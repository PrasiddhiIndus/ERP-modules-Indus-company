import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Plus, Trash2, Edit2, X, Save, GripVertical, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const ExcelCostingSheet = forwardRef(({ quotationId, onCostingChange, onSaveSuccess, isViewMode = false, costingSheetId = null, hideSaveButton = false }, ref) => {
  // Default cost heads (columns - horizontal)
  const defaultCostHeads = [
    { id: 'base_cost', label: 'Base Cost', isEditable: true, isCalculated: false },
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

  const [items, setItems] = useState([
    { id: 'item-1', productId: null, productName: '', specification: '' },
    { id: 'item-2', productId: null, productName: '', specification: '' }
  ]);
  const [products, setProducts] = useState([]);
  const [costHeads, setCostHeads] = useState(defaultCostHeads);
  const [costingData, setCostingData] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gstPercentage, setGstPercentage] = useState(0);
  const isCalculatingRef = useRef(false);
  const previousInputDataRef = useRef({});
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [editingItemName, setEditingItemName] = useState(null);
  const [typingMode, setTypingMode] = useState({});
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const itemNameRefs = useRef({});

  useEffect(() => {
    const loadData = async () => {
      await fetchProducts();
      if (quotationId) {
        await fetchCostingData();
      } else {
        setLoading(false);
      }
    };
    loadData();
  }, [quotationId, costingSheetId]);

  // Update specifications when products are loaded and items have productIds
  useEffect(() => {
    if (products.length > 0 && items.length > 0) {
      const updatedItems = items.map(item => {
        if (item.productId && (!item.specification || item.specification === '')) {
          const spec = getProductSpecification(item.productId);
          if (spec && spec !== item.specification) {
            return { ...item, specification: spec };
          }
        }
        return item;
      });
      // Check if any item was updated
      const hasChanges = updatedItems.some((item, index) => 
        item.specification !== items[index]?.specification
      );
      if (hasChanges) {
        setItems(updatedItems);
      }
    }
  }, [products]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_products')
        .select('id, product_name, product_code, base_cost_price, custom_price, detailed_specifications')
        .eq('is_active', true)
        .order('product_name');
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const getProductSpecification = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.detailed_specifications) return '';
    // Get specification without additional info
    const parts = product.detailed_specifications.split('Additional Info:');
    return parts[0].trim();
  };

  useEffect(() => {
    // Skip if we're already calculating or if loading
    if (isCalculatingRef.current || loading) {
      return;
    }

    // Extract only user-input fields (non-calculated)
    const currentInputData = {};
    items.forEach((item) => {
      costHeads.forEach((head) => {
        if (!head.isCalculated) {
          const key = `${item.id}_${head.id}`;
          currentInputData[key] = costingData[key] || '';
        }
      });
    });
    currentInputData.gstPercentage = gstPercentage;
    currentInputData.itemsLength = items.length;
    currentInputData.costHeadsLength = costHeads.length;

    // Compare with previous input data
    const inputDataChanged = JSON.stringify(currentInputData) !== JSON.stringify(previousInputDataRef.current);
    
    if (inputDataChanged) {
      previousInputDataRef.current = currentInputData;
      calculateAll();
    }
  }, [costingData, items, costHeads, gstPercentage, loading]);

  // Update dropdown position on scroll/resize
  useEffect(() => {
    if (editingItemName) {
      const updatePosition = () => {
        const element = itemNameRefs.current[editingItemName];
        if (element) {
          const rect = element.getBoundingClientRect();
          const dropdownHeight = 450; // Approximate max height
          const scrollY = window.scrollY;
          
          // Position above the input field
          let topPosition = rect.top + scrollY - dropdownHeight - 4;
          
          // Ensure it doesn't go above the viewport
          if (topPosition < scrollY) {
            topPosition = scrollY + 10; // Add small margin from top
          }
          
          setDropdownPosition({
            top: topPosition,
            left: rect.left + window.scrollX,
            width: Math.max(rect.width, 300)
          });
        }
      };
      
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [editingItemName]);

  const fetchCostingData = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('marketing_costing_sheets')
        .select('*')
        .eq('quotation_id', quotationId);
      
      // If specific costing sheet ID is provided, filter by it
      if (costingSheetId) {
        query = query.eq('id', costingSheetId);
      }
      
      const { data, error } = await query.order('item_order', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        // Get the most recent or specific costing sheet
        const costingSheet = costingSheetId 
          ? data.find(sheet => sheet.id === costingSheetId) || data[0]
          : data[0];
        
        // Parse stored JSON data
        let parsedData = {};
        if (costingSheet.costing_data) {
          try {
            parsedData = typeof costingSheet.costing_data === 'string' 
              ? JSON.parse(costingSheet.costing_data) 
              : costingSheet.costing_data;
          } catch (e) {
            console.error('Error parsing costing data:', e);
          }
        }

        // Restore items and cost heads from stored data
        if (parsedData.items && parsedData.items.length > 0) {
          // Ensure items have productId, productName, and specification for proper display
          // If specification is missing but productId exists, fetch it from products
          const restoredItems = parsedData.items.map(item => {
            let specification = item.specification || '';
            // If no specification stored but productId exists, get it from products array
            if (!specification && item.productId) {
              const product = products.find(p => p.id === item.productId);
              if (product && product.detailed_specifications) {
                const parts = product.detailed_specifications.split('Additional Info:');
                specification = parts[0].trim();
              }
            }
            return {
              ...item,
              productId: item.productId || null,
              productName: item.productName || item.name || '',
              specification: specification
            };
          });
          setItems(restoredItems);
        }
        if (parsedData.costHeads && parsedData.costHeads.length > 0) {
          setCostHeads(parsedData.costHeads);
        }
        if (parsedData.gstPercentage !== undefined && parsedData.gstPercentage !== null) {
          setGstPercentage(parsedData.gstPercentage);
        } else {
          setGstPercentage(0);
        }

        // Restore cell values - use restored items/costHeads if available
        const restoredItems = parsedData.items && parsedData.items.length > 0 ? parsedData.items : items;
        const restoredHeads = parsedData.costHeads && parsedData.costHeads.length > 0 ? parsedData.costHeads : costHeads;
        
        const cellData = {};
        restoredItems.forEach((item) => {
          restoredHeads.forEach((head) => {
            const key = `${item.id}_${head.id}`;
            if (parsedData[key] !== undefined) {
              cellData[key] = parsedData[key];
            }
          });
        });
        setCostingData(cellData);
        // Reset the previous input data ref after loading
        previousInputDataRef.current = {};
      } else {
        // Reset the previous input data ref if no data
        previousInputDataRef.current = {};
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching costing data:', error);
      setLoading(false);
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
    // Get all editable (non-calculated) cost heads except margin_percent and gst_percent
    const summableHeads = costHeads.filter(head => 
      !head.isCalculated && 
      head.id !== 'margin_percent' && 
      head.id !== 'gst_percent' &&
      head.id !== 'final_price' &&
      head.id !== 'quotation_rate' &&
      head.id !== 'margin_amount' &&
      head.id !== 'total_cost'
    );
    let total = 0;
    summableHeads.forEach((head) => {
      const value = parseFloat(getCellValue(itemId, head.id)) || 0;
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
    
    // Use functional updates to batch state changes and read from current state
    setCostingData((prev) => {
      const newData = { ...prev };
      
      items.forEach((item) => {
        // Helper function to get value from current state
        const getCurrentValue = (itemId, costHeadId) => {
          const key = `${itemId}_${costHeadId}`;
          return newData[key] || '';
        };
        
        // Calculate total cost - include all editable non-calculated columns except margin_percent and gst_percent
        const summableHeads = costHeads.filter(head => 
          !head.isCalculated && 
          head.id !== 'margin_percent' && 
          head.id !== 'gst_percent' &&
          head.id !== 'final_price' &&
          head.id !== 'quotation_rate' &&
          head.id !== 'margin_amount' &&
          head.id !== 'total_cost'
        );
        let totalCost = 0;
        summableHeads.forEach((head) => {
          const value = parseFloat(getCurrentValue(item.id, head.id)) || 0;
          totalCost += value;
        });
        newData[`${item.id}_total_cost`] = totalCost.toFixed(2);

        // Calculate margin amount
        const marginPercent = parseFloat(getCurrentValue(item.id, 'margin_percent')) || 0;
        const marginAmount = (totalCost * marginPercent) / 100;
        newData[`${item.id}_margin_amount`] = marginAmount.toFixed(2);

        // Calculate quotation rate
        const quotationRate = totalCost + marginAmount;
        newData[`${item.id}_quotation_rate`] = quotationRate.toFixed(2);

        // Calculate final price
        const itemGstPercent = getCurrentValue(item.id, 'gst_percent');
        const gstPercent = itemGstPercent ? parseFloat(itemGstPercent) : gstPercentage;
        const gstAmount = (quotationRate * gstPercent) / 100;
        const finalPrice = quotationRate + gstAmount;
        newData[`${item.id}_final_price`] = finalPrice.toFixed(2);
      });
      
      // Calculate grand total
      const grandTotal = items.reduce((sum, item) => {
        const finalPriceKey = `${item.id}_final_price`;
        const finalPrice = parseFloat(newData[finalPriceKey] || 0);
        return sum + finalPrice;
      }, 0);

      // Call callback after state update
      setTimeout(() => {
        if (onCostingChange) {
          onCostingChange(grandTotal);
        }
        isCalculatingRef.current = false;
      }, 0);
      
      return newData;
    });
  };

  const addItem = () => {
    const newItem = {
      id: `item-${Date.now()}`,
      productId: null,
      productName: '',
      specification: '',
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

    // Remove data for deleted item
    const newData = { ...costingData };
    costHeads.forEach((head) => {
      delete newData[`${itemId}_${head.id}`];
    });
    setCostingData(newData);
  };

  const handleProductSelect = (itemId, productId) => {
    const selectedProduct = products.find(p => p.id === productId);
    if (selectedProduct) {
      // Update item with product info
      setItems(items.map((item) => 
        item.id === itemId 
          ? { ...item, productId: productId, productName: selectedProduct.product_name }
          : item
      ));
      
      // Auto-populate base cost
      const baseCost = selectedProduct.base_cost_price || 0;
      setCellValue(itemId, 'base_cost', baseCost);
      
      // Auto-populate customs duty from custom_price
      const customsDuty = selectedProduct.custom_price || 0;
      setCellValue(itemId, 'customs_duty', customsDuty);
    }
  };

  const addCostHead = () => {
    const newHead = {
      id: `cost_head_${Date.now()}`,
      label: 'New Cost Head',
      isEditable: true,
      isCalculated: false,
    };
    // Find the index of final_price column
    const finalPriceIndex = costHeads.findIndex(head => head.id === 'final_price');
    if (finalPriceIndex !== -1) {
      // Insert before final_price
      const newHeads = [...costHeads];
      newHeads.splice(finalPriceIndex, 0, newHead);
      setCostHeads(newHeads);
    } else {
      // If final_price not found, add at the end
      setCostHeads([...costHeads, newHead]);
    }
  };

  const handleDragStart = (e, headId) => {
    setDraggedColumn(headId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetHeadId) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetHeadId) {
      setDraggedColumn(null);
      return;
    }

    const draggedIndex = costHeads.findIndex(h => h.id === draggedColumn);
    const targetIndex = costHeads.findIndex(h => h.id === targetHeadId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumn(null);
      return;
    }

    // Don't allow moving calculated columns (except within calculated section)
    const draggedHead = costHeads[draggedIndex];
    const targetHead = costHeads[targetIndex];
    
    // Prevent moving calculated columns to non-calculated positions and vice versa
    if (draggedHead.isCalculated !== targetHead.isCalculated) {
      // Allow only if moving within the same section
      setDraggedColumn(null);
      return;
    }

    const newHeads = [...costHeads];
    const [removed] = newHeads.splice(draggedIndex, 1);
    newHeads.splice(targetIndex, 0, removed);
    setCostHeads(newHeads);
    setDraggedColumn(null);
  };

  const deleteCostHead = (headId) => {
    // Don't allow deleting calculated rows
    const head = costHeads.find((h) => h.id === headId);
    if (head && head.isCalculated) {
      alert('Cannot delete calculated rows');
      return;
    }
    const newHeads = costHeads.filter((head) => head.id !== headId);
    setCostHeads(newHeads);

    // Remove data for deleted cost head
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

  const saveCostingSheet = async ({ silent = false, quotationId: providedQuotationId = null } = {}) => {
    try {
      if (isViewMode) return { ok: true, skipped: true };
      // Use provided quotationId or fall back to prop
      const targetQuotationId = providedQuotationId || quotationId;
      if (!targetQuotationId) {
        if (!silent) alert('Please save quotation first before saving costing sheet.');
        return { ok: false, error: new Error('Missing quotationId') };
      }
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate totals from costing sheet
      const grandTotal = items.reduce((sum, item) => {
        return sum + (parseFloat(getCellValue(item.id, 'final_price')) || 0);
      }, 0);
      
      const netTotal = items.reduce((sum, item) => {
        return sum + (parseFloat(getCellValue(item.id, 'quotation_rate')) || 0);
      }, 0);
      
      const gstAmount = grandTotal - netTotal;

      // Prepare data to save with product information
      const itemsWithProductInfo = items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          ...item,
          productName: product?.product_name || item.productName || item.name || '',
          productCode: product?.product_code || '',
          specification: item.productId ? getProductSpecification(item.productId) : ''
        };
      });

      const dataToSave = {
        items: itemsWithProductInfo,
        costHeads,
        gstPercentage,
        ...costingData,
      };

      // Check if costing sheet exists
      const { data: existing, error: checkError } = await supabase
        .from('marketing_costing_sheets')
        .select('id')
        .eq('quotation_id', targetQuotationId)
        .limit(1)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('marketing_costing_sheets')
          .update({
            costing_data: dataToSave,
            total_price: grandTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('marketing_costing_sheets')
          .insert([
            {
              quotation_id: targetQuotationId,
              item_name: 'Excel Costing Sheet',
              description: 'Multi-item costing sheet',
              quantity: items.length,
              unit_price: netTotal / items.length || 0,
              total_price: grandTotal,
              item_order: 0,
              costing_data: dataToSave,
            },
          ]);

        if (error) throw error;
      }

      // Update quotation with amounts from costing sheet
      const { error: quotationError } = await supabase
        .from('marketing_quotations')
        .update({
          total_amount: netTotal,
          gst_amount: gstAmount,
          final_amount: grandTotal,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetQuotationId);

      if (quotationError) {
        console.error('Error updating quotation:', quotationError);
        // Don't throw, just log - costing sheet is saved
      }

      if (!silent) alert('Costing sheet saved successfully! Quotation amounts updated.');
      
      // Call success callback if provided
      if (onSaveSuccess) {
        onSaveSuccess();
      }
      return { ok: true, grandTotal, netTotal, gstAmount };
    } catch (error) {
      console.error('Error saving costing sheet:', error);
      if (!silent) alert('Error saving costing sheet: ' + error.message);
      return { ok: false, error };
    }
  };

  useImperativeHandle(ref, () => ({
    save: (opts) => saveCostingSheet(opts),
  }), [saveCostingSheet]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <p className="text-gray-600 font-medium">Loading costing sheet...</p>
        </div>
      </div>
    );
  }

  const grandTotal = items.reduce((sum, item) => {
    return sum + (parseFloat(getCellValue(item.id, 'final_price')) || 0);
  }, 0);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Costing Sheet</h3>
          <p className="text-[9px] text-gray-500 mt-0.5">Items as rows, cost heads as columns</p>
        </div>
        {!isViewMode && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={addItem}
              className="flex items-center space-x-1 px-2 py-0.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-[10px] font-medium"
              title="Add Item Row"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Add Item</span>
            </button>
            <button
              onClick={addCostHead}
              className="flex items-center space-x-1 px-2 py-0.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-[10px] font-medium"
              title="Add Cost Head Column"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Add Column</span>
            </button>
            {!hideSaveButton && (
              <button
                onClick={() => saveCostingSheet()}
                className="flex items-center space-x-1 px-2 py-0.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-[10px] font-medium"
                title="Save Costing Sheet"
              >
                <Save className="w-3 h-3" />
                <span className="hidden sm:inline">Save</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-gray-300 rounded-md" style={{ maxWidth: '100%', scrollbarWidth: 'thin', scrollbarColor: '#c084fc #f3f4f6' }}>
        <style>{`
          .overflow-x-auto::-webkit-scrollbar {
            height: 6px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: #f3f4f6;
            border-radius: 3px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: #c084fc;
            border-radius: 3px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb:hover {
            background: #a855f7;
          }
        `}</style>
        <table className="border-collapse bg-white text-xs" style={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '35px' }} />
            <col style={{ width: '140px' }} />
            {costHeads.map((head) => {
              // Set fixed widths for all cost head columns
              let width = '90px';
              if (head.id === 'customs_duty' || head.id === 'business_dev' || head.id === 'quotation_rate' || head.id === 'final_price') {
                width = '110px';
              } else if (head.id === 'margin_percent' || head.id === 'gst_percent') {
                width = '70px';
              } else if (head.id === 'total_cost' || head.id === 'margin_amount') {
                width = '100px';
              }
              return <col key={head.id} style={{ width }} />;
            })}
            <col style={{ width: '35px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-400">
              <th className="px-1 py-1 text-center text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky left-0 bg-gradient-to-r from-gray-100 to-gray-200 z-10" title="Serial Number">
                S.No.
              </th>
              <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky bg-gradient-to-r from-gray-100 to-gray-200 z-10" style={{ left: '35px' }} title="Item Name - Select or type product name">
                Item Name
              </th>
              {costHeads.map((head, index) => (
                <th 
                  key={head.id} 
                  className={`px-1 py-1 text-center text-[10px] font-bold text-gray-800 border-r border-gray-400 relative group bg-gradient-to-r from-gray-100 to-gray-200 ${
                    draggedColumn === head.id ? 'opacity-50' : ''
                  }`}
                  draggable={!isViewMode}
                  onDragStart={(e) => !isViewMode && handleDragStart(e, head.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => !isViewMode && handleDrop(e, head.id)}
                  title={head.label}
                >
                  <div className="flex items-center justify-center gap-0.5">
                    {!isViewMode && (
                      <GripVertical className="w-2.5 h-2.5 text-gray-500 cursor-move opacity-0 group-hover:opacity-100" />
                    )}
                    {editingCell === `label_${head.id}` ? (
                      <input
                        type="text"
                        value={head.label}
                        onChange={(e) => editCostHeadLabel(head.id, e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingCell(null);
                        }}
                        className="px-1 py-0.5 border border-blue-500 text-[10px] w-full focus:outline-none rounded"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`${head.isCalculated ? 'font-bold' : ''} ${!isViewMode ? 'cursor-pointer hover:text-blue-600' : ''} text-[10px] truncate`}
                        onClick={() => !isViewMode && setEditingCell(`label_${head.id}`)}
                        title={head.label}
                      >
                        {head.label}
                      </span>
                    )}
                    {!isViewMode && (
                      <button
                        onClick={() => deleteCostHead(head.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-red-600 hover:bg-red-100 rounded"
                        title="Delete Column"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {!isViewMode && (
                <th className="px-1 py-1 text-center bg-gradient-to-r from-gray-100 to-gray-200 border-l-2 border-gray-500">
                  <button
                    onClick={addCostHead}
                    className="p-0.5 text-blue-600 hover:bg-blue-100 rounded"
                    title="Add Cost Head Column"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-300 hover:bg-purple-50/30 group transition-colors">
                <td className="px-1 py-1 text-center text-xs text-gray-700 border-r border-gray-400 sticky left-0 bg-white z-10 group-hover:bg-purple-50/30">
                  <div className="flex items-center justify-center gap-1">
                    <span>{index + 1}</span>
                    {!isViewMode && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-red-600 hover:bg-red-100 rounded"
                        title="Delete Row"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-1 py-1 border-r border-gray-400 sticky bg-white z-10 group-hover:bg-gray-50" style={{ left: '35px' }}>
                  {isViewMode ? (
                    <div className="px-1 py-0.5 text-xs text-gray-700 font-medium truncate">
                      {item.productName || item.name || 'No product selected'}
                    </div>
                  ) : typingMode[item.id] ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={item.productName || ''}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          setItems(items.map(i => 
                            i.id === item.id 
                              ? { ...i, productName: inputValue, productId: null }
                              : i
                          ));
                          // Try to find matching product
                          const matchedProduct = products.find(p => 
                            p.product_name.toLowerCase() === inputValue.toLowerCase() ||
                            (p.product_code && p.product_code.toLowerCase() === inputValue.toLowerCase())
                          );
                          if (matchedProduct) {
                            handleProductSelect(item.id, matchedProduct.id);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setTypingMode(prev => {
                              const newMode = { ...prev };
                              delete newMode[item.id];
                              return newMode;
                            });
                          }, 200);
                        }}
                        autoFocus
                        className="w-full px-1 py-0.5 border border-blue-500 text-xs focus:outline-none focus:border-blue-500 rounded"
                        placeholder="Type product name"
                      />
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        ref={(el) => {
                          if (el) itemNameRefs.current[item.id] = el;
                        }}
                        className="w-full flex items-center border border-gray-300 rounded hover:border-gray-400 min-h-[20px]"
                      >
                        <div
                          onClick={() => {
                            // First click: Enable manual typing
                            setTypingMode(prev => ({ ...prev, [item.id]: true }));
                            setEditingItemName(null);
                            setProductSearchTerm('');
                          }}
                          className="flex-1 px-1 py-0.5 text-xs cursor-text min-h-[20px] flex items-center"
                        >
                          <span className={item.productName ? "text-gray-900" : "text-gray-400"}>
                            {item.productName || 'Click to type'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show product dropdown
                            setProductSearchTerm('');
                            const element = itemNameRefs.current[item.id];
                            if (element) {
                              const rect = element.getBoundingClientRect();
                              const dropdownHeight = 450; // Approximate max height
                              const scrollY = window.scrollY;
                              
                              // Position above the input field
                              let topPosition = rect.top + scrollY - dropdownHeight - 4;
                              
                              // Ensure it doesn't go above the viewport
                              if (topPosition < scrollY) {
                                topPosition = scrollY + 10; // Add small margin from top
                              }
                              
                              setDropdownPosition({
                                top: topPosition,
                                left: rect.left + window.scrollX,
                                width: Math.max(rect.width, 300)
                              });
                            }
                            setEditingItemName(item.id);
                            setTypingMode(prev => {
                              const newMode = { ...prev };
                              delete newMode[item.id];
                              return newMode;
                            });
                          }}
                          className="px-1.5 py-0.5 border-l border-gray-300 hover:bg-purple-50 hover:border-purple-300 flex items-center justify-center transition-colors"
                          title="Select from products"
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-gray-600 hover:text-purple-600" />
                        </button>
                      </div>
                    </div>
                  )}
                </td>
                {costHeads.map((head) => {
                  const cellValue = getCellValue(item.id, head.id);
                  const isEditing = editingCell === `${item.id}_${head.id}`;
                  const numericValue = parseFloat(cellValue) || 0;
                  
                  return (
                    <td key={`${item.id}_${head.id}`} className={`px-1 py-1 border-r border-gray-400 bg-white ${
                      draggedColumn === head.id ? 'opacity-50' : ''
                    }`}>
                      {head.isCalculated ? (
                        <div className={`text-xs font-semibold text-right whitespace-nowrap ${head.id === 'final_price' ? 'text-green-700' : 'text-gray-800'}`}>
                          {head.id === 'final_price' 
                            ? `₹${numericValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : head.id === 'total_cost' || head.id === 'margin_amount' || head.id === 'quotation_rate'
                            ? `₹${numericValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : cellValue || '0.00'}
                        </div>
                      ) : isEditing && !isViewMode ? (
                        <input
                          type="number"
                          step={head.id === 'gst_percent' || head.id === 'margin_percent' ? '0.01' : '0.01'}
                          value={cellValue}
                          onChange={(e) => setCellValue(item.id, head.id, e.target.value)}
                          onBlur={() => {
                            handleCellChange(item.id, head.id, cellValue);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCellChange(item.id, head.id, cellValue);
                            }
                            if (e.key === 'Escape') {
                              setEditingCell(null);
                            }
                          }}
                          className="w-full px-1 py-0.5 border border-blue-500 text-xs text-right focus:outline-none rounded"
                          autoFocus
                          placeholder={head.id === 'gst_percent' ? gstPercentage.toString() : ''}
                        />
                      ) : (
                        <div
                          className={`text-xs text-gray-700 text-right px-1 py-0.5 min-h-[20px] flex items-center justify-end ${
                            isViewMode ? '' : 'cursor-pointer hover:bg-blue-50 rounded'
                          }`}
                          onClick={() => !isViewMode && setEditingCell(`${item.id}_${head.id}`)}
                          title={isViewMode ? 'Read only' : 'Click to edit'}
                        >
                          {numericValue > 0 ? (
                            <span>{numericValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-1 py-1 border-l border-gray-400">
                  {!isViewMode && (
                    <button
                      onClick={addItem}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-purple-600 hover:bg-purple-100 rounded"
                      title="Add Row Below"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isViewMode && (
              <tr className="bg-gray-100">
                <td className="px-1 py-1 text-center border-r border-gray-400 sticky bg-gray-100 z-10" style={{ left: 0 }}></td>
                <td className="px-1 py-1 text-center border-r border-gray-400 sticky bg-gray-100 z-10" style={{ left: '35px' }}>
                  <button
                    onClick={addItem}
                    className="flex items-center justify-center gap-1 px-2 py-0.5 text-purple-600 hover:bg-purple-100 rounded text-xs font-medium"
                    title="Add Item Row"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </td>
                {costHeads.map(() => (
                  <td key={`empty_${Math.random()}`} className="px-1 py-1 border-r border-gray-400 bg-gray-100"></td>
                ))}
                <td className="bg-gray-100 border-l border-gray-400"></td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gradient-to-r from-gray-200 to-gray-300 text-gray-900 font-bold border-t-2 border-gray-500">
              <td className="px-1 py-1 text-xs border-r border-gray-400 sticky bg-gradient-to-r from-gray-200 to-gray-300 z-20" style={{ left: 0 }}></td>
              <td className="px-1 py-1 text-xs border-r border-gray-400 sticky bg-gradient-to-r from-gray-200 to-gray-300 z-20 font-semibold" style={{ left: '35px' }}>
                Grand Total
              </td>
              {costHeads.map((head) => {
                if (head.id === 'final_price') {
                  const columnTotal = items.reduce((sum, item) => {
                    return sum + (parseFloat(getCellValue(item.id, head.id)) || 0);
                  }, 0);
                  return (
                    <td key={head.id} className="px-1 py-1 text-xs text-right border-r border-gray-400 font-bold whitespace-nowrap text-green-700 bg-green-50">
                      ₹{columnTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  );
                }
                return <td key={head.id} className="px-1 py-1 border-r border-gray-400"></td>;
              })}
              <td className="px-1 py-1 text-xs text-right font-bold bg-gradient-to-r from-gray-200 to-gray-300 whitespace-nowrap border-l border-gray-400"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!isViewMode && (
        <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 bg-gray-50 rounded border border-gray-300">
          <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <span>Default GST %:</span>
            <input
              type="number"
              step="0.01"
              value={gstPercentage || 0}
              onChange={(e) => setGstPercentage(parseFloat(e.target.value) || 0)}
              className="px-2 py-0.5 border border-gray-400 rounded w-16 focus:outline-none focus:border-blue-500 text-center text-xs"
              placeholder="0.00"
              min="0"
            />
          </label>
        </div>
      )}

      {/* Product Dropdown Popup */}
      {editingItemName && products.length > 0 && (() => {
        const filteredProducts = productSearchTerm
          ? products.filter(p => 
              p.product_name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
              (p.product_code && p.product_code.toLowerCase().includes(productSearchTerm.toLowerCase()))
            )
          : products;
        
        return (
          <>
            <div 
              className="fixed inset-0 z-[9998] bg-black/20"
              onClick={() => {
                setEditingItemName(null);
                setProductSearchTerm('');
              }}
            />
            <div 
              className="fixed z-[9999] bg-white border-2 border-purple-300 rounded-lg shadow-2xl overflow-hidden"
              style={{ 
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${Math.max(dropdownPosition.width || 300, 320)}px`,
                maxWidth: '400px',
                maxHeight: '450px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.15)'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 border-b border-purple-400">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white">Select Product</h3>
                  <span className="text-xs font-normal text-white/90 bg-white/20 px-2 py-0.5 rounded">
                    {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <input
                  type="text"
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  placeholder="Search by name or code..."
                  className="w-full px-3 py-2 text-sm rounded-md border border-purple-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent placeholder:text-gray-400"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div 
                className="overflow-y-auto bg-white"
                style={{ 
                  scrollbarWidth: 'thin', 
                  scrollbarColor: '#c084fc #f3f4f6',
                  maxHeight: '350px'
                }}
              >
                <style>{`
                  .product-dropdown-list::-webkit-scrollbar {
                    width: 8px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-track {
                    background: #f3f4f6;
                    border-radius: 4px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-thumb {
                    background: #c084fc;
                    border-radius: 4px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-thumb:hover {
                    background: #a855f7;
                  }
                `}</style>
                <div className="product-dropdown-list">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map((product, idx) => (
                      <div
                        key={product.id}
                        onClick={() => {
                          handleProductSelect(editingItemName, product.id);
                          setEditingItemName(null);
                          setProductSearchTerm('');
                        }}
                        className="px-4 py-3 hover:bg-purple-50 active:bg-purple-100 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors duration-150"
                        style={{
                          backgroundColor: idx % 2 === 0 ? '#fafafa' : '#ffffff'
                        }}
                      >
                        <div className="font-semibold text-sm text-gray-900 leading-tight mb-1">
                          {product.product_name}
                        </div>
                        {product.product_code && (
                          <div className="text-xs text-gray-600 font-medium">
                            Code: <span className="text-purple-600 font-semibold">{product.product_code}</span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <div className="text-sm text-gray-500 font-medium mb-1">No products found</div>
                      <div className="text-xs text-gray-400">Try a different search term</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
});

export default ExcelCostingSheet;

