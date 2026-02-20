import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  FileText, 
  Calendar, 
  Users, 
  Package, 
  ShoppingCart,
  MapPin,
  TrendingUp,
  Bell,
  RefreshCw,
  X
} from 'lucide-react';
import DateRangeCalendar from './components/DateRangeCalendar';

// Rupee Icon Component
const RupeeIcon = ({ className = '' }) => {
  return (
    <span 
      className={`${className} inline-flex items-center justify-center`}
      style={{ 
        fontFamily: 'Arial, sans-serif', 
        fontWeight: 'bold',
        lineHeight: '1'
      }}
    >
      ₹
    </span>
  );
};

const MarketingDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalEnquiries: 0,
    totalQuotations: 0,
    totalClients: 0,
    totalProducts: 0,
  });
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [enquiriesInRange, setEnquiriesInRange] = useState([]);
  const [loadingEnquiries, setLoadingEnquiries] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revisionNotifications, setRevisionNotifications] = useState([]);
  const [siteVisitNotifications, setSiteVisitNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchEnquiriesInRange();
    fetchRevisionNotifications();
    fetchSiteVisitNotifications();
    
    // Set up real-time subscription for revision notifications
    const revisionSubscription = supabase
      .channel('revision-notifications')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'marketing_quotation_revisions' },
        (payload) => {
          checkRevisionDueToday(payload.new);
        }
      )
      .subscribe();

    // Set up real-time subscription for site visit notifications
    const siteVisitSubscription = supabase
      .channel('site-visit-notifications')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'marketing_site_visits' },
        () => {
          fetchSiteVisitNotifications();
        }
      )
      .subscribe();

    // Check for revisions due today on load
    checkRevisionsDueToday();

    return () => {
      revisionSubscription.unsubscribe();
      siteVisitSubscription.unsubscribe();
    };
  }, [dateRange]);

  const fetchStats = async () => {
    try {
      const [enquiries, quotations, clients, products] = await Promise.all([
        supabase.from('marketing_enquiries').select('id', { count: 'exact', head: true }),
        supabase.from('marketing_quotations').select('id', { count: 'exact', head: true }),
        supabase.from('marketing_clients').select('id', { count: 'exact', head: true }),
        supabase.from('marketing_products').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalEnquiries: enquiries.count || 0,
        totalQuotations: quotations.count || 0,
        totalClients: clients.count || 0,
        totalProducts: products.count || 0,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setLoading(false);
    }
  };

  const fetchEnquiriesInRange = async () => {
    try {
      // Only fetch if both dates are selected
      if (!dateRange.startDate || !dateRange.endDate) {
        setEnquiriesInRange([]);
        setLoadingEnquiries(false);
        return;
      }

      setLoadingEnquiries(true);
      const query = supabase
        .from('marketing_enquiries')
        .select(`
          id,
          enquiry_number,
          enquiry_date,
          source,
          status,
          estimated_value,
          marketing_clients:client_id (id, client_name)
        `)
        .gte('enquiry_date', dateRange.startDate)
        .lte('enquiry_date', dateRange.endDate)
        .order('enquiry_date', { ascending: false });

      const { data, error } = await query;
      
      if (error) throw error;
      setEnquiriesInRange(data || []);
      setLoadingEnquiries(false);
    } catch (error) {
      console.error('Error fetching enquiries in date range:', error);
      setLoadingEnquiries(false);
    }
  };

  const handleViewAllEnquiries = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (dateRange.startDate && dateRange.endDate) {
      navigate(`/app/marketing/enquiry-master?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`, { replace: false });
    } else {
      navigate('/app/marketing/enquiry-master', { replace: false });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const fetchRevisionNotifications = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch revisions due today
      const { data: revisions, error } = await supabase
        .from('marketing_quotation_revisions')
        .select(`
          *,
          marketing_quotations:quotation_id (
            id,
            quotation_number,
            marketing_clients:client_id (client_name, contact_email)
          )
        `)
        .eq('revision_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Deduplicate: Get unique revisions by quotation_id and revision_number
      const uniqueRevisions = [];
      const seen = new Set();
      
      (revisions || []).forEach(rev => {
        const key = `${rev.quotation_id}_${rev.revision_number}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRevisions.push(rev);
        }
      });
      
      setRevisionNotifications(uniqueRevisions);
    } catch (error) {
      console.error('Error fetching revision notifications:', error);
    }
  };

  const checkRevisionsDueToday = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: revisions } = await supabase
        .from('marketing_quotation_revisions')
        .select(`
          *,
          marketing_quotations:quotation_id (
            id,
            quotation_number,
            marketing_clients:client_id (client_name, contact_email)
          )
        `)
        .eq('revision_date', today);

      if (revisions && revisions.length > 0) {
        // Deduplicate
        const uniqueRevisions = [];
        const seen = new Set();
        
        revisions.forEach(rev => {
          const key = `${rev.quotation_id}_${rev.revision_number}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueRevisions.push(rev);
          }
        });
        
        setRevisionNotifications(uniqueRevisions);
      }
    } catch (error) {
      console.error('Error checking revisions:', error);
    }
  };

  const checkRevisionDueToday = async (revision) => {
    const today = new Date().toISOString().split('T')[0];
    if (revision.revision_date === today) {
      await fetchRevisionNotifications();
    }
  };

  const fetchSiteVisitNotifications = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch site visits scheduled for today
      const { data: visits, error } = await supabase
        .from('marketing_site_visits')
        .select('*')
        .eq('visit_date', today)
        .order('visit_date', { ascending: true });

      if (error) {
        console.error('Error fetching site visit notifications:', error);
        setSiteVisitNotifications([]);
        return;
      }
      
      setSiteVisitNotifications(visits || []);
    } catch (error) {
      console.error('Error fetching site visit notifications:', error);
      setSiteVisitNotifications([]);
    }
  };

  const handleDismissNotification = (revisionId) => {
    setRevisionNotifications(prev => prev.filter(r => r.id !== revisionId));
  };

  const handleDismissSiteVisitNotification = (visitId) => {
    setSiteVisitNotifications(prev => prev.filter(v => v.id !== visitId));
  };

  const totalNotifications = revisionNotifications.length + siteVisitNotifications.length;

  const dashboardCards = [
    {
      icon: FileText,
      label: 'Enquiry Master',
      path: '/app/marketing/enquiry-master',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
    },
    {
      icon: RupeeIcon,
      label: 'Quotation Tracker',
      path: '/app/marketing/quotation-tracker',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
    },
    {
      icon: Calendar,
      label: 'Follow-up Planner',
      path: '/app/marketing/follow-up-planner',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
    },
    {
      icon: MapPin,
      label: 'Expo / Visit Tracker',
      path: '/app/marketing/expo-seminar',
      color: 'bg-orange-500',
      hoverColor: 'hover:bg-orange-600',
    },
    {
      icon: ShoppingCart,
      label: 'Contracts / Purchase Orders',
      path: '/app/marketing/purchase-orders',
      color: 'bg-indigo-500',
      hoverColor: 'hover:bg-indigo-600',
    },
  ];

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="mb-4 md:mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Marketing Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Overview of your marketing activities</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
            >
              <Bell className="w-6 h-6 text-purple-600" />
              {totalNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalNotifications}
                </span>
              )}
            </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowNotifications(false);
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2">
                    {/* Site Visit Notifications */}
                    {siteVisitNotifications.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 px-2">Site Visits Today</h4>
                        {siteVisitNotifications.map((visit) => (
                          <div
                            key={visit.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate('/app/marketing/follow-up-planner', { replace: false });
                              setShowNotifications(false);
                            }}
                            className="p-3 mb-2 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <Users className="w-4 h-4 text-yellow-600" />
                                  <p className="font-medium text-sm text-gray-900">
                                    {visit.visitor_name || 'Site Visit'}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  {visit.company_name || visit.client_name || 'Company'} - Visit scheduled today
                                </p>
                                {visit.site_location && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Location: {visit.site_location}
                                  </p>
                                )}
                                <p className="text-xs text-yellow-600 mt-2 font-medium">
                                  Click to view in Follow-up Planner →
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissSiteVisitNotification(visit.id);
                                }}
                                className="ml-2 p-1 hover:bg-yellow-200 rounded"
                              >
                                <X className="w-3 h-3 text-gray-500" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Revision Notifications */}
                    {revisionNotifications.length > 0 && (
                      <div>
                        {siteVisitNotifications.length > 0 && (
                          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 px-2 mt-3">Revision Reminders</h4>
                        )}
                        {revisionNotifications.map((revision) => (
                          <div
                            key={revision.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate('/app/marketing/follow-up-planner', { replace: false });
                              setShowNotifications(false);
                            }}
                            className="p-3 mb-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <RefreshCw className="w-4 h-4 text-purple-600" />
                                  <p className="font-medium text-sm text-gray-900">
                                    {revision.marketing_quotations?.quotation_number || 'Quotation'}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  Revision #{revision.revision_number} due today
                                </p>
                                {revision.remarks && (
                                  <p className="text-xs text-gray-700 mt-1 truncate">
                                    {revision.remarks}
                                  </p>
                                )}
                                {revision.marketing_quotations?.marketing_clients && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Client: {revision.marketing_quotations.marketing_clients.client_name}
                                  </p>
                                )}
                                <p className="text-xs text-purple-600 mt-2 font-medium">
                                  Click to view in Follow-up Planner →
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissNotification(revision.id);
                                }}
                                className="ml-2 p-1 hover:bg-purple-200 rounded"
                              >
                                <X className="w-3 h-3 text-gray-500" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {totalNotifications === 0 && (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No notifications
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Enquiries</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '...' : stats.totalEnquiries}
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Quotations</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '...' : stats.totalQuotations}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <RupeeIcon className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Clients</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '...' : stats.totalClients}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '...' : stats.totalProducts}
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Navigation Cards */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">Quick Navigation</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {dashboardCards.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(card.path, { replace: false });
                      }}
                      className={`${card.color} ${card.hoverColor} text-white rounded-lg p-4 cursor-pointer transition-all transform hover:scale-105 shadow-md`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="w-6 h-6" />
                        <span className="font-medium">{card.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Calendar Widget */}
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-purple-600" />
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Enquiry Calendar</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-center">
                <DateRangeCalendar
                  startDate={dateRange.startDate}
                  endDate={dateRange.endDate}
                  onDateRangeChange={setDateRange}
                />
              </div>
              
              {dateRange.startDate && dateRange.endDate ? (
                loadingEnquiries ? (
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3 text-center">
                    <div className="animate-pulse flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                      <p className="text-xs text-gray-600">Loading...</p>
                    </div>
                  </div>
                ) : enquiriesInRange.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-2.5 shadow-sm">
                      <p className="text-[10px] text-gray-600 mb-0.5">
                        {formatDate(dateRange.startDate)} to {formatDate(dateRange.endDate)}
                      </p>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-lg font-bold text-purple-700">{enquiriesInRange.length}</p>
                        <p className="text-[10px] text-gray-600">enquiries</p>
                      </div>
                    </div>
                    
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#c084fc #f3f4f6' }}>
                      {enquiriesInRange.map((enquiry) => (
                        <div
                          key={enquiry.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/app/marketing/enquiry-master?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`, { replace: false });
                          }}
                          className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-pointer hover:bg-purple-50 hover:border-purple-400 hover:shadow-sm transition-all group active:scale-[0.98]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-bold text-gray-900 truncate group-hover:text-purple-700">
                                  {enquiry.enquiry_number}
                                </p>
                                <span className={`px-2 py-0.5 text-[9px] rounded-md font-semibold whitespace-nowrap ${
                                  enquiry.status === 'Converted'
                                    ? 'bg-green-100 text-green-700'
                                    : enquiry.status === 'New'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {enquiry.status === 'Converted' ? 'Converted' : enquiry.status}
                                </span>
                              </div>
                              <p className="text-[11px] font-medium text-gray-700 truncate mb-0.5">
                                {enquiry.marketing_clients?.client_name || 'No Client'}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {formatDate(enquiry.enquiry_date)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={handleViewAllEnquiries}
                      className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 active:bg-purple-800 transition-colors text-xs font-semibold shadow-sm"
                    >
                      View All in Enquiry Master
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600 text-center">
                      No enquiries found from {formatDate(dateRange.startDate)} to {formatDate(dateRange.endDate)}
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-gradient-to-r from-gray-50 to-purple-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Select a date range to view enquiries</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketingDashboard;

