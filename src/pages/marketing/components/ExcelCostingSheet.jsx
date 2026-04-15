import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Plus, Trash2, Save, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// Fixed costing sheet column definitions (column names as required – do not add/remove)
const COSTING_SHEET_COLUMNS = [
  { id: 'qty', label: 'Qty', isEditable: true, isCalculated: false },
  { id: 'import_base_cost', label: 'Import Base Cost (In INR)', isEditable: true, isCalculated: false },
  { id: 'import_custom_duty_pct', label: 'Import Custom Duty %', isEditable: true, isCalculated: false },
  { id: 'import_custom_duty_amount', label: 'Import Custom Duty Amount', isEditable: false, isCalculated: true },
  { id: 'import_freight', label: 'Import Freight / Logistics', isEditable: true, isCalculated: false },
  { id: 'import_transit_insurance_pct', label: 'Import Transit Insurance %', isEditable: true, isCalculated: false },
  { id: 'import_transit_insurance_amount', label: 'Import Transit Insurance Amount', isEditable: false, isCalculated: true },
  { id: 'import_cost_per_unit', label: 'Import Cost Per Unit', isEditable: false, isCalculated: true },
  { id: 'total_import_amount', label: 'Total Import Amount', isEditable: false, isCalculated: true },
  { id: 'margin_pct', label: 'Margin %', isEditable: true, isCalculated: false },
  { id: 'margin_amount', label: 'Margin Amount', isEditable: false, isCalculated: true },
  { id: 'supply_freight', label: 'Supply Freight / Logistic Amount', isEditable: true, isCalculated: false },
  { id: 'supply_transit_insurance_pct', label: 'Supply Transit Insurance %', isEditable: true, isCalculated: false },
  { id: 'supply_transit_insurance_amount', label: 'Supply Transit Insurance Amount', isEditable: false, isCalculated: true },
  { id: 'supply_total_cost', label: 'Supply Total Cost', isEditable: false, isCalculated: true },
  { id: 'business_dev_pct', label: 'Business Development % (If Applicable)', isEditable: true, isCalculated: false },
  { id: 'business_dev_cost', label: 'Business Development Cost', isEditable: false, isCalculated: true },
  { id: 'other_misc_cost', label: 'Other Miscellaneous Cost (If Any)', isEditable: true, isCalculated: false },
  { id: 'quotation_rate_per_unit', label: 'Quotation Rate Per Unit', isEditable: false, isCalculated: true },
  { id: 'grand_total_supply_cost_excl_gst', label: 'Grand Total Supply Cost (Excluding GST)', isEditable: false, isCalculated: true },
  { id: 'gst_pct', label: 'GST %', isEditable: true, isCalculated: false },
  { id: 'gst_amount', label: 'GST Amount', isEditable: false, isCalculated: true },
  { id: 'grand_total_supply_cost_with_gst', label: 'Grand Total Supply Cost With GST', isEditable: false, isCalculated: true },
];

/** Format number with thousand separators (e.g. 1000 → "1,000", 1000.5 → "1,000.5"). Use decimals: 2 for amounts (1,000.00). */
const formatNumber = (value, decimals = null) => {
  const n = parseFloat(value);
  if (value === '' || value === null || value === undefined) return '';
  if (Number.isNaN(n)) return String(value);
  if (decimals === 2) {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const ExcelCostingSheet = forwardRef(({ quotationId, onCostingChange, onSaveSuccess, isViewMode = false, costingSheetId = null, hideSaveButton = false }, ref) => {
  const [items, setItems] = useState([
    { id: 'item-1', productId: null, productName: '', specification: '' },
    { id: 'item-2', productId: null, productName: '', specification: '' }
  ]);
  const [products, setProducts] = useState([]);
  const [costHeads] = useState(COSTING_SHEET_COLUMNS);
  const [costingData, setCostingData] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const isCalculatingRef = useRef(false);
  const previousInputDataRef = useRef({});
  const [editingItemName, setEditingItemName] = useState(null);
  const [typingMode, setTypingMode] = useState({});
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const itemNameRefs = useRef({});
  // Fixed columns - no drag/edit/delete

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
    currentInputData.itemsLength = items.length;
    currentInputData.costHeadsLength = costHeads.length;

    // Compare with previous input data
    const inputDataChanged = JSON.stringify(currentInputData) !== JSON.stringify(previousInputDataRef.current);
    
    if (inputDataChanged) {
      previousInputDataRef.current = currentInputData;
      calculateAll();
    }
  }, [costingData, items, costHeads, loading]);

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
          const restoredItems = parsedData.items.map(item => {
            let specification = item.specification || '';
            if (!specification && item.productId && products.length) {
              const product = products.find(p => p.id === item.productId);
              if (product?.detailed_specifications) {
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

        const restoredItems = parsedData.items && parsedData.items.length > 0 ? parsedData.items : items;
        const itemIds = new Set(restoredItems.map((i) => i.id));
        const newToOldKey = { import_base_cost: 'base_cost', import_custom_duty_pct: 'customs_duty', import_freight: 'freight', import_transit_insurance_pct: 'insurance', margin_pct: 'margin_percent', gst_pct: 'gst_percent', other_misc_cost: 'other_cost' };
        const cellData = {};
        Object.keys(parsedData).forEach((key) => {
          if (key === 'items' || key === 'costHeads' || key === 'gstPercentage') return;
          const match = key.match(/^(.+)_([a-z0-9_]+)$/);
          if (match && itemIds.has(match[1])) {
            cellData[key] = parsedData[key];
          }
        });
        restoredItems.forEach((item) => {
          COSTING_SHEET_COLUMNS.forEach((head) => {
            const key = `${item.id}_${head.id}`;
            if (cellData[key] !== undefined) return;
            if (parsedData[key] !== undefined) {
              cellData[key] = parsedData[key];
            } else {
              const oldId = newToOldKey[head.id];
              if (oldId && parsedData[`${item.id}_${oldId}`] !== undefined) {
                cellData[key] = parsedData[`${item.id}_${oldId}`];
              }
            }
          });
        });
        const legacySheetGst = parsedData.gstPercentage;
        if (legacySheetGst !== undefined && legacySheetGst !== null && legacySheetGst !== '') {
          const lg = parseFloat(legacySheetGst);
          if (!Number.isNaN(lg)) {
            restoredItems.forEach((item) => {
              const k = `${item.id}_gst_pct`;
              const v = cellData[k];
              if (v === undefined || v === '' || v === null) {
                cellData[k] = String(lg);
              }
            });
          }
        }
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

  /** Builds full cell data (manual + calculated) for save - so DB always gets correct values */
  const buildFullCostingDataForSave = (itemsList, cellData) => {
    const out = { ...cellData };
    itemsList.forEach((item) => {
      const getVal = (costHeadId) => parseFloat(cellData[`${item.id}_${costHeadId}`] || 0) || 0;
      const qty = Math.max(0, getVal('qty'));
      const importBaseCost = getVal('import_base_cost');
      const importCustomDutyPct = getVal('import_custom_duty_pct');
      const importFreight = getVal('import_freight');
      const importTransitInsPct = getVal('import_transit_insurance_pct');
      const supplyFreight = getVal('supply_freight');
      const supplyTransitInsPct = getVal('supply_transit_insurance_pct');
      const marginPct = getVal('margin_pct');
      const businessDevPct = getVal('business_dev_pct');
      const otherMiscCost = getVal('other_misc_cost');
      const itemGstPct = getVal('gst_pct');

      const importCustomDutyAmountPerUnit = importBaseCost * (importCustomDutyPct / 100);
      const importTransitInsAmountPerUnit = importBaseCost * (importTransitInsPct / 100);
      const importCostPerUnit = importBaseCost + importCustomDutyAmountPerUnit + importFreight + importTransitInsAmountPerUnit;
      const totalImportAmount = importCostPerUnit * (qty || 0);

      out[`${item.id}_import_custom_duty_amount`] = importCustomDutyAmountPerUnit.toFixed(2);
      out[`${item.id}_import_transit_insurance_amount`] = importTransitInsAmountPerUnit.toFixed(2);
      out[`${item.id}_import_cost_per_unit`] = importCostPerUnit.toFixed(2);
      out[`${item.id}_total_import_amount`] = totalImportAmount.toFixed(2);

      const marginAmount = totalImportAmount * (marginPct / 100);
      const supplyTransitInsAmount = totalImportAmount * (supplyTransitInsPct / 100);
      const supplyTotalCost = totalImportAmount + marginAmount + supplyFreight + supplyTransitInsAmount;
      const businessDevCost = supplyTotalCost * (businessDevPct / 100);
      const grandTotalExclGst = supplyTotalCost + businessDevCost + otherMiscCost;
      const quotationRatePerUnit = qty > 0 ? grandTotalExclGst / qty : 0;
      const gstAmount = grandTotalExclGst * (itemGstPct / 100);
      const grandTotalWithGst = grandTotalExclGst + gstAmount;

      out[`${item.id}_margin_amount`] = marginAmount.toFixed(2);
      out[`${item.id}_supply_transit_insurance_amount`] = supplyTransitInsAmount.toFixed(2);
      out[`${item.id}_supply_total_cost`] = supplyTotalCost.toFixed(2);
      out[`${item.id}_business_dev_cost`] = businessDevCost.toFixed(2);
      out[`${item.id}_grand_total_supply_cost_excl_gst`] = grandTotalExclGst.toFixed(2);
      out[`${item.id}_quotation_rate_per_unit`] = quotationRatePerUnit.toFixed(2);
      out[`${item.id}_gst_amount`] = gstAmount.toFixed(2);
      out[`${item.id}_grand_total_supply_cost_with_gst`] = grandTotalWithGst.toFixed(2);
    });
    return out;
  };

  const setCellValue = (itemId, costHeadId, value) => {
    const key = `${itemId}_${costHeadId}`;
    setCostingData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const calculateAll = () => {
    if (isCalculatingRef.current) {
      return;
    }
    isCalculatingRef.current = true;

    setCostingData((prev) => {
      const newData = { ...prev };

      items.forEach((item) => {
        const getVal = (costHeadId) => parseFloat(prev[`${item.id}_${costHeadId}`] || 0) || 0;
        const qty = Math.max(0, getVal('qty'));
        const importBaseCost = getVal('import_base_cost');           // D2
        const importCustomDutyPct = getVal('import_custom_duty_pct'); // E2
        const importFreight = getVal('import_freight');              // G2
        const importTransitInsPct = getVal('import_transit_insurance_pct'); // H2
        const supplyFreight = getVal('supply_freight');              // N2
        const supplyTransitInsPct = getVal('supply_transit_insurance_pct'); // O2
        const marginPct = getVal('margin_pct');                       // L2
        const businessDevPct = getVal('business_dev_pct');            // R2
        const otherMiscCost = getVal('other_misc_cost');              // T2
        const itemGstPct = getVal('gst_pct');      // W2

        // F2 = D2*E2/100 (Import Custom Duty Amount - per unit)
        const importCustomDutyAmountPerUnit = importBaseCost * (importCustomDutyPct / 100);
        // I2 = D2*H2/100 (Import Transit Insurance Amount - per unit)
        const importTransitInsAmountPerUnit = importBaseCost * (importTransitInsPct / 100);
        // J2 = D2+F2+G2+I2 (Import Cost Per Unit)
        const importCostPerUnit = importBaseCost + importCustomDutyAmountPerUnit + importFreight + importTransitInsAmountPerUnit;
        // K2 = J2*C2 (Total Import Amount)
        const totalImportAmount = importCostPerUnit * (qty || 0);

        newData[`${item.id}_import_custom_duty_amount`] = importCustomDutyAmountPerUnit.toFixed(2);
        newData[`${item.id}_import_transit_insurance_amount`] = importTransitInsAmountPerUnit.toFixed(2);
        newData[`${item.id}_import_cost_per_unit`] = importCostPerUnit.toFixed(2);
        newData[`${item.id}_total_import_amount`] = totalImportAmount.toFixed(2);

        // M2 = K2*L2/100 (Margin Amount)
        const marginAmount = totalImportAmount * (marginPct / 100);
        // P2 = K2*O2/100 (Supply Transit Insurance Amount)
        const supplyTransitInsAmount = totalImportAmount * (supplyTransitInsPct / 100);
        // Q2 = K2+M2+N2+P2 (Supply Total Cost)
        const supplyTotalCost = totalImportAmount + marginAmount + supplyFreight + supplyTransitInsAmount;
        // S2 = Q2*R2/100 (Business Development Cost)
        const businessDevCost = supplyTotalCost * (businessDevPct / 100);
        // V2 = Q2+S2+T2 (Grand Total Supply Cost Excl GST)
        const grandTotalExclGst = supplyTotalCost + businessDevCost + otherMiscCost;
        // Quotation Rate Per Unit = V2/C2
        const quotationRatePerUnit = qty > 0 ? grandTotalExclGst / qty : 0;
        // X2 = V2*W2/100 (GST Amount)
        const gstAmount = grandTotalExclGst * (itemGstPct / 100);
        // Grand Total With GST = V2+X2
        const grandTotalWithGst = grandTotalExclGst + gstAmount;

        newData[`${item.id}_margin_amount`] = marginAmount.toFixed(2);
        newData[`${item.id}_supply_transit_insurance_amount`] = supplyTransitInsAmount.toFixed(2);
        newData[`${item.id}_supply_total_cost`] = supplyTotalCost.toFixed(2);
        newData[`${item.id}_business_dev_cost`] = businessDevCost.toFixed(2);
        newData[`${item.id}_grand_total_supply_cost_excl_gst`] = grandTotalExclGst.toFixed(2);
        newData[`${item.id}_quotation_rate_per_unit`] = quotationRatePerUnit.toFixed(2);
        newData[`${item.id}_gst_amount`] = gstAmount.toFixed(2);
        newData[`${item.id}_grand_total_supply_cost_with_gst`] = grandTotalWithGst.toFixed(2);
      });

      const grandTotal = items.reduce((sum, item) => {
        return sum + (parseFloat(newData[`${item.id}_grand_total_supply_cost_with_gst`] || 0) || 0);
      }, 0);
      setTimeout(() => {
        if (onCostingChange) onCostingChange(grandTotal);
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
      setItems(items.map((item) =>
        item.id === itemId
          ? { ...item, productId: productId, productName: selectedProduct.product_name }
          : item
      ));
      const baseCost = selectedProduct.base_cost_price || 0;
      setCellValue(itemId, 'import_base_cost', baseCost);
      const customDutyPct = selectedProduct.custom_price != null && selectedProduct.custom_price !== '' ? selectedProduct.custom_price : 0;
      setCellValue(itemId, 'import_custom_duty_pct', customDutyPct);
    }
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
        return sum + (parseFloat(getCellValue(item.id, 'grand_total_supply_cost_with_gst')) || 0);
      }, 0);
      
      const netTotal = items.reduce((sum, item) => {
        return sum + (parseFloat(getCellValue(item.id, 'grand_total_supply_cost_excl_gst')) || 0);
      }, 0);
      
      const gstAmount = grandTotal - netTotal;

      // Recompute all calculated fields so DB gets correct values
      const fullCellData = buildFullCostingDataForSave(items, costingData);

      const itemsWithProductInfo = items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          id: item.id,
          productId: item.productId || null,
          productName: product?.product_name || item.productName || item.name || '',
          productCode: product?.product_code || '',
          specification: item.productId ? getProductSpecification(item.productId) : (item.specification || '')
        };
      });

      const dataToSave = {
        items: itemsWithProductInfo,
        costHeads: COSTING_SHEET_COLUMNS,
        ...fullCellData,
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
    return sum + (parseFloat(getCellValue(item.id, 'grand_total_supply_cost_with_gst')) || 0);
  }, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/90 ring-1 ring-slate-900/5 p-2.5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Costing Sheet</h3>
          <p className="text-[9px] text-gray-500 mt-0.5">Items as rows, cost heads as columns. <span className="bg-red-50 text-red-900 px-1.5 py-0.5 rounded border border-red-200 font-medium">Tint = Manual entry</span></p>
        </div>
        {!isViewMode && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={addItem}
              className="flex items-center space-x-1 px-2 py-0.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-[10px] font-medium"
              title="Add Item Row"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Add Item</span>
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

      <div className="overflow-x-auto border border-gray-300 rounded-md" style={{ maxWidth: '100%', scrollbarWidth: 'thin', scrollbarColor: 'rgba(220, 38, 38, 0.45) #f3f4f6' }}>
        <style>{`
          .overflow-x-auto::-webkit-scrollbar {
            height: 6px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: #f3f4f6;
            border-radius: 3px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: rgba(220, 38, 38, 0.45);
            border-radius: 3px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb:hover {
            background: rgba(220, 38, 38, 0.65);
          }
          .costing-manual-entry {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
          }
          .costing-manual-entry:hover {
            background-color: #fee2e2;
          }
          .costing-manual-entry:focus-within {
            outline: 2px solid #dc2626;
            outline-offset: -1px;
          }
        `}</style>
        <table className="border-collapse bg-white text-xs costing-sheet-table" style={{ width: 'max-content', minWidth: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '36px', minWidth: '36px' }} />
            <col style={{ width: '160px', minWidth: '160px' }} />
            {costHeads.map((head) => {
              const isPct = head.id.includes('_pct') || head.id === 'gst_pct';
              const isAmount = head.isCalculated || head.id.includes('amount') || head.id.includes('cost') || head.id.includes('freight');
              const w = isPct ? '72px' : (isAmount ? '100px' : '90px');
              return <col key={head.id} style={{ width: w, minWidth: w }} />;
            })}
            <col style={{ width: '32px', minWidth: '32px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-400">
              <th className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky left-0 bg-gradient-to-r from-gray-100 to-gray-200 z-10 whitespace-nowrap" title="Serial Number">
                Sr. No.
              </th>
              <th className="px-1 py-1.5 text-left text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky bg-gradient-to-r from-gray-100 to-gray-200 z-10" style={{ left: '36px' }} title="Item Name - Select or type product name">
                Item Name
              </th>
              {costHeads.map((head) => (
                <th
                  key={head.id}
                  className="px-1 py-1.5 text-center text-[10px] font-bold text-gray-800 border-r border-gray-400 bg-gradient-to-r from-gray-100 to-gray-200 whitespace-nowrap"
                  title={head.label}
                >
                  <span className={head.isCalculated ? 'font-bold' : ''}>{head.label}</span>
                </th>
              ))}
              <th className="px-1 py-1.5 w-8 border-l border-gray-400 bg-gradient-to-r from-gray-100 to-gray-200 z-10"></th>
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
                <td className="px-1 py-1 border-r border-gray-400 sticky z-10 group-hover:bg-gray-50 costing-manual-entry bg-red-50" style={{ left: '36px' }}>
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
                        className="w-full px-1 py-0.5 border border-red-500 text-xs focus:outline-none focus:border-red-600 rounded"
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
                  const isPctCol = head.id.includes('_pct') || head.id === 'gst_pct';
                  const isManualEntry = !head.isCalculated;

                  return (
                    <td
                      key={`${item.id}_${head.id}`}
                      className={`px-1 py-1 border-r border-gray-400 ${isManualEntry ? 'costing-manual-entry bg-red-50' : 'bg-white'}`}
                    >
                      {head.isCalculated ? (
                        <div className={`text-xs font-semibold text-right whitespace-nowrap ${head.id === 'grand_total_supply_cost_with_gst' ? 'text-green-700' : 'text-gray-800'}`}>
                          ₹{formatNumber(numericValue, 2)}
                        </div>
                      ) : isEditing && !isViewMode ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cellValue}
                          onChange={(e) => setCellValue(item.id, head.id, e.target.value)}
                          onBlur={() => handleCellChange(item.id, head.id, cellValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCellChange(item.id, head.id, cellValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-full px-1 py-0.5 border border-red-500 text-xs text-right focus:outline-none rounded bg-white"
                          autoFocus
                          placeholder=""
                          title="Manual entry"
                        />
                      ) : (
                        <div
                          className={`text-xs text-gray-700 text-right px-1 py-0.5 min-h-[20px] flex items-center justify-end ${isViewMode ? '' : 'cursor-pointer hover:bg-red-100 rounded'}`}
                          onClick={() => !isViewMode && setEditingCell(`${item.id}_${head.id}`)}
                          title={isViewMode ? 'Read only' : 'Manual entry - click to edit'}
                        >
                          {numericValue > 0 || (head.id === 'qty' && cellValue !== '') ? (
                            <span>{formatNumber(numericValue)}</span>
                          ) : (
                            <span className="text-gray-400 text-[10px]">Enter</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-1 py-1 border-l border-gray-400 bg-white">
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
                <td className="px-1 py-1 text-center border-r border-gray-400 sticky bg-gray-100 z-10" style={{ left: '36px' }}>
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
              <td className="px-1 py-1 text-xs border-r border-gray-400 sticky bg-gradient-to-r from-gray-200 to-gray-300 z-20 font-semibold" style={{ left: '36px' }}>
                Grand Total
              </td>
              {costHeads.map((head) => {
                if (head.id === 'grand_total_supply_cost_with_gst') {
                  const columnTotal = items.reduce((sum, item) => sum + (parseFloat(getCellValue(item.id, head.id)) || 0), 0);
                  return (
                    <td key={head.id} className="px-1 py-1 text-xs text-right border-r border-gray-400 font-bold whitespace-nowrap text-green-700 bg-green-50">
                      ₹{formatNumber(columnTotal, 2)}
                    </td>
                  );
                }
                return <td key={head.id} className="px-1 py-1 border-r border-gray-400"></td>;
              })}
              <td className="px-1 py-1 text-xs border-l border-gray-400 bg-gradient-to-r from-gray-200 to-gray-300"></td>
            </tr>
          </tfoot>
        </table>
      </div>

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

