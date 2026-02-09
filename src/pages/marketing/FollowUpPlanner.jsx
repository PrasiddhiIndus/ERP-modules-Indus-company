import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Eye, Calendar, RefreshCw, Search, Users } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import ExcelCostingSheet from './components/ExcelCostingSheet';

const FollowUpPlanner = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('followup'); // 'followup' or 'visitor'
  const [followUps, setFollowUps] = useState([]);
  const [siteVisits, setSiteVisits] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingFollowUp, setViewingFollowUp] = useState(null);
  const [editingFollowUp, setEditingFollowUp] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [filter, setFilter] = useState('upcoming'); // 'upcoming', 'all', 'past'
  const [visitFilter, setVisitFilter] = useState('upcoming'); // 'upcoming', 'all', 'past'
  const [searchQuery, setSearchQuery] = useState('');
  const [visitSearchQuery, setVisitSearchQuery] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedFollowUpForRevision, setSelectedFollowUpForRevision] = useState(null);
  const [revisionFormData, setRevisionFormData] = useState({
    upcoming_date: new Date().toISOString().split('T')[0],
    remarks: '',
    status: 'Pending',
  });
  const [formData, setFormData] = useState({
    enquiry_id: '',
    quotation_id: '',
    follow_up_date: new Date().toISOString().split('T')[0],
    due_date: '',
    remarks: '',
    status: 'Pending',
  });

  useEffect(() => {
    if (activeTab === 'followup') {
      fetchFollowUps();
      fetchEnquiries();
      fetchQuotations();
    } else {
      fetchSiteVisits();
    }
  }, [filter, visitFilter, activeTab]);

  const fetchFollowUps = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('marketing_follow_ups')
        .select(`
          *,
          marketing_enquiries:enquiry_id (id, enquiry_number, client_id, marketing_clients:client_id (client_name, contact_email)),
          marketing_quotations:quotation_id (id, quotation_number, marketing_clients:client_id (client_name, contact_email))
        `)
        .order('follow_up_date', { ascending: true });

      const today = new Date().toISOString().split('T')[0];
      
      if (filter === 'upcoming') {
        query = query.gte('follow_up_date', today);
      } else if (filter === 'past') {
        query = query.lt('follow_up_date', today);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Fetch revision creation dates for quotation follow-ups
      const processedFollowUps = await Promise.all((data || []).map(async (followUp) => {
        const followUpDate = new Date(followUp.follow_up_date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        followUpDate.setHours(0, 0, 0, 0);
        
        // Auto-update status based on date
        let autoStatus = followUp.status;
        if (followUpDate < todayDate && followUp.status === 'Pending') {
          autoStatus = 'Overdue';
        } else if (followUpDate.getTime() === todayDate.getTime() && followUp.status === 'Pending') {
          autoStatus = 'Pending';
        }
        
        // Check if this is a revision and get the revision creation date
        let revisionCreatedDate = null;
        const isRevision = followUp.remarks?.includes('Revision');
        if (isRevision && followUp.quotation_id) {
          // Extract revision number from remarks (e.g., "Revision 1: ...")
          const revisionMatch = followUp.remarks?.match(/Revision (\d+):/);
          if (revisionMatch) {
            const revisionNumber = parseInt(revisionMatch[1]);
            const { data: revision } = await supabase
              .from('marketing_quotation_revisions')
              .select('created_at')
              .eq('quotation_id', followUp.quotation_id)
              .eq('revision_number', revisionNumber)
              .single();
            
            if (revision) {
              revisionCreatedDate = revision.created_at;
            }
          }
        }
        
        return {
          ...followUp,
          computed_status: autoStatus,
          is_revision: isRevision,
          revision_created_date: revisionCreatedDate || followUp.created_at, // Use revision created date if available, else follow-up created date
        };
      }));
      
      // Remove duplicates: For quotations, keep only the most recent follow-up per base quotation number
      // Base number strips any /R suffix so revisions stay grouped.
      const getBaseNumber = (qNum) => (qNum ? qNum.split('/R')[0] : '');
      const getRevisionNumber = (qNum) => {
        if (!qNum || !qNum.includes('/R')) return 0;
        const parts = qNum.split('/R');
        return parseInt(parts[1]) || 0;
      };

      const quotationMap = new Map();
      const enquiryFollowUps = [];

      processedFollowUps.forEach(followUp => {
        if (followUp.quotation_id) {
          const qNum = followUp.marketing_quotations?.quotation_number;
          const base = getBaseNumber(qNum) || followUp.quotation_id; // fallback to id
          const existing = quotationMap.get(base);
          if (!existing) {
            quotationMap.set(base, followUp);
            return;
          }

          const curRev = getRevisionNumber(qNum);
          const exRev = getRevisionNumber(existing.marketing_quotations?.quotation_number);
          if (curRev > exRev) {
            quotationMap.set(base, followUp);
            return;
          }
          if (curRev === exRev) {
            // Compare follow_up_date then created_at
            const existingDate = new Date(existing.follow_up_date);
            const currentDate = new Date(followUp.follow_up_date);
            const existingCreated = new Date(existing.created_at);
            const currentCreated = new Date(followUp.created_at);
            if (currentDate > existingDate || 
                (currentDate.getTime() === existingDate.getTime() && currentCreated > existingCreated)) {
              quotationMap.set(base, followUp);
            }
          }
        } else {
          // For enquiries, keep all (or you can apply same logic if needed)
          enquiryFollowUps.push(followUp);
        }
      });
      
      // Combine unique quotations and all enquiries
      const uniqueFollowUps = [...quotationMap.values(), ...enquiryFollowUps];
      
      // Sort by follow_up_date
      uniqueFollowUps.sort((a, b) => {
        const dateA = new Date(a.follow_up_date);
        const dateB = new Date(b.follow_up_date);
        return dateA - dateB;
      });
      
      setFollowUps(uniqueFollowUps);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      setLoading(false);
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

  const fetchSiteVisits = async () => {
    try {
      setLoadingVisits(true);
      let query = supabase
        .from('marketing_site_visits')
        .select('*')
        .order('visit_date', { ascending: true });

      const today = new Date().toISOString().split('T')[0];
      
      if (visitFilter === 'upcoming') {
        query = query.gte('visit_date', today);
      } else if (visitFilter === 'past') {
        query = query.lt('visit_date', today);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching site visits:', error);
        setSiteVisits([]);
        setLoadingVisits(false);
        return;
      }

      setSiteVisits(data || []);
      setLoadingVisits(false);
    } catch (error) {
      console.error('Error fetching site visits:', error);
      setSiteVisits([]);
      setLoadingVisits(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const submitData = {
        ...formData,
        enquiry_id: formData.enquiry_id || null,
        quotation_id: formData.quotation_id || null,
        due_date: formData.due_date || null,
      };

      if (editingFollowUp) {
        // Auto-update status based on date
        const followUpDate = new Date(submitData.follow_up_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        followUpDate.setHours(0, 0, 0, 0);
        
        // If status is Completed, ensure it's marked as completed
        // If date is past and status is Pending, mark as Overdue
        if (submitData.status === 'Completed') {
          submitData.status = 'Completed';
        } else if (followUpDate < today && submitData.status === 'Pending') {
          submitData.status = 'Overdue';
        }
        
        const { error } = await supabase
          .from('marketing_follow_ups')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingFollowUp.id);

        if (error) throw error;
      } else {
        // Auto-update status based on date for new entries
        const followUpDate = new Date(submitData.follow_up_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        followUpDate.setHours(0, 0, 0, 0);
        
        if (followUpDate < today && submitData.status === 'Pending') {
          submitData.status = 'Overdue';
        }
        
        const { error } = await supabase
          .from('marketing_follow_ups')
          .insert([{
            ...submitData,
            created_by: user.id,
            updated_by: user.id,
          }]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingFollowUp(null);
      setFormData({
        enquiry_id: '',
        quotation_id: '',
        follow_up_date: new Date().toISOString().split('T')[0],
        due_date: '',
        remarks: '',
        status: 'Pending',
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error saving follow-up:', error);
      alert('Error saving follow-up: ' + error.message);
    }
  };

  const handleEdit = (followUp) => {
    setEditingFollowUp(followUp);
    setFormData({
      enquiry_id: followUp.enquiry_id || '',
      quotation_id: followUp.quotation_id || '',
      follow_up_date: followUp.follow_up_date || new Date().toISOString().split('T')[0],
      due_date: followUp.due_date || '',
      remarks: followUp.remarks || '',
      status: followUp.status || 'Pending',
    });
    setShowForm(true);
    setMenuOpen(null);
  };

  const handleRevision = async (followUp) => {
    if (!followUp.quotation_id) {
      alert('Revisions can only be added for quotations');
      return;
    }

    // Get the latest revision number for this quotation
    const { data: latestRevision } = await supabase
      .from('marketing_quotation_revisions')
      .select('revision_number')
      .eq('quotation_id', followUp.quotation_id)
      .order('revision_number', { ascending: false })
      .limit(1)
      .single();

    const nextRevisionNumber = latestRevision ? latestRevision.revision_number + 1 : 1;

    setSelectedFollowUpForRevision(followUp);
    setRevisionFormData({
      upcoming_date: new Date().toISOString().split('T')[0],
      remarks: '',
      status: 'Pending',
    });
    setShowRevisionModal(true);
    setMenuOpen(null);
  };

  const handleRevisionSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!selectedFollowUpForRevision.quotation_id) {
        alert('Revisions can only be added for quotations');
        return;
      }

      // Get the latest revision number for this quotation
      const { data: latestRevision } = await supabase
        .from('marketing_quotation_revisions')
        .select('revision_number')
        .eq('quotation_id', selectedFollowUpForRevision.quotation_id)
        .order('revision_number', { ascending: false })
        .limit(1)
        .single();

      const nextRevisionNumber = latestRevision ? latestRevision.revision_number + 1 : 1;

      // Create revision record
      const { data: revisionData, error: revisionError } = await supabase
        .from('marketing_quotation_revisions')
        .insert([{
          quotation_id: selectedFollowUpForRevision.quotation_id,
          revision_number: nextRevisionNumber,
          revision_date: revisionFormData.upcoming_date,
          remarks: revisionFormData.remarks,
          status: revisionFormData.status,
          created_by: user.id,
          updated_by: user.id,
        }])
        .select()
        .single();

      if (revisionError) throw revisionError;

      // Auto-sync with follow-up planner - create new follow-up entry
      const { error: followUpError } = await supabase
        .from('marketing_follow_ups')
        .insert([{
          quotation_id: selectedFollowUpForRevision.quotation_id,
          follow_up_date: revisionFormData.upcoming_date,
          remarks: `Revision ${nextRevisionNumber}: ${revisionFormData.remarks}`,
          status: revisionFormData.status,
          created_by: user.id,
          updated_by: user.id,
        }]);

      if (followUpError) {
        console.error('Error creating follow-up:', followUpError);
      }

      // Update quotation follow-up date
      await supabase
        .from('marketing_quotations')
        .update({ 
          follow_up_date: revisionFormData.upcoming_date,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFollowUpForRevision.quotation_id);

      setShowRevisionModal(false);
      setSelectedFollowUpForRevision(null);
      setRevisionFormData({
        upcoming_date: new Date().toISOString().split('T')[0],
        remarks: '',
        status: 'Pending',
      });
      fetchFollowUps();
      alert(`Revision ${nextRevisionNumber} created successfully!`);
    } catch (error) {
      console.error('Error saving revision:', error);
      alert('Error saving revision: ' + error.message);
    }
  };

  const handleView = async (followUp) => {
    // Fetch revision history if it's a quotation (show these first, no duplicates)
    let revisionHistory = [];
    if (followUp.quotation_id) {
      const { data: revisions } = await supabase
        .from('marketing_quotation_revisions')
        .select('*')
        .eq('quotation_id', followUp.quotation_id)
        .order('revision_number', { ascending: true }); // Order by revision number: 1, 2, 3...

      // Fetch revision quotations to get final_amount per revision
      let revisionQuotations = [];
      const baseNumber = followUp.marketing_quotations?.quotation_number
        ? followUp.marketing_quotations.quotation_number.split('/R')[0]
        : null;
      if (baseNumber) {
        const { data: revQuotes } = await supabase
          .from('marketing_quotations')
          .select('id, quotation_number, final_amount')
          .ilike('quotation_number', `${baseNumber}/R%`);
        revisionQuotations = revQuotes || [];
      }

      revisionHistory = (revisions || []).map(rev => {
        const revQuote = revisionQuotations.find(q => {
          const parts = q.quotation_number?.split('/R');
          const revNum = parts && parts[1] ? parseInt(parts[1]) : 0;
          return revNum === rev.revision_number;
        });
        return {
          ...rev,
          revision_quotation_final_amount: revQuote?.final_amount,
          created_by_user: { email: 'User' }, // Will be enhanced if user table is available
        };
      });
    }

    // Fetch follow-up history, but filter out entries that are revisions
    // (since revisions are already shown in revision history section)
    const { data: allHistory } = await supabase
      .from('marketing_follow_ups')
      .select(`
        *,
        created_by_user:created_by (email),
        updated_by_user:updated_by (email)
      `)
      .or(`enquiry_id.eq.${followUp.enquiry_id || 'null'},quotation_id.eq.${followUp.quotation_id || 'null'}`)
      .order('follow_up_date', { ascending: false });

    // Filter out follow-up entries that are revisions (they start with "Revision X:")
    // Only show non-revision follow-ups in the follow-up history
    const filteredHistory = (allHistory || []).filter(item => {
      // If it's a quotation follow-up, check if it's a revision entry
      if (item.quotation_id && item.remarks) {
        // If remarks start with "Revision", it's a duplicate of revision history
        return !item.remarks.trim().startsWith('Revision');
      }
      // For enquiries or entries without revision markers, include them
      return true;
    });

    // Fetch costing sheet if it's a quotation
    let costingSheetId = null;
    if (followUp.quotation_id) {
      const { data: costingSheet } = await supabase
        .from('marketing_costing_sheets')
        .select('id')
        .eq('quotation_id', followUp.quotation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (costingSheet) {
        costingSheetId = costingSheet.id;
      }
    }

    setViewingFollowUp({ 
      ...followUp, 
      history: filteredHistory,
      revisionHistory: revisionHistory,
      costingSheetId: costingSheetId
    });
    setShowViewModal(true);
    setMenuOpen(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;

    try {
      const { error } = await supabase
        .from('marketing_follow_ups')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchFollowUps();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting follow-up:', error);
      alert('Error deleting follow-up: ' + error.message);
    }
  };

  const handleExport = () => {
    const exportData = followUps.map(followUp => ({
      'Follow-up Date': followUp.follow_up_date,
      'Due Date': followUp.due_date || '-',
      'Enquiry Number': followUp.marketing_enquiries?.enquiry_number || '-',
      'Quotation Number': followUp.marketing_quotations?.quotation_number || '-',
      'Client': followUp.marketing_enquiries?.marketing_clients?.client_name || '-',
      'Remarks': followUp.remarks || '-',
      'Status': followUp.status,
      'Created At': new Date(followUp.created_at).toLocaleDateString(),
    }));
    exportToExcel(exportData, 'FollowUps_Export', 'Follow-ups');
  };

  const upcomingFollowUps = followUps.filter(fu => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const followUpDate = new Date(fu.follow_up_date);
    return followUpDate >= today;
  });

  const pastFollowUps = followUps.filter(fu => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const followUpDate = new Date(fu.follow_up_date);
    return followUpDate < today;
  });

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Follow-up Planner</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Track and manage follow-ups and site visits</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 md:mb-6 border-b">
          <div className="flex space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('followup')}
              className={`px-3 sm:px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'followup'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Follow-up
            </button>
            <button
              onClick={() => setActiveTab('visitor')}
              className={`px-3 sm:px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'visitor'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Visitor
            </button>
          </div>
        </div>

        {/* Follow-up Section */}
        {activeTab === 'followup' && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="flex flex-wrap gap-2 bg-white rounded-lg p-1 border border-gray-300">
                  <button
                    onClick={() => setFilter('upcoming')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${filter === 'upcoming' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    Upcoming
                  </button>
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${filter === 'all' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilter('past')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${filter === 'past' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    Past
                  </button>
                </div>
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
                    setEditingFollowUp(null);
                    setFormData({
                      enquiry_id: '',
                      quotation_id: '',
                      follow_up_date: new Date().toISOString().split('T')[0],
                      due_date: '',
                      remarks: '',
                      status: 'Pending',
                    });
                    setShowForm(true);
                  }}
                  className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm sm:text-base"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Follow-up</span>
                </button>
              </div>
            </div>

        {/* Search Bar */}
        <div className="mb-4 md:mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by enquiry/quotation number, client name, remarks, status, or date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 md:mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Upcoming Follow-ups</p>
                <p className="text-3xl font-bold text-gray-900">{upcomingFollowUps.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Past Follow-ups</p>
                <p className="text-3xl font-bold text-gray-900">{pastFollowUps.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-gray-600" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Follow-ups</p>
                <p className="text-3xl font-bold text-gray-900">{followUps.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Follow-ups Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
          ) : followUps.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-gray-500">No follow-ups found</div>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enquiry/Quotation</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Follow-up Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Date</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remark</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {followUps.filter(followUp => {
                    if (!searchQuery) return true;
                    
                    const query = searchQuery.toLowerCase();
                    const enquiryNumber = followUp.marketing_enquiries?.enquiry_number?.toLowerCase() || '';
                    const quotationNumber = followUp.marketing_quotations?.quotation_number?.toLowerCase() || '';
                    const clientName = (followUp.marketing_enquiries?.marketing_clients?.client_name || 
                                      followUp.marketing_quotations?.marketing_clients?.client_name || '').toLowerCase();
                    const remarks = (followUp.remarks || '').toLowerCase();
                    const status = (followUp.computed_status || followUp.status || '').toLowerCase();
                    const followUpDate = new Date(followUp.follow_up_date).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    }).toLowerCase();
                    const currentDate = followUp.revision_created_date 
                      ? new Date(followUp.revision_created_date).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        }).toLowerCase()
                      : new Date(followUp.created_at).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        }).toLowerCase();
                    
                    return enquiryNumber.includes(query) ||
                           quotationNumber.includes(query) ||
                           clientName.includes(query) ||
                           remarks.includes(query) ||
                           status.includes(query) ||
                           followUpDate.includes(query) ||
                           currentDate.includes(query);
                  }).map((followUp) => (
                    <tr key={followUp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {followUp.marketing_enquiries?.enquiry_number || followUp.marketing_quotations?.quotation_number || '-'}
                          </span>
                          {followUp.marketing_enquiries?.marketing_clients?.client_name || followUp.marketing_quotations?.marketing_clients?.client_name ? (
                            <span className="text-xs text-gray-500 mt-0.5">
                              {followUp.marketing_enquiries?.marketing_clients?.client_name || followUp.marketing_quotations?.marketing_clients?.client_name}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900 whitespace-nowrap">
                        {new Date(followUp.follow_up_date).toLocaleDateString('en-GB', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-700 whitespace-nowrap">
                        {followUp.revision_created_date 
                          ? new Date(followUp.revision_created_date).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: 'short', 
                              year: 'numeric' 
                            })
                          : new Date(followUp.created_at).toLocaleDateString('en-GB', { 
                              day: '2-digit', 
                              month: 'short', 
                              year: 'numeric' 
                            })
                        }
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600">
                        <div className="max-w-xs">
                          <p className="truncate" title={followUp.remarks || '-'}>
                            {followUp.remarks || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          (followUp.computed_status || followUp.status) === 'Completed' ? 'bg-green-100 text-green-800' :
                          (followUp.computed_status || followUp.status) === 'Overdue' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {followUp.computed_status || followUp.status}
                          {followUp.is_revision && (
                            <span className="ml-1 text-xs">(Revision)</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-center text-sm font-medium relative">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => setMenuOpen(menuOpen === followUp.id ? null : followUp.id)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Actions"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                          {menuOpen === followUp.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-40" 
                                onClick={() => setMenuOpen(null)}
                                style={{ backgroundColor: 'transparent' }}
                              ></div>
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50 border border-gray-200">
                                <button
                                  onClick={() => {
                                    handleView(followUp);
                                    setMenuOpen(null);
                                  }}
                                  className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>View History</span>
                                </button>
                                <button
                                  onClick={() => {
                                    handleEdit(followUp);
                                    setMenuOpen(null);
                                  }}
                                  className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  <span>Edit</span>
                                </button>
                                {followUp.quotation_id && (
                                  <button
                                    onClick={() => {
                                      handleRevision(followUp);
                                      setMenuOpen(null);
                                    }}
                                    className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-purple-700 hover:bg-purple-50 transition-colors"
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                    <span>Add Revision</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    handleDelete(followUp.id);
                                    setMenuOpen(null);
                                  }}
                                  className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}

        {/* Visitor Section */}
        {activeTab === 'visitor' && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <div className="flex flex-wrap gap-2 bg-white rounded-lg p-1 border border-gray-300">
                  <button
                    onClick={() => setVisitFilter('upcoming')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${visitFilter === 'upcoming' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    Upcoming
                  </button>
                  <button
                    onClick={() => setVisitFilter('all')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${visitFilter === 'all' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setVisitFilter('past')}
                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base ${visitFilter === 'past' ? 'bg-purple-600 text-white' : 'text-gray-700'}`}
                  >
                    Past
                  </button>
                </div>
                <button
                  onClick={() => {
                    const exportData = siteVisits.map(visit => ({
                      'Visit Date': visit.visit_date,
                      'Visitor Name': visit.visitor_name || '-',
                      'Company Name': visit.company_name || '-',
                      'Client Name': visit.client_name || '-',
                      'Location': visit.site_location || '-',
                      'Designation': visit.designation || '-',
                      'Mobile Number': visit.mobile_number || '-',
                      'Email ID': visit.email_id || '-',
                      'Status': visit.status || '-',
                      'Total Expense': visit.total_expense || 0,
                      'Approved Amount': visit.approved_amount || '-',
                    }));
                    exportToExcel(exportData, 'Site_Visits_Export', 'Site Visits');
                  }}
                  className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm sm:text-base"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export Excel</span>
                  <span className="sm:hidden">Export</span>
                </button>
              </div>
            </div>

            {/* Search Bar for Visits */}
            <div className="mb-4 md:mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by visitor name, company, client, location, or date..."
                    value={visitSearchQuery}
                    onChange={(e) => setVisitSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
                  />
                  {visitSearchQuery && (
                    <button
                      onClick={() => setVisitSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Site Visits Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 md:mb-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Upcoming Visits</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {siteVisits.filter(v => {
                        const today = new Date().toISOString().split('T')[0];
                        return v.visit_date >= today;
                      }).length}
                    </p>
                  </div>
                  <Calendar className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Past Visits</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {siteVisits.filter(v => {
                        const today = new Date().toISOString().split('T')[0];
                        return v.visit_date < today;
                      }).length}
                    </p>
                  </div>
                  <Calendar className="w-8 h-8 text-gray-600" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Visits</p>
                    <p className="text-3xl font-bold text-gray-900">{siteVisits.length}</p>
                  </div>
                  <Users className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Site Visits Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {loadingVisits ? (
                <div className="p-4 sm:p-8 text-center text-gray-500">Loading...</div>
              ) : siteVisits.length === 0 ? (
                <div className="p-4 sm:p-8 text-center text-gray-500">No site visits found</div>
              ) : (
                <div className="overflow-x-auto -mx-3 sm:mx-0">
                  <table className="w-full min-w-[900px]">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor Name</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visit Date</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-3 sm:px-6 py-2 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {siteVisits.filter(visit => {
                        if (!visitSearchQuery) return true;
                        const query = visitSearchQuery.toLowerCase();
                        return (
                          (visit.visitor_name || '').toLowerCase().includes(query) ||
                          (visit.company_name || '').toLowerCase().includes(query) ||
                          (visit.client_name || '').toLowerCase().includes(query) ||
                          (visit.site_location || '').toLowerCase().includes(query) ||
                          (visit.visit_date || '').includes(query) ||
                          (visit.status || '').toLowerCase().includes(query)
                        );
                      }).map((visit) => {
                        const visitDate = new Date(visit.visit_date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        visitDate.setHours(0, 0, 0, 0);
                        const isToday = visitDate.getTime() === today.getTime();
                        
                        return (
                          <tr 
                            key={visit.id} 
                            className={`hover:bg-gray-50 transition-colors ${isToday ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}`}
                          >
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">
                              {visit.visitor_name || '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900">
                              {visit.company_name || '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900">
                              {visit.client_name || '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-700">
                              {visit.site_location || '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900 whitespace-nowrap">
                              {visit.visit_date ? new Date(visit.visit_date).toLocaleDateString('en-GB', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              }) : '-'}
                              {isToday && (
                                <span className="ml-2 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-semibold rounded-full">
                                  Today
                                </span>
                              )}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-sm text-right font-semibold text-purple-600">
                              {visit.total_expense ? `₹${parseFloat(visit.total_expense).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                visit.status === 'Pending Paid' ? 'bg-yellow-100 text-yellow-800' :
                                visit.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                visit.status === 'Paid' ? 'bg-blue-100 text-blue-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {visit.status || '-'}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-4 text-center text-sm font-medium">
                              <button
                                onClick={() => {
                                  navigate('/marketing/expo-seminar');
                                }}
                                className="text-purple-600 hover:text-purple-900 font-medium"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Follow-up Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {editingFollowUp ? 'Edit Follow-up' : 'Create New Follow-up'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">Add a new follow-up record</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingFollowUp(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6">
              <div className="space-y-4">
                {editingFollowUp && editingFollowUp.quotation_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quotation Number
                    </label>
                    <input
                      type="text"
                      value={editingFollowUp.marketing_quotations?.quotation_number || ''}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Follow-up Date / Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.follow_up_date}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                {!editingFollowUp && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Related Enquiry</label>
                      <select
                        value={formData.enquiry_id}
                        onChange={(e) => setFormData({ ...formData, enquiry_id: e.target.value, quotation_id: '' })}
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">Related Quotation</label>
                      <select
                        value={formData.quotation_id}
                        onChange={(e) => setFormData({ ...formData, quotation_id: e.target.value, enquiry_id: '' })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">Select quotation</option>
                        {quotations.map((quotation) => (
                          <option key={quotation.id} value={quotation.id}>
                            {quotation.quotation_number}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={4}
                    placeholder="Enter remarks or description..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status <span className="text-red-500">*</span></label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Status will auto-update based on date. Completed items move to past.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingFollowUp(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingFollowUp ? 'Update Follow-up' : 'Create Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revision Modal */}
      {showRevisionModal && selectedFollowUpForRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Add Revision</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Quotation: {selectedFollowUpForRevision.marketing_quotations?.quotation_number || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRevisionModal(false);
                  setSelectedFollowUpForRevision(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRevisionSubmit} className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upcoming Date (Follow-up Date) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={revisionFormData.upcoming_date}
                    onChange={(e) => setRevisionFormData({ ...revisionFormData, upcoming_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Remarks / Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={revisionFormData.remarks}
                    onChange={(e) => setRevisionFormData({ ...revisionFormData, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={4}
                    placeholder="Enter revision details, client feedback, or any remarks..."
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={revisionFormData.status}
                    onChange={(e) => setRevisionFormData({ ...revisionFormData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevisionModal(false);
                    setSelectedFollowUpForRevision(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Save Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Follow-up History Modal */}
      {showViewModal && viewingFollowUp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Follow-up History</h2>
                {viewingFollowUp.marketing_quotations?.quotation_number && (
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    Quotation: {viewingFollowUp.marketing_quotations.quotation_number}
                  </p>
                )}
                {viewingFollowUp.marketing_enquiries?.enquiry_number && (
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    Enquiry: {viewingFollowUp.marketing_enquiries.enquiry_number}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingFollowUp(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {/* Revision History Section */}
              {viewingFollowUp.revisionHistory && viewingFollowUp.revisionHistory.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2 text-purple-600" />
                    Revision History ({viewingFollowUp.revisionHistory.length} {viewingFollowUp.revisionHistory.length === 1 ? 'Revision' : 'Revisions'})
                  </h3>
                  <div className="space-y-3">
                    {viewingFollowUp.revisionHistory.map((revision) => {
                      const totalAmount = revision.revision_quotation_final_amount || revision.final_amount || revision.revision_quotation?.final_amount;
                      
                      return (
                        <div 
                          key={revision.id} 
                          className="border-l-4 border-blue-500 bg-blue-50 pl-4 py-3 rounded-r-lg hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center mb-2">
                                <span className="font-semibold text-base text-gray-900">
                                  Revision {revision.revision_number}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-700 mb-3">
                                <div>
                                  <div className="text-xs text-gray-500">Date Created</div>
                                  <div className="font-semibold text-gray-900 mt-0.5">
                                    {new Date(revision.created_at).toLocaleDateString('en-GB', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' })}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">Upcoming Date</div>
                                  <div className="font-semibold text-gray-900 mt-0.5">
                                    {new Date(revision.revision_date).toLocaleDateString('en-GB', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' })}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">Grand Total</div>
                                  <div className="font-semibold text-gray-900 mt-0.5">
                                    {totalAmount ? `₹${parseFloat(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                                <div className="text-xs font-medium text-gray-500 mb-1">Remarks / Message</div>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                  {revision.remarks || 'No remarks provided'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Follow-up History Section (Non-Revision Follow-ups Only) */}
              {viewingFollowUp.history && viewingFollowUp.history.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-blue-600" />
                    Follow-up History ({viewingFollowUp.history.length} {viewingFollowUp.history.length === 1 ? 'Entry' : 'Entries'})
                  </h3>
                  <div className="space-y-3">
                    {viewingFollowUp.history.map((item) => (
                      <div 
                        key={item.id} 
                        className="border-l-4 border-blue-500 bg-blue-50 pl-4 py-3 rounded-r-lg hover:bg-blue-100 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <p className="font-medium text-gray-900">
                                {new Date(item.follow_up_date).toLocaleDateString('en-GB', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                              </p>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                item.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                item.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.status}
                              </span>
                            </div>
                            <div className="relative group mt-2">
                              <p className="text-sm text-gray-700 line-clamp-2">
                                {item.remarks || 'No remarks'}
                              </p>
                              {item.remarks && item.remarks.length > 100 && (
                                <div className="absolute left-0 top-full mt-2 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
                                  <p className="whitespace-pre-wrap">{item.remarks}</p>
                                  <div className="absolute -top-2 left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Updated by: {item.updated_by_user?.email || item.created_by_user?.email || 'System'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!viewingFollowUp.history || viewingFollowUp.history.length === 0) && 
               (!viewingFollowUp.revisionHistory || viewingFollowUp.revisionHistory.length === 0) && (
                <p className="text-gray-500 text-center py-8">No history found</p>
              )}

              {/* Costing Sheet Section - Only for Quotations */}
              {viewingFollowUp.quotation_id && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Costing Sheet</h3>
                  <ExcelCostingSheet
                    quotationId={viewingFollowUp.quotation_id}
                    costingSheetId={viewingFollowUp.costingSheetId}
                    onCostingChange={() => {}}
                    onSaveSuccess={() => {}}
                    isViewMode={true}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpPlanner;

