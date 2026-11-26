import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, FileText, Upload } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import NumberInput from './components/NumberInput';
import { parseIndianNumber } from './utils/numberFormat';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import FormDateInput from "../../components/FormDateInput";


import { toast } from "../../lib/toast";
import { confirmDialog } from "../../lib/dialog";

function quotationsForContext(quotations, enquiryId, clientId) {
  if (enquiryId) {
    const byEnquiry = quotations.filter((q) => q.enquiry_id && q.enquiry_id === enquiryId);
    if (byEnquiry.length) return byEnquiry;
  }
  if (clientId) {
    return quotations.filter((q) => q.client_id && q.client_id === clientId);
  }
  return [];
}

function bestQuotationId(quotations, enquiryId, clientId) {
  return quotationsForContext(quotations, enquiryId, clientId)[0]?.id || '';
}

function emptyContractForm() {
  return {
    quotation_id: '',
    enquiry_id: '',
    client_id: '',
    business_category: '',
    po_number: '',
    po_date: new Date().toISOString().split('T')[0],
    po_value: '',
    delivery_address: '',
    expected_delivery_date: '',
    payment_terms: '',
    status: 'Awarded',
    awarded_date: new Date().toISOString().split('T')[0],
    remarks: '',
  };
}

function quotationNumberForContract(contract, quotations) {
  const embedded = contract.marketing_quotations?.quotation_number;
  if (embedded) return embedded;
  const saved = quotations.find((q) => q.id === contract.quotation_id);
  if (saved?.quotation_number) return saved.quotation_number;
  return quotationsForContext(quotations, contract.enquiry_id, contract.client_id)[0]?.quotation_number || '-';
}

const CONTRACT_NUMBER_PATTERN = /^CON\/(\d{4})\/(\d+)$/i;

function formatContractNumber(year, sequence) {
  return `CON/${year}/${String(sequence).padStart(4, '0')}`;
}

/** Next CON/year/sequence from the highest existing number, not the newest row. */
function nextContractNumber(existingNumbers, now = new Date()) {
  let bestYear = null;
  let bestSequence = 0;
  for (const value of existingNumbers || []) {
    const match = String(value || '').trim().match(CONTRACT_NUMBER_PATTERN);
    if (!match) continue;
    const year = Number(match[1]);
    const sequence = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(sequence)) continue;
    if (bestYear == null || year > bestYear || (year === bestYear && sequence > bestSequence)) {
      bestYear = year;
      bestSequence = sequence;
    }
  }
  if (bestYear == null) return formatContractNumber(now.getFullYear(), 1);
  return formatContractNumber(bestYear, bestSequence + 1);
}

function isContractNumberConflict(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return error?.code === '23505' && /contract_number/i.test(text);
}

function quotationBaseNumber(quotationNumber) {
  return String(quotationNumber || '').split('/R')[0];
}

function deliveryAddressFromQuotation(quotation) {
  const site = String(quotation?.marketing_enquiries?.site_location || '').trim();
  if (site) return site;
  const client = quotation?.marketing_clients || {};
  return [client.street_address, client.city, client.state, client.country].filter(Boolean).join(', ');
}

function formFromQuotation(quotation) {
  const amount = parseFloat(quotation?.final_amount || 0);
  return {
    ...emptyContractForm(),
    quotation_id: quotation.id,
    enquiry_id: quotation.enquiry_id || '',
    client_id: quotation.client_id || '',
    po_value: amount > 0 ? String(amount) : '',
    delivery_address: deliveryAddressFromQuotation(quotation),
    payment_terms: quotation.payment_terms || '',
    remarks: quotation.quotation_number ? `Converted from quotation ${quotation.quotation_number}` : '',
  };
}

async function loadQuotationForPurchaseOrder(quotationId) {
  const fullSelect = `
    id, quotation_number, enquiry_id, client_id, final_amount, payment_terms,
    marketing_enquiries:enquiry_id (id, site_location),
    marketing_clients:client_id (id, street_address, city, state, country)
  `;
  let { data, error } = await supabase
    .from('marketing_quotations')
    .select(fullSelect)
    .eq('id', quotationId)
    .maybeSingle();

  if (error) {
    ({ data, error } = await supabase
      .from('marketing_quotations')
      .select('id, quotation_number, enquiry_id, client_id, final_amount')
      .eq('id', quotationId)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

async function existingPurchaseOrderForQuotation(quotation) {
  const ids = new Set([quotation.id]);
  const base = quotationBaseNumber(quotation.quotation_number);
  if (base && /^[A-Za-z0-9/_-]+$/.test(base)) {
    const { data: family, error: familyError } = await supabase
      .from('marketing_quotations')
      .select('id, quotation_number')
      .or(`quotation_number.eq.${base},quotation_number.like.${base}/R%`);
    if (!familyError) {
      (family || []).forEach((row) => {
        if (quotationBaseNumber(row.quotation_number) === base) ids.add(row.id);
      });
    }
  }

  const { data, error } = await supabase
    .from('marketing_contracts')
    .select('id, po_number, contract_number')
    .in('quotation_id', Array.from(ids))
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

function isNotNullColumn(error, column) {
  const text = `${error?.message || ''} ${error?.details || ''}`;
  return error?.code === '23502' && text.includes(column);
}

async function insertMarketingContract(submitData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('You need to be signed in to create a purchase order.');
  const { data: existingNumbers, error: numberError } = await supabase
    .from('marketing_contracts')
    .select('contract_number')
    .like('contract_number', 'CON/%')
    .order('contract_number', { ascending: false })
    .limit(100);

  if (numberError) throw numberError;

  let contractNumber = nextContractNumber(
    (existingNumbers || []).map((row) => row.contract_number)
  );
  let created = null;
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('marketing_contracts')
      .insert([{
        ...submitData,
        contract_number: contractNumber,
        created_by: user.id,
        updated_by: user.id,
      }])
      .select()
      .single();

    if (!error) {
      created = data;
      break;
    }
    lastError = error;
    if (!isContractNumberConflict(error)) throw error;
    const match = String(contractNumber).match(CONTRACT_NUMBER_PATTERN);
    const year = match ? Number(match[1]) : new Date().getFullYear();
    const sequence = match ? Number(match[2]) + 1 : attempt + 2;
    contractNumber = formatContractNumber(year, sequence);
  }
  if (!created) throw lastError;
  return created;
}

async function createPurchaseOrderFromQuotation(quotation) {
  const filled = formFromQuotation(quotation);
  const submitData = {
    ...filled,
    po_value: filled.po_value ? parseIndianNumber(String(filled.po_value)) : null,
    quotation_id: filled.quotation_id || null,
    enquiry_id: filled.enquiry_id || null,
    client_id: filled.client_id || null,
    business_category: filled.business_category.trim() || null,
    po_number: null,
    expected_delivery_date: filled.expected_delivery_date || null,
    awarded_date: filled.awarded_date || null,
  };

  try {
    return await insertMarketingContract(submitData);
  } catch (error) {
    if (!isNotNullColumn(error, 'po_number')) throw error;
    return insertMarketingContract({
      ...submitData,
      po_number: quotation.quotation_number ? `Pending ${quotation.quotation_number}` : 'Pending',
    });
  }
}

async function loadContractById(id) {
  const { data, error } = await supabase
    .from('marketing_contracts')
    .select(`
      *,
      marketing_quotations:quotation_id (id, quotation_number),
      marketing_enquiries:enquiry_id (id, enquiry_number),
      marketing_clients:client_id (id, client_name)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function contractToForm(contract) {
  return {
    quotation_id: contract.quotation_id || '',
    enquiry_id: contract.enquiry_id || '',
    client_id: contract.client_id || '',
    business_category: contract.business_category || '',
    po_number: contract.po_number || '',
    po_date: contract.po_date || new Date().toISOString().split('T')[0],
    po_value: contract.po_value ?? '',
    delivery_address: contract.delivery_address || '',
    expected_delivery_date: contract.expected_delivery_date || '',
    payment_terms: contract.payment_terms || '',
    status: contract.status || 'Awarded',
    awarded_date: contract.awarded_date || new Date().toISOString().split('T')[0],
    remarks: contract.remarks || '',
  };
}

const PurchaseOrders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [contracts, setContracts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [formData, setFormData] = useState(emptyContractForm);
  const [clientMailFile, setClientMailFile] = useState(null);
  const [poDocumentFile, setPoDocumentFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [linkedQuotationNumber, setLinkedQuotationNumber] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const conversionOpenKey = useRef('');
  const contractsRequest = useRef(0);

  useEffect(() => {
    fetchContracts();
    fetchQuotations();
    fetchEnquiries();
    fetchClients();
  }, []);

  const openSavedContract = (contract, quotationNumber, notice) => {
    setEditingContract(contract);
    setClientMailFile(null);
    setPoDocumentFile(null);
    setLinkedQuotationNumber(quotationNumber || contract?.marketing_quotations?.quotation_number || '');
    setFormNotice(notice || '');
    setFormData(contractToForm(contract));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingContract(null);
    setClientMailFile(null);
    setPoDocumentFile(null);
    setLinkedQuotationNumber('');
    setFormNotice('');
  };

  useEffect(() => {
    const quotationId = searchParams.get('quotation_id');
    const contractId = searchParams.get('contract_id');
    const key = quotationId ? `quotation:${quotationId}` : contractId ? `contract:${contractId}` : '';
    if (!key) {
      conversionOpenKey.current = '';
      return undefined;
    }
    if (conversionOpenKey.current === key) return undefined;
    conversionOpenKey.current = key;

    (async () => {
      try {
        if (contractId) {
          const contract = await loadContractById(contractId);
          if (!contract) {
            toast.warning('Purchase order not found', 'It may have been removed. Refresh the quotation tracker and try again.');
            setSearchParams({}, { replace: true });
            return;
          }
          const quotationNumber = contract.marketing_quotations?.quotation_number || '';
          openSavedContract(
            contract,
            quotationNumber,
            quotationNumber
              ? `Opened from quotation ${quotationNumber}. The details already saved from that quotation are filled in.`
              : 'The saved purchase order details are filled in.'
          );
          setSearchParams({}, { replace: true });
          return;
        }

        const quotation = await loadQuotationForPurchaseOrder(quotationId);
        if (!quotation) {
          toast.warning('Quotation not found', 'Choose another quotation and try again.');
          setSearchParams({}, { replace: true });
          return;
        }

        let existing = await existingPurchaseOrderForQuotation(quotation);
        let createdNow = false;
        if (!existing) {
          existing = await createPurchaseOrderFromQuotation(quotation);
          createdNow = true;
        }

        const contract = await loadContractById(existing.id);
        if (!contract) throw new Error('Purchase order was saved but could not be opened.');

        const quotationLabel = quotation.quotation_number || 'this quotation';
        openSavedContract(
          contract,
          quotation.quotation_number || '',
          createdNow
            ? `Filled from quotation ${quotationLabel}. This purchase order is already in the list. Add the purchase order number, or close the form and it will stay saved.`
            : `Quotation ${quotationLabel} is already converted. The linked purchase order is filled in.`
        );
        const listed = await fetchContracts({ silent: true });
        if (createdNow) {
          toast.success(
            'Quotation converted',
            listed
              ? 'The purchase order is in the list. Close the form and it stays saved.'
              : 'The purchase order was saved. Refresh the list if you do not see it yet.'
          );
        }
        setSearchParams({}, { replace: true });
      } catch (error) {
        console.error('Error opening purchase order from quotation:', error);
        toast.warning(
          'Could not convert this quotation',
          'The purchase order could not be created from the quotation. Please try again.'
        );
        setSearchParams({}, { replace: true });
      }
    })();

    return undefined;
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!showForm || formData.quotation_id) return;
    const nextId = bestQuotationId(quotations, formData.enquiry_id, formData.client_id);
    if (!nextId) return;
    setFormData((prev) => (prev.quotation_id ? prev : { ...prev, quotation_id: nextId }));
  }, [showForm, quotations, formData.enquiry_id, formData.client_id, formData.quotation_id]);

  const fetchContracts = async ({ silent = false } = {}) => {
    const requestId = ++contractsRequest.current;
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('marketing_contracts')
        .select(`
          *,
          marketing_quotations:quotation_id (id, quotation_number),
          marketing_enquiries:enquiry_id (id, enquiry_number),
          marketing_clients:client_id (id, client_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (requestId !== contractsRequest.current) return true;
      setContracts(data || []);
      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error fetching contracts:', error);
      if (requestId !== contractsRequest.current) return false;
      setLoading(false);
      return false;
    }
  };

  const fetchQuotations = async () => {
    try {
      const { data } = await supabase
        .from('marketing_quotations')
        .select('id, quotation_number, enquiry_id, client_id')
        .order('created_at', { ascending: false });
      setQuotations(data || []);
    } catch (error) {
      console.error('Error fetching quotations:', error);
    }
  };

  const fetchEnquiries = async () => {
    try {
      const { data } = await supabase
        .from('marketing_enquiries')
        .select('id, enquiry_number, client_id')
        .order('created_at', { ascending: false });
      setEnquiries(data || []);
    } catch (error) {
      console.error('Error fetching enquiries:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const { data } = await supabase
        .from('marketing_clients')
        .select('id, client_name')
        .order('client_name');
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const submitData = {
        ...formData,
        po_value: formData.po_value ? parseIndianNumber(formData.po_value.toString()) : null,
        quotation_id: formData.quotation_id || null,
        enquiry_id: formData.enquiry_id || null,
        client_id: formData.client_id || null,
        business_category: formData.business_category.trim() || null,
        expected_delivery_date: formData.expected_delivery_date || null,
        awarded_date: formData.awarded_date || null,
      };

      let contractId;
      if (editingContract) {
        const { data, error } = await supabase
          .from('marketing_contracts')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingContract.id)
          .select()
          .single();

        if (error) throw error;
        contractId = data.id;
      } else {
        const created = await insertMarketingContract({
          ...submitData,
          po_number: submitData.po_number || null,
        });
        contractId = created.id;
      }

      // Handle file uploads
      if (clientMailFile) {
        const fileExt = clientMailFile.name.split('.').pop();
        const fileName = `${Date.now()}_client_mail.${fileExt}`;
        const filePath = `contracts/${contractId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('marketing-documents')
          .upload(filePath, clientMailFile);

        if (!uploadError) {
          await supabase
            .from('marketing_contracts')
            .update({ client_mail_path: filePath })
            .eq('id', contractId);
        }
      }

      if (poDocumentFile) {
        const fileExt = poDocumentFile.name.split('.').pop();
        const fileName = `${Date.now()}_po_document.${fileExt}`;
        const filePath = `contracts/${contractId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('marketing-documents')
          .upload(filePath, poDocumentFile);

        if (!uploadError) {
          await supabase
            .from('marketing_contracts')
            .update({ po_document_path: filePath })
            .eq('id', contractId);
        }
      }

      closeForm();
      setFormData(emptyContractForm());
      fetchContracts();
      if (submitData.quotation_id) {
        toast.success(
          editingContract ? 'Purchase order updated' : 'Purchase order created',
          'The quotation stays marked as converted to a purchase order.'
        );
      }
    } catch (error) {
      console.error('Error saving contract:', error);
      toast.warning(
        isContractNumberConflict(error)
          ? 'Could not assign a contract number. Please try again.'
          : 'Could not save this purchase order. Please check the details and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contract) => {
    setLinkedQuotationNumber('');
    setEditingContract(contract);
    setFormData({
      quotation_id: contract.quotation_id || bestQuotationId(quotations, contract.enquiry_id, contract.client_id),
      enquiry_id: contract.enquiry_id || '',
      client_id: contract.client_id || '',
      business_category: contract.business_category || '',
      po_number: contract.po_number || '',
      po_date: contract.po_date || new Date().toISOString().split('T')[0],
      po_value: contract.po_value || '',
      delivery_address: contract.delivery_address || '',
      expected_delivery_date: contract.expected_delivery_date || '',
      payment_terms: contract.payment_terms || '',
      status: contract.status || 'Awarded',
      awarded_date: contract.awarded_date || new Date().toISOString().split('T')[0],
      remarks: contract.remarks || '',
    });
    setShowForm(true);
    setMenuOpen(null);
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: "Delete contract", message: 'Are you sure you want to delete this contract?', confirmLabel: "Delete", tone: "danger" }))) return;

    try {
      const { error } = await supabase
        .from('marketing_contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchContracts();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.warning('Error deleting contract: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = contracts.map(contract => ({
      'Contract Number': contract.contract_number,
      'PO Number': contract.po_number || '-',
      'PO Date': contract.po_date ? formatDateDdMmYyyy(contract.po_date) : '-',
      'PO Value (₹)': contract.po_value || 0,
      'Quotation Number': quotationNumberForContract(contract, quotations),
      'Client': contract.marketing_clients?.client_name || '-',
      'Business Category': contract.business_category || '-',
      'Status': contract.status,
      'Awarded Date': contract.awarded_date ? formatDateDdMmYyyy(contract.awarded_date) : '-',
      'Expected Delivery Date': contract.expected_delivery_date ? formatDateDdMmYyyy(contract.expected_delivery_date) : '-',
    }));
    exportToExcel(exportData, 'Contracts_Export', 'Contracts');
  };

  const relevantQuotations = quotationsForContext(quotations, formData.enquiry_id, formData.client_id);
  const savedQuotation = quotations.find((q) => q.id === formData.quotation_id);
  const linkedOption = linkedQuotationNumber && formData.quotation_id
    ? { id: formData.quotation_id, quotation_number: linkedQuotationNumber }
    : null;
  const quotationOptions = [
    ...(linkedOption ? [linkedOption] : []),
    ...(savedQuotation && savedQuotation.id !== linkedOption?.id && !relevantQuotations.some((q) => q.id === savedQuotation.id)
      ? [savedQuotation]
      : []),
    ...relevantQuotations.filter((q) => q.id !== linkedOption?.id),
  ];

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Purchase Orders / Contracts</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage contracts and purchase orders</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={() => {
                setEditingContract(null);
                setFormData(emptyContractForm());
                setClientMailFile(null);
                setPoDocumentFile(null);
                setLinkedQuotationNumber('');
                setFormNotice('');
                setShowForm(true);
              }}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>New Contract</span>
            </button>
          </div>
        </div>

        {/* Contracts Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
          ) : contracts.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">No contracts found</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase w-11">S.No</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Contract #</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">PO Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Quotation #</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Category</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Value</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">Awarded Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contracts.map((contract, idx) => (
                    <tr key={contract.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-center tabular-nums text-gray-600">{idx + 1}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">
                        {contract.contract_number}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{contract.po_number || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden md:table-cell">
                        {contract.po_date ? formatDateDdMmYyyy(contract.po_date) : '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {quotationNumberForContract(contract, quotations)}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">
                        {contract.marketing_clients?.client_name || '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-700">
                        {contract.business_category || '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">
                        {contract.po_value ? `₹${parseFloat(contract.po_value).toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          contract.status === 'Awarded' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {contract.status}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden xl:table-cell">
                        {contract.awarded_date ? formatDateDdMmYyyy(contract.awarded_date) : '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right text-sm font-medium relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === contract.id ? null : contract.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpen === contract.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-[80] border border-gray-200">
                            <button
                              onClick={() => handleEdit(contract)}
                              className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Edit2 className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(contract.id)}
                              className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Contract Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingContract ? 'Purchase Order' : 'Create New Purchase Order'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  {formNotice
                    || (linkedQuotationNumber
                      ? `Filled from quotation ${linkedQuotationNumber}.`
                      : 'Add a new purchase order or contract')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PO Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.po_number}
                    onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PO Date <span className="text-red-500">*</span>
                  </label>
                  <FormDateInput value={formData.po_date} onChange={(e) => setFormData({ ...formData, po_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Related Enquiry (Optional)</label>
                  <select
                    value={formData.enquiry_id}
                    onChange={(e) => {
                      const enquiryId = e.target.value;
                      const selectedEnquiry = enquiries.find((enq) => enq.id === enquiryId);
                      const clientId = selectedEnquiry?.client_id || formData.client_id;
                      setFormData({
                        ...formData,
                        enquiry_id: enquiryId,
                        client_id: clientId,
                        quotation_id: linkedQuotationNumber
                          ? formData.quotation_id
                          : bestQuotationId(quotations, enquiryId, clientId),
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select enquiry</option>
                    {enquiries.map((enquiry) => (
                      <option key={enquiry.id} value={enquiry.id}>
                        {enquiry.enquiry_number}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.client_id}
                    onChange={(e) => {
                      const clientId = e.target.value;
                      const enquiry = enquiries.find((enq) => enq.id === formData.enquiry_id);
                      const enquiryId = enquiry && (!clientId || enquiry.client_id === clientId) ? formData.enquiry_id : '';
                      setFormData({
                        ...formData,
                        client_id: clientId,
                        enquiry_id: enquiryId,
                        quotation_id: linkedQuotationNumber
                          ? formData.quotation_id
                          : bestQuotationId(quotations, enquiryId, clientId),
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.client_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business Category</label>
                  <input
                    type="text"
                    value={formData.business_category}
                    onChange={(e) => setFormData({ ...formData, business_category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="Type the business category"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quotation No.</label>
                  <select
                    value={formData.quotation_id}
                    onChange={(e) => setFormData({ ...formData, quotation_id: e.target.value })}
                    disabled={Boolean(linkedQuotationNumber)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
                  >
                    <option value="">
                      {relevantQuotations.length
                        ? 'Select quotation'
                        : 'No quotation found for this enquiry or client'}
                    </option>
                    {quotationOptions.map((quotation) => (
                      <option key={quotation.id} value={quotation.id}>
                        {quotation.quotation_number}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    {linkedQuotationNumber
                      ? `Linked to quotation ${linkedQuotationNumber}. Client, amount, address, and payment terms are filled from that quotation.`
                      : formData.enquiry_id && quotations.some((q) => q.enquiry_id === formData.enquiry_id)
                        ? 'Filled from the latest quotation for this enquiry.'
                        : formData.client_id && quotations.some((q) => q.client_id === formData.client_id)
                          ? 'Filled from the latest quotation for this client.'
                          : 'Choose an enquiry or client to fill the quotation number.'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PO Value (₹)</label>
                  <NumberInput
                    value={formData.po_value}
                    onChange={(e) => setFormData({ ...formData, po_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g., 5,00,000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                    <option value="INR">INR</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Address</label>
                  <textarea
                    value={formData.delivery_address}
                    onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expected Delivery Date</label>
                  <FormDateInput value={formData.expected_delivery_date} onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                    <option value="">Select user</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
                  <textarea
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Awarded">Awarded</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Awarded Date</label>
                  <FormDateInput value={formData.awarded_date} onChange={(e) => setFormData({ ...formData, awarded_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Client Mail (Upload)</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    onChange={(e) => setClientMailFile(e.target.files[0])}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                  {clientMailFile && (
                    <p className="mt-1 text-sm text-gray-600 flex items-center space-x-1">
                      <FileText className="w-4 h-4" />
                      <span>{clientMailFile.name}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PO Document (Upload)</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    onChange={(e) => setPoDocumentFile(e.target.files[0])}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                  {poDocumentFile && (
                    <p className="mt-1 text-sm text-gray-600 flex items-center space-x-1">
                      <FileText className="w-4 h-4" />
                      <span>{poDocumentFile.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingContract ? 'Save Purchase Order' : 'Create Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;

