import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import CostingSheet from './components/CostingSheet';
import QuotationForm from './components/QuotationForm';
import CostingSheetForm from './components/CostingSheetForm';
import InternalQuotationFormModal from './components/InternalQuotationFormModal';
import ExcelCostingSheet from './components/ExcelCostingSheet';
import { X, Plus, Edit2, Trash2, MoreVertical, Download, Eye, FileText, Save, FileDown, Search, RefreshCw, History } from 'lucide-react';
import { exportToExcel } from './utils/excelExport';
import jsPDF from 'jspdf';
import logo from '../../image/website_logo.webp';

const DropdownMenu = ({ buttonId, quotation, onView, onEdit, onDownloadPDF, onDelete, onRevision, hasRevisions }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const positionMenu = () => {
      const button = document.getElementById(buttonId);
      const menu = menuRef.current;
      
      if (!button || !menu) return;

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const btnRect = button.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Get menu dimensions
        const menuHeight = menu.scrollHeight || 300;
        const menuWidth = menu.offsetWidth || 200;
        
        // Calculate available space
        const spaceBelow = viewportHeight - btnRect.bottom;
        const spaceAbove = btnRect.top;
        const spaceRight = viewportWidth - btnRect.right;
        
        // Calculate position
        let top = btnRect.bottom + 8;
        let left = btnRect.right - menuWidth;
        
        // Adjust vertical position if not enough space below
        if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
          top = btnRect.top - menuHeight - 8;
        } else if (spaceBelow < menuHeight) {
          // If neither side has enough space, limit height and show below
          top = btnRect.bottom + 8;
        }
        
        // Adjust horizontal position if needed
        if (spaceRight < menuWidth) {
          left = btnRect.right - menuWidth;
        }
        if (left < 8) {
          left = 8;
        }
        
        // Ensure menu doesn't go off screen
        if (top + menuHeight > viewportHeight) {
          top = Math.max(8, viewportHeight - menuHeight - 8);
        }
        if (top < 8) {
          top = 8;
        }
        
        // Apply position
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.right = 'auto';
      });
    };

    // Position on mount with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(positionMenu, 10);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [buttonId]);

  return (
    <div 
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-50"
      style={{ 
        minWidth: '200px',
        width: 'max-content',
        maxHeight: '320px',
      }}
    >
      <div 
        className="py-1 overflow-y-auto custom-scrollbar"
        style={{ 
          maxHeight: '320px',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-all duration-150 whitespace-nowrap group"
        >
          <Eye className="w-4 h-4 flex-shrink-0 text-gray-500 group-hover:text-purple-600 transition-colors" />
          <span className="flex-1 font-medium">View</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-all duration-150 whitespace-nowrap group"
        >
          <Edit2 className="w-4 h-4 flex-shrink-0 text-gray-500 group-hover:text-purple-600 transition-colors" />
          <span className="flex-1 font-medium">Edit</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownloadPDF();
          }}
          className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-all duration-150 whitespace-nowrap group"
        >
          <FileDown className="w-4 h-4 flex-shrink-0 text-gray-500 group-hover:text-purple-600 transition-colors" />
          <span className="flex-1 font-medium">Download PDF</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRevision();
          }}
          className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left transition-all duration-150 whitespace-nowrap group"
        >
          <RefreshCw className="w-4 h-4 flex-shrink-0 text-gray-500 group-hover:text-purple-600 transition-colors" />
          <span className="flex-1 font-medium">{hasRevisions ? 'Add Revision' : 'Revision'}</span>
        </button>
        <div className="border-t border-gray-200 my-1"></div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left transition-all duration-150 whitespace-nowrap group"
        >
          <Trash2 className="w-4 h-4 flex-shrink-0 text-red-600 group-hover:text-red-700 transition-colors" />
          <span className="flex-1 font-medium">Delete</span>
        </button>
      </div>
    </div>
  );
};

const QuotationTracker = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const enquiryId = searchParams.get('enquiry_id');
  
  const [quotations, setQuotations] = useState([]);
  const [quotationsWithRevisionCount, setQuotationsWithRevisionCount] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCostingForm, setShowCostingForm] = useState(false);
  const [showInternalForm, setShowInternalForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState(null);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [approvedQuotations, setApprovedQuotations] = useState([]);
  const [quotationsWithCosting, setQuotationsWithCosting] = useState([]);
  const [loadingCosting, setLoadingCosting] = useState(false);
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [costingQuotations, setCostingQuotations] = useState([]);
  const [costingSheets, setCostingSheets] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedQuotationIdForEditor, setSelectedQuotationIdForEditor] = useState(null);
  const [showCostingSheetEditor, setShowCostingSheetEditor] = useState(false);
  const [isCostingSheetViewMode, setIsCostingSheetViewMode] = useState(false);
  const [showNewCostingSheetForm, setShowNewCostingSheetForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [costingSearchQuery, setCostingSearchQuery] = useState('');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedQuotationForRevision, setSelectedQuotationForRevision] = useState(null);
  const [revisionHistory, setRevisionHistory] = useState([]);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [revisionFormData, setRevisionFormData] = useState({
    upcoming_date: new Date().toISOString().split('T')[0],
    remarks: '',
    status: 'Pending',
  });
  const [revisionCostingSheetId, setRevisionCostingSheetId] = useState(null);
  const [revisionQuotationId, setRevisionQuotationId] = useState(null);
  
  const [formData, setFormData] = useState({
    enquiry_id: enquiryId || '',
    client_id: '',
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    revision_number: 1,
    gst_type: 'IGST',
    gst_percentage: 18,
    payment_terms: '',
    terms_and_conditions: '',
    status: 'Draft',
    assigned_to: '',
  });

  const [quotationItems, setQuotationItems] = useState([]);
  const [costingTotal, setCostingTotal] = useState(0);

  useEffect(() => {
    fetchQuotations();
    fetchEnquiries();
    fetchClients();
    fetchProducts();
    if (enquiryId) {
      // Auto-fetch enquiry data and populate client_id when user manually opens form
      fetchEnquiryData(enquiryId);
    }
  }, [enquiryId]);

  // Auto-fetch enquiry data when enquiry_id is present
  const fetchEnquiryData = async (enquiryId) => {
    try {
      const { data: enquiry, error } = await supabase
        .from('marketing_enquiries')
        .select('id, enquiry_number, client_id, client_name')
        .eq('id', enquiryId)
        .single();

      if (error) throw error;

      if (enquiry) {
        // Auto-populate client_id from enquiry
        setFormData(prev => ({
          ...prev,
          enquiry_id: enquiry.id,
          client_id: enquiry.client_id || prev.client_id,
        }));
      }
    } catch (error) {
      console.error('Error fetching enquiry data:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'costing') {
      fetchCostingQuotations();
      fetchCostingSheets();
    } else if (activeTab === 'internal') {
      fetchQuotationsWithCosting();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'costing') {
      fetchCostingSheets();
    }
  }, [selectedQuotationId]);

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_enquiries:enquiry_id (id, enquiry_number),
          marketing_clients:client_id (id, client_name, contact_email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter to show only one quotation per base number (latest revision)
      // Group by base quotation number and keep only the latest revision
      const quotationMap = new Map();
      
      (data || []).forEach(quotation => {
        // Extract base number (everything before /R)
        const baseNumber = quotation.quotation_number.split('/R')[0];
        const existing = quotationMap.get(baseNumber);
        
        if (!existing) {
          quotationMap.set(baseNumber, quotation);
        } else {
          // Compare revision numbers - keep the one with higher revision
          const getRevisionNumber = (qNum) => {
            if (!qNum.includes('/R')) return 0;
            const parts = qNum.split('/R');
            return parseInt(parts[1]) || 0;
          };
          
          const currentRevision = getRevisionNumber(quotation.quotation_number);
          const existingRevision = getRevisionNumber(existing.quotation_number);
          
          // Keep the quotation with higher revision number, or if same, keep the one with later updated_at
          if (currentRevision > existingRevision) {
            quotationMap.set(baseNumber, quotation);
          } else if (currentRevision === existingRevision) {
            const currentDate = new Date(quotation.updated_at || quotation.created_at);
            const existingDate = new Date(existing.updated_at || existing.created_at);
            if (currentDate > existingDate) {
              quotationMap.set(baseNumber, quotation);
            }
          }
        }
      });
      
      const uniqueQuotations = Array.from(quotationMap.values());
      
      // Fetch revision counts for each quotation
      const quotationsWithCounts = await Promise.all(
        uniqueQuotations.map(async (quotation) => {
          // Get base quotation ID (the original one without /R)
          const baseNumber = quotation.quotation_number.split('/R')[0];
          const { data: baseQuotation } = await supabase
            .from('marketing_quotations')
            .select('id')
            .eq('quotation_number', baseNumber)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          const baseId = baseQuotation?.id || quotation.id;
          
          const { count } = await supabase
            .from('marketing_quotation_revisions')
            .select('id', { count: 'exact', head: true })
            .eq('quotation_id', baseId);
          
          return {
            ...quotation,
            revisionCount: count || 0,
            hasRevisions: (count || 0) > 0
          };
        })
      );
      
      setQuotations(uniqueQuotations);
      setQuotationsWithRevisionCount(quotationsWithCounts);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      setLoading(false);
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

  const fetchProducts = async () => {
    try {
      const { data } = await supabase
        .from('marketing_products')
        .select('*')
        .eq('is_active', true)
        .order('product_name');
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchCostingQuotations = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_quotations')
        .select('id, quotation_number, client_id, enquiry_id')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCostingQuotations(data || []);
    } catch (error) {
      console.error('Error fetching quotations:', error);
    }
  };

  const fetchCostingSheets = async () => {
    try {
      setLoadingCosting(true);
      
      const { data, error } = await supabase
        .from('marketing_costing_sheets')
        .select(`
          *,
          marketing_quotations:quotation_id (
            id,
            quotation_number,
            client_id,
            enquiry_id,
          marketing_clients:client_id (id, client_name),
          marketing_enquiries:enquiry_id (id, enquiry_number)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching costing sheets:', error);
        throw error;
      }

      // De-duplicate: keep only latest costing sheet per base quotation number (prefer highest revision)
      const getBaseNumber = (qNum) => (qNum ? qNum.split('/R')[0] : '');
      const getRevisionNumber = (qNum) => {
        if (!qNum || !qNum.includes('/R')) return 0;
        const parts = qNum.split('/R');
        return parseInt(parts[1]) || 0;
      };

      const latestByBase = new Map();
      (data || []).forEach((sheet) => {
        const qNum = sheet?.marketing_quotations?.quotation_number;
        if (!qNum) return;
        const base = getBaseNumber(qNum);
        const existing = latestByBase.get(base);
        if (!existing) {
          latestByBase.set(base, sheet);
          return;
        }
        const curRev = getRevisionNumber(qNum);
        const exRev = getRevisionNumber(existing?.marketing_quotations?.quotation_number);
        if (curRev > exRev) {
          latestByBase.set(base, sheet);
          return;
        }
        if (curRev === exRev) {
          const curDate = new Date(sheet.updated_at || sheet.created_at);
          const exDate = new Date(existing.updated_at || existing.created_at);
          if (curDate > exDate) latestByBase.set(base, sheet);
        }
      });
      setCostingSheets(Array.from(latestByBase.values()));
      setLoadingCosting(false);
    } catch (error) {
      console.error('Error fetching costing sheets:', error);
      setCostingSheets([]);
      setLoadingCosting(false);
    }
  };

  const fetchQuotationsWithCosting = async () => {
    try {
      setLoadingInternal(true);
      // Fetch quotations that have internal quotation data (subject_title or subject filled)
      const { data: quotationsData, error: quotationsError } = await supabase
        .from('marketing_quotations')
        .select(`
          *,
          marketing_clients:client_id (id, client_name, contact_email, contact_number, city, state, country),
          marketing_enquiries:enquiry_id (id, enquiry_number)
        `)
        .eq('status', 'Sent')
        .order('created_at', { ascending: false });

      if (quotationsError) throw quotationsError;

      const quotationsWithCosting = await Promise.all(
        quotationsData.map(async (quotation) => {
          const { data: costingData } = await supabase
            .from('marketing_costing_sheets')
            .select('id, costing_data, created_at')
            .eq('quotation_id', quotation.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Calculate final amount from costing data
          let finalAmount = 0;
          if (costingData?.costing_data) {
            try {
              const costingDataParsed = typeof costingData.costing_data === 'string' 
                ? JSON.parse(costingData.costing_data) 
                : costingData.costing_data;
              if (costingDataParsed.items && costingDataParsed.items.length > 0) {
                finalAmount = costingDataParsed.items.reduce((sum, item) => {
                  const finalPriceKey = `${item.id}_final_price`;
                  const finalPrice = parseFloat(costingDataParsed[finalPriceKey] || 0);
                  return sum + finalPrice;
                }, 0);
              }
            } catch (e) {
              console.error('Error parsing costing data:', e);
              finalAmount = parseFloat(quotation.final_amount || 0);
            }
          } else {
            finalAmount = parseFloat(quotation.final_amount || 0);
          }

          // Check if internal quotation data exists (has subject_title or subject)
          const hasInternalData = quotation.subject_title || quotation.subject;
          // Get created date for internal quotation (when subject_title or subject was first set)
          const internalQuotationCreatedDate = hasInternalData && quotation.updated_at 
            ? quotation.updated_at 
            : null;

          return {
            ...quotation,
            hasCosting: costingData !== null,
            hasInternalQuotation: hasInternalData,
            finalAmount: finalAmount,
            internalQuotationCreatedDate: internalQuotationCreatedDate,
          };
        })
      );


      // Show all quotations with costing (latest only, no duplicates by base quotation number)
      const withCostingOnly = quotationsWithCosting.filter(q => q.hasCosting);

      const byBaseNumber = new Map();
      const getBaseNumber = (qNum) => (qNum ? qNum.split('/R')[0] : '');
      const getRevisionNumber = (qNum) => {
        if (!qNum || !qNum.includes('/R')) return 0;
        const parts = qNum.split('/R');
        return parseInt(parts[1]) || 0;
      };

      withCostingOnly.forEach((q) => {
        const base = getBaseNumber(q.quotation_number);
        const existing = byBaseNumber.get(base);
        if (!existing) {
          byBaseNumber.set(base, q);
          return;
        }
        const curRev = getRevisionNumber(q.quotation_number);
        const exRev = getRevisionNumber(existing.quotation_number);
        if (curRev > exRev) {
          byBaseNumber.set(base, q);
          return;
        }
        if (curRev === exRev) {
          const curDate = new Date(q.updated_at || q.created_at);
          const exDate = new Date(existing.updated_at || existing.created_at);
          if (curDate > exDate) byBaseNumber.set(base, q);
        }
      });

      setQuotationsWithCosting(Array.from(byBaseNumber.values()));
      setLoadingInternal(false);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      setLoadingInternal(false);
    }
  };

  const fetchQuotationItems = async (quotationId) => {
    try {
      const { data } = await supabase
        .from('marketing_quotation_items')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('item_order', { ascending: true });
      setQuotationItems(data || []);
    } catch (error) {
      console.error('Error fetching quotation items:', error);
    }
  };

  // Generate unique quotation number - always uses MAX number for year (never reuses deleted numbers)
  const generateQuotationNumber = async (retryCount = 0, lastAttemptedNumber = null) => {
    try {
      const currentYear = new Date().getFullYear();
      let quotationNumber;
      
      // If we're retrying after a duplicate, increment from the last attempted number
      if (lastAttemptedNumber && retryCount > 0) {
        const parts = lastAttemptedNumber.split('/');
        if (parts.length >= 3) {
          const year = parts[1] || currentYear;
          const num = parseInt(parts[2], 10);
          if (!isNaN(num)) {
            quotationNumber = `QT/${year}/${String(num + 1).padStart(4, '0')}`;
          } else {
            quotationNumber = `QT/${year}/0001`;
          }
        } else {
          quotationNumber = `QT/${currentYear}/0001`;
        }
      } else {
        // First attempt - get ALL quotations for current year and find MAXIMUM number
        // This ensures we never reuse numbers even if quotations are deleted
        const { data: allQuotations, error: fetchError } = await supabase
          .from('marketing_quotations')
          .select('quotation_number')
          .like('quotation_number', `QT/${currentYear}/%`);

        // Handle error
        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching quotations:', fetchError);
        }

        let maxNumber = 0;
        if (allQuotations && allQuotations.length > 0) {
          // Extract numeric part from each quotation number and find maximum
          allQuotations.forEach(quote => {
            if (quote.quotation_number) {
              const parts = quote.quotation_number.split('/');
              if (parts.length >= 3) {
                // Extract base number (before /R if revision exists)
                const baseNumber = parts[2].split('/R')[0];
                const num = parseInt(baseNumber, 10);
                if (!isNaN(num) && num > maxNumber) {
                  maxNumber = num;
                }
              }
            }
          });
        }

        // Generate next number from maximum
        quotationNumber = `QT/${currentYear}/${String(maxNumber + 1).padStart(4, '0')}`;
      }

      // Check if this quotation number already exists (handle race conditions)
      const { data: existing, error: checkError } = await supabase
        .from('marketing_quotations')
        .select('id')
        .eq('quotation_number', quotationNumber)
        .maybeSingle();

      // If error checking (and it's not "not found"), log but continue
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing quotation:', checkError);
      }

      // If duplicate found and we haven't exceeded retry limit, increment and try again
      if (existing && retryCount < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return generateQuotationNumber(retryCount + 1, quotationNumber);
      }

      return quotationNumber;
    } catch (error) {
      console.error('Error generating quotation number:', error);
      // Fallback to default with timestamp to ensure uniqueness
      const currentYear = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-4);
      return `QT/${currentYear}/${timestamp}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate unique quotation number with retry mechanism
      let quotationNumber;
      if (editingQuotation) {
        quotationNumber = editingQuotation.quotation_number;
      } else {
        quotationNumber = await generateQuotationNumber();
      }

      // Calculate amounts
      const subtotal = costingTotal || quotationItems.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
      const gstAmount = (subtotal * parseFloat(formData.gst_percentage)) / 100;
      const finalAmount = subtotal + gstAmount;

      const submitData = {
        ...formData,
        quotation_number: quotationNumber,
        total_amount: subtotal,
        gst_amount: gstAmount,
        final_amount: finalAmount,
        client_id: formData.client_id || null,
        enquiry_id: formData.enquiry_id || null,
        assigned_to: formData.assigned_to || null,
      };

      let quotationId;
      if (editingQuotation) {
        const { data, error } = await supabase
          .from('marketing_quotations')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingQuotation.id)
          .select()
          .single();

        if (error) {
          if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
            alert('Error: This quotation number already exists. Please refresh and try again.');
            return;
          }
          throw error;
        }
        quotationId = data.id;
      } else {
        // Try to insert with retry mechanism for duplicate key errors
        let insertAttempts = 0;
        let insertSuccess = false;
        
        while (insertAttempts < 3 && !insertSuccess) {
          try {
            const { data, error } = await supabase
              .from('marketing_quotations')
              .insert([{
                ...submitData,
                quotation_number: quotationNumber,
                created_by: user.id,
                updated_by: user.id,
              }])
              .select()
              .single();

            if (error) {
              if (error.message.includes('duplicate key') || error.message.includes('unique constraint') || error.code === '23505') {
                // Increment from current quotation number and retry
                const parts = quotationNumber.split('/');
                if (parts.length >= 3) {
                  const year = parts[1] || new Date().getFullYear();
                  const num = parseInt(parts[2], 10);
                  if (!isNaN(num)) {
                    quotationNumber = `QT/${year}/${String(num + 1).padStart(4, '0')}`;
                  } else {
                    quotationNumber = await generateQuotationNumber(insertAttempts, quotationNumber);
                  }
                } else {
                  quotationNumber = await generateQuotationNumber(insertAttempts, quotationNumber);
                }
                submitData.quotation_number = quotationNumber;
                insertAttempts++;
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
              }
              throw error;
            }
            
            quotationId = data.id;
            insertSuccess = true;

            // Mark enquiry as converted only after successful quotation creation
            if (formData.enquiry_id) {
              await supabase
                .from('marketing_enquiries')
                .update({ 
                  is_converted_to_quotation: true, 
                  converted_quotation_id: quotationId,
                  status: 'Converted',
                  updated_by: user.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', formData.enquiry_id);
            }
          } catch (insertError) {
            if (insertError.message.includes('duplicate key') || insertError.message.includes('unique constraint') || insertError.code === '23505') {
              if (insertAttempts < 10) {
                // Increment from current quotation number
                const parts = quotationNumber.split('/');
                if (parts.length >= 3) {
                  const year = parts[1] || new Date().getFullYear();
                  const num = parseInt(parts[2], 10);
                  if (!isNaN(num)) {
                    quotationNumber = `QT/${year}/${String(num + 1).padStart(4, '0')}`;
                  } else {
                    quotationNumber = await generateQuotationNumber(insertAttempts, quotationNumber);
                  }
                } else {
                  quotationNumber = await generateQuotationNumber(insertAttempts, quotationNumber);
                }
                submitData.quotation_number = quotationNumber;
                insertAttempts++;
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
              } else {
                throw new Error(`Unable to generate unique quotation number after ${insertAttempts + 1} attempts. Please try again.`);
              }
            }
            throw insertError;
          }
        }

        if (!insertSuccess) {
          throw new Error('Failed to create quotation after multiple attempts. Please try again.');
        }
      }

      // Save quotation items from costing sheet
      if (costingTotal > 0) {
        await supabase
          .from('marketing_quotation_items')
          .insert([{
            quotation_id: quotationId,
            item_description: 'Total from Costing Sheet',
            quantity: 1,
            unit_price: costingTotal,
            total_amount: costingTotal,
            item_order: 0,
          }]);
      }

      setShowForm(false);
      setEditingQuotation(null);
      setFormData({
        enquiry_id: '',
        client_id: '',
        quotation_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        revision_number: 1,
        gst_type: 'IGST',
        gst_percentage: 18,
        payment_terms: '',
        terms_and_conditions: '',
        status: 'Draft',
        assigned_to: '',
      });
      setCostingTotal(0);
      fetchQuotations();
      fetchEnquiries(); // Refresh enquiries list
      
      // Clear URL parameter after successful creation
      if (enquiryId) {
        navigate('/marketing/quotation-tracker', { replace: true });
      }
    } catch (error) {
      console.error('Error saving quotation:', error);
      const errorMessage = error.message || 'An unknown error occurred';
      alert(`Error saving quotation: ${errorMessage}`);
    }
  };

  const handleView = async (quotation) => {
    await fetchQuotationItems(quotation.id);
    // Fetch costing sheet data if available
    try {
      const { data: costingSheets } = await supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', quotation.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (costingSheets && costingSheets.length > 0) {
        quotation.costingSheet = costingSheets[0];
      }
    } catch (error) {
      console.error('Error fetching costing sheet:', error);
    }
    setViewingQuotation(quotation);
    setShowViewModal(true);
    setMenuOpen(null);
  };

  const handleEdit = (quotation) => {
    setEditingQuotation(quotation);
    setFormData({
      enquiry_id: quotation.enquiry_id || '',
      client_id: quotation.client_id || '',
      quotation_date: quotation.quotation_date || new Date().toISOString().split('T')[0],
      valid_until: quotation.valid_until || '',
      revision_number: quotation.revision_number || 1,
      gst_type: quotation.gst_type || 'IGST',
      gst_percentage: quotation.gst_percentage || 18,
      payment_terms: quotation.payment_terms || '',
      terms_and_conditions: quotation.terms_and_conditions || '',
      status: quotation.status || 'Draft',
      assigned_to: quotation.assigned_to || '',
    });
    setSelectedQuotation(quotation);
    setActiveTab('edit');
    setShowForm(true);
    setMenuOpen(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this quotation?')) return;

    try {
      const { error } = await supabase
        .from('marketing_quotations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchQuotations();
      setMenuOpen(null);
    } catch (error) {
      console.error('Error deleting quotation:', error);
      alert('Error deleting quotation: ' + error.message);
    }
  };


  const generatePDF = async (quotation) => {
    try {
      const logoBase64 = await getBase64Image(logo);
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Logo
      doc.addImage(logoBase64, 'PNG', 155, 5, 35, 35);
      let yPos = 50;

      // Header
      doc.setFontSize(20);
      doc.text('QUOTATION', 105, yPos, { align: 'center' });
      yPos += 10;

      // Quotation details
      doc.setFontSize(10);
      doc.text(`Quotation No: ${quotation.quotation_number}`, 20, yPos);
      doc.text(`Date: ${new Date(quotation.quotation_date).toLocaleDateString()}`, 20, yPos + 5);
      if (quotation.valid_until) {
        doc.text(`Valid Until: ${new Date(quotation.valid_until).toLocaleDateString()}`, 20, yPos + 10);
      }
      yPos += 20;

      // Client details
      if (quotation.marketing_clients) {
        doc.setFontSize(12);
        doc.text('To:', 20, yPos);
        doc.setFontSize(10);
        doc.text(quotation.marketing_clients.client_name, 20, yPos + 5);
        yPos += 15;
      }

      // Items table
      const items = quotationItems.length > 0 ? quotationItems : [
        { item_description: 'Total from Costing Sheet', quantity: 1, unit_price: quotation.total_amount, total_amount: quotation.total_amount }
      ];

      const tableData = items.map(item => [
        item.item_description || '',
        parseFloat(item.quantity || 1).toFixed(2),
        `₹${parseFloat(item.unit_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `₹${parseFloat(item.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      ]);

      doc.autoTable({
        startY: yPos,
        head: [['Description', 'Qty', 'Unit Price', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [128, 0, 128] },
      });

      yPos = doc.lastAutoTable.finalY + 10;

      // Totals
      const subtotal = quotation.total_amount || 0;
      const gstAmount = quotation.gst_amount || 0;
      const finalAmount = quotation.final_amount || 0;

      doc.setFontSize(10);
      doc.text(`Subtotal: ₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 150, yPos, { align: 'right' });
      yPos += 5;
      doc.text(`GST (${quotation.gst_type} ${quotation.gst_percentage}%): ₹${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 150, yPos, { align: 'right' });
      yPos += 5;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total: ₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 150, yPos, { align: 'right' });
      yPos += 10;

      // Terms and conditions
      if (quotation.terms_and_conditions) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Terms & Conditions:', 20, yPos);
        yPos += 5;
        const terms = quotation.terms_and_conditions.split('\n');
        terms.forEach(term => {
          doc.text(`• ${term}`, 25, yPos);
          yPos += 5;
        });
      }

      // Save PDF
      const pdfBlob = doc.output('blob');
      const fileName = `${quotation.quotation_number}.pdf`;
      
      // Upload to storage
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `quotations/${quotation.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('marketing-documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('marketing-documents')
          .getPublicUrl(filePath);

        await supabase
          .from('marketing_quotations')
          .update({ pdf_path: filePath })
          .eq('id', quotation.id);

        // Download PDF
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + error.message);
    }
  };

  const getBase64Image = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleExport = () => {
    const exportData = quotations.map(quotation => ({
      'Quotation Number': quotation.quotation_number,
      'Date': quotation.quotation_date,
      'Client': quotation.marketing_clients?.client_name || '-',
      'Enquiry Number': quotation.marketing_enquiries?.enquiry_number || '-',
      'Total Amount (₹)': quotation.total_amount || 0,
      'GST Amount (₹)': quotation.gst_amount || 0,
      'Final Amount (₹)': quotation.final_amount || 0,
      'Status': quotation.status,
    }));
    exportToExcel(exportData, 'Quotations_Export', 'Quotations');
  };

  const handleCreateCosting = async (quotationId) => {
    if (!quotationId) {
      alert('Please select a quotation first');
      return;
    }

    try {
      setSelectedQuotationIdForEditor(quotationId);
      setIsCostingSheetViewMode(false);
      setShowCostingSheetEditor(true);
    } catch (error) {
      console.error('Error creating/finding quotation:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEditCostingSheet = (costingSheet) => {
    setSelectedQuotationIdForEditor(costingSheet.quotation_id);
    setIsCostingSheetViewMode(false);
    setShowCostingSheetEditor(true);
  };

  const handleViewCostingSheet = (costingSheet) => {
    setSelectedQuotationIdForEditor(costingSheet.quotation_id);
    setIsCostingSheetViewMode(true);
    setShowCostingSheetEditor(true);
  };

  const handleDeleteCostingSheet = async (costingSheet) => {
    if (!confirm('Are you sure you want to delete this costing sheet?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_costing_sheets')
        .delete()
        .eq('id', costingSheet.id);

      if (error) throw error;

      alert('Costing sheet deleted successfully!');
      fetchCostingSheets();
    } catch (error) {
      console.error('Error deleting costing sheet:', error);
      alert('Error deleting costing sheet: ' + error.message);
    }
  };

  const handleCostingSheetSaveSuccess = () => {
    fetchCostingSheets();
    setShowCostingSheetEditor(false);
    setSelectedQuotationIdForEditor(null);
    setIsCostingSheetViewMode(false);
  };

  const handleCreateInternalQuotation = (quotationId) => {
    setSelectedQuotationId(quotationId);
    setShowInternalForm(true);
  };

  const handleViewInternalQuotation = (quotationId) => {
    setSelectedQuotationId(quotationId);
    setShowInternalForm(true);
  };

  const handleEditInternalQuotation = (quotationId) => {
    setSelectedQuotationId(quotationId);
    setShowInternalForm(true);
  };

  const handleDeleteInternalQuotation = async (quotationId) => {
    if (!confirm('Are you sure you want to delete this internal quotation data? This will clear the subject and terms data.')) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('marketing_quotations')
        .update({
          subject_title: null,
          subject: null,
          signed_by: null,
          signature_path: null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quotationId);

      if (error) throw error;

      alert('Internal quotation data deleted successfully!');
      fetchQuotationsWithCosting();
    } catch (error) {
      console.error('Error deleting internal quotation:', error);
      alert('Error deleting internal quotation: ' + error.message);
    }
  };

  const handleRevision = async (quotation) => {
    // Get the latest revision number to show in modal
    const { data: latestRevision } = await supabase
      .from('marketing_quotation_revisions')
      .select('revision_number')
      .eq('quotation_id', quotation.id)
      .order('revision_number', { ascending: false })
      .limit(1)
      .single();

    const nextRevisionNumber = latestRevision ? latestRevision.revision_number + 1 : 1;
    
    setSelectedQuotationForRevision({
      ...quotation,
      nextRevisionNumber
    });
    setRevisionFormData({
      upcoming_date: new Date().toISOString().split('T')[0],
      remarks: '',
      status: 'Pending',
    });
    
    // Load costing sheet ID if it exists
    if (quotation.id) {
      const { data } = await supabase
        .from('marketing_costing_sheets')
        .select('id')
        .eq('quotation_id', quotation.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setRevisionCostingSheetId(data.id);
      } else {
        setRevisionCostingSheetId(null);
      }
    }
    
    setShowRevisionModal(true);
    setMenuOpen(null);
  };

  const handleRevisionSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Use the pre-calculated revision number
      const nextRevisionNumber = selectedQuotationForRevision.nextRevisionNumber || 1;

      // Generate revision quotation number (QT/2025/0015/R1)
      const baseQuotationNumber = selectedQuotationForRevision.quotation_number;
      // Remove any existing revision suffix to get base number
      const baseNumber = baseQuotationNumber.split('/R')[0];
      const revisionQuotationNumber = `${baseNumber}/R${nextRevisionNumber}`;

      // Get original quotation data
      const originalQuotation = selectedQuotationForRevision;

      // Update existing quotation with revision number instead of creating new one
      const { data: updatedQuotation, error: quotationError } = await supabase
        .from('marketing_quotations')
        .update({
          quotation_number: revisionQuotationNumber,
          revision_number: nextRevisionNumber,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', originalQuotation.id)
        .select()
        .single();

      if (quotationError) {
        // If duplicate key error, it means revision quotation already exists
        if (quotationError.message.includes('duplicate key') || quotationError.message.includes('unique constraint')) {
          // Just update the revision_number and other fields without changing quotation_number
          const { data: retryUpdate, error: retryError } = await supabase
            .from('marketing_quotations')
            .update({
              revision_number: nextRevisionNumber,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', originalQuotation.id)
            .select()
            .single();
          
          if (retryError) throw retryError;
        } else {
          throw quotationError;
        }
      }

      // Create revision record (without revision_quotation_id if column doesn't exist)
      const revisionInsertData = {
        quotation_id: selectedQuotationForRevision.id,
        revision_number: nextRevisionNumber,
        revision_date: revisionFormData.upcoming_date,
        remarks: revisionFormData.remarks,
        created_by: user.id,
      };

      const { data: revisionData, error: revisionError } = await supabase
        .from('marketing_quotation_revisions')
        .insert([revisionInsertData])
        .select()
        .single();

      if (revisionError) {
        // If error is about missing column, try without it
        if (revisionError.message.includes('revision_quotation_id')) {
          const { data: retryData, error: retryError } = await supabase
            .from('marketing_quotation_revisions')
            .insert([{
              quotation_id: selectedQuotationForRevision.id,
              revision_number: nextRevisionNumber,
              revision_date: revisionFormData.upcoming_date,
              remarks: revisionFormData.remarks,
              created_by: user.id,
            }])
            .select()
            .single();
          
          if (retryError) throw retryError;
        } else {
          throw revisionError;
        }
      }

      // Auto-sync with follow-up planner
      const { error: followUpError } = await supabase
        .from('marketing_follow_ups')
        .insert([{
          quotation_id: selectedQuotationForRevision.id,
          follow_up_date: revisionFormData.upcoming_date,
          remarks: `Revision ${nextRevisionNumber}: ${revisionFormData.remarks}`,
          status: revisionFormData.status,
          created_by: user.id,
          updated_by: user.id,
        }]);

      if (followUpError) {
        console.error('Error creating follow-up:', followUpError);
        // Continue even if follow-up creation fails
      }

      // Update quotation follow-up date if it exists
      await supabase
        .from('marketing_quotations')
        .update({ 
          follow_up_date: revisionFormData.upcoming_date,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedQuotationForRevision.id);

      // Email and notification sending removed as per user request

      setShowRevisionModal(false);
      setSelectedQuotationForRevision(null);
      setRevisionFormData({
        upcoming_date: new Date().toISOString().split('T')[0],
        remarks: '',
        status: 'Pending',
      });
      await fetchQuotations();
      await fetchCostingSheets();
      await fetchQuotationsWithCosting();
      // Show alert only once
      const alertShown = sessionStorage.getItem(`revision_alert_${selectedQuotationForRevision.id}_${nextRevisionNumber}`);
      if (!alertShown) {
        alert(`Revision ${nextRevisionNumber} created successfully and synced with follow-up planner!`);
        sessionStorage.setItem(`revision_alert_${selectedQuotationForRevision.id}_${nextRevisionNumber}`, 'true');
      }
    } catch (error) {
      console.error('Error saving revision:', error);
      alert('Error saving revision: ' + error.message);
    }
  };

  const sendRevisionNotification = async (quotation, remarks) => {
    try {
      // Create notification record (you may need to create a notifications table)
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('marketing_notifications')
        .insert([{
          type: 'quotation_revision',
          title: `Quotation Revision Due: ${quotation.quotation_number}`,
          message: `Revision reminder for ${quotation.quotation_number}: ${remarks}`,
          quotation_id: quotation.id,
          created_by: user.id,
        }])
        .catch(err => {
          // If notifications table doesn't exist, just log the error
          console.log('Notifications table not found, skipping notification save');
        });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const sendRevisionEmail = async (quotation, remarks) => {
    try {
      // Fetch client email if not already loaded
      let clientEmail = quotation.marketing_clients?.contact_email;
      let clientName = quotation.marketing_clients?.client_name;
      
      if (!clientEmail && quotation.client_id) {
        const { data: client } = await supabase
          .from('marketing_clients')
          .select('client_name, contact_email')
          .eq('id', quotation.client_id)
          .single();
        
        if (client) {
          clientEmail = client.contact_email;
          clientName = client.client_name;
        }
      }
      
      if (!clientEmail) {
        console.log('No client email found for quotation:', quotation.quotation_number);
        return;
      }

      const subject = `Quotation Revision Reminder - ${quotation.quotation_number}`;
      const body = `Dear ${clientName || 'Valued Client'},

This is a reminder regarding the revision of quotation ${quotation.quotation_number}.

Remarks: ${remarks}

Please review and provide your feedback at your earliest convenience.

Best regards,
Marketing Team`;

      // Use mailto link as a fallback (you can integrate with your email service)
      const mailtoLink = `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailtoLink);
      
      // If you have an email service configured, you can call it here
      // await supabase.functions.invoke('send-email', { body: { to: clientEmail, subject, body } });
    } catch (error) {
      console.error('Error sending email:', error);
    }
  };

  const fetchRevisionHistory = async (quotationId) => {
    try {
      const { data, error } = await supabase
        .from('marketing_quotation_revisions')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('revision_number', { ascending: true }); // Order: 1, 2, 3...

      if (error) throw error;
      
      // Fetch base quotation to get quotation number
      const { data: baseQuotation } = await supabase
        .from('marketing_quotations')
        .select('quotation_number')
        .eq('id', quotationId)
        .single();

      // Fetch quotation data to get final_amount for each revision
      // Since we can't use revision_quotation_id, we'll search for quotations with revision numbers
      let allQuotations = [];
      if (baseQuotation?.quotation_number) {
        const baseNumber = baseQuotation.quotation_number;
        const { data: revisionQuotations } = await supabase
          .from('marketing_quotations')
          .select('id, quotation_number, final_amount, created_at, revision_number')
          .ilike('quotation_number', `${baseNumber}/R%`)
          .order('created_at', { ascending: false });
        
        allQuotations = revisionQuotations || [];
      }

      // Determine which revision is active (not completed)
      const revisions = (data || []).map(rev => {
        // Try to find matching revision quotation by checking quotation numbers with /R pattern
        const baseQuotation = allQuotations?.find(q => q.id === quotationId);
        const baseNumber = baseQuotation?.quotation_number || '';
        const revisionQuotation = allQuotations?.find(q => 
          q.quotation_number === `${baseNumber}/R${rev.revision_number}` ||
          q.quotation_number?.includes(`/R${rev.revision_number}`)
        );

        return {
          ...rev,
          isActive: rev.status !== 'Completed',
          created_by_user: { email: 'User' },
          revision_quotation: revisionQuotation || null
        };
      });
      
      setRevisionHistory(revisions);
      setShowRevisionHistory(true);
    } catch (error) {
      console.error('Error fetching revision history:', error);
      alert('Error fetching revision history: ' + error.message);
    }
  };

  return (
    <div className="w-full h-screen overflow-y-auto p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="bg-white shadow p-3 sm:p-4 md:p-6 rounded-lg mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {activeTab === 'list' ? 'Quotation Tracker' : 
               activeTab === 'costing' ? 'Costing Sheet' : 
               'Internal Quotation'}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {activeTab === 'list' ? 'Manage all quotations and costing sheets' : 
               activeTab === 'costing' ? 'Create and manage costing sheets for approved quotations' : 
               'Create and manage internal quotations from costing sheets'}
            </p>
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
                if (activeTab === 'list') {
                  setEditingQuotation(null);
                  setFormData({
                    enquiry_id: enquiryId || '',
                    client_id: '',
                    quotation_date: new Date().toISOString().split('T')[0],
                    valid_until: '',
                    revision_number: 1,
                    gst_type: 'IGST',
                    gst_percentage: 18,
                    payment_terms: '',
                    terms_and_conditions: '',
                    status: 'Draft',
                    assigned_to: '',
                  });
                  setShowForm(true);
                } else if (activeTab === 'costing') {
                  setShowNewCostingSheetForm(true);
                } else if (activeTab === 'internal') {
                  setShowInternalForm(true);
                }
              }}
              className={`flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 text-white rounded-lg text-sm sm:text-base ${
                activeTab === 'list' ? 'bg-purple-600 hover:bg-purple-700' :
                activeTab === 'costing' ? 'bg-green-600 hover:bg-green-700' :
                'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>
                {activeTab === 'list' ? 'New Quotation' : 
                 activeTab === 'costing' ? 'New Costing Sheet' : 
                 'New Internal Quotation'}
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 md:mb-6 border-b">
          <div className="flex space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'list'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Quotation List
            </button>
              <button
                onClick={() => setActiveTab('costing')}
              className={`px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                  activeTab === 'costing'
                  ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Costing Sheet
              </button>
            <button
              onClick={() => setActiveTab('internal')}
              className={`px-4 py-2 font-medium text-sm sm:text-base whitespace-nowrap ${
                activeTab === 'internal'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Internal Quotation
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'list' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ overflow: 'visible' }}>
            {/* Search Bar */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by quotation number, client name, or enquiry number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                <p className="mt-2 text-sm">Loading...</p>
              </div>
            ) : quotations.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <FileText className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                <p className="text-base font-medium">No quotations found</p>
                <p className="text-xs mt-1">Create your first quotation to get started</p>
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
                <table className="w-full min-w-[1000px] text-xs">
                  <thead className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Quotation ID</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Client Name</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Enquiry ID</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Total Amount</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Quotation Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {quotations.filter(quotation => {
                      if (!searchQuery) return true;
                      const query = searchQuery.toLowerCase();
                      const quotationNumber = quotation.quotation_number?.toLowerCase() || '';
                      const clientName = quotation.marketing_clients?.client_name?.toLowerCase() || '';
                      const enquiryNumber = quotation.marketing_enquiries?.enquiry_number?.toLowerCase() || '';
                      return quotationNumber.includes(query) || 
                             clientName.includes(query) || 
                             enquiryNumber.includes(query);
                    }).map((quotation, index) => {
                      const isLastRow = index === quotations.length - 1;
                      return (
                        <tr key={quotation.id} className="hover:bg-purple-50/30 transition-colors" data-is-last-row={isLastRow}>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold text-gray-900">{quotation.quotation_number}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-700 font-medium">
                              {quotation.marketing_clients?.client_name || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-600">
                              {quotation.marketing_enquiries?.enquiry_number || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold text-gray-900">
                              ₹{parseFloat(quotation.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-600">
                              {new Date(quotation.quotation_date).toLocaleDateString('en-GB', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                              quotation.status === 'Sent' 
                                ? 'bg-green-100 text-green-700 border border-green-200' 
                                : quotation.status === 'Accepted' 
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : quotation.status === 'Draft'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : quotation.status === 'Approved'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                            }`}>
                              {quotation.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center" style={{ position: 'relative', overflow: 'visible' }}>
                            <div className="relative inline-block text-center" style={{ zIndex: menuOpen === quotation.id ? 1000 : 'auto' }}>
                              <button
                                id={`menu-btn-${quotation.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpen(menuOpen === quotation.id ? null : quotation.id);
                                }}
                                className="p-1.5 hover:bg-purple-100 rounded-md transition-colors text-gray-600 hover:text-purple-700"
                                title="Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {menuOpen === quotation.id && (
                                <>
                                  <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setMenuOpen(null)}
                                    style={{ backgroundColor: 'transparent' }}
                                  ></div>
                                  <DropdownMenu
                                    buttonId={`menu-btn-${quotation.id}`}
                                    quotation={quotation}
                                    onView={() => {
                                      handleView(quotation);
                                      setMenuOpen(null);
                                    }}
                                    onEdit={() => {
                                      handleEdit(quotation);
                                      setMenuOpen(null);
                                    }}
                                    onDownloadPDF={() => {
                                      generatePDF(quotation);
                                      setMenuOpen(null);
                                    }}
                                    onDelete={() => {
                                      handleDelete(quotation.id);
                                      setMenuOpen(null);
                                    }}
                                    onRevision={() => {
                                      handleRevision(quotation);
                                      setMenuOpen(null);
                                    }}
                                    hasRevisions={quotationsWithRevisionCount.find(q => q.id === quotation.id)?.hasRevisions || false}
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'costing' && (
          <div>
            {/* New Costing Sheet Form Modal */}
            {showNewCostingSheetForm && (
              <div className="mb-6 bg-white p-6 rounded-lg border-2 border-purple-200 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Create New Costing Sheet</h3>
                  <button
                    onClick={() => {
                      setShowNewCostingSheetForm(false);
                      setSelectedQuotationId('');
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quotation
                  </label>
                  <div className="flex gap-3">
                    <select
                      value={selectedQuotationId}
                      onChange={(e) => setSelectedQuotationId(e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select Quotation</option>
                      {costingQuotations.map((quotation) => (
                        <option key={quotation.id} value={quotation.id}>
                          {quotation.quotation_number}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!selectedQuotationId) {
                          alert('Please select a quotation first');
                          return;
                        }
                        handleCreateCosting(selectedQuotationId);
                        setShowNewCostingSheetForm(false);
                      }}
                      disabled={!selectedQuotationId}
                      className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Costing Sheet</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Costing Sheet Editor */}
            {showCostingSheetEditor && selectedQuotationIdForEditor && (
              <div className="mb-6 bg-white p-6 rounded-lg border border-gray-200">
                <div className="mb-4 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {isCostingSheetViewMode ? 'Costing Sheet View' : 'Costing Sheet Editor'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowCostingSheetEditor(false);
                      setSelectedQuotationIdForEditor(null);
                      setIsCostingSheetViewMode(false);
                      fetchCostingSheets();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
                <ExcelCostingSheet
                  quotationId={selectedQuotationIdForEditor}
                  onCostingChange={() => {}}
                  onSaveSuccess={handleCostingSheetSaveSuccess}
                  isViewMode={isCostingSheetViewMode}
                />
              </div>
            )}

            {/* Costing Sheets Table */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Costing Sheets</h3>
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by quotation number, client name, or enquiry number..."
                    value={costingSearchQuery}
                    onChange={(e) => setCostingSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            {loadingCosting ? (
                <div className="p-8 text-center text-gray-500">Loading costing sheets...</div>
              ) : costingSheets.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                  No costing sheets found. Click "+ New Costing Sheet" to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-full">
                  <thead>
                      <tr className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                        <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Quotation ID</th>
                        <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Enquiry ID</th>
                        <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Client Name</th>
                        <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Create Date</th>
                        <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Updated</th>
                        <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Final Amount</th>
                        <th className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {costingSheets.filter((sheet) => {
                        if (!costingSearchQuery) return true;
                        const query = costingSearchQuery.toLowerCase();
                        const quotation = sheet.marketing_quotations;
                        const quotationNumber = quotation?.quotation_number?.toLowerCase() || '';
                        const clientName = quotation?.marketing_clients?.client_name?.toLowerCase() || '';
                        const enquiryNumber = quotation?.marketing_enquiries?.enquiry_number?.toLowerCase() || '';
                        return quotationNumber.includes(query) || 
                               clientName.includes(query) || 
                               enquiryNumber.includes(query);
                      }).map((sheet) => {
                        const quotation = sheet.marketing_quotations;
                        // Calculate final amount from costing data
                        let finalAmount = 0;
                        if (sheet.costing_data) {
                          try {
                            const costingData = typeof sheet.costing_data === 'string' 
                              ? JSON.parse(sheet.costing_data) 
                              : sheet.costing_data;
                            if (costingData.items && costingData.items.length > 0) {
                              finalAmount = costingData.items.reduce((sum, item) => {
                                const finalPriceKey = `${item.id}_final_price`;
                                const finalPrice = parseFloat(costingData[finalPriceKey] || 0);
                                return sum + finalPrice;
                              }, 0);
                            }
                          } catch (e) {
                            console.error('Error parsing costing data:', e);
                          }
                        }
                        return (
                          <tr key={sheet.id} className="hover:bg-green-50/30 transition-colors border-b border-gray-200">
                            <td className="px-2 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                              {quotation?.quotation_number || '-'}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700">
                              {quotation?.marketing_enquiries?.enquiry_number || '-'}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-700">
                              {quotation?.marketing_clients?.client_name || '-'}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600">
                              {sheet.created_at ? new Date(sheet.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600">
                              {sheet.updated_at ? new Date(sheet.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : (sheet.created_at ? new Date(sheet.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-')}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-right font-semibold text-gray-900">
                              {finalAmount > 0 ? `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                          <button
                                  onClick={() => handleViewCostingSheet(sheet)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="View"
                          >
                                  <Eye className="w-3.5 h-3.5" />
                          </button>
                                <button
                                  onClick={() => handleEditCostingSheet(sheet)}
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCostingSheet(sheet)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                        </td>
                      </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        )}

        {activeTab === 'internal' && (
          <div>
            {/* Search Bar */}
            <div className="mb-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by quotation number or client name..."
                  value={internalSearchQuery}
                  onChange={(e) => setInternalSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            {loadingInternal ? (
              <div className="p-8 text-center text-gray-500">Loading quotations...</div>
            ) : quotationsWithCosting.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No sent quotations with costing sheets found. Create and send quotations first.
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
                <table className="w-full min-w-[1000px] text-xs">
                  <thead className="bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Quotation ID</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Client Name</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Final Amount</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Created Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {quotationsWithCosting.filter((quotation) => {
                      if (!internalSearchQuery) return true;
                      const query = internalSearchQuery.toLowerCase();
                      const quotationNumber = quotation.quotation_number?.toLowerCase() || '';
                      const clientName = quotation.marketing_clients?.client_name?.toLowerCase() || '';
                      return quotationNumber.includes(query) || clientName.includes(query);
                    }).map((quotation, index, filteredArray) => {
                      const hasInternalData = quotation.subject_title || quotation.subject;
                      const isLastRow = index === filteredArray.length - 1;
                      return (
                        <tr key={quotation.id} className="hover:bg-purple-50/30 transition-colors" data-is-last-row={isLastRow}>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold text-gray-900">{quotation.quotation_number}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-700 font-medium">
                              {quotation.marketing_clients?.client_name || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold text-gray-900">
                              {quotation.finalAmount > 0 
                                ? `₹${quotation.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs text-gray-600">
                              {quotation.internalQuotationCreatedDate 
                                ? new Date(quotation.internalQuotationCreatedDate).toLocaleDateString('en-GB', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' 
                                  })
                                : quotation.created_at
                                ? new Date(quotation.created_at).toLocaleDateString('en-GB', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    year: 'numeric' 
                                  })
                                : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                              hasInternalData
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : quotation.status === 'Sent'
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : quotation.status === 'Draft'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                            }`}>
                              {hasInternalData ? 'Saved' : (quotation.status || 'Sent')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {hasInternalData ? (
                                <>
                                  <button
                                    onClick={() => handleViewInternalQuotation(quotation.id)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="View"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleEditInternalQuotation(quotation.id)}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteInternalQuotation(quotation.id)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleCreateInternalQuotation(quotation.id)}
                                  className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                                >
                                  Create Internal Quotation
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Quotation Modal */}
      {showForm && (
        <QuotationForm
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingQuotation(null);
            setSelectedQuotation(null);
            fetchQuotations();
            fetchCostingSheets();
            fetchQuotationsWithCosting();
          }}
          quotation={editingQuotation}
          enquiryId={enquiryId}
          onSave={async (result) => {
            // Wait a bit to ensure data is saved
            await new Promise(resolve => setTimeout(resolve, 200));
            await fetchQuotations();
            await fetchEnquiries(); // Refresh enquiries to show converted status
            if (activeTab === 'costing') {
              await fetchCostingSheets();
              await fetchCostingQuotations();
            }
            if (activeTab === 'internal') {
              await fetchQuotationsWithCosting();
            }
            setShowForm(false);
            setEditingQuotation(null);
            setSelectedQuotation(null);
            // Clear URL parameter after successful save
            if (enquiryId) {
              navigate('/marketing/quotation-tracker', { replace: true });
            }
          }}
        />
      )}

      {/* Costing Sheet functionality is now inline in the costing tab */}

      {/* Create Internal Quotation Modal */}
      {showInternalForm && (
        <InternalQuotationFormModal
          isOpen={showInternalForm}
          quotationId={selectedQuotationId}
          onClose={() => {
            setShowInternalForm(false);
            setSelectedQuotationId(null);
            fetchQuotationsWithCosting();
            fetchCostingSheets();
          }}
          onSave={() => {
            fetchQuotationsWithCosting();
            fetchCostingSheets();
            setShowInternalForm(false);
            setSelectedQuotationId(null);
          }}
        />
      )}


      {/* Revision Modal */}
      {showRevisionModal && selectedQuotationForRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                  {selectedQuotationForRevision.nextRevisionNumber === 1 ? 'Create Revision' : `Add Revision ${selectedQuotationForRevision.nextRevisionNumber}`}
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Quotation: {selectedQuotationForRevision.quotation_number} → {selectedQuotationForRevision.quotation_number}/R{selectedQuotationForRevision.nextRevisionNumber || 1}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRevisionModal(false);
                  setSelectedQuotationForRevision(null);
                  setRevisionCostingSheetId(null);
                  fetchQuotations();
                  fetchCostingSheets();
                  fetchQuotationsWithCosting();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRevisionSubmit} className="p-4 sm:p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upcoming Date (Follow-up Date) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={revisionFormData.upcoming_date}
                      onChange={(e) => setRevisionFormData({ ...revisionFormData, upcoming_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This date will auto-sync with the follow-up planner
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={revisionFormData.status}
                      onChange={(e) => setRevisionFormData({ ...revisionFormData, status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    >
                      <option value="Pending">Pending</option>
                      <option value="Completed">Completed</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Remarks / Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={revisionFormData.remarks}
                    onChange={(e) => setRevisionFormData({ ...revisionFormData, remarks: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                    placeholder="Enter revision details, client feedback, or any remarks..."
                    required
                  />
                </div>

                {/* Costing Sheet */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Costing Sheet</h3>
                  <ExcelCostingSheet
                    quotationId={selectedQuotationForRevision.id}
                    costingSheetId={revisionCostingSheetId}
                    onCostingChange={(total) => {
                      // Update revision total if needed
                    }}
                    onSaveSuccess={() => {
                      // Refresh costing sheet ID after save
                      if (selectedQuotationForRevision.id) {
                        supabase
                          .from('marketing_costing_sheets')
                          .select('id')
                          .eq('quotation_id', selectedQuotationForRevision.id)
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .maybeSingle()
                          .then(({ data }) => {
                            if (data) setRevisionCostingSheetId(data.id);
                          });
                      }
                    }}
                    isViewMode={false}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowRevisionModal(false);
                    setSelectedQuotationForRevision(null);
                    setRevisionCostingSheetId(null);
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Save Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {showRevisionHistory && selectedQuotationForRevision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Revision History</h2>
                <p className="text-xs sm:text-sm text-gray-600 mt-1">
                  Quotation: {selectedQuotationForRevision.quotation_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRevisionHistory(false);
                  setSelectedQuotationForRevision(null);
                  setRevisionHistory([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {revisionHistory.length > 0 ? (
                revisionHistory.map((revision) => {
                  // Completed revisions: gray/blue color
                  // Active/working revision: different color (purple/orange)
                  const isCompleted = revision.status === 'Completed';
                  const isActive = revision.isActive && !isCompleted;
                  
                  return (
                    <div 
                      key={revision.id} 
                      className={`border-l-4 pl-4 py-3 rounded-r-lg transition-colors ${
                        isActive 
                          ? 'border-orange-500 bg-orange-50 hover:bg-orange-100' 
                          : isCompleted
                          ? 'border-gray-400 bg-gray-50 hover:bg-gray-100'
                          : 'border-purple-500 bg-purple-50 hover:bg-purple-100'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-gray-900">
                                Revision {revision.revision_number}
                              </span>
                              {isActive && (
                                <span className="px-2 py-1 text-xs rounded-full bg-orange-200 text-orange-800 font-medium">
                                  Active
                                </span>
                              )}
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                revision.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                revision.status === 'Overdue' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {revision.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  // Fetch the quotation with revision number to edit
                                  const baseNumber = selectedQuotationForRevision.quotation_number.split('/R')[0];
                                  const revisionQuotationNumber = `${baseNumber}/R${revision.revision_number}`;
                                  
                                  const { data: revisionQuotation } = await supabase
                                    .from('marketing_quotations')
                                    .select(`
                                      *,
                                      marketing_enquiries:enquiry_id (id, enquiry_number),
                                      marketing_clients:client_id (id, client_name, contact_email)
                                    `)
                                    .eq('quotation_number', revisionQuotationNumber)
                                    .maybeSingle();
                                  
                                  // If revision quotation exists, edit it; otherwise edit base quotation
                                  const quotationToEdit = revisionQuotation || selectedQuotationForRevision;
                                  
                                  setShowRevisionHistory(false);
                                  setSelectedQuotationForRevision(null);
                                  handleEdit(quotationToEdit);
                                }}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                title="Edit Revision"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600 mb-3">
                            <div>
                              <span className="font-medium text-gray-500">Date:</span>
                              <div className="text-gray-900 font-semibold mt-0.5">
                                {new Date(revision.created_at).toLocaleDateString('en-GB', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-500">Upcoming Date:</span>
                              <div className="text-gray-900 font-semibold mt-0.5">
                                {new Date(revision.revision_date).toLocaleDateString('en-GB', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric' 
                                })}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-500">Total Amount:</span>
                              <div className="text-gray-900 font-semibold mt-0.5">
                                {revision.revision_quotation?.final_amount 
                                  ? `₹${parseFloat(revision.revision_quotation.final_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : '-'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="text-xs font-medium text-gray-500 mb-1">Remarks / Message:</div>
                            <p className="text-sm text-gray-700">
                              {revision.remarks || 'No remarks provided'}
                            </p>
                          </div>
                          {revision.revision_quotation?.quotation_number && (
                            <div className="mt-2 text-xs text-gray-500">
                              Revision Quotation: <span className="font-semibold text-gray-700">{revision.revision_quotation.quotation_number}</span>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            Created by: {revision.created_by_user?.email || 'System'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-8">No revision history found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Quotation Modal */}
      {showViewModal && viewingQuotation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Quotation Details</h2>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingQuotation(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Quotation Number</p>
                    <p className="font-medium text-gray-900">{viewingQuotation.quotation_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Date</p>
                    <p className="font-medium text-gray-900">{new Date(viewingQuotation.quotation_date).toLocaleDateString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric' 
                    })}</p>
                  </div>
                  {viewingQuotation.valid_until && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Valid Until</p>
                      <p className="font-medium text-gray-900">{new Date(viewingQuotation.valid_until).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Client</p>
                    <p className="font-medium text-gray-900">{viewingQuotation.marketing_clients?.client_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      viewingQuotation.status === 'Sent' ? 'bg-blue-100 text-blue-800' :
                      viewingQuotation.status === 'Draft' ? 'bg-gray-100 text-gray-800' :
                      viewingQuotation.status === 'Approved' ? 'bg-green-100 text-green-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {viewingQuotation.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Revision Number</p>
                    <p className="font-medium text-gray-900">{viewingQuotation.revision_number || 1}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">GST Type</p>
                    <p className="font-medium text-gray-900">{viewingQuotation.gst_type || 'IGST'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">GST Percentage</p>
                    <p className="font-medium text-gray-900">{viewingQuotation.gst_percentage || 18}%</p>
                  </div>
                  {viewingQuotation.follow_up_date && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Follow-up Date</p>
                      <p className="font-medium text-gray-900">{new Date(viewingQuotation.follow_up_date).toLocaleDateString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric' 
                      })}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-md font-semibold text-gray-900 mb-4">Financial Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Subtotal</p>
                    <p className="text-lg font-semibold text-gray-900">
                      ₹{parseFloat(viewingQuotation.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">GST Amount</p>
                    <p className="text-lg font-semibold text-gray-900">
                      ₹{parseFloat(viewingQuotation.gst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Final Amount</p>
                    <p className="text-xl font-bold text-purple-600">
                      ₹{parseFloat(viewingQuotation.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Costing Sheet Table */}
              {viewingQuotation.costingSheet?.costing_data && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Costing Sheet</h3>
                  <div className="overflow-x-auto">
                    {(() => {
                      try {
                        const costingData = typeof viewingQuotation.costingSheet.costing_data === 'string' 
                          ? JSON.parse(viewingQuotation.costingSheet.costing_data)
                          : viewingQuotation.costingSheet.costing_data;
                        
                        if (costingData.items && costingData.items.length > 0 && costingData.costHeads && costingData.costHeads.length > 0) {
                          return (
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Item</th>
                                  {costingData.costHeads.map((head) => (
                                    <th key={head.id} className="border border-gray-300 px-3 py-2 text-right font-semibold">
                                      {head.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {costingData.items.map((item, idx) => (
                                  <tr key={item.id || idx} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 px-3 py-2 font-medium">{item.name || `Item ${idx + 1}`}</td>
                                    {costingData.costHeads.map((head) => {
                                      const cellValue = costingData[`${item.id}_${head.id}`] || '';
                                      return (
                                        <td key={head.id} className="border border-gray-300 px-3 py-2 text-right">
                                          {head.isCalculated || head.id === 'final_price' || head.id === 'quotation_rate' || head.id === 'margin_amount' || head.id === 'total_cost'
                                            ? `₹${parseFloat(cellValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                            : cellValue ? `₹${parseFloat(cellValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        }
                        return null;
                      } catch (e) {
                        console.error('Error parsing costing data:', e);
                        return <p className="text-gray-500">Unable to display costing sheet data</p>;
                      }
                    })()}
                  </div>
                </div>
              )}

              {/* Quotation Items */}
              {quotationItems.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-gray-900 mb-4">Quotation Items</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Description</th>
                          <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Quantity</th>
                          <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Unit Price</th>
                          <th className="border border-gray-300 px-3 py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotationItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-3 py-2">{item.item_description}</td>
                            <td className="border border-gray-300 px-3 py-2 text-right">{item.quantity}</td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                              ₹{parseFloat(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right font-medium">
                              ₹{parseFloat(item.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Description/Payment Terms */}
              {viewingQuotation.payment_terms && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingQuotation.payment_terms}</p>
                </div>
              )}

              {/* Terms and Conditions */}
              {viewingQuotation.terms_and_conditions && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="text-md font-semibold text-gray-900 mb-2">Terms and Conditions</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingQuotation.terms_and_conditions}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => fetchRevisionHistory(viewingQuotation.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <History className="w-4 h-4" />
                  <span>View Revision History</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuotationTracker;

