import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ExcelCostingSheet from './ExcelCostingSheet';

const QuotationForm = ({ 
  isOpen, 
  onClose, 
  quotation = null, 
  enquiryId = null,
  onSave 
}) => {
  // Default cost heads (rows)
  const defaultCostHeads = [
    { id: 'base_cost', label: 'Base Cost (from Product Catalog)', isEditable: true, isCalculated: false },
    { id: 'customs_duty', label: 'Customs Duty (If applicable)', isEditable: true, isCalculated: false },
    { id: 'freight', label: 'Freight / Logistics', isEditable: true, isCalculated: false },
    { id: 'insurance', label: 'Insurance(If applicable)', isEditable: true, isCalculated: false },
    { id: 'finance_cost', label: 'Finance Cost', isEditable: true, isCalculated: false },
    { id: 'business_dev', label: 'Business Development Cost(If applicable)', isEditable: true, isCalculated: false },
    { id: 'other_cost', label: 'Other / Misc Cost', isEditable: true, isCalculated: false },
    { id: 'total_cost', label: 'TOTAL COST', isEditable: false, isCalculated: true },
    { id: 'margin_percent', label: 'Margin %', isEditable: true, isCalculated: false },
    { id: 'margin_amount', label: 'Margin Amount', isEditable: false, isCalculated: true },
    { id: 'quotation_rate', label: 'Quotation Rate (Excluding-GST)', isEditable: false, isCalculated: true },
    { id: 'gst_percent', label: 'GST %', isEditable: true, isCalculated: false },
    { id: 'final_price', label: 'Final Quoted Price (Incl. GST)', isEditable: false, isCalculated: true },
  ];

  const [enquiries, setEnquiries] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([{ id: 'item-1', name: 'Item 1', productId: null, productName: '' }, { id: 'item-2', name: 'Item 2', productId: null, productName: '' }]);
  const [costHeads, setCostHeads] = useState(defaultCostHeads);
  const [costingData, setCostingData] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [costingDescription, setCostingDescription] = useState('');
  const [gstPercentage, setGstPercentage] = useState(18);
  const [costingSheetId, setCostingSheetId] = useState(null);
  const [costingTotal, setCostingTotal] = useState(0);
  const costingSheetRef = useRef(null);
  const isCalculatingRef = useRef(false);
  const previousInputDataRef = useRef({});

  const [formData, setFormData] = useState({
    enquiry_id: enquiryId || '',
    client_id: '',
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    revision_number: 1,
    gst_type: 'IGST',
    gst_percentage: 18,
    terms_and_conditions: '',
    status: 'Draft',
    assigned_to: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchEnquiries();
      fetchClients();
      fetchProducts();
      if (quotation) {
        setFormData({
          enquiry_id: quotation.enquiry_id || '',
          client_id: quotation.client_id || '',
          quotation_date: quotation.quotation_date || new Date().toISOString().split('T')[0],
          valid_until: quotation.valid_until || '',
          revision_number: quotation.revision_number || 1,
          gst_type: quotation.gst_type || 'IGST',
          gst_percentage: quotation.gst_percentage || 18,
          terms_and_conditions: quotation.terms_and_conditions || 'GST At Actuals',
          status: quotation.status || 'Draft',
          assigned_to: quotation.assigned_to || '',
        });
        setCostingDescription(quotation.payment_terms || '');
        setGstPercentage(quotation.gst_percentage || 18);
        
        // Load costing sheet data if available
        if (quotation.id) {
          loadCostingSheetData(quotation.id);
        }
      } else {
        setFormData({
          enquiry_id: enquiryId || '',
          client_id: '',
          quotation_date: new Date().toISOString().split('T')[0],
          valid_until: '',
          revision_number: 1,
          gst_type: 'IGST',
          gst_percentage: 18,
          terms_and_conditions: 'GST At Actuals',
          status: 'Draft',
          assigned_to: '',
        });
        setCostingDescription('');
        setGstPercentage(18);
        setCostingSheetId(null);
        setCostingTotal(0);
        setItems([{ id: 'item-1', name: 'Item 1', productId: null, productName: '' }, { id: 'item-2', name: 'Item 2', productId: null, productName: '' }]);
        setCostHeads(defaultCostHeads);
        setCostingData({});
        
        // Auto-fetch enquiry data and populate client_id when enquiryId is provided
        if (enquiryId) {
          fetchEnquiryData(enquiryId);
        }
      }
    }
  }, [isOpen, quotation, enquiryId]);

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
    if (isCalculatingRef.current) {
      return;
    }
    calculateAll();
  }, [costingData, items, costHeads, gstPercentage]);

  const fetchEnquiries = async () => {
    try {
      const { data } = await supabase
        .from('marketing_enquiries')
        .select('id, enquiry_number, client_id, is_converted_to_quotation')
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
        .select('id, product_name, product_code, detailed_specifications')
        .eq('is_active', true)
        .order('product_name');
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
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

  const getProductSpecification = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.detailed_specifications) return '';
    // Get specification without additional info
    const parts = product.detailed_specifications.split('Additional Info:');
    return parts[0].trim();
  };

  const loadCostingSheetData = async (quotationId) => {
    try {
      const { data, error } = await supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setCostingSheetId(data.id);
        if (data.costing_data) {
          try {
            const parsedData = typeof data.costing_data === 'string' 
              ? JSON.parse(data.costing_data) 
              : data.costing_data;
            
            // Calculate total from costing data
            if (parsedData.items && parsedData.items.length > 0) {
              const total = parsedData.items.reduce((sum, item) => {
                const finalPriceKey = `${item.id}_final_price`;
                const finalPrice = parseFloat(parsedData[finalPriceKey] || 0);
                return sum + finalPrice;
              }, 0);
              setCostingTotal(total);
            }
          } catch (e) {
            console.error('Error parsing costing data:', e);
          }
        }
      } else {
        setCostingSheetId(null);
      }
    } catch (error) {
      console.error('Error loading costing sheet:', error);
    }
  };

  const getCellValue = (itemId, costHeadId) => {
    const key = `${itemId}_${costHeadId}`;
    return costingData[key] || '';
  };

  const setCellValue = (itemId, costHeadId, value) => {
    const key = `${itemId}_${costHeadId}`;
    setCostingData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const calculateTotalCost = (itemId) => {
    const summableHeads = ['base_cost', 'customs_duty', 'freight', 'insurance', 'finance_cost', 'business_dev', 'other_cost'];
    let total = 0;
    summableHeads.forEach((headId) => {
      const value = parseFloat(getCellValue(itemId, headId)) || 0;
      total += value;
    });
    return total;
  };

  const calculateMarginAmount = (itemId) => {
    const totalCost = calculateTotalCost(itemId);
    const marginPercent = parseFloat(getCellValue(itemId, 'margin_percent')) || 0;
    return (totalCost * marginPercent) / 100;
  };

  const calculateQuotationRate = (itemId) => {
    const totalCost = calculateTotalCost(itemId);
    const marginAmount = calculateMarginAmount(itemId);
    return totalCost + marginAmount;
  };

  const calculateFinalPrice = (itemId) => {
    const quotationRate = calculateQuotationRate(itemId);
    const itemGstPercent = getCellValue(itemId, 'gst_percent');
    const gstPercent = itemGstPercent ? parseFloat(itemGstPercent) : gstPercentage;
    const gstAmount = (quotationRate * gstPercent) / 100;
    return quotationRate + gstAmount;
  };

  const calculateAll = () => {
    if (isCalculatingRef.current) {
      return;
    }
    
    isCalculatingRef.current = true;
    
    setCostingData((prev) => {
      const newData = { ...prev };
      
      items.forEach((item) => {
        const getCurrentValue = (itemId, costHeadId) => {
          const key = `${itemId}_${costHeadId}`;
          return newData[key] || '';
        };
        
        const totalCost = calculateTotalCost(item.id);
        newData[`${item.id}_total_cost`] = totalCost.toFixed(2);

        const marginPercent = parseFloat(getCurrentValue(item.id, 'margin_percent')) || 0;
        const marginAmount = (totalCost * marginPercent) / 100;
        newData[`${item.id}_margin_amount`] = marginAmount.toFixed(2);

        const quotationRate = totalCost + marginAmount;
        newData[`${item.id}_quotation_rate`] = quotationRate.toFixed(2);

        const itemGstPercent = getCurrentValue(item.id, 'gst_percent');
        const gstPercent = itemGstPercent ? parseFloat(itemGstPercent) : gstPercentage;
        const gstAmount = (quotationRate * gstPercent) / 100;
        const finalPrice = quotationRate + gstAmount;
        newData[`${item.id}_final_price`] = finalPrice.toFixed(2);
      });
      
      setTimeout(() => {
        isCalculatingRef.current = false;
      }, 0);
      
      return newData;
    });
  };

  const addItem = () => {
    const newItem = {
      id: `item-${Date.now()}`,
      name: `Item ${items.length + 1}`,
      productId: null,
      productName: '',
    };
    setItems([...items, newItem]);
  };

  const deleteItem = (itemId) => {
    if (items.length <= 1) {
      alert('At least one item is required');
      return;
    }
    const newItems = items.filter((item) => item.id !== itemId);
    setItems(newItems);

    const newData = { ...costingData };
    costHeads.forEach((head) => {
      delete newData[`${itemId}_${head.id}`];
    });
    setCostingData(newData);
  };

  const editItemName = (itemId, newName) => {
    setItems(items.map((item) => (item.id === itemId ? { ...item, name: newName } : item)));
  };

  const addCostHead = () => {
    const newHead = {
      id: `cost_head_${Date.now()}`,
      label: 'New Cost Head',
      isEditable: true,
      isCalculated: false,
    };
    setCostHeads([...costHeads, newHead]);
  };

  const deleteCostHead = (headId) => {
    const head = costHeads.find((h) => h.id === headId);
    if (head && head.isCalculated) {
      alert('Cannot delete calculated rows');
      return;
    }
    const newHeads = costHeads.filter((head) => head.id !== headId);
    setCostHeads(newHeads);

    const newData = { ...costingData };
    items.forEach((item) => {
      delete newData[`${item.id}_${headId}`];
    });
    setCostingData(newData);
  };

  const editCostHeadLabel = (headId, newLabel) => {
    setCostHeads(costHeads.map((head) => (head.id === headId ? { ...head, label: newLabel } : head)));
  };

  const handleCellChange = (itemId, costHeadId, value) => {
    setCellValue(itemId, costHeadId, value);
    setEditingCell(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!formData.client_id) {
        alert('Please select a client');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // If editing an existing quotation: save costing sheet first (silent),
      // then update quotation and close from this submit.
      if (quotation?.id && costingSheetRef.current?.save) {
        const res = await costingSheetRef.current.save({ silent: true });
        if (res?.ok && typeof res.grandTotal === 'number') {
          setCostingTotal(res.grandTotal);
        }
      }
      
      // Generate unique quotation number with retry mechanism
      let quotationNumber;
      if (quotation) {
        quotationNumber = quotation.quotation_number;
      } else {
        quotationNumber = await generateQuotationNumber();
      }

      // Use costingTotal from ExcelCostingSheet if available, otherwise calculate from items
      let grandTotal = costingTotal;
      if (grandTotal === 0) {
        grandTotal = items.reduce((sum, item) => {
          return sum + (parseFloat(getCellValue(item.id, 'final_price')) || 0);
        }, 0);
      }
      
      // Calculate net total (excl GST) for display
      const netTotal = items.reduce((sum, item) => {
        return sum + (parseFloat(getCellValue(item.id, 'quotation_rate')) || 0);
      }, 0);
      
      // GST amount is the difference between grand total and net total
      const gstAmount = grandTotal - netTotal;
      
      // Use grandTotal as final amount (already includes GST)
      const subtotal = netTotal;
      const finalAmount = grandTotal;

      const submitData = {
        ...formData,
        quotation_number: quotation ? quotation.quotation_number : quotationNumber,
        client_id: formData.client_id || null,
        enquiry_id: formData.enquiry_id || null,
        assigned_to: formData.assigned_to || null,
        payment_terms: costingDescription,
        total_amount: subtotal,
        gst_amount: gstAmount,
        final_amount: finalAmount,
      };

      let result;
      if (quotation) {
        const { data, error } = await supabase
          .from('marketing_quotations')
          .update({
            ...submitData,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', quotation.id)
          .select()
          .single();

        if (error) {
          if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
            alert('Error: This quotation number already exists. Please refresh and try again.');
            return;
          }
          throw error;
        }
        result = data;
      } else {
        // Try to insert with retry mechanism for duplicate key errors
        let insertAttempts = 0;
        let insertSuccess = false;
        let lastError = null;
        
        while (insertAttempts < 5 && !insertSuccess) {
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
              lastError = error;
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
              // For other errors, throw immediately
              throw error;
            }
            
            result = data;
            insertSuccess = true;

            // Mark enquiry as converted only after successful quotation creation
            if (formData.enquiry_id) {
              await supabase
                .from('marketing_enquiries')
                .update({ 
                  is_converted_to_quotation: true, 
                  converted_quotation_id: result.id,
                  status: 'Converted',
                  updated_by: user.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', formData.enquiry_id);
            }
          } catch (insertError) {
            lastError = insertError;
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
            // For other errors, throw immediately
            throw insertError;
          }
        }

        if (!insertSuccess) {
          const errorMsg = lastError?.message || 'Unknown error occurred';
          throw new Error(`Failed to create quotation after ${insertAttempts} attempts. ${errorMsg}`);
        }
      }

      // Save costing sheet after quotation is created/updated
      let costingSaved = false;
      if (result && result.id && costingSheetRef.current?.save) {
        try {
          // Wait a moment to ensure quotation is fully saved
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Save costing sheet with the new quotation ID
          // The ExcelCostingSheet component will handle checking if there's data to save
          const saveResult = await costingSheetRef.current.save({ 
            silent: true, 
            quotationId: result.id 
          });
          
          if (saveResult?.ok) {
            costingSaved = true;
            // Update costing total if available
            if (typeof saveResult.grandTotal === 'number') {
              setCostingTotal(saveResult.grandTotal);
            }
            
            // Update quotation with final amounts from costing sheet if available
            if (saveResult.grandTotal !== undefined) {
              const { data: { user } } = await supabase.auth.getUser();
              await supabase
                .from('marketing_quotations')
                .update({
                  total_amount: saveResult.netTotal || 0,
                  gst_amount: saveResult.gstAmount || 0,
                  final_amount: saveResult.grandTotal || 0,
                  updated_by: user.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', result.id);
            }
          } else if (saveResult?.error) {
            console.error('Error saving costing sheet:', saveResult.error);
            // Don't fail - costing sheet might be empty, which is okay
          }
        } catch (costingError) {
          console.error('Error saving costing sheet:', costingError);
          // Don't fail the whole operation if costing sheet save fails
          // User can save it manually later if needed
        }
      }

      // Costing sheet is now handled by ExcelCostingSheet component
      // It will save automatically when user clicks Save in the costing sheet

      // If this is a revision quotation (has /R in quotation_number), update revision record
      if (result.quotation_number && result.quotation_number.includes('/R')) {
        try {
          const revisionNumber = parseInt(result.quotation_number.split('/R')[1]) || result.revision_number || 1;
          
          // Since we update the existing quotation (not create new), the quotation_id stays the same
          // The revision record's quotation_id points to this same quotation
          const { data: revisionRecord } = await supabase
            .from('marketing_quotation_revisions')
            .select('id, remarks')
            .eq('quotation_id', result.id)
            .eq('revision_number', revisionNumber)
            .maybeSingle();
          
          if (revisionRecord) {
            // Update revision record with new data
            await supabase
              .from('marketing_quotation_revisions')
              .update({
                revision_date: formData.quotation_date || new Date().toISOString().split('T')[0],
                remarks: formData.payment_terms || revisionRecord.remarks || '',
                updated_at: new Date().toISOString(),
              })
              .eq('id', revisionRecord.id);
          }
        } catch (error) {
          console.error('Error updating revision record:', error);
          // Continue even if revision update fails
        }
      }

      // Refresh costing sheet ID after save
      if (result && result.id) {
        await loadCostingSheetData(result.id);
      }

      if (onSave) {
        onSave(result);
      }
      
      // Show success notification
      const message = quotation 
        ? `Quotation ${result.quotation_number} updated successfully!`
        : costingSaved
          ? `Quotation ${result.quotation_number} and Costing Sheet created successfully!`
          : `Quotation ${result.quotation_number} created successfully!`;
      
      alert(message);
      onClose();
    } catch (error) {
      console.error('Error saving quotation:', error);
      const errorMessage = error.message || 'An unknown error occurred';
      alert(`Error saving quotation: ${errorMessage}`);
    }
  };

  if (!isOpen) return null;

  const grandTotal = items.reduce((sum, item) => {
    return sum + (parseFloat(getCellValue(item.id, 'final_price')) || 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
              {quotation ? 'Edit Quotation' : 'Create New Quotation'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">Create a new quotation from enquiry</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Related Enquiry (Optional)
              </label>
              <select
                value={formData.enquiry_id}
                onChange={(e) => {
                  const enquiryId = e.target.value;
                  const selectedEnquiry = enquiries.find(e => e.id === enquiryId);
                  setFormData({ 
                    ...formData, 
                    enquiry_id: enquiryId,
                    client_id: selectedEnquiry?.client_id || formData.client_id
                  });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select enquiry</option>
                {enquiries
                  .filter(enquiry => enquiry.is_converted_to_quotation) // Show only converted enquiries (already have quotations)
                  .map((enquiry) => (
                    <option 
                      key={enquiry.id} 
                      value={enquiry.id}
                      style={{
                        backgroundColor: '#dbeafe', // Light blue background
                        color: '#1e40af', // Dark blue text
                        fontWeight: '600'
                      }}
                    >
                      {enquiry.enquiry_number} ✓ (Quotation Already Created)
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-blue-600 font-medium">
                Only enquiries that have already been converted to quotations are shown here
              </p>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quotation Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.quotation_date}
                onChange={(e) => setFormData({ ...formData, quotation_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Valid Until</label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>


            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={costingDescription}
                onChange={(e) => setCostingDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                rows={3}
                placeholder="Enter description..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Terms & Conditions</label>
              <textarea
                value={formData.terms_and_conditions}
                onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                rows={4}
                placeholder="GST At Actuals"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Rejected">Reject</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {formData.status === 'Draft' && 'Saves only in quotation table'}
                {formData.status === 'Sent' && 'Saves and allows moving to internal quotation'}
                {formData.status === 'Rejected' && 'Saves but cannot be moved to internal quotation'}
              </p>
            </div>
          </div>

          {/* Costing Sheet - Using ExcelCostingSheet Component */}
          <div className="md:col-span-2 border-t border-gray-200 pt-6 mt-6">
            <ExcelCostingSheet
              ref={costingSheetRef}
              quotationId={quotation?.id || null}
              costingSheetId={costingSheetId}
              onCostingChange={(total) => {
                setCostingTotal(total);
              }}
              onSaveSuccess={() => {
                // Refresh costing sheet ID after save
                if (quotation?.id) {
                  loadCostingSheetData(quotation.id);
                }
              }}
              isViewMode={false}
              hideSaveButton={true}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              {quotation ? 'Update Quotation' : 'Create Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuotationForm;
