import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, FileText, Upload } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import NumberInput from './components/NumberInput';
import { parseIndianNumber } from './utils/numberFormat';

const PurchaseOrders = () => {
  const [contracts, setContracts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [formData, setFormData] = useState({
    quotation_id: '',
    enquiry_id: '',
    client_id: '',
    po_number: '',
    po_date: new Date().toISOString().split('T')[0],
    po_value: '',
    delivery_address: '',
    expected_delivery_date: '',
    payment_terms: '',
    status: 'Awarded',
    awarded_date: new Date().toISOString().split('T')[0],
    remarks: '',
  });
  const [clientMailFile, setClientMailFile] = useState(null);
  const [poDocumentFile, setPoDocumentFile] = useState(null);

  useEffect(() => {
    fetchContracts();
    fetchQuotations();
    fetchEnquiries();
    fetchClients();
  }, []);

  const fetchContracts = async () => {
    try {
      setLoading(true);
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
      setContracts(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      setLoading(false);
    }
  };

  const fetchQuotations = async () => {
    try {
      const { data } = await supabase
        .from('marketing_quotations')
        .select('id, quotation_number')
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
        .select('id, enquiry_number')
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate contract number
      const { data: latest } = await supabase
        .from('marketing_contracts')
        .select('contract_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let contractNumber = 'CON/2025/0001';
      if (latest?.contract_number) {
        const parts = latest.contract_number.split('/');
        const year = parts[1];
        const num = parseInt(parts[2]) + 1;
        contractNumber = `CON/${year}/${String(num).padStart(4, '0')}`;
      }

      const submitData = {
        ...formData,
        contract_number: contractNumber,
        po_value: formData.po_value ? parseIndianNumber(formData.po_value.toString()) : null,
        quotation_id: formData.quotation_id || null,
        enquiry_id: formData.enquiry_id || null,
        client_id: formData.client_id || null,
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
        const { data, error } = await supabase
          .from('marketing_contracts')
          .insert([{
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }])
          .select()
          .single();

        if (error) throw error;
        contractId = data.id;
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

      setShowForm(false);
      setEditingContract(null);
      setClientMailFile(null);
      setPoDocumentFile(null);
      setFormData({
        quotation_id: '',
        enquiry_id: '',
        client_id: '',
        po_number: '',
        po_date: new Date().toISOString().split('T')[0],
        po_value: '',
        delivery_address: '',
        expected_delivery_date: '',
        payment_terms: '',
        status: 'Awarded',
        awarded_date: new Date().toISOString().split('T')[0],
        remarks: '',
      });
      fetchContracts();
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Error saving contract: ' + error.message);
    }
  };

  const handleEdit = (contract) => {
    setEditingContract(contract);
    setFormData({
      quotation_id: contract.quotation_id || '',
      enquiry_id: contract.enquiry_id || '',
      client_id: contract.client_id || '',
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
    if (!confirm('Are you sure you want to delete this contract?')) return;

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
      alert('Error deleting contract: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = contracts.map(contract => ({
      'Contract Number': contract.contract_number,
      'PO Number': contract.po_number || '-',
      'PO Date': contract.po_date ? new Date(contract.po_date).toLocaleDateString() : '-',
      'PO Value (₹)': contract.po_value || 0,
      'Quotation Number': contract.marketing_quotations?.quotation_number || '-',
      'Client': contract.marketing_clients?.client_name || '-',
      'Status': contract.status,
      'Awarded Date': contract.awarded_date ? new Date(contract.awarded_date).toLocaleDateString() : '-',
      'Expected Delivery Date': contract.expected_delivery_date ? new Date(contract.expected_delivery_date).toLocaleDateString() : '-',
    }));
    exportToExcel(exportData, 'Contracts_Export', 'Contracts');
  };

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
                setFormData({
                  quotation_id: '',
                  enquiry_id: '',
                  client_id: '',
                  po_number: '',
                  po_date: new Date().toISOString().split('T')[0],
                  po_value: '',
                  delivery_address: '',
                  expected_delivery_date: '',
                  payment_terms: '',
                  status: 'Awarded',
                  awarded_date: new Date().toISOString().split('T')[0],
                  remarks: '',
                });
                setClientMailFile(null);
                setPoDocumentFile(null);
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
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Contract #</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">PO Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Quotation #</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Value</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden xl:table-cell">Awarded Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contracts.map((contract) => (
                    <tr key={contract.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">
                        {contract.contract_number}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">{contract.po_number || '-'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden md:table-cell">
                        {contract.po_date ? new Date(contract.po_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {contract.marketing_quotations?.quotation_number || '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-500">
                        {contract.marketing_clients?.client_name || '-'}
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
                        {contract.awarded_date ? new Date(contract.awarded_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right text-sm font-medium relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === contract.id ? null : contract.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpen === contract.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
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
                  {editingContract ? 'Edit Contract' : 'Create New Purchase Order'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Add a new purchase order or contract</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingContract(null);
                  setClientMailFile(null);
                  setPoDocumentFile(null);
                }}
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
                  <input
                    type="date"
                    value={formData.po_date}
                    onChange={(e) => setFormData({ ...formData, po_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Related Enquiry (Optional)</label>
                  <select
                    value={formData.enquiry_id}
                    onChange={(e) => {
                      const selectedEnquiry = enquiries.find(enq => enq.id === e.target.value);
                      setFormData({ ...formData, enquiry_id: e.target.value, client_id: selectedEnquiry?.client_id || formData.client_id });
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
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
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
                  <input
                    type="date"
                    value={formData.expected_delivery_date}
                    onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
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
                  <input
                    type="date"
                    value={formData.awarded_date}
                    onChange={(e) => setFormData({ ...formData, awarded_date: e.target.value })}
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
                  onClick={() => {
                    setShowForm(false);
                    setEditingContract(null);
                    setClientMailFile(null);
                    setPoDocumentFile(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingContract ? 'Update Contract' : 'Create Purchase Order'}
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

