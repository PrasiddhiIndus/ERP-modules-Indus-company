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
      iconWrap: 'bg-red-100 text-red-700',
    },
    {
      icon: RupeeIcon,
      label: 'Quotation Tracker',
      path: '/app/marketing/quotation-tracker',
      iconWrap: 'bg-green-100 text-green-700',
    },
    {
      icon: Calendar,
      label: 'Follow-up Planner',
      path: '/app/marketing/follow-up-planner',
      iconWrap: 'bg-violet-100 text-violet-700',
    },
    {
      icon: MapPin,
      label: 'Expo / Visit Tracker',
      path: '/app/marketing/expo-seminar',
      iconWrap: 'bg-orange-100 text-orange-700',
    },
    {
      icon: ShoppingCart,
      label: 'Contracts / Purchase Orders',
      path: '/app/marketing/purchase-orders',
      iconWrap: 'bg-indigo-100 text-indigo-700',
    },
  ];

  const kpiCards = [
    {
      title: 'Total enquiries',
      subtitle: 'All enquiries captured',
      value: loading ? '...' : stats.totalEnquiries,
      icon: FileText,
      iconWrap: 'bg-red-100 text-red-700',
      keyColor: 'text-red-700',
    },
    {
      title: 'Total quotations',
      subtitle: 'Across all revisions',
      value: loading ? '...' : stats.totalQuotations,
      icon: RupeeIcon,
      iconWrap: 'bg-green-100 text-green-700',
      keyColor: 'text-green-700',
    },
    {
      title: 'Total clients',
      subtitle: 'Active client master',
      value: loading ? '...' : stats.totalClients,
      icon: Users,
      iconWrap: 'bg-slate-200 text-slate-700',
      keyColor: 'text-slate-800',
    },
    {
      title: 'Total products',
      subtitle: 'Product catalog entries',
      value: loading ? '...' : stats.totalProducts,
      icon: Package,
      iconWrap: 'bg-orange-100 text-orange-700',
      keyColor: 'text-orange-700',
    },
  ];

  return (
    <div className="w-full min-h-screen overflow-y-auto bg-gradient-to-b from-slate-50/70 to-white px-4 sm:px-6 py-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 ring-1 ring-red-100 border border-red-100/80 shadow-sm">
              <TrendingUp className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Marketing Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5">Overview of your marketing activities</p>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 bg-red-50 rounded-xl ring-1 ring-red-100 hover:bg-red-100/80 transition-colors"
            >
              <Bell className="w-6 h-6 text-red-600" />
              {totalNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalNotifications}
                </span>
              )}
            </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200/90 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
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
                            className="p-3 mb-2 bg-red-50/80 border border-red-100 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <RefreshCw className="w-4 h-4 text-red-600" />
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
                                <p className="text-xs text-red-700 mt-2 font-medium">
                                  Click to view in Follow-up Planner →
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissNotification(revision.id);
                                }}
                                className="ml-2 p-1 hover:bg-red-100 rounded"
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
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 max-w-6xl mx-auto">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="h-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white shadow-sm p-4 text-left"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 text-[14px] leading-5 truncate">{card.title}</h3>
                  <p className="text-[11px] leading-4 text-gray-500">{card.subtitle}</p>
                </div>
                <div className={`p-2.5 rounded-lg ring-1 ring-black/5 shrink-0 ${card.iconWrap}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="rounded-lg border border-white/70 bg-white/85 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Total</p>
                <p className={`mt-1 text-2xl leading-7 font-bold tabular-nums ${card.keyColor}`}>{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Navigation Cards */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick actions</h2>
              <p className="text-xs text-gray-500 mb-4">Click any action to open the relevant marketing page.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dashboardCards.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(card.path, { replace: false });
                      }}
                      className="relative h-full min-h-[68px] flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className={`p-2 rounded-lg ${card.iconWrap}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-gray-900 text-sm leading-5 pr-2">{card.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Calendar Widget */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-red-600" />
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
                  <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-100/80 rounded-lg p-3 text-center">
                    <div className="animate-pulse flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                      <p className="text-xs text-gray-600">Loading...</p>
                    </div>
                  </div>
                ) : enquiriesInRange.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-100 rounded-lg p-2.5 shadow-sm">
                      <p className="text-[10px] text-gray-600 mb-0.5">
                        {formatDate(dateRange.startDate)} to {formatDate(dateRange.endDate)}
                      </p>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-lg font-bold text-red-800">{enquiriesInRange.length}</p>
                        <p className="text-[10px] text-gray-600">enquiries</p>
                      </div>
                    </div>
                    
                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(220, 38, 38, 0.45) #f3f4f6' }}>
                      {enquiriesInRange.map((enquiry) => (
                        <div
                          key={enquiry.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/app/marketing/enquiry-master?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`, { replace: false });
                          }}
                          className="bg-white border border-gray-200 rounded-lg p-2.5 cursor-pointer hover:bg-red-50/60 hover:border-red-200 hover:shadow-sm transition-all group active:scale-[0.98]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-bold text-gray-900 truncate group-hover:text-red-800">
                                  {enquiry.enquiry_number}
                                </p>
                                <span className={`px-2 py-0.5 text-[9px] rounded-md font-semibold whitespace-nowrap ${
                                  enquiry.status === 'Converted'
                                    ? 'bg-green-100 text-green-700'
                                    : enquiry.status === 'New'
                                    ? 'bg-red-100 text-red-800'
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
                      className="w-full px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800 transition-colors text-xs font-semibold shadow-sm"
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
                <div className="bg-gradient-to-r from-slate-50 to-red-50/40 border border-slate-200/90 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Select a date range to view enquiries</p>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
};

export default MarketingDashboard;

