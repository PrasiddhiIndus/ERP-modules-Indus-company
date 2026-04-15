import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Eye, FileText, ArrowRight, Search, Calendar, Users, MapPin, UserPlus, RotateCcw } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import DateRangeCalendar from './components/DateRangeCalendar';
import { parseIndianNumber } from './utils/numberFormat';
import NumberInput from './components/NumberInput';

const DOCUMENTS_BUCKET = 'marketing-documents';
const ENQUIRY_DOCUMENTS_TABLE = 'marketing_enquiry_documents';

function isValidDateInput(value) {
  const raw = String(value || '');
  if (!raw) return true;
  if (raw.length > 10) return false;
  const [year = ''] = raw.split('-');
  return year.length <= 4;
}

const EnquiryMaster = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [enquiries, setEnquiries] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingEnquiry, setViewingEnquiry] = useState(null);
  const [editingEnquiry, setEditingEnquiry] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [formData, setFormData] = useState({
    enquiry_date: new Date().toISOString().split('T')[0],
    source: 'Email',
    client_id: '',
    contact_person: '',
    contact_number: '',
    contact_email: '',
    site_location: '',
    description: '',
    estimated_value: '',
    expected_closing_date: '',
    status: 'New',
    assigned_to_ids: [],
    assigned_to_custom_names: [],
  });
  const [customNamesOptions, setCustomNamesOptions] = useState([]);
  const [showAddNameInput, setShowAddNameInput] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [documentsToRemove, setDocumentsToRemove] = useState([]);
  const [dateRange, setDateRange] = useState({
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingBrokenImageIds, setViewingBrokenImageIds] = useState(new Set());
  const [documentsLoadError, setDocumentsLoadError] = useState(null);

  const handleDateInputChange = (field, value) => {
    if (!isValidDateInput(value)) return;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    fetchEnquiries();
    fetchClients();
    fetchUsers();
    fetchAssignedCustomNames();
    setCurrentPage(1); // Reset to first page when filter changes
  }, [dateRange]);

  const fetchEnquiries = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('marketing_enquiries')
        .select(`
          *,
          marketing_clients:client_id (id, client_name)
        `)
        .order('created_at', { ascending: false });

      if (dateRange.startDate && dateRange.endDate) {
        query = query
          .gte('enquiry_date', dateRange.startDate)
          .lte('enquiry_date', dateRange.endDate);
      } else if (dateRange.startDate) {
        query = query.gte('enquiry_date', dateRange.startDate);
      } else if (dateRange.endDate) {
        query = query.lte('enquiry_date', dateRange.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEnquiries(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching enquiries:', error);
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data } = await supabase
        .from('marketing_clients')
        .select('id, client_name, primary_contact_person, contact_number, contact_numbers, contact_email, contact_emails, street_address, city, state, country')
        .order('client_name');
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  // When client is selected in New Enquiry form, auto-populate contact and address from Client Master
  const handleClientChange = (clientId) => {
    if (!clientId) {
      setFormData((prev) => ({
        ...prev,
        client_id: '',
        contact_person: '',
        contact_number: '',
        contact_email: '',
        site_location: '',
      }));
      return;
    }
    const client = clients.find((c) => c.id === clientId);
    if (!client) {
      setFormData((prev) => ({ ...prev, client_id: clientId }));
      return;
    }
    // Collect ALL phone numbers from client (single or array/JSON)
    let contactNumbers = [];
    if (client.contact_numbers) {
      try {
        const parsed = typeof client.contact_numbers === 'string' ? JSON.parse(client.contact_numbers) : client.contact_numbers;
        contactNumbers = Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
      } catch (e) {
        contactNumbers = [client.contact_numbers].filter(Boolean);
      }
    }
    if (contactNumbers.length === 0 && client.contact_number) {
      contactNumbers = [client.contact_number];
    }
    const contactNumber = contactNumbers.join(', ');

    // Collect ALL emails from client (single or array/JSON)
    let contactEmails = [];
    if (client.contact_emails) {
      try {
        const parsed = typeof client.contact_emails === 'string' ? JSON.parse(client.contact_emails) : client.contact_emails;
        contactEmails = Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
      } catch (e) {
        contactEmails = [client.contact_emails].filter(Boolean);
      }
    }
    if (contactEmails.length === 0 && client.contact_email) {
      contactEmails = [client.contact_email];
    }
    const contactEmail = contactEmails.join(', ');

    const addressParts = [client.street_address, client.city, client.state, client.country].filter(Boolean);
    const siteLocation = addressParts.length > 0 ? addressParts.join(', ') : '';
    setFormData((prev) => ({
      ...prev,
      client_id: clientId,
      contact_person: client.primary_contact_person || prev.contact_person,
      contact_number: contactNumber || prev.contact_number,
      contact_email: contactEmail || prev.contact_email,
      site_location: siteLocation || prev.site_location,
    }));
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, username')
        .order('username', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUsers([{ id: user.id, email: user.email || '', username: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me' }]);
      } else {
        setUsers([]);
      }
    }
  };

  const fetchAssignedCustomNames = async () => {
    try {
      const { data } = await supabase
        .from('marketing_enquiries')
        .select('assigned_to_name, assigned_to_custom_names');
      const names = new Set();
      (data || []).forEach((row) => {
        if (row.assigned_to_name?.trim()) names.add(row.assigned_to_name.trim());
        if (row.assigned_to_custom_names && Array.isArray(row.assigned_to_custom_names)) {
          row.assigned_to_custom_names.forEach((n) => n?.trim() && names.add(n.trim()));
        } else if (row.assigned_to_custom_names && typeof row.assigned_to_custom_names === 'string') {
          try {
            const arr = JSON.parse(row.assigned_to_custom_names);
            if (Array.isArray(arr)) arr.forEach((n) => n?.trim() && names.add(n.trim()));
          } catch (_) {}
        }
      });
      setCustomNamesOptions(Array.from(names).sort());
    } catch (_) {
      setCustomNamesOptions([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (submitting) {
      return;
    }
    
    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate unique enquiry number - always uses MAX number for year (never reuses deleted numbers)
      const currentYear = new Date().getFullYear();
      
      // Get ALL enquiries for current year and find MAXIMUM number
      // This ensures we never reuse numbers even if enquiries are deleted
      const { data: allEnquiries, error: fetchError } = await supabase
        .from('marketing_enquiries')
        .select('enquiry_number')
        .like('enquiry_number', `ENQ/${currentYear}/%`);

      // Handle error
      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching enquiries:', fetchError);
      }

      let maxNumber = 0;
      if (allEnquiries && allEnquiries.length > 0) {
        // Extract numeric part from each enquiry number and find maximum
        allEnquiries.forEach(enquiry => {
          if (enquiry.enquiry_number) {
            const parts = enquiry.enquiry_number.split('/');
            if (parts.length >= 3) {
              const num = parseInt(parts[2], 10);
              if (!isNaN(num) && num > maxNumber) {
                maxNumber = num;
              }
            }
          }
        });
      }

      // Generate next number from maximum
      const enquiryNumber = `ENQ/${currentYear}/${String(maxNumber + 1).padStart(4, '0')}`;

      const assignedIds = Array.isArray(formData.assigned_to_ids) ? formData.assigned_to_ids.filter(Boolean) : [];
      const assignedNames = Array.isArray(formData.assigned_to_custom_names) ? formData.assigned_to_custom_names.map((n) => (n || '').trim()).filter(Boolean) : [];

      const enquiryPayload = {
        enquiry_date: formData.enquiry_date || null,
        source: formData.source || 'Email',
        client_id: formData.client_id || null,
        contact_person: formData.contact_person || null,
        contact_number: formData.contact_number || null,
        contact_email: formData.contact_email || null,
        site_location: formData.site_location || null,
        description: formData.description || null,
        estimated_value: formData.estimated_value ? parseIndianNumber(String(formData.estimated_value)) : null,
        expected_closing_date: formData.expected_closing_date || null,
        status: formData.status || 'New',
        assigned_to: assignedIds[0] || null,
        assigned_to_name: assignedNames[0] || null,
        assigned_to_ids: assignedIds.length > 0 ? assignedIds : null,
        assigned_to_custom_names: assignedNames.length > 0 ? assignedNames : null,
      };

      let enquiryId;
      if (editingEnquiry) {
        const { data, error } = await supabase
          .from('marketing_enquiries')
          .update({
            ...enquiryPayload,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEnquiry.id)
          .select()
          .single();

        if (error) throw error;
        enquiryId = data.id;
      } else {
        const { data, error } = await supabase
          .from('marketing_enquiries')
          .insert([{
            ...enquiryPayload,
            enquiry_number: enquiryNumber,
            created_by: user.id,
            updated_by: user.id,
          }])
          .select()
          .single();

        if (error) throw error;
        enquiryId = data.id;
      }

      let uploadFailed = 0;
      if (uploadedFiles.length > 0 && enquiryId) {
        for (const file of uploadedFiles) {
          const fileExt = (file.name.split('.').pop() || '').toLowerCase();
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileName = `${Date.now()}_${safeName}`;
          const filePath = `enquiries/${enquiryId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .upload(filePath, file, { upsert: false });

          if (uploadError) {
            console.error('Storage upload failed:', file.name, uploadError);
            uploadFailed += 1;
            continue;
          }

          const { error: docError } = await supabase.from(ENQUIRY_DOCUMENTS_TABLE).insert([{
            enquiry_id: enquiryId,
            file_name: file.name,
            file_path: filePath,
            file_type: fileExt,
            file_size: file.size ?? null,
            uploaded_by: user.id,
          }]);

          if (docError) {
            console.error('Document record insert failed:', file.name, docError);
            uploadFailed += 1;
          }
        }
        if (uploadFailed > 0) {
          alert(`Could not save ${uploadFailed} file(s). Error: ${uploadFailed === uploadedFiles.length ? 'Check that table "' + ENQUIRY_DOCUMENTS_TABLE + '" exists (run marketing_enquiry_documents_schema.sql) and storage bucket "' + DOCUMENTS_BUCKET + '" exists.' : 'See console.'}`);
        }
      }

      if (documentsToRemove.length > 0 && enquiryId) {
        for (const docId of documentsToRemove) {
          const doc = existingDocuments.find((d) => d.id === docId);
          if (doc?.file_path) {
            try {
              await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.file_path]);
            } catch (storageErr) {
              console.warn('Storage delete failed (file may remain):', doc.file_path, storageErr);
            }
          }
          const { error: delError } = await supabase
            .from(ENQUIRY_DOCUMENTS_TABLE)
            .delete()
            .eq('id', docId);
          if (delError) console.error('Document row delete failed:', docId, delError);
        }
      }

      setShowForm(false);
      setEditingEnquiry(null);
      setUploadedFiles([]);
      setExistingDocuments([]);
      setDocumentsToRemove([]);
      setFormData({
        enquiry_date: new Date().toISOString().split('T')[0],
        source: 'Email',
        client_id: '',
        contact_person: '',
        contact_number: '',
        contact_email: '',
        site_location: '',
        description: '',
        estimated_value: '',
        expected_closing_date: '',
        status: 'New',
        assigned_to_ids: [],
        assigned_to_custom_names: [],
      });
      setShowAddNameInput(false);
      setNewCustomName('');
      fetchEnquiries();
      fetchAssignedCustomNames();
    } catch (error) {
      console.error('Error saving enquiry:', error);
      alert('Error saving enquiry: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (enquiry) => {
    if (enquiry.is_converted_to_quotation) {
      alert('Cannot edit enquiry that has been converted to quotation');
      return;
    }
    setDocumentsToRemove([]);
    setEditingEnquiry(enquiry);
    let ids = [];
    let names = [];
    if (enquiry.assigned_to_ids) {
      ids = Array.isArray(enquiry.assigned_to_ids) ? [...enquiry.assigned_to_ids] : (typeof enquiry.assigned_to_ids === 'string' ? (() => { try { const p = JSON.parse(enquiry.assigned_to_ids); return Array.isArray(p) ? p : []; } catch (_) { return []; } })() : []);
    } else if (enquiry.assigned_to) {
      ids = [enquiry.assigned_to];
    }
    if (enquiry.assigned_to_custom_names) {
      names = Array.isArray(enquiry.assigned_to_custom_names) ? [...enquiry.assigned_to_custom_names] : (typeof enquiry.assigned_to_custom_names === 'string' ? (() => { try { const p = JSON.parse(enquiry.assigned_to_custom_names); return Array.isArray(p) ? p : []; } catch (_) { return []; } })() : []);
    } else if (enquiry.assigned_to_name?.trim()) {
      names = [enquiry.assigned_to_name.trim()];
    }
    setFormData({
      enquiry_date: enquiry.enquiry_date || new Date().toISOString().split('T')[0],
      source: enquiry.source || 'Email',
      client_id: enquiry.client_id || '',
      contact_person: enquiry.contact_person || '',
      contact_number: enquiry.contact_number || '',
      contact_email: enquiry.contact_email || '',
      site_location: enquiry.site_location || '',
      description: enquiry.description || '',
      estimated_value: enquiry.estimated_value || '',
      expected_closing_date: enquiry.expected_closing_date || '',
      status: enquiry.status || 'New',
      assigned_to_ids: ids,
      assigned_to_custom_names: names,
    });
    setShowAddNameInput(false);
    setNewCustomName('');
    setUploadedFiles([]);

    const enquiryId = enquiry?.id;
    let docsList = [];
    if (enquiryId) {
      const { data: docs, error: docError } = await supabase
        .from(ENQUIRY_DOCUMENTS_TABLE)
        .select('id, file_name, file_path, file_type, file_size')
        .eq('enquiry_id', enquiryId);
      if (docError) {
        console.error('Error fetching enquiry documents for Edit:', docError);
      } else {
        docsList = Array.isArray(docs) ? docs : [];
      }
      const withUrls = await Promise.all(
        docsList.map(async (doc) => {
          const path = doc.file_path;
          if (!path) return { ...doc, fileUrl: null };
          try {
            const { data: signed } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 3600);
            if (signed?.signedUrl) return { ...doc, fileUrl: signed.signedUrl };
          } catch (_) {}
          const { data: publicData } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
          return { ...doc, fileUrl: publicData?.publicUrl || null };
        })
      );
      setExistingDocuments(withUrls);
    } else {
      setExistingDocuments([]);
    }

    setShowForm(true);
  };

  const handleView = async (enquiry) => {
    setViewingBrokenImageIds(new Set());
    setDocumentsLoadError(null);
    const enquiryId = enquiry?.id;
    let docsList = [];
    if (enquiryId) {
      const { data: documents, error: docError } = await supabase
        .from(ENQUIRY_DOCUMENTS_TABLE)
        .select('id, file_name, file_path, file_type, file_size')
        .eq('enquiry_id', enquiryId);

      if (docError) {
        console.error('Error fetching enquiry documents for View:', docError);
        setDocumentsLoadError(docError.message || 'Could not load documents.');
      } else {
        docsList = Array.isArray(documents) ? documents : [];
      }
    }

    const docsWithUrls = await Promise.all(
      docsList.map(async (doc) => {
        const path = doc.file_path;
        if (!path) return { ...doc, fileUrl: null };
        try {
          const { data: signed } = await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .createSignedUrl(path, 3600);
          if (signed?.signedUrl) return { ...doc, fileUrl: signed.signedUrl };
        } catch (_) {}
        const { data: publicData } = supabase.storage
          .from(DOCUMENTS_BUCKET)
          .getPublicUrl(path);
        return { ...doc, fileUrl: publicData?.publicUrl || null };
      })
    );

    setViewingEnquiry({ ...enquiry, documents: docsWithUrls });
    setShowViewModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this enquiry?')) return;

    try {
      const { error } = await supabase
        .from('marketing_enquiries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchEnquiries();
    } catch (error) {
      console.error('Error deleting enquiry:', error);
      alert('Error deleting enquiry: ' + error.message);
    }
  };

  const handleConvertToQuotation = async (enquiry) => {
    try {
      // Check if enquiry is already converted
      if (enquiry.is_converted_to_quotation) {
        alert('This enquiry has already been converted to a quotation.');
        return;
      }

      // Navigate to quotation tracker - enquiry will be marked as converted only after successful quotation creation
      navigate(`/app/marketing/quotation-tracker?enquiry_id=${enquiry.id}`);
    } catch (error) {
      console.error('Error converting enquiry:', error);
      alert('Error converting enquiry: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = enquiries.map(enquiry => {
      const customNames = Array.isArray(enquiry.assigned_to_custom_names) ? enquiry.assigned_to_custom_names : (enquiry.assigned_to_name?.trim() ? [enquiry.assigned_to_name] : []);
      const ids = Array.isArray(enquiry.assigned_to_ids) ? enquiry.assigned_to_ids : (enquiry.assigned_to ? [enquiry.assigned_to] : []);
      const userLabels = ids.map((id) => {
        const u = users.find((x) => x.id === id);
        return u ? (u.username?.trim() ? `${u.username} (${u.email})` : u.email) : id;
      });
      const assignedTo = [...customNames, ...userLabels].join('; ') || '-';
      return {
        'Enquiry Number': enquiry.enquiry_number,
        'Enquiry Date': enquiry.enquiry_date,
        'Source': enquiry.source,
        'Client': enquiry.marketing_clients?.client_name || '-',
        'Contact Person': enquiry.contact_person || '-',
        'Contact Number': enquiry.contact_number || '-',
        'Contact Email': enquiry.contact_email || '-',
        'Site Location': enquiry.site_location || '-',
        'Assigned To': assignedTo,
        'Estimated Value (₹)': enquiry.estimated_value || '-',
        'Expected Closing Date': enquiry.expected_closing_date || '-',
        'Status': enquiry.status,
        'Converted to Quotation': enquiry.is_converted_to_quotation ? 'Yes' : 'No',
        'Created At': new Date(enquiry.created_at).toLocaleDateString(),
      };
    });
    exportToExcel(exportData, 'Enquiries_Export', 'Enquiries');
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Enquiry Master</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage all customer enquiries</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Search Bar */}
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by enquiry number, client name, or contact person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
            {/* Date Range Filter */}
            <div className="relative">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 border rounded-lg text-sm sm:text-base transition-colors ${
                  dateRange.startDate || dateRange.endDate
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {dateRange.startDate && dateRange.endDate
                    ? `${new Date(dateRange.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(dateRange.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                    : dateRange.startDate
                    ? `From ${new Date(dateRange.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                    : 'Select Date Range'}
                </span>
                <span className="sm:hidden">Date Range</span>
              </button>
              
              {showCalendar && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowCalendar(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 z-50">
                    <DateRangeCalendar
                      startDate={dateRange.startDate}
                      endDate={dateRange.endDate}
                      onDateRangeChange={(range) => {
                        setDateRange(range);
                        if (range.startDate && range.endDate) {
                          setShowCalendar(false);
                        }
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleExport}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={async () => {
                setEditingEnquiry(null);
                const { data: { user } } = await supabase.auth.getUser();
                const defaultIds = user?.id ? [user.id] : [];
                setFormData({
                  enquiry_date: new Date().toISOString().split('T')[0],
                  source: 'Email',
                  client_id: '',
                  contact_person: '',
                  contact_number: '',
                  contact_email: '',
                  site_location: '',
                  description: '',
                  estimated_value: '',
                  expected_closing_date: '',
                  status: 'New',
                  assigned_to_ids: defaultIds,
                  assigned_to_custom_names: [],
                });
                setShowAddNameInput(false);
                setNewCustomName('');
                setUploadedFiles([]);
                setExistingDocuments([]);
                fetchClients();
                fetchUsers();
                fetchAssignedCustomNames();
                setShowForm(true);
              }}
              className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
            >
              <Plus className="w-4 h-4" />
              <span>New Enquiry</span>
            </button>
          </div>
        </div>

        {/* Enquiries Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ overflow: 'visible' }}>
          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              <p className="mt-2 text-sm">Loading...</p>
            </div>
          ) : enquiries.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <FileText className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <p className="text-base font-medium">No enquiries found</p>
              <p className="text-xs mt-1">Create your first enquiry to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#c084fc #f3f4f6' }}>
              <style>{`
                .overflow-x-auto::-webkit-scrollbar {
                  height: 8px;
                }
                .overflow-x-auto::-webkit-scrollbar-track {
                  background: #f3f4f6;
                  border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb {
                  background: #c084fc;
                  border-radius: 4px;
                }
                .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                  background: #a855f7;
                }
              `}</style>
              <table className="w-full min-w-[1100px] text-xs">
                <thead className="bg-gradient-to-r from-red-50 to-amber-50 border-b border-red-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Enquiry ID</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Client Name</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Expected Closing Date</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Estimated Value</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">Convert</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {(() => {
                    // Filter enquiries based on search query
                    const filteredEnquiries = enquiries.filter(enquiry => {
                      if (!searchQuery) return true;
                      const query = searchQuery.toLowerCase();
                      const enquiryNumber = enquiry.enquiry_number?.toLowerCase() || '';
                      const clientName = enquiry.marketing_clients?.client_name?.toLowerCase() || '';
                      const contactPerson = enquiry.contact_person?.toLowerCase() || '';
                      return enquiryNumber.includes(query) || 
                             clientName.includes(query) || 
                             contactPerson.includes(query);
                    });
                    
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const paginatedEnquiries = filteredEnquiries.length > 20 
                      ? filteredEnquiries.slice(startIndex, endIndex)
                      : filteredEnquiries;
                    
                    return paginatedEnquiries.map((enquiry, index) => {
                      const isLastRow = index === paginatedEnquiries.length - 1;
                      return (
                    <tr key={enquiry.id} className="hover:bg-purple-50/30 transition-colors" data-is-last-row={isLastRow}>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold text-gray-900">{enquiry.enquiry_number}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-700 font-medium">
                          {enquiry.marketing_clients?.client_name || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-600">
                          {new Date(enquiry.enquiry_date).toLocaleDateString('en-GB', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-600">
                          {enquiry.expected_closing_date 
                            ? new Date(enquiry.expected_closing_date).toLocaleDateString('en-GB', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })
                            : '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold text-gray-900">
                          {enquiry.estimated_value ? `₹${parseFloat(enquiry.estimated_value).toLocaleString('en-IN')}` : '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                          enquiry.is_converted_to_quotation 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : enquiry.status === 'New' 
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : enquiry.status === 'In Progress'
                            ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                            : enquiry.status === 'Follow Up'
                            ? 'bg-orange-100 text-orange-700 border border-orange-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {enquiry.is_converted_to_quotation ? 'Converted' : enquiry.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => !enquiry.is_converted_to_quotation && handleConvertToQuotation(enquiry)}
                          disabled={enquiry.is_converted_to_quotation}
                          className={`px-3 py-1 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${
                            enquiry.is_converted_to_quotation
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                              : 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-sm active:scale-95'
                          }`}
                          title={enquiry.is_converted_to_quotation ? 'Already Converted' : 'Convert to Quotation'}
                        >
                          {enquiry.is_converted_to_quotation ? 'Converted' : 'Convert'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center" style={{ position: 'relative', overflow: 'visible' }}>
                        <div className="relative inline-block text-center" style={{ zIndex: menuOpen === enquiry.id ? 1000 : 'auto' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(menuOpen === enquiry.id ? null : enquiry.id);
                            }}
                            className="p-1.5 hover:bg-purple-100 rounded-md transition-colors text-gray-600 hover:text-purple-700"
                            title="Actions"
                            data-enquiry-id={enquiry.id}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpen === enquiry.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setMenuOpen(null)}
                                style={{ backgroundColor: 'transparent' }}
                              ></div>
                              <div 
                                ref={(el) => {
                                  if (el && menuOpen === enquiry.id) {
                                    setTimeout(() => {
                                      const button = el.previousElementSibling;
                                      const row = el.closest('tr');
                                      const isLastRow = row?.getAttribute('data-is-last-row') === 'true';
                                      
                                      if (button) {
                                        const rect = button.getBoundingClientRect();
                                        const viewportHeight = window.innerHeight;
                                        const dropdownHeight = el.offsetHeight || 150;
                                        const spaceBelow = viewportHeight - rect.bottom;
                                        const spaceAbove = rect.top;
                                        
                                        // Reset all positioning classes
                                        el.classList.remove('mt-1', 'mb-1', 'bottom-full', 'top-full');
                                        
                                        // Check if it's the last row or if there's not enough space below
                                        const needsTopPosition = isLastRow || (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight);
                                        
                                        if (needsTopPosition) {
                                          el.classList.add('mb-1', 'bottom-full');
                                        } else {
                                          el.classList.add('mt-1', 'top-full');
                                        }
                                      }
                                    }, 0);
                                  }
                                }}
                                className="absolute right-0 top-full mt-1 bg-white rounded-md shadow-lg border border-gray-200"
                                style={{ 
                                  minWidth: '140px',
                                  width: 'auto',
                                  zIndex: 1000,
                                  overflow: 'hidden',
                                  maxHeight: 'none'
                                }}
                              >
                                <div className="py-0.5" style={{ overflow: 'visible' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleView(enquiry);
                                      setMenuOpen(null);
                                    }}
                                    className="flex items-center space-x-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-purple-50 text-left transition-colors whitespace-nowrap"
                                  >
                                    <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="flex-1">View</span>
                                  </button>
                                  {!enquiry.is_converted_to_quotation && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEdit(enquiry);
                                          setMenuOpen(null);
                                        }}
                                        className="flex items-center space-x-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-purple-50 text-left transition-colors whitespace-nowrap"
                                      >
                                        <Edit2 className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="flex-1">Edit</span>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDelete(enquiry.id);
                                          setMenuOpen(null);
                                        }}
                                        className="flex items-center space-x-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left transition-colors whitespace-nowrap"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="flex-1">Delete</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {enquiries.length > 20 && (
          <div className="mt-2 flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-2 bg-white border-t border-gray-200 rounded-b-lg">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, enquiries.length)} of {enquiries.length}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">Show:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Previous
              </button>
              <span className="text-xs text-gray-600 px-2">
                Page {currentPage} of {Math.ceil(enquiries.length / itemsPerPage)}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(enquiries.length / itemsPerPage), prev + 1))}
                disabled={currentPage >= Math.ceil(enquiries.length / itemsPerPage)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  currentPage >= Math.ceil(enquiries.length / itemsPerPage)
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Enquiry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingEnquiry ? 'Edit Enquiry' : 'Create New Enquiry'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Add a new customer enquiry to the system</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingEnquiry(null);
                  setUploadedFiles([]);
                  setExistingDocuments([]);
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
                    Enquiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.enquiry_date}
                    onChange={(e) => handleDateInputChange('enquiry_date', e.target.value)}
                    min="1900-01-01"
                    max="9999-12-31"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="Email">Email</option>
                    <option value="Phone">Phone</option>
                    <option value="Website">Website</option>
                    <option value="Referral">Referral</option>
                    <option value="Expo">Expo</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={formData.client_id}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select a client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.client_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => navigate('/app/marketing/client-master')}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Client</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Number</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Site Location</label>
                  <input
                    type="text"
                    value={formData.site_location}
                    onChange={(e) => setFormData({ ...formData, site_location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Value (₹)</label>
                  <NumberInput
                    value={formData.estimated_value}
                    onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., 5,00,000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expected Closing Date</label>
                  <input
                    type="date"
                    value={formData.expected_closing_date}
                    onChange={(e) => handleDateInputChange('expected_closing_date', e.target.value)}
                    min="1900-01-01"
                    max="9999-12-31"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="New">New</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Follow Up">Follow Up</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                  <div className="flex items-center gap-1.5 min-h-[2.5rem] px-3 py-1.5 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent bg-white">
                    <button
                      type="button"
                      onClick={() => setShowAddNameInput(!showAddNameInput)}
                      className="flex-shrink-0 p-1 rounded text-gray-500 hover:bg-purple-100 hover:text-purple-600 transition-colors"
                      title="Add name"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                    <div className="flex-1 flex flex-wrap items-center gap-1 min-h-[1.5rem] py-0.5">
                      {formData.assigned_to_ids?.map((id) => {
                        const u = users.find((x) => x.id === id);
                        const label = u ? (u.username?.trim() || u.email || id) : id;
                        return (
                          <span
                            key={`user-${id}`}
                            className="inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded text-xs bg-purple-100 text-purple-800 border border-purple-200"
                          >
                            <span className="max-w-[100px] truncate" title={u?.email}>{label}</span>
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({
                                ...prev,
                                assigned_to_ids: (prev.assigned_to_ids || []).filter((x) => x !== id),
                              }))}
                              className="hover:bg-purple-200 rounded p-0.5"
                              aria-label="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                      {formData.assigned_to_custom_names?.map((name, idx) => (
                        <span
                          key={`custom-${idx}-${name}`}
                          className="inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded text-xs bg-red-100 text-red-900 border border-red-200"
                        >
                          <span className="max-w-[80px] truncate">{name}</span>
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({
                              ...prev,
                              assigned_to_custom_names: (prev.assigned_to_custom_names || []).filter((_, i) => i !== idx),
                            }))}
                            className="hover:bg-red-200 rounded p-0.5"
                            aria-label="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {showAddNameInput ? (
                        <input
                          type="text"
                          value={newCustomName}
                          onChange={(e) => setNewCustomName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const name = newCustomName.trim();
                              if (name && !(formData.assigned_to_custom_names || []).includes(name)) {
                                setFormData((prev) => ({
                                  ...prev,
                                  assigned_to_custom_names: [...(prev.assigned_to_custom_names || []), name],
                                }));
                                setCustomNamesOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
                                setNewCustomName('');
                                setShowAddNameInput(false);
                              }
                            } else if (e.key === 'Escape') {
                              setShowAddNameInput(false);
                              setNewCustomName('');
                            }
                          }}
                          onBlur={() => {
                            const name = newCustomName.trim();
                            if (name && !(formData.assigned_to_custom_names || []).includes(name)) {
                              setFormData((prev) => ({
                                ...prev,
                                assigned_to_custom_names: [...(prev.assigned_to_custom_names || []), name],
                              }));
                              setCustomNamesOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
                            }
                            setNewCustomName('');
                            setShowAddNameInput(false);
                          }}
                          placeholder="Name, Enter"
                          className="w-20 min-w-[4rem] px-1.5 py-0.5 text-xs border-0 border-b border-gray-400 rounded-none bg-transparent focus:outline-none focus:ring-0 focus:border-purple-500"
                          autoFocus
                        />
                      ) : (
                        <select
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = '';
                            if (!v) return;
                            if (v.startsWith('user:')) {
                              const id = v.slice(5);
                              if (id && !(formData.assigned_to_ids || []).includes(id)) {
                                setFormData((prev) => ({
                                  ...prev,
                                  assigned_to_ids: [...(prev.assigned_to_ids || []), id],
                                }));
                              }
                            } else if (v.startsWith('name:')) {
                              const name = v.slice(5).trim();
                              if (name && !(formData.assigned_to_custom_names || []).includes(name)) {
                                setFormData((prev) => ({
                                  ...prev,
                                  assigned_to_custom_names: [...(prev.assigned_to_custom_names || []), name],
                                }));
                              }
                            }
                          }}
                          className="flex-1 min-w-0 max-w-[120px] py-0.5 pl-1 pr-6 text-xs border-0 bg-transparent text-gray-600 focus:ring-0 focus:outline-none cursor-pointer"
                        >
                          <option value="">Add user...</option>
                          {users
                            .filter((u) => !(formData.assigned_to_ids || []).includes(u.id))
                            .map((u) => (
                              <option key={u.id} value={`user:${u.id}`}>
                                {u.username?.trim() || u.email || u.id}
                              </option>
                            ))}
                          {customNamesOptions
                            .filter((n) => !(formData.assigned_to_custom_names || []).includes(n))
                            .map((n) => (
                              <option key={n} value={`name:${n}`}>{n}</option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload Documents & Images</label>
                  {existingDocuments.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 mb-2">
                        Already attached ({existingDocuments.filter((d) => !documentsToRemove.includes(d.id)).length}
                        {documentsToRemove.length > 0 && `, ${documentsToRemove.length} marked for removal`})
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {existingDocuments.map((doc) => {
                          const markedForRemoval = documentsToRemove.includes(doc.id);
                          const isImage = doc.file_type && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(String(doc.file_type).toLowerCase());
                          return (
                            <div
                              key={doc.id}
                              className={`relative bg-white border rounded-lg overflow-hidden group ${markedForRemoval ? 'border-red-300 bg-red-50/50 opacity-75' : 'border-gray-200'}`}
                            >
                              {markedForRemoval && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-100/80 rounded-lg">
                                  <span className="text-xs font-semibold text-red-700 px-2 py-1 bg-white/90 rounded">Will be removed</span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (markedForRemoval) {
                                    setDocumentsToRemove((prev) => prev.filter((id) => id !== doc.id));
                                  } else {
                                    setDocumentsToRemove((prev) => [...prev, doc.id]);
                                  }
                                }}
                                className={`absolute top-1 right-1 z-20 p-1 rounded-full transition-opacity ${markedForRemoval ? 'bg-gray-500 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white opacity-0 group-hover:opacity-100 focus:opacity-100`}
                                title={markedForRemoval ? 'Undo remove' : 'Remove document'}
                                aria-label={markedForRemoval ? 'Undo remove' : 'Remove document'}
                              >
                                {markedForRemoval ? (
                                  <RotateCcw className="w-3.5 h-3.5" title="Undo remove" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {isImage && doc.fileUrl ? (
                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-gray-100">
                                  <img src={doc.fileUrl} alt={doc.file_name} className="w-full h-full object-cover" />
                                </a>
                              ) : (
                                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                                  <FileText className="w-10 h-10 text-gray-400" />
                                </div>
                              )}
                              <div className="p-2 border-t border-gray-100">
                                <p className="text-xs font-medium text-gray-900 truncate" title={doc.file_name}>{doc.file_name}</p>
                                {doc.file_size != null && <p className="text-[10px] text-gray-500">{(Number(doc.file_size) / 1024).toFixed(1)} KB</p>}
                                {doc.fileUrl && !markedForRemoval && (
                                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 hover:text-purple-700 font-medium">
                                    <Eye className="w-3.5 h-3.5" /> View
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    onChange={(e) => {
                      const newFiles = e.target.files ? Array.from(e.target.files) : [];
                      setUploadedFiles((prev) => [...prev, ...newFiles]);
                      e.target.value = '';
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                  />
                  {uploadedFiles.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {uploadedFiles.map((file, index) => {
                        const isImg = file.type.startsWith('image/');
                        const previewUrl = isImg ? URL.createObjectURL(file) : null;
                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className="relative bg-white border border-gray-200 rounded-lg overflow-hidden group"
                          >
                            <button
                              type="button"
                              onClick={() => setUploadedFiles((prev) => prev.filter((_, i) => i !== index))}
                              className="absolute top-1 right-1 z-10 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              aria-label="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {isImg && previewUrl ? (
                              <div className="aspect-square bg-gray-100">
                                <img
                                  src={previewUrl}
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="aspect-square bg-gray-100 flex items-center justify-center">
                                <FileText className="w-10 h-10 text-gray-400" />
                              </div>
                            )}
                            <div className="p-2 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-900 truncate" title={file.name}>{file.name}</p>
                              <p className="text-[10px] text-gray-500">{file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingEnquiry(null);
                    setUploadedFiles([]);
                    setExistingDocuments([]);
                    setDocumentsToRemove([]);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors ${
                    submitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {submitting ? 'Saving...' : (editingEnquiry ? 'Update Enquiry' : 'Create Enquiry')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Enquiry Modal */}
      {showViewModal && viewingEnquiry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-800 text-white p-4 sm:p-6 flex justify-between items-center rounded-t-xl">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Enquiry Details</h2>
                <p className="text-sm text-purple-100 mt-1">{viewingEnquiry.enquiry_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingEnquiry(null);
                  setDocumentsLoadError(null);
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-6">
              {/* Basic Information Section */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Enquiry Number</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingEnquiry.enquiry_number || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Enquiry Date</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.enquiry_date 
                          ? new Date(viewingEnquiry.enquiry_date).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: 'short', 
                              year: 'numeric' 
                            })
                          : <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Client Name</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.marketing_clients?.client_name || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Source</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.source || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      {viewingEnquiry.status || viewingEnquiry.is_converted_to_quotation ? (
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                          viewingEnquiry.is_converted_to_quotation 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : viewingEnquiry.status === 'New' 
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : viewingEnquiry.status === 'In Progress'
                            ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                            : viewingEnquiry.status === 'Follow Up'
                            ? 'bg-orange-100 text-orange-700 border border-orange-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {viewingEnquiry.is_converted_to_quotation ? 'Converted' : viewingEnquiry.status}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-sm">Not provided</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Expected Closing Date</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.expected_closing_date 
                          ? new Date(viewingEnquiry.expected_closing_date).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: 'short', 
                              year: 'numeric' 
                            })
                          : <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Estimated Value</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm font-semibold text-gray-900">
                        {viewingEnquiry.estimated_value 
                          ? `₹${parseFloat(viewingEnquiry.estimated_value).toLocaleString('en-IN')}` 
                          : <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Assigned To</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {(() => {
                          const customNames = Array.isArray(viewingEnquiry.assigned_to_custom_names)
                            ? viewingEnquiry.assigned_to_custom_names
                            : (viewingEnquiry.assigned_to_name?.trim() ? [viewingEnquiry.assigned_to_name.trim()] : []);
                          const ids = Array.isArray(viewingEnquiry.assigned_to_ids)
                            ? viewingEnquiry.assigned_to_ids
                            : (viewingEnquiry.assigned_to ? [viewingEnquiry.assigned_to] : []);
                          const userLabels = ids.map((id) => {
                            const u = users.find((x) => x.id === id);
                            return u ? (u.username?.trim() ? `${u.username} (${u.email})` : u.email) : id;
                          });
                          const all = [...customNames, ...userLabels];
                          return all.length > 0 ? all.join(', ') : <span className="text-gray-400 italic">Not provided</span>;
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Information Section */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact Person</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.contact_person || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact Number</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.contact_number || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Contact Email</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.contact_email || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location & Description Section */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-purple-600" />
                  Location & Description
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Site Location</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-gray-900">
                        {viewingEnquiry.site_location || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Description</label>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 min-h-[100px]">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">
                        {viewingEnquiry.description || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents Section */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  Documents & Images
                </h3>
                {documentsLoadError && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    {documentsLoadError} Ensure table &quot;{ENQUIRY_DOCUMENTS_TABLE}&quot; exists — run <code className="text-xs bg-amber-100 px-1 rounded">marketing_enquiry_documents_schema.sql</code> in Supabase SQL Editor.
                  </div>
                )}
                {viewingEnquiry.documents && viewingEnquiry.documents.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {viewingEnquiry.documents.map((doc) => {
                      const fileUrl = doc.fileUrl || (doc.file_path
                        ? supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(doc.file_path).data?.publicUrl
                        : null);
                      const isImage = doc.file_type && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(String(doc.file_type).toLowerCase());
                      const imageBroken = viewingBrokenImageIds.has(doc.id);
                      const showImage = isImage && fileUrl && !imageBroken;
                      return (
                        <div key={doc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors shadow-sm">
                          {showImage ? (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-square bg-gray-100"
                            >
                              <img
                                src={fileUrl}
                                alt={doc.file_name || 'Document'}
                                className="w-full h-full object-cover"
                                onError={() => setViewingBrokenImageIds((prev) => new Set([...prev, doc.id]))}
                              />
                            </a>
                          ) : (
                            <div className="aspect-square bg-gray-100 flex items-center justify-center">
                              <FileText className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                          <div className="p-2 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-900 truncate" title={doc.file_name}>{doc.file_name || 'Document'}</p>
                            {doc.file_size != null && (
                              <p className="text-[10px] text-gray-500">{(Number(doc.file_size) / 1024).toFixed(1)} KB</p>
                            )}
                            {fileUrl && (
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 hover:text-purple-700 font-medium"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-4 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 italic">No documents attached</p>
                    {!documentsLoadError && (
                      <p className="text-xs text-gray-500 mt-1">Uploads appear here after save. If you just added files, ensure table &quot;{ENQUIRY_DOCUMENTS_TABLE}&quot; exists and storage bucket &quot;{DOCUMENTS_BUCKET}&quot; is created.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 sm:p-6 flex justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingEnquiry(null);
                  setDocumentsLoadError(null);
                }}
                className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnquiryMaster;

