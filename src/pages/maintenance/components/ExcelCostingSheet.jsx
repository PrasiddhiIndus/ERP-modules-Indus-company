import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Plus, Trash2, Save, ChevronDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { filterEmptyCostingItems, dedupeCostingItemsById, pruneCostingCellData, pickCanonicalCostingSheet } from '../utils/maintenanceQuotationUtils';
import { sanitizePdfText } from '../utils/pdfTextSanitize';

// Sheet1 columns A–Y (Sr. No. + Item Description are sticky; rest are cost heads)
const COSTING_SHEET_COLUMNS = [
  { id: 'specifications', label: 'Specifications', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'picture', label: 'Picture', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'make', label: 'Make', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'model', label: 'Model', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'hsn_sac_code', label: 'HSN/SAC Code', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'gst_pct', label: 'GST (%)', inputType: 'number', isEditable: true, isCalculated: false },
  { id: 'qty', label: 'Quantity', inputType: 'number', isEditable: true, isCalculated: false },
  { id: 'uom', label: 'UOM (Unit of Measure)', inputType: 'uom', isEditable: true, isCalculated: false },

  { id: 'unit_rate', label: 'Unit Rate', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'total_amount', label: 'Total Amount', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'vendor_name', label: 'Vendor Name', inputType: 'text', isEditable: true, isCalculated: false },
  { id: 'vendor_rate', label: 'Vendor Rate', inputType: 'number', isEditable: true, isCalculated: false },
  { id: 'vendor_rate_total', label: 'Total Amount of Vendor Rate', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'transport_per_unit', label: 'Transportation Charge (per unit)', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'transport_total', label: 'Total Transportation Charge', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'misc_per_unit', label: 'Miscellaneous Expenses (per unit)', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'misc_total', label: 'Total Miscellaneous Expenses', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'bd_overhead_per_unit', label: 'Business Development / Overhead Cost (per unit)', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'bd_overhead_total', label: 'Total Business Development / Overhead Cost', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'margin_per_unit', label: 'Margin (per unit)', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'margin_total', label: 'Total Margin', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'final_rate_submission', label: 'Final Rate for Submission', inputType: 'number', isEditable: false, isCalculated: true },
  { id: 'total_difference_pct', label: 'Total Difference (%)', inputType: 'number', isEditable: false, isCalculated: true },
];

/** Fixed markups on Vendor Rate (N): transport 5%, misc 1%, BD/overhead 10%, margin 25%. */
const TRANSPORT_PCT = 5;
const MISC_PCT = 1;
const BD_OVERHEAD_PCT = 10;
const MARGIN_PCT = 25;

/** UOM presets for costing sheet; anything else is treated as manual/custom entry. */
const UOM_OPTIONS = ['no.', 'mtr', 'litre', 'each', 'set', 'job', 'man day'];
const UOM_MANUAL_VALUE = '__manual__';

function isUomPreset(value) {
  return UOM_OPTIONS.includes(String(value || '').trim());
}

/**
 * Compute derived cells for one row from Vendor Rate (N) and Quantity (I).
 * Also writes legacy keys so Internal Quotation / PDF keep working.
 */
function computeRowDerived(itemId, cellData) {
  const num = (id) => parseFloat(cellData[`${itemId}_${id}`] || 0) || 0;
  const qty = Math.max(0, num('qty'));
  const vendorRate = Math.max(0, num('vendor_rate')); // N
  const gstPct = Math.max(0, num('gst_pct'));

  const transportPerUnit = vendorRate * (TRANSPORT_PCT / 100); // P = N*5%
  const miscPerUnit = vendorRate * (MISC_PCT / 100); // R = N*1%
  const bdPerUnit = vendorRate * (BD_OVERHEAD_PCT / 100); // T = N*10%
  const marginPerUnit = vendorRate * (MARGIN_PCT / 100); // V = N*25%

  // X = V + T + R + P + N
  const finalRate = marginPerUnit + bdPerUnit + miscPerUnit + transportPerUnit + vendorRate;
  const unitRate = finalRate; // K = X
  const totalAmount = unitRate * qty; // L = K*I
  const vendorRateTotal = vendorRate * qty; // O = N*I
  const transportTotal = transportPerUnit * qty; // Q = P*I
  const miscTotal = miscPerUnit * qty; // S = R*I
  const bdTotal = bdPerUnit * qty; // U = T*I
  const marginTotal = marginPerUnit * qty; // W = V*I
  // Y = ((K-N)/N)*100
  const totalDiffPct = vendorRate > 0 ? ((unitRate - vendorRate) / vendorRate) * 100 : 0;
  const gstAmount = totalAmount * (gstPct / 100);
  const grandWithGst = totalAmount + gstAmount;

  const out = {};
  out[`${itemId}_transport_per_unit`] = transportPerUnit.toFixed(2);
  out[`${itemId}_misc_per_unit`] = miscPerUnit.toFixed(2);
  out[`${itemId}_bd_overhead_per_unit`] = bdPerUnit.toFixed(2);
  out[`${itemId}_margin_per_unit`] = marginPerUnit.toFixed(2);
  out[`${itemId}_final_rate_submission`] = finalRate.toFixed(2);
  out[`${itemId}_unit_rate`] = unitRate.toFixed(2);
  out[`${itemId}_total_amount`] = totalAmount.toFixed(2);
  out[`${itemId}_vendor_rate_total`] = vendorRateTotal.toFixed(2);
  out[`${itemId}_transport_total`] = transportTotal.toFixed(2);
  out[`${itemId}_misc_total`] = miscTotal.toFixed(2);
  out[`${itemId}_bd_overhead_total`] = bdTotal.toFixed(2);
  out[`${itemId}_margin_total`] = marginTotal.toFixed(2);
  out[`${itemId}_total_difference_pct`] = totalDiffPct.toFixed(2);
  // Legacy aliases for Internal Quotation / PDF
  out[`${itemId}_quotation_rate_per_unit`] = unitRate.toFixed(2);
  out[`${itemId}_grand_total_supply_cost_excl_gst`] = totalAmount.toFixed(2);
  out[`${itemId}_gst_amount`] = gstAmount.toFixed(2);
  out[`${itemId}_grand_total_supply_cost_with_gst`] = grandWithGst.toFixed(2);
  return out;
}

/** TOTAL / AVERAGE row + bottom summary (Excel rows 23 / 26–33). */
function computeSheetSummary(itemsList, getVal) {
  const sum = (field) =>
    itemsList.reduce((s, item) => s + (parseFloat(getVal(item.id, field)) || 0), 0);

  const vendorRates = itemsList
    .map((item) => parseFloat(getVal(item.id, 'vendor_rate')) || 0)
    .filter((n) => n > 0);
  const avgVendorRate =
    vendorRates.length > 0
      ? vendorRates.reduce((s, n) => s + n, 0) / vendorRates.length
      : 0;

  const totalAmount = sum('total_amount'); // L23
  const vendorRateTotal = sum('vendor_rate_total'); // O23
  const transportTotal = sum('transport_total'); // Q23
  const miscTotal = sum('misc_total'); // S23
  const bdTotal = sum('bd_overhead_total'); // U23
  const marginTotal = sum('margin_total'); // W23

  const avgTransport = avgVendorRate * (TRANSPORT_PCT / 100); // P23
  const avgMisc = avgVendorRate * (MISC_PCT / 100); // R23
  const avgBd = avgVendorRate * (BD_OVERHEAD_PCT / 100); // T23
  const avgMargin = avgVendorRate * (MARGIN_PCT / 100); // V23
  const avgFinalRate = avgMargin + avgBd + avgMisc + avgTransport + avgVendorRate; // X23
  const avgUnitRate = avgFinalRate; // K23 = X23
  const avgDiffPct =
    avgVendorRate > 0 ? ((avgUnitRate - avgVendorRate) / avgVendorRate) * 100 : 0; // Y23

  const quotationValueA = totalAmount; // L26 = L23
  const purchaseVendorB = vendorRateTotal; // L27 = O23
  const bdCostC = bdTotal; // L28 = U23
  const miscCostD = miscTotal; // L29 = S23
  const transportCostE = transportTotal; // L30 = Q23
  const totalCost = purchaseVendorB + bdCostC + miscCostD + transportCostE; // L31
  const totalMarginCrossCheck = marginTotal; // L32 = W23
  const netMarginProfit = quotationValueA - totalCost; // L33

  return {
    avgVendorRate,
    avgTransport,
    avgMisc,
    avgBd,
    avgMargin,
    avgFinalRate,
    avgUnitRate,
    avgDiffPct,
    totalAmount,
    vendorRateTotal,
    transportTotal,
    miscTotal,
    bdTotal,
    marginTotal,
    quotationValueA,
    purchaseVendorB,
    bdCostC,
    miscCostD,
    transportCostE,
    totalCost,
    totalMarginCrossCheck,
    netMarginProfit,
  };
}

let productsCache = null;
let productsCacheTime = 0;
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
/** Bump when product source table changes so stale cache is not reused. */
const PRODUCTS_CACHE_SOURCE = "marketing_products";
let productsCacheSource = "";

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
  ]);
  const [products, setProducts] = useState([]);
  const [costHeads] = useState(COSTING_SHEET_COLUMNS);
  const [costingData, setCostingData] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [uomForceManual, setUomForceManual] = useState({});
  const [loading, setLoading] = useState(true);
  const isCalculatingRef = useRef(false);
  const previousInputDataRef = useRef({});
  const [editingItemName, setEditingItemName] = useState(null);
  const [typingMode, setTypingMode] = useState({});
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const itemNameRefs = useRef({});
  const isSavingRef = useRef(false);
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
      const now = Date.now();
      if (
        productsCache &&
        productsCacheSource === PRODUCTS_CACHE_SOURCE &&
        now - productsCacheTime < PRODUCTS_CACHE_TTL_MS
      ) {
        setProducts(productsCache);
        return;
      }

      const { data, error } = await supabase
        .from('marketing_products')
        .select('id, product_name, product_code, base_cost_price, custom_price, detailed_specifications')
        .eq('is_active', true)
        .order('product_name');
      
      if (error) throw error;
      productsCache = data || [];
      productsCacheTime = now;
      productsCacheSource = PRODUCTS_CACHE_SOURCE;
      setProducts(productsCache);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const getProductSpecification = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.detailed_specifications) return '';
    const parts = product.detailed_specifications.split('Additional Info:');
    return sanitizePdfText(parts[0].trim());
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
        .from('maintenance_costing_sheets')
        .select('*')
        .eq('quotation_id', quotationId);
      
      // If specific costing sheet ID is provided, filter by it
      if (costingSheetId) {
        query = query.eq('id', costingSheetId);
      }
      
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const costingSheet = costingSheetId
          ? data.find((sheet) => sheet.id === costingSheetId) || pickCanonicalCostingSheet(data)
          : pickCanonicalCostingSheet(data);
        
        // Parse stored JSON data
        let parsedData = {};
        if (costingSheet?.costing_data) {
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
          const uniqueItems = dedupeCostingItemsById(parsedData.items);
          const restoredItems = uniqueItems.map(item => {
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
        const itemIds = restoredItems.map((i) => i.id).filter(Boolean);
        const sortedIds = [...itemIds].sort((a, b) => b.length - a.length);
        const newToOldKey = {
          vendor_rate: 'import_base_cost',
          gst_pct: 'gst_percent',
          qty: 'qty',
        };
        const cellData = {};
        Object.keys(parsedData).forEach((key) => {
          if (key === 'items' || key === 'costHeads' || key === 'gstPercentage') return;
          const ownerId = sortedIds.find((id) => key.startsWith(`${id}_`));
          if (ownerId) {
            cellData[key] = parsedData[key];
          }
        });
        restoredItems.forEach((item) => {
          COSTING_SHEET_COLUMNS.forEach((head) => {
            const key = `${item.id}_${head.id}`;
            if (cellData[key] !== undefined && cellData[key] !== '') return;
            if (parsedData[key] !== undefined && parsedData[key] !== '') {
              cellData[key] = parsedData[key];
              return;
            }
            const oldId = newToOldKey[head.id];
            if (oldId && parsedData[`${item.id}_${oldId}`] !== undefined) {
              cellData[key] = parsedData[`${item.id}_${oldId}`];
            }
            // Older legacy key for vendor rate
            if (head.id === 'vendor_rate' && (cellData[key] === undefined || cellData[key] === '')) {
              const legacy = parsedData[`${item.id}_base_cost`];
              if (legacy !== undefined) cellData[key] = legacy;
            }
            if (head.id === 'specifications' && (cellData[key] === undefined || cellData[key] === '')) {
              if (item.specification) cellData[key] = item.specification;
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
        // Recompute derived columns for the new formula set
        restoredItems.forEach((item) => {
          Object.assign(cellData, computeRowDerived(item.id, cellData));
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

  /** Builds full cell data (manual + calculated) for save - so DB always gets correct values */
  const buildFullCostingDataForSave = (itemsList, cellData) => {
    const out = { ...cellData };
    itemsList.forEach((item) => {
      Object.assign(out, computeRowDerived(item.id, out));
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
        Object.assign(newData, computeRowDerived(item.id, prev));
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
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      setCellValue(itemId, 'vendor_rate', baseCost);
      const spec = getProductSpecification(productId);
      if (spec) setCellValue(itemId, 'specifications', spec);
    }
  };

  const handleCellChange = (itemId, costHeadId, value) => {
    setCellValue(itemId, costHeadId, value);
    setEditingCell(null);
    if (costHeadId === 'uom') {
      setUomForceManual((prev) => {
        if (!prev[itemId]) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const saveCostingSheet = useCallback(async ({ silent = false, quotationId: providedQuotationId = null } = {}) => {
    if (isSavingRef.current) {
      return { ok: false, error: new Error('Save already in progress') };
    }
    isSavingRef.current = true;
    try {
      if (isViewMode) return { ok: true, skipped: true };
      const targetQuotationId = providedQuotationId || quotationId;
      if (!targetQuotationId) {
        if (!silent) alert('Please save quotation first before saving costing sheet.');
        return { ok: false, error: new Error('Missing quotationId') };
      }
      const { data: { user } } = await supabase.auth.getUser();

      const dedupedItems = dedupeCostingItemsById(items);
      const activeItems = filterEmptyCostingItems(dedupedItems, costingData);
      const prunedCellData = pruneCostingCellData(costingData, activeItems.map((i) => i.id));
      const fullCellData = buildFullCostingDataForSave(activeItems, prunedCellData);

      const grandTotal = activeItems.reduce((sum, item) => {
        return sum + (parseFloat(fullCellData[`${item.id}_grand_total_supply_cost_with_gst`] || 0) || 0);
      }, 0);

      const netTotal = activeItems.reduce((sum, item) => {
        return sum + (parseFloat(fullCellData[`${item.id}_grand_total_supply_cost_excl_gst`] || 0) || 0);
      }, 0);

      const gstAmount = grandTotal - netTotal;

      const itemsWithProductInfo = activeItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const rawSpec = item.productId
          ? getProductSpecification(item.productId)
          : sanitizePdfText(item.specification || '');
        return {
          id: item.id,
          productId: item.productId || null,
          productName: sanitizePdfText(product?.product_name || item.productName || item.name || ''),
          productCode: product?.product_code || '',
          specification: rawSpec,
        };
      });

      const dataToSave = {
        items: itemsWithProductInfo,
        costHeads: COSTING_SHEET_COLUMNS,
        ...fullCellData,
      };

      const { data: existingSheets, error: checkError } = await supabase
        .from('maintenance_costing_sheets')
        .select('id, costing_data, updated_at, created_at')
        .eq('quotation_id', targetQuotationId)
        .order('updated_at', { ascending: false });

      if (checkError) throw checkError;

      const existing = pickCanonicalCostingSheet(existingSheets || []);

      if (existingSheets && existingSheets.length > 0 && existing) {
        const staleIds = existingSheets
          .filter((s) => s.id !== existing.id)
          .map((s) => s.id);
        if (staleIds.length > 0) {
          await supabase.from('maintenance_costing_sheets').delete().in('id', staleIds);
        }
      }

      if (existing) {
        const { error } = await supabase
          .from('maintenance_costing_sheets')
          .update({
            costing_data: dataToSave,
            total_price: grandTotal,
            quantity: activeItems.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('maintenance_costing_sheets')
          .insert([
            {
              quotation_id: targetQuotationId,
              item_name: 'Excel Costing Sheet',
              description: 'Multi-item costing sheet',
              quantity: activeItems.length,
              unit_price: activeItems.length ? netTotal / activeItems.length : 0,
              total_price: grandTotal,
              item_order: 0,
              costing_data: dataToSave,
            },
          ]);

        if (error) throw error;
      }

      setItems(activeItems);
      setCostingData(fullCellData);

      // Update quotation with amounts from costing sheet
      const { error: quotationError } = await supabase
        .from('maintenance_quotations')
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
    } finally {
      isSavingRef.current = false;
    }
  }, [isViewMode, quotationId, items, costingData, products, onSaveSuccess]);

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

  const sheetSummary = computeSheetSummary(items, getCellValue);

  const footerCell = (head) => {
    const money = (v) => `₹${formatNumber(v, 2)}`;
    const pct = (v) => `${formatNumber(v, 2)}%`;
    switch (head.id) {
      case 'unit_rate':
        return money(sheetSummary.avgUnitRate);
      case 'total_amount':
        return money(sheetSummary.totalAmount);
      case 'vendor_rate':
        return money(sheetSummary.avgVendorRate);
      case 'vendor_rate_total':
        return money(sheetSummary.vendorRateTotal);
      case 'transport_per_unit':
        return money(sheetSummary.avgTransport);
      case 'transport_total':
        return money(sheetSummary.transportTotal);
      case 'misc_per_unit':
        return money(sheetSummary.avgMisc);
      case 'misc_total':
        return money(sheetSummary.miscTotal);
      case 'bd_overhead_per_unit':
        return money(sheetSummary.avgBd);
      case 'bd_overhead_total':
        return money(sheetSummary.bdTotal);
      case 'margin_per_unit':
        return money(sheetSummary.avgMargin);
      case 'margin_total':
        return money(sheetSummary.marginTotal);
      case 'final_rate_submission':
        return money(sheetSummary.avgFinalRate);
      case 'total_difference_pct':
        return pct(sheetSummary.avgDiffPct);
      default:
        return null;
    }
  };

  const summaryRows = [
    { key: 'A', label: 'Total Quotation Value (A)', value: sheetSummary.quotationValueA, tone: 'text-slate-900' },
    { key: 'B', label: 'Total Purchase / Vendor Cost (B)', value: sheetSummary.purchaseVendorB, tone: 'text-slate-800' },
    { key: 'C', label: 'Total Business Development / Overhead Cost (C)', value: sheetSummary.bdCostC, tone: 'text-slate-800' },
    { key: 'D', label: 'Total Miscellaneous Expenses (D)', value: sheetSummary.miscCostD, tone: 'text-slate-800' },
    { key: 'E', label: 'Total Transportation Charges (E)', value: sheetSummary.transportCostE, tone: 'text-slate-800' },
    { key: 'TC', label: 'Total Cost (B + C + D + E)', value: sheetSummary.totalCost, tone: 'text-amber-900 font-bold', strong: true },
    { key: 'M', label: 'Total Margin (Cross-check with TOTAL row)', value: sheetSummary.totalMarginCrossCheck, tone: 'text-slate-800' },
    { key: 'NP', label: 'Net Margin / Profit (A − Total Cost)', value: sheetSummary.netMarginProfit, tone: sheetSummary.netMarginProfit >= 0 ? 'text-emerald-800 font-bold' : 'text-red-700 font-bold', strong: true },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/90 ring-1 ring-slate-900/5 p-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Costing Sheet</h3>
          <p className="text-[9px] text-gray-500 mt-0.5">
            Enter Vendor Rate &amp; Quantity — transport 5%, misc 1%, BD/overhead 10%, margin 25% auto-calculate.
            <span className="bg-red-50 text-red-900 px-1.5 py-0.5 rounded border border-red-200 font-medium ml-1">Tint = Manual entry</span>
          </p>
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

      <div className="overflow-x-auto border border-gray-300 rounded-md" style={{ maxWidth: '100%', scrollbarWidth: 'thin', scrollbarColor: 'rgba(220, 38, 38, 0.45) var(--surface-sunken)' }}>
        <style>{`
          .overflow-x-auto::-webkit-scrollbar {
            height: 6px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: var(--surface-sunken);
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
            background-color: var(--critical-soft);
            border: 1px solid var(--critical-border);
          }
          .costing-manual-entry:hover {
            background-color: var(--critical-soft);
          }
          .costing-manual-entry:focus-within {
            outline: 2px solid var(--accent);
            outline-offset: -1px;
          }
        `}</style>
        <table className="border-collapse bg-white text-xs costing-sheet-table" style={{ width: 'max-content', minWidth: '100%', tableLayout: 'fixed', borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: '36px', minWidth: '36px' }} />
            <col style={{ width: '160px', minWidth: '160px' }} />
            {costHeads.map((head) => {
              const isPct = head.id.includes('_pct') || head.id === 'gst_pct' || head.id === 'total_difference_pct';
              const isTextLike = head.inputType === 'text' || head.inputType === 'uom';
              const isAmount = !isTextLike && (head.isCalculated || head.id.includes('amount') || head.id.includes('rate') || head.id.includes('cost') || head.id.includes('total'));
              const w = head.inputType === 'uom' ? '100px' : isTextLike ? '110px' : isPct ? '72px' : isAmount ? '100px' : '90px';
              return <col key={head.id} style={{ width: w, minWidth: w }} />;
            })}
            <col style={{ width: '32px', minWidth: '32px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-400">
              <th className="px-1.5 py-2 text-center text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky left-0 bg-gradient-to-r from-gray-100 to-gray-200 z-10 whitespace-nowrap align-middle" title="Serial Number">
                Sr. No.
              </th>
              <th className="px-1.5 py-2 text-left text-[10px] font-bold text-gray-800 border-r border-gray-400 sticky bg-gradient-to-r from-gray-100 to-gray-200 z-10 align-middle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]" style={{ left: '36px' }} title="Item Description">
                Item Description
              </th>
              {costHeads.map((head) => (
                <th
                  key={head.id}
                  className={`px-1.5 py-2 text-[10px] font-bold text-gray-800 border-r border-gray-400 bg-gradient-to-r from-gray-100 to-gray-200 align-middle ${head.isCalculated && head.inputType !== 'text' && head.inputType !== 'uom' ? 'text-right' : 'text-center'}`}
                  title={head.label}
                  style={{ minWidth: head.inputType === 'text' || head.inputType === 'uom' ? '100px' : head.id.includes('_pct') || head.id === 'gst_pct' ? '72px' : '96px', maxWidth: '140px', whiteSpace: 'normal', lineHeight: 1.2 }}
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
                  const isText = head.inputType === 'text';
                  const isUom = head.inputType === 'uom';
                  const isTextLike = isText || isUom;
                  const numericValue = parseFloat(cellValue) || 0;
                  const isPctCol =
                    head.id.includes('_pct') ||
                    head.id === 'gst_pct' ||
                    head.id === 'total_difference_pct';
                  const isManualEntry = !head.isCalculated;
                  const highlightTotal =
                    head.id === 'total_amount' || head.id === 'final_rate_submission';
                  const uomForce = Boolean(uomForceManual[item.id]);
                  const uomSelectValue = isUomPreset(cellValue)
                    ? String(cellValue).trim()
                    : cellValue || uomForce
                      ? UOM_MANUAL_VALUE
                      : '';
                  const showUomManualInput = isUom && uomSelectValue === UOM_MANUAL_VALUE;

                  return (
                    <td
                      key={`${item.id}_${head.id}`}
                      className={`px-1.5 py-1 border-r border-gray-400 align-middle ${isManualEntry ? 'costing-manual-entry bg-red-50' : 'bg-white'}`}
                    >
                      {head.isCalculated ? (
                        <div
                          className={`text-xs font-semibold whitespace-nowrap ${
                            isPctCol ? 'text-center' : 'text-right'
                          } ${highlightTotal ? 'text-green-700' : 'text-gray-800'}`}
                        >
                          {isPctCol
                            ? `${formatNumber(numericValue, 2)}%`
                            : `₹${formatNumber(numericValue, 2)}`}
                        </div>
                      ) : isEditing && !isViewMode ? (
                        isUom ? (
                          <div className="flex flex-col gap-0.5">
                            <select
                              value={uomSelectValue}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (next === UOM_MANUAL_VALUE) {
                                  setUomForceManual((prev) => ({ ...prev, [item.id]: true }));
                                  if (isUomPreset(cellValue)) {
                                    setCellValue(item.id, head.id, '');
                                  }
                                  return;
                                }
                                setUomForceManual((prev) => {
                                  if (!prev[item.id]) return prev;
                                  const copy = { ...prev };
                                  delete copy[item.id];
                                  return copy;
                                });
                                handleCellChange(item.id, head.id, next);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setUomForceManual((prev) => {
                                    if (!prev[item.id]) return prev;
                                    const copy = { ...prev };
                                    delete copy[item.id];
                                    return copy;
                                  });
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-1 py-0.5 border border-red-500 text-xs focus:outline-none rounded bg-white"
                              autoFocus={!showUomManualInput}
                              title="Unit of Measure"
                            >
                              <option value="">Select UOM</option>
                              {UOM_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                              <option value={UOM_MANUAL_VALUE}>Manual entry</option>
                            </select>
                            {showUomManualInput && (
                              <input
                                type="text"
                                value={isUomPreset(cellValue) ? '' : cellValue}
                                onChange={(e) => setCellValue(item.id, head.id, e.target.value)}
                                onBlur={(e) => handleCellChange(item.id, head.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellChange(item.id, head.id, e.target.value);
                                  if (e.key === 'Escape') {
                                    setUomForceManual((prev) => {
                                      if (!prev[item.id]) return prev;
                                      const copy = { ...prev };
                                      delete copy[item.id];
                                      return copy;
                                    });
                                    setEditingCell(null);
                                  }
                                }}
                                className="w-full px-1 py-0.5 border border-red-500 text-xs focus:outline-none rounded bg-white"
                                autoFocus
                                placeholder="Type UOM"
                                title="Enter any unit of measure"
                              />
                            )}
                          </div>
                        ) : isText ? (
                          <input
                            type="text"
                            value={cellValue}
                            onChange={(e) => setCellValue(item.id, head.id, e.target.value)}
                            onBlur={() => handleCellChange(item.id, head.id, cellValue)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCellChange(item.id, head.id, cellValue);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-full px-1 py-0.5 border border-red-500 text-xs focus:outline-none rounded bg-white"
                            autoFocus
                            placeholder={head.label}
                            title="Manual entry"
                          />
                        ) : (
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
                        )
                      ) : (
                        <div
                          className={`text-xs text-gray-700 px-1 py-0.5 min-h-[20px] flex items-center ${
                            isTextLike ? 'justify-start text-left truncate' : 'justify-end text-right'
                          } ${isViewMode ? '' : 'cursor-pointer hover:bg-red-100 rounded'}`}
                          onClick={() => !isViewMode && setEditingCell(`${item.id}_${head.id}`)}
                          title={isViewMode ? 'Read only' : isUom ? 'Select or enter UOM' : isText ? String(cellValue || head.label) : 'Manual entry - click to edit'}
                        >
                          {isTextLike ? (
                            cellValue ? (
                              <span className="truncate">{cellValue}</span>
                            ) : (
                              <span className="text-gray-400 text-[10px]">{isUom ? 'Select' : 'Enter'}</span>
                            )
                          ) : numericValue > 0 || (head.id === 'qty' && cellValue !== '') || (head.id === 'gst_pct' && cellValue !== '') ? (
                            <span>{isPctCol ? `${formatNumber(numericValue)}%` : formatNumber(numericValue)}</span>
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
                {costHeads.map((head) => (
                  <td key={`add-row-${head.id}`} className="px-1 py-1 border-r border-gray-400 bg-gray-100"></td>
                ))}
                <td className="bg-gray-100 border-l border-gray-400"></td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gradient-to-r from-slate-100 to-slate-200 text-slate-900 font-bold border-t-2 border-slate-400">
              <td className="px-1 py-1.5 text-[10px] border-r border-slate-300 sticky bg-slate-100 z-20" style={{ left: 0 }}></td>
              <td
                className="px-1.5 py-1.5 text-[10px] border-r border-slate-300 sticky bg-slate-100 z-20 font-bold uppercase tracking-wide"
                style={{ left: '36px' }}
              >
                TOTAL / AVERAGE
              </td>
              {costHeads.map((head) => {
                const display = footerCell(head);
                const highlight = head.id === 'total_amount' || head.id === 'final_rate_submission';
                return (
                  <td
                    key={`ft-${head.id}`}
                    className={`px-1 py-1.5 text-[10px] text-right border-r border-slate-300 whitespace-nowrap ${
                      highlight ? 'text-emerald-800 bg-emerald-50 font-bold' : display ? 'text-slate-800' : ''
                    }`}
                  >
                    {display || ''}
                  </td>
                );
              })}
              <td className="px-1 py-1.5 text-xs border-l border-slate-300 bg-slate-100"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Bottom summary — full width, label left / amount right */}
      <div className="mt-3 w-full rounded-md border border-gray-300 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-400">
          <h4 className="text-[10px] font-bold text-gray-800 uppercase tracking-wide">Costing Summary</h4>
        </div>
        <table className="w-full border-collapse text-xs">
          <colgroup>
            <col style={{ width: '70%' }} />
            <col style={{ width: '30%' }} />
          </colgroup>
          <tbody>
            {summaryRows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-gray-300 last:border-b-0 ${
                  row.strong ? 'bg-slate-50' : 'bg-white hover:bg-purple-50/20'
                }`}
              >
                <td className={`px-3 py-2.5 text-left border-r border-gray-300 ${row.tone}`}>
                  {row.label}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${row.tone}`}>
                  ₹{formatNumber(row.value, 2)}
                </td>
              </tr>
            ))}
          </tbody>
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
                  scrollbarColor: 'var(--accent) var(--surface-sunken)',
                  maxHeight: '350px'
                }}
              >
                <style>{`
                  .product-dropdown-list::-webkit-scrollbar {
                    width: 8px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-track {
                    background: var(--surface-sunken);
                    border-radius: 4px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-thumb {
                    background: var(--accent);
                    border-radius: 4px;
                  }
                  .product-dropdown-list::-webkit-scrollbar-thumb:hover {
                    background: var(--accent-deep);
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
                          backgroundColor: idx % 2 === 0 ? 'var(--surface-raised)' : 'var(--surface)'
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

