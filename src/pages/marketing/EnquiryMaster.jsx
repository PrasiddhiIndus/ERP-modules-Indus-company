import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Eye, FileText, ArrowRight, Search, Calendar, Users, MapPin } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import DateRangeCalendar from './components/DateRangeCalendar';

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
    assigned_to: '',
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dateRange, setDateRange] = useState({
    startDate: searchParams.get('startDate') || '',
    endDate: searchParams.get('endDate') || '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEnquiries();
    fetchClients();
    fetchUsers();
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
        .select('id, client_name')
        .order('client_name');
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await supabase.auth.admin.listUsers();
      setUsers(data?.users || []);
    } catch (error) {
      // Fallback: try to get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUsers([user]);
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

      const submitData = {
        ...formData,
        enquiry_number: enquiryNumber,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null,
        expected_closing_date: formData.expected_closing_date || null,
        client_id: formData.client_id || null,
        assigned_to: formData.assigned_to || null,
      };

      let enquiryId;
      if (editingEnquiry) {
        const { data, error } = await supabase
          .from('marketing_enquiries')
          .update({
            ...submitData,
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
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }])
          .select()
          .single();

        if (error) throw error;
        enquiryId = data.id;
      }

      // Handle file uploads
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${file.name}`;
          const filePath = `enquiries/${enquiryId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('marketing-documents')
            .upload(filePath, file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('marketing-documents')
              .getPublicUrl(filePath);

            await supabase.from('marketing_enquiry_documents').insert([{
              enquiry_id: enquiryId,
              file_name: file.name,
              file_path: filePath,
              file_type: fileExt,
              file_size: file.size,
              uploaded_by: user.id,
            }]);
          }
        }
      }

      setShowForm(false);
      setEditingEnquiry(null);
      setUploadedFiles([]);
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
        assigned_to: '',
      });
      fetchEnquiries();
    } catch (error) {
      console.error('Error saving enquiry:', error);
      alert('Error saving enquiry: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (enquiry) => {
    if (enquiry.is_converted_to_quotation) {
      alert('Cannot edit enquiry that has been converted to quotation');
      return;
    }
    setEditingEnquiry(enquiry);
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
      assigned_to: enquiry.assigned_to || '',
    });
    setShowForm(true);
  };

  const handleView = async (enquiry) => {
    const { data: documents } = await supabase
      .from('marketing_enquiry_documents')
      .select('*')
      .eq('enquiry_id', enquiry.id);

    setViewingEnquiry({ ...enquiry, documents: documents || [] });
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
      navigate(`/marketing/quotation-tracker?enquiry_id=${enquiry.id}`);
    } catch (error) {
      console.error('Error converting enquiry:', error);
      alert('Error converting enquiry: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = enquiries.map(enquiry => ({
      'Enquiry Number': enquiry.enquiry_number,
      'Enquiry Date': enquiry.enquiry_date,
      'Source': enquiry.source,
      'Client': enquiry.marketing_clients?.client_name || '-',
      'Contact Person': enquiry.contact_person || '-',
      'Contact Number': enquiry.contact_number || '-',
      'Contact Email': enquiry.contact_email || '-',
      'Site Location': enquiry.site_location || '-',
      'Estimated Value (₹)': enquiry.estimated_value || '-',
      'Expected Closing Date': enquiry.expected_closing_date || '-',
      'Status': enquiry.status,
      'Converted to Quotation': enquiry.is_converted_to_quotation ? 'Yes' : 'No',
      'Created At': new Date(enquiry.created_at).toLocaleDateString(),
    }));
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
              onClick={() => {
                setEditingEnquiry(null);
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
                  assigned_to: '',
                });
                setUploadedFiles([]);
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
                <thead className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200">
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
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
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
                    onChange={(e) => setFormData({ ...formData, enquiry_date: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
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
                      onClick={() => navigate('/marketing/client-master')}
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
                  <input
                    type="number"
                    step="0.01"
                    value={formData.estimated_value}
                    onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expected Closing Date</label>
                  <input
                    type="date"
                    value={formData.expected_closing_date}
                    onChange={(e) => setFormData({ ...formData, expected_closing_date: e.target.value })}
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
                  <select
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select user</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload Documents</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setUploadedFiles(Array.from(e.target.files))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  {uploadedFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="text-sm text-gray-600 flex items-center space-x-2">
                          <FileText className="w-4 h-4" />
                          <span>{file.name}</span>
                        </div>
                      ))}
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
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6 flex justify-between items-center rounded-t-xl">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Enquiry Details</h2>
                <p className="text-sm text-purple-100 mt-1">{viewingEnquiry.enquiry_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingEnquiry(null);
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
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
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
                  Documents
                </h3>
                {viewingEnquiry.documents && viewingEnquiry.documents.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viewingEnquiry.documents.map((doc) => (
                      <div key={doc.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 hover:border-purple-300 transition-colors">
                        <div className="bg-purple-100 p-2 rounded-lg">
                          <FileText className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                          {doc.file_size && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {(doc.file_size / 1024).toFixed(2)} KB
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-4 text-center">
                    <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 italic">No documents attached</p>
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

