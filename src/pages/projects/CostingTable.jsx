// src/pages/CostingTable.jsx
import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CostingSummary from "./CostingSummary";
import { FaBars, FaChevronDown, FaChevronUp, FaTrash } from "react-icons/fa";
import { supabase } from "../../lib/supabase";
import auditLogger from "../../lib/auditLogger";
import { isRetiredFireTenderMainComponentLabel } from "../../lib/retiredFireTenderMainComponents";
import { NumericInput, parseNumericInput } from "../../components/NumericInput";
import {
  calculateCostingRowTotal,
  computeMetaconeQty,
  getComponentDisplayAliases,
  getCostingRowFillStatus,
  getGlobalOmittedComponents,
  getManualSubLabel,
  getManualSubPlaceholder,
  getOrderedMainComponents,
  getSubOptions,
  getWeightColumnLabel,
  isDcpComponent,
  isLabourFieldEditable,
  isMetaconeMounting,
  isStructureOrPanelling,
  isTankComponent,
  isWeightFieldEditable,
  parseCostingNumber,
} from "./fireTenderCostingConfig";
import { exportFireTenderCostingWorkbook } from "./fireTenderCostingExcelExport";
import { rowMatchesTemplate } from "./fireTenderTemplates";

import { toast } from "../../lib/toast";
import { confirmDialog } from "../../lib/dialog";
// 🔹 Convert rows into nested tree structure (unchanged)
const buildTree = (rows) => {
  const tree = {};
  rows.forEach((r) => {
    if (!tree[r.main_component]) tree[r.main_component] = {};
    let level1 = tree[r.main_component];

    if (r.sub_category1) {
      if (!level1[r.sub_category1]) level1[r.sub_category1] = {};
      let level2 = level1[r.sub_category1];

      if (r.sub_category2) {
        if (!level2[r.sub_category2]) level2[r.sub_category2] = {};
        let level3 = level2[r.sub_category2];

        if (r.sub_category3) {
          if (!level3[r.sub_category3]) level3[r.sub_category3] = {};
          let level4 = level3[r.sub_category3];

          if (r.sub_category4) {
            if (!level4[r.sub_category4]) level4[r.sub_category4] = {};
            let level5 = level4[r.sub_category4];

            if (r.sub_category5) {
              level5[r.sub_category5] = {};
            }
          }
        }
      }
    }
  });
  return tree;
};

/** Costing sheet shows at most this many lines (Sr. 1 … N). */
const MAX_COSTING_SHEET_LINES = 120;

function omittedMainStorageKey(tenderId) {
  return `fire_tender_costing_omitted_main_${Number(tenderId)}`;
}

function loadOmittedMainComponents(tenderId) {
  if (!tenderId) return [];
  try {
    const raw = localStorage.getItem(omittedMainStorageKey(tenderId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveOmittedMainComponents(tenderId, list) {
  localStorage.setItem(omittedMainStorageKey(tenderId), JSON.stringify(list));
}

/** Keep first N rows in fixed-then-extra order (Sr. No. order). */
function trimCostingSheetToMaxLines(fixed, extra, maxLines) {
  const nFixed = fixed.length;
  const all = [...fixed, ...extra];
  if (all.length <= maxLines) {
    return { fixedRows: [...fixed], extraRows: [...extra] };
  }
  const t = all.slice(0, maxLines);
  if (maxLines <= nFixed) {
    return { fixedRows: t, extraRows: [] };
  }
  return { fixedRows: t.slice(0, nFixed), extraRows: t.slice(nFixed) };
}

/** Display order for costing lines (catalog + added), by sortOrder. */
function buildDisplayRows(fixed, extra) {
  const items = [
    ...fixed.map((row, kindIndex) => ({ row, isCatalog: true, kindIndex })),
    ...extra.map((row, kindIndex) => ({ row, isCatalog: false, kindIndex })),
  ];
  items.sort((a, b) => {
    const ao =
      a.row.sortOrder != null && Number.isFinite(Number(a.row.sortOrder))
        ? Number(a.row.sortOrder)
        : a.isCatalog
          ? a.kindIndex
          : 10000 + a.kindIndex;
    const bo =
      b.row.sortOrder != null && Number.isFinite(Number(b.row.sortOrder))
        ? Number(b.row.sortOrder)
        : b.isCatalog
          ? b.kindIndex
          : 10000 + b.kindIndex;
    if (ao !== bo) return ao - bo;
    if (a.isCatalog !== b.isCatalog) return a.isCatalog ? -1 : 1;
    return a.kindIndex - b.kindIndex;
  });
  return items;
}

/** Compact summary of selected subcategory levels for the collapsed row. */
function getSubCategorySummary(row) {
  const parts = [row.sub1, row.sub2, row.sub3, row.sub4, row.sub5]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" › ") : "";
}

/** Remark field stays inside the cell; height grows as text wraps. */
function AutoGrowRemark({ value, onChange, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(28, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value ?? ""}
      onChange={onChange}
      rows={1}
      placeholder="Remark"
      className={`box-border block w-full max-w-full min-h-[1.75rem] resize-none overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] ${className}`}
    />
  );
}

const COSTING_COL_COUNT = 11;

const CostingTable = ({
  tenderId,
  tenderNumber,
  clientName,
  tenderSource,
  template,
  accessoriesTotal: accessoriesTotalProp,
}) => {
  const [componentTree, setComponentTree] = useState({});
  const [displayAliases, setDisplayAliases] = useState({});
  const [globalOmittedComponents, setGlobalOmittedComponents] = useState(() => new Set());
  const [orderedComponentList, setOrderedComponentList] = useState([]);
  const [fixedRows, setFixedRows] = useState([]);
  const [extraRows, setExtraRows] = useState([]);
  const [mocPrices, setMocPrices] = useState({}); // key: moc, value: price
  const [priceMasterData, setPriceMasterData] = useState({});
  const [priceDriftData, setPriceDriftData] = useState({});
  /** Row indices with Sub Category expand panel open (independent per row). */
  const [expandedSubRows, setExpandedSubRows] = useState(() => new Set());
  const [dragFromIndex, setDragFromIndex] = useState(null);

  const [showDriftMonitor, setShowDriftMonitor] = useState(false);

  const toggleSubExpand = (index) => {
    setExpandedSubRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  /** Reorder any costing line (catalog or newly added) — calculation formulas unchanged. */
  const reorderCostingRows = (fromIndex, toIndex) => {
    const items = buildDisplayRows(fixedRows, extraRows);
    if (
      fromIndex == null ||
      toIndex == null ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= items.length ||
      toIndex >= items.length
    ) {
      return;
    }
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    const orderMap = new Map();
    next.forEach((item, i) => {
      orderMap.set(`${item.isCatalog ? "c" : "e"}:${item.kindIndex}`, i);
    });

    setFixedRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        sortOrder: orderMap.has(`c:${i}`) ? orderMap.get(`c:${i}`) : i,
      }))
    );
    setExtraRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        sortOrder: orderMap.has(`e:${i}`) ? orderMap.get(`e:${i}`) : 10000 + i,
      }))
    );

    setExpandedSubRows((prev) => {
      if (!prev.size) return prev;
      const remapped = new Set();
      prev.forEach((i) => {
        if (i === fromIndex) remapped.add(toIndex);
        else if (fromIndex < toIndex && i > fromIndex && i <= toIndex) remapped.add(i - 1);
        else if (fromIndex > toIndex && i >= toIndex && i < fromIndex) remapped.add(i + 1);
        else remapped.add(i);
      });
      return remapped;
    });
  };

  // Function to manually check and update price drift
  const checkAndUpdatePriceDrift = () => {
    const allRows = [...fixedRows, ...extraRows];
    const driftData = {};
    let hasDrift = false;

    console.log('Checking price drift for rows:', allRows.length);
    
    allRows.forEach(row => {
      if (row.component) {
        const component = row.component;
        const sub1 = row.sub1 || '';
        const sub2 = row.sub2 || '';
        const sub3 = row.sub3 || '';
        const sub4 = row.sub4 || '';
        const sub5 = row.sub5 || '';
        const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
        
        const isDrift = checkPriceDrift(row);
        
        if (isDrift) {
          driftData[priceKey] = true;
          hasDrift = true;
        }
      }
    });

    setPriceDriftData(driftData);
    
    if (hasDrift) {
      auditLogger.detectPriceDrift();
      setShowDriftMonitor(true); // Auto-show monitor if drift detected
    }
    
    return hasDrift;
  };

  // Function to check price drift for a specific row
  const checkPriceDrift = (row) => {
    if (!row.component || !priceMasterData || Object.keys(priceMasterData).length === 0) {
      console.log(`No drift check: component=${row.component}, priceMasterData=${!!priceMasterData}, keys=${Object.keys(priceMasterData).length}`);
      return false;
    }
    
    const component = row.component;
    const sub1 = row.sub1 || '';
    const sub2 = row.sub2 || '';
    const sub3 = row.sub3 || '';
    const sub4 = row.sub4 || '';
    const sub5 = row.sub5 || '';
    
    const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
    const priceMasterEntry = priceMasterData[priceKey];
    
    console.log(`Checking drift for key: ${priceKey}`, {
      priceMasterEntry: priceMasterEntry,
      originalUnitCost: row.original_unit_cost,
      hasOriginalCost: !!row.original_unit_cost
    });
    
    if (priceMasterEntry && row.original_unit_cost) {
      const currentPriceMasterCost = parseFloat(priceMasterEntry.unit_cost) || 0;
      const originalCostingCost = parseFloat(row.original_unit_cost) || 0;
      
      const isDrift = Math.abs(currentPriceMasterCost - originalCostingCost) > 0.01;
      console.log(`Price comparison: current=${currentPriceMasterCost}, original=${originalCostingCost}, drift=${isDrift}`);
      
      return isDrift;
    }
    
    return false;
  };

  // Function to check if total needs recalculation due to price drift
  const checkTotalDrift = (row) => {
    if (!row.component || !priceMasterData || Object.keys(priceMasterData).length === 0) return false;
    
    const component = row.component;
    const sub1 = row.sub1 || '';
    const sub2 = row.sub2 || '';
    const sub3 = row.sub3 || '';
    const sub4 = row.sub4 || '';
    const sub5 = row.sub5 || '';
    
    const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
    const priceMasterEntry = priceMasterData[priceKey];
    
    if (priceMasterEntry && row.original_unit_cost) {
      const currentPriceMasterCost = parseFloat(priceMasterEntry.unit_cost) || 0;
      const originalCostingCost = parseFloat(row.original_unit_cost) || 0;
      
      // Check if weight also changed
      const currentWeight = parseFloat(priceMasterEntry.weight) || 0;
      const originalWeight = parseFloat(row.original_weight) || 0;
      
      return (Math.abs(currentPriceMasterCost - originalCostingCost) > 0.01) || (Math.abs(currentWeight - originalWeight) > 0.01);
    }
    
    return false;
  }; // key: component+sub1+sub2+..., value: {weight, unit_cost}

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!tenderId) return;

        // 1️⃣ Fetch main components tree (scoped to this tender's costing template)
        const { data: mainData, error: mainError } = await supabase.from("main_components").select("*");
        if (mainError) throw mainError;
        const mainRows = (mainData || [])
          .filter((r) => rowMatchesTemplate(r, template))
          .filter((r) => !isRetiredFireTenderMainComponentLabel(r.main_component));
        const tree = buildTree(mainRows);

        // 2️⃣ Fetch existing costing rows for tender
        const { data: existingRowsRaw, error: existingError } = await supabase
          .from("costing_rows")
          .select("*")
          .eq("tender_id", Number(tenderId));
        if (existingError) throw existingError;
        const existingRows = (existingRowsRaw || []).filter(
          (r) => !isRetiredFireTenderMainComponentLabel(r.main_component)
        );

        // 3️⃣ Fetch MOC prices for tender
        const { data: mocData, error: mocError } = await supabase
          .from("moc_prices")
          .select("*")
          .eq("tender_id", Number(tenderId));
        if (mocError) throw mocError;

        const mocObj = {};
        mocData.forEach((row) => {
          mocObj[row.moc.toLowerCase()] = parseFloat(row.price) || 0;
        });
        setMocPrices(mocObj);

        // 4️⃣ Fetch Price Master data
        const { data: priceData, error: priceError } = await supabase
          .from("price_master")
          .select("*");
        if (priceError) throw priceError;

        const priceObj = {};
        priceData.forEach((row) => {
          if (!rowMatchesTemplate(row, template)) return;
          if (isRetiredFireTenderMainComponentLabel(row.main_component)) return;
          // Create a unique key based on component and sub categories
          const key = `${row.main_component}|${row.sub_category1 || ''}|${row.sub_category2 || ''}|${row.sub_category3 || ''}|${row.sub_category4 || ''}|${row.sub_category5 || ''}`;
          priceObj[key] = {
            weight: parseFloat(row.weight) || 0,
            unit_cost: parseFloat(row.unit_cost) || 0
          };
        });
        setPriceMasterData(priceObj);

        // 5️⃣ Separate fixed and extra rows
        const fixed = [];
        const extra = [];

        const orderedComponents = getOrderedMainComponents(mainRows);
        const globalOmitted = getGlobalOmittedComponents(orderedComponents);
        setOrderedComponentList(orderedComponents);
        setDisplayAliases(getComponentDisplayAliases(orderedComponents));
        setGlobalOmittedComponents(globalOmitted);
        const omittedMain = new Set([...loadOmittedMainComponents(Number(tenderId)), ...globalOmitted]);

        // Build fixed rows (catalog order by main_components.id)
        orderedComponents.forEach((comp) => {
          if (omittedMain.has(comp)) return;

          const rowFromDB = existingRows.find((r) => r.main_component === comp);
          let unitCost = rowFromDB?.unit_cost ?? 0;
          let weight = rowFromDB?.weight ?? 0;

          // MOC fills unit cost only when nothing was saved on the row
          if (rowFromDB?.sub_category1 && (unitCost === 0 || unitCost == null)) {
            const mocPrice = mocObj[rowFromDB.sub_category1.toLowerCase()];
            if (mocPrice !== undefined) unitCost = mocPrice;
          }

          // If no existing data, try to get from Price Master
          if (!rowFromDB) {
            const sub1 = "";
            const sub2 = "";
            const sub3 = "";
            const sub4 = "";
            const sub5 = "";
            const priceKey = `${comp}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
            const priceData = priceObj[priceKey];
            
            if (priceData) {
              weight = priceData.weight;
              unitCost = priceData.unit_cost;
            }
          }

          fixed.push({
            component: comp,
            sub1: rowFromDB?.sub_category1 || "",
            sub2: rowFromDB?.sub_category2 || "",
            sub3: rowFromDB?.sub_category3 || "",
            sub4: rowFromDB?.sub_category4 || "",
            sub5: rowFromDB?.sub_category5 || "",
            manualSub: rowFromDB?.manual_sub || "",
            weight,
            labour: rowFromDB?.labour || 0,
            unitCost,
            qty: rowFromDB?.qty || 1,
            remark: rowFromDB?.remark || "",
            includeInSummary: rowFromDB?.include_in_summary !== false,
            sortOrder:
              rowFromDB?.sort_order != null && rowFromDB?.sort_order !== ""
                ? Number(rowFromDB.sort_order)
                : null,
            original_unit_cost: rowFromDB?.original_unit_cost,
            original_weight: rowFromDB?.original_weight
          });
        });

        if (fixed.some((r) => r.sortOrder != null && Number.isFinite(r.sortOrder))) {
          fixed.sort((a, b) => {
            const ao = a.sortOrder != null && Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
            const bo = b.sortOrder != null && Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
            return ao - bo;
          });
        }

        // Extra rows (rows not in main_components)
        existingRows.forEach((r) => {
          // Skip "Tender Mode" as it should only be in CostingSummary
          if (r.main_component === "Tender Mode") return;
          if (omittedMain.has(r.main_component)) return;

          if (!tree[r.main_component]) {
            let unitCost = r.unit_cost || 0;
            let weight = r.weight || 0;

            if (r.sub_category1 && (unitCost === 0 || unitCost == null)) {
              const mocPrice = mocObj[r.sub_category1.toLowerCase()];
              if (mocPrice !== undefined) unitCost = mocPrice;
            }

            // Try to get from Price Master if no existing data
            if (!r.unit_cost && !r.weight) {
              const priceKey = `${r.main_component}|${r.sub_category1 || ''}|${r.sub_category2 || ''}|${r.sub_category3 || ''}|${r.sub_category4 || ''}|${r.sub_category5 || ''}`;
              const priceData = priceObj[priceKey];
              
              if (priceData) {
                weight = priceData.weight;
                unitCost = priceData.unit_cost;
              }
            }

            extra.push({
              component: r.main_component,
              sub1: r.sub_category1 || "",
              sub2: r.sub_category2 || "",
              sub3: r.sub_category3 || "",
              sub4: r.sub_category4 || "",
              sub5: r.sub_category5 || "",
              manualSub: r.manual_sub || "",
              weight,
              labour: r.labour || 0,
              unitCost,
              qty: r.qty || 1,
              remark: r.remark || "",
              includeInSummary: r.include_in_summary !== false,
              sortOrder:
                r.sort_order != null && r.sort_order !== "" ? Number(r.sort_order) : null,
              original_unit_cost: r.original_unit_cost,
              original_weight: r.original_weight
            });
          }
        });

        const { fixedRows: fixedCapped, extraRows: extraCapped } = trimCostingSheetToMaxLines(
          fixed,
          extra,
          MAX_COSTING_SHEET_LINES
        );

        skipCostingAutosaveRef.current = true;
        setComponentTree(tree);
        setFixedRows(fixedCapped);
        setExtraRows(extraCapped);

        // Check price drift when costing table loads
        setTimeout(() => {
          checkAndUpdatePriceDrift();
        }, 2000);
      } catch (err) {
        console.error("Fetch error:", err);
        toast.warning("Error loading tender data: " + (err.message || err));
      }
    };

    fetchData();
  }, [tenderId, template]);


  const addRow = () => {
    if (fixedRows.length + extraRows.length >= MAX_COSTING_SHEET_LINES) {
      toast.success(`The costing sheet is limited to ${MAX_COSTING_SHEET_LINES} lines (Sr. 1–${MAX_COSTING_SHEET_LINES}). Remove a line or shorten the main-component list to add more.`);
      return;
    }
    const maxOrder = buildDisplayRows(fixedRows, extraRows).reduce((m, item) => {
      const n = Number(item.row.sortOrder);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, -1);
    setExtraRows([
      ...extraRows,
      {
        component: "",
        sub1: "",
        sub2: "",
        sub3: "",
        sub4: "",
        sub5: "",
        manualSub: "",
        weight: 0,
        labour: 0,
        unitCost: 0,
        qty: 1,
        remark: "",
        includeInSummary: true,
        sortOrder: maxOrder + 1,
      },
    ]);
  };

  const removeCostingRowAt = async (displayIndex) => {
    const items = buildDisplayRows(fixedRows, extraRows);
    if (displayIndex < 0 || displayIndex >= items.length) return;
    const target = items[displayIndex];

    const reindexExpanded = () => {
      setExpandedSubRows((prev) => {
        const next = new Set();
        prev.forEach((i) => {
          if (i < displayIndex) next.add(i);
          else if (i > displayIndex) next.add(i - 1);
        });
        return next;
      });
    };

    if (target.isCatalog) {
      const comp = target.row?.component;
      if (!comp) return;
      if (
        !(await confirmDialog({ title: "Remove costing line", message: `Remove line ${displayIndex + 1} (“${comp}”) from this tender’s costing sheet?\n\nIt will stay hidden for this tender on this browser until you clear site data.`, confirmLabel: "Remove", tone: "danger" }))
      ) {
        return;
      }
      const list = loadOmittedMainComponents(Number(tenderId));
      if (!list.includes(comp)) {
        list.push(comp);
        saveOmittedMainComponents(Number(tenderId), list);
      }
      setFixedRows((prev) => prev.filter((_, i) => i !== target.kindIndex));
      reindexExpanded();
      return;
    }

    if (!(await confirmDialog({ title: "Remove extra line", message: `Remove extra line ${displayIndex + 1}?`, confirmLabel: "Remove", tone: "danger" }))) return;
    setExtraRows((prev) => prev.filter((_, i) => i !== target.kindIndex));
    reindexExpanded();
  };

  const handleChange = (rows, setRows, index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;

    // Reset lower levels if a parent changes
    if (field === "sub1") {
      updated[index].sub2 = updated[index].sub3 = updated[index].sub4 = updated[index].sub5 = "";
    }
    if (field === "sub2") {
      updated[index].sub3 = updated[index].sub4 = updated[index].sub5 = "";
    }
    if (field === "sub3") {
      updated[index].sub4 = updated[index].sub5 = "";
    }
    if (field === "sub4") {
      updated[index].sub5 = "";
    }

    // Auto-populate weight and unit cost from Price Master when component/sub categories change
    if (field === "component" || field === "sub1" || field === "sub2" || field === "sub3" || field === "sub4" || field === "sub5") {
      const component = updated[index].component;
      const sub1 = updated[index].sub1 || '';
      const sub2 = updated[index].sub2 || '';
      const sub3 = updated[index].sub3 || '';
      const sub4 = updated[index].sub4 || '';
      const sub5 = updated[index].sub5 || '';

      // Try to find matching Price Master entry
      const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
      const priceData = priceMasterData[priceKey];

      if (priceData) {
        // If exact match found, use Price Master data
        updated[index].weight = priceData.weight;
        updated[index].unitCost = priceData.unit_cost;
      } else {
        // Try partial matches (less specific)
        const partialKeys = [
          `${component}|${sub1}|${sub2}|${sub3}|${sub4}`,
          `${component}|${sub1}|${sub2}|${sub3}`,
          `${component}|${sub1}|${sub2}`,
          `${component}|${sub1}`,
          `${component}`
        ];

        for (const key of partialKeys) {
          if (priceMasterData[key]) {
            updated[index].weight = priceMasterData[key].weight;
            updated[index].unitCost = priceMasterData[key].unit_cost;
            break;
          }
        }
      }
    }

    // Determine unitCost dynamically (MOC prices take precedence)
    let newUnitCost = updated[index].unitCost || 0;

    // 1️⃣ Check sub1 first for MOC prices
    const sub1Moc = updated[index].sub1?.toLowerCase();
    if (sub1Moc && mocPrices[sub1Moc] !== undefined) {
      newUnitCost = mocPrices[sub1Moc];
    } else {
      // 2️⃣ If sub1 has no MOC, check sub2 only for Panelling
      const sub2Moc = updated[index].sub2?.toLowerCase();
      if (updated[index].component === "Panelling" && sub2Moc && mocPrices[sub2Moc] !== undefined) {
        newUnitCost = mocPrices[sub2Moc];
      }
    }

    updated[index].unitCost = newUnitCost;

    setRows(updated);

    // Check price drift after changes
    setTimeout(() => {
      checkAndUpdatePriceDrift();
    }, 1000);
  };


  const parseNumber = parseCostingNumber;

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const displayItems = buildDisplayRows(fixedRows, extraRows);
  const allRows = displayItems.map((item) => item.row);

  const calculateTotal = (row) => calculateCostingRowTotal(row, allRows);

  // Exclude chassis rows for total calculation
  const grandTotal = allRows
    .filter((row) => row.component && !row.component.toLowerCase().includes("chassis"))
    .reduce((sum, row) => sum + calculateTotal(row), 0);

  // Calculate chassis total
  const chassisTotal = allRows
    .filter((row) => row.component && row.component.toLowerCase().includes("chassis"))
    .reduce((sum, row) => sum + calculateTotal(row), 0);

  // Calculate accessories total - use prop if provided, otherwise fetch from DB
  const [accessoriesTotal, setAccessoriesTotal] = useState(0);
  const [autoSaveHint, setAutoSaveHint] = useState("");
  const skipCostingAutosaveRef = useRef(true);

  // Use prop if provided (real-time updates from AccessoriesTable) - this takes precedence
  useEffect(() => {
    if (accessoriesTotalProp !== undefined && accessoriesTotalProp !== null) {
      setAccessoriesTotal(accessoriesTotalProp);
    }
  }, [accessoriesTotalProp]);

  // Fetch accessories total from DB only if prop is not provided (fallback for initial load)
  useEffect(() => {
    // Only fetch if prop is not provided
    if (accessoriesTotalProp !== undefined && accessoriesTotalProp !== null) {
      return; // Prop is provided, don't fetch from DB
    }

    const fetchAccessoriesTotal = async () => {
      if (!tenderId) return;

      try {
        const { data, error } = await supabase
          .from("costing_accessories")
          .select("qty, price")
          .eq("tender_id", Number(tenderId));

        if (error) throw error;

        const total = (data || []).reduce((sum, row) => {
          return sum + (Number(row.qty) * Number(row.price));
        }, 0);

        setAccessoriesTotal(total);
      } catch (err) {
        console.error("Error fetching accessories total:", err);
        setAccessoriesTotal(0);
      }
    };

    fetchAccessoriesTotal();
  }, [tenderId, accessoriesTotalProp]);

  useEffect(() => {
    skipCostingAutosaveRef.current = true;
  }, [tenderId]);

  /** Persist costing_rows. Manual save uses alerts + DB refresh; auto-save is quiet and skips refresh. */
  const persistCostingTender = async ({ silent = false } = {}) => {
    if (!tenderId) {
      if (!silent) toast.warning("No tender selected. Please open a Tender before saving.");
      return;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.error("Auth error:", userErr);
      if (!silent) toast.warning("User not authenticated. Please login.");
      else setAutoSaveHint("Could not save — not signed in.");
      return;
    }
    const userId = user.id;

    const { fixedRows: fSave, extraRows: eSave } = trimCostingSheetToMaxLines(
      fixedRows,
      extraRows,
      MAX_COSTING_SHEET_LINES
    );
    if (fSave.length !== fixedRows.length || eSave.length !== extraRows.length) {
      setFixedRows(fSave);
      setExtraRows(eSave);
    }
    const allToSave = buildDisplayRows(fSave, eSave)
      .map((item) => item.row)
      .filter((row) => String(row.component || "").trim());

    const { data: backupRows, error: backupErr } = await supabase
      .from("costing_rows")
      .select("*")
      .eq("tender_id", Number(tenderId));

    if (backupErr) {
      console.error("Backup read error:", backupErr);
      if (!silent) toast.warning("Could not read existing costing data before save.");
      throw backupErr;
    }

    const { error: deleteError } = await supabase
      .from("costing_rows")
      .delete()
      .eq("tender_id", Number(tenderId));

    if (deleteError) {
      console.error("Delete error:", deleteError);
      if (!silent) toast.warning("Error clearing old costing rows: " + deleteError.message);
      throw deleteError;
    }

    const rowsToInsert = allToSave
      .filter((row) => !isRetiredFireTenderMainComponentLabel(row.component))
      .map((row, orderIndex) => {
      const labour = parseNumber(row.labour);
      const unitCost = parseNumber(row.unitCost);
      const weight = parseNumber(row.weight);
      let qty = parseNumber(row.qty);

      if (isMetaconeMounting(row.component)) {
        qty = computeMetaconeQty(allToSave);
      }

      let total = 0;
      if (isMetaconeMounting(row.component)) {
        total = unitCost * qty + labour;
      } else if (isTankComponent(row.component)) {
        total = weight * (unitCost + labour) * qty;
      } else if (isStructureOrPanelling(row.component)) {
        total = weight * unitCost + labour;
      } else if (isDcpComponent(row.component) && weight > 0) {
        total = weight * unitCost * qty + labour;
      } else {
        total = (labour + unitCost) * qty;
      }

      return {
        tender_id: Number(tenderId),
        main_component: row.component || null,
        sub_category1: row.sub1 || null,
        sub_category2: row.sub2 || null,
        sub_category3: row.sub3 || null,
        sub_category4: row.sub4 || null,
        sub_category5: row.sub5 || null,
        manual_sub: row.manualSub || null,
        weight,
        labour,
        unit_cost: unitCost,
        qty,
        remark: row.remark || null,
        total,
        include_in_summary: row.includeInSummary !== false,
        sort_order: orderIndex,
        user_id: userId,
        original_unit_cost: unitCost,
        original_weight: weight,
        costing_saved_at: new Date().toISOString(),
      };
    });

    let { error } = await supabase.from("costing_rows").insert(rowsToInsert).select();

    // Graceful fallback if migration for include_in_summary / sort_order is not applied yet
    if (error && /include_in_summary|sort_order/i.test(error.message || "")) {
      const legacyRows = rowsToInsert.map(({ include_in_summary, sort_order, ...rest }) => rest);
      ({ error } = await supabase.from("costing_rows").insert(legacyRows).select());
    }

    if (error) {
      console.error("Insert error:", error);
      if (backupRows?.length) {
        const restorePayload = backupRows.map((r) => {
          const { id, created_at, updated_at, ...rest } = r;
          return rest;
        });
        await supabase.from("costing_rows").insert(restorePayload);
      }
      if (!silent) toast.warning("Error saving tender ❌: " + error.message);
      else setAutoSaveHint("Save failed — " + (error.message || "error"));
      throw error;
    }

    if (!silent) {
      console.log("Insert success");
      toast.success("Costing rows saved successfully ✅");
    } else {
      const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setAutoSaveHint(`Costing sheet saved · ${t}`);
      window.setTimeout(() => setAutoSaveHint(""), 5000);
    }

    if (!silent) {
      const { data: refreshedRowsRaw, error: fetchError } = await supabase
        .from("costing_rows")
        .select("*")
        .eq("tender_id", Number(tenderId));
      if (fetchError) throw fetchError;

      const refreshedRows = (refreshedRowsRaw || []).filter(
        (r) => !isRetiredFireTenderMainComponentLabel(r.main_component)
      );
      const fixed = [];
      const extra = [];
      const omittedMain = new Set([
        ...loadOmittedMainComponents(Number(tenderId)),
        ...globalOmittedComponents,
      ]);

      (orderedComponentList.length ? orderedComponentList : Object.keys(componentTree)).forEach((comp) => {
        if (comp === "Tender Mode") return;
        if (omittedMain.has(comp)) return;
        const rowFromDB = refreshedRows.find((r) => r.main_component === comp);
        fixed.push({
          component: comp,
          sub1: rowFromDB?.sub_category1 || "",
          sub2: rowFromDB?.sub_category2 || "",
          sub3: rowFromDB?.sub_category3 || "",
          sub4: rowFromDB?.sub_category4 || "",
          sub5: rowFromDB?.sub_category5 || "",
          manualSub: rowFromDB?.manual_sub || "",
          weight: rowFromDB?.weight || 0,
          labour: rowFromDB?.labour || 0,
          unitCost: rowFromDB?.unit_cost || 0,
          qty: rowFromDB?.qty || 1,
          remark: rowFromDB?.remark || "",
          includeInSummary: rowFromDB?.include_in_summary !== false,
          sortOrder:
            rowFromDB?.sort_order != null && rowFromDB?.sort_order !== ""
              ? Number(rowFromDB.sort_order)
              : null,
        });
      });

      if (fixed.some((r) => r.sortOrder != null && Number.isFinite(r.sortOrder))) {
        fixed.sort((a, b) => {
          const ao = a.sortOrder != null && Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
          const bo = b.sortOrder != null && Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
          return ao - bo;
        });
      }

      refreshedRows.forEach((r) => {
        if (omittedMain.has(r.main_component)) return;
        if (!componentTree[r.main_component]) {
          extra.push({
            component: r.main_component,
            sub1: r.sub_category1 || "",
            sub2: r.sub_category2 || "",
            sub3: r.sub_category3 || "",
            sub4: r.sub_category4 || "",
            sub5: r.sub_category5 || "",
            manualSub: r.manual_sub || "",
            weight: r.weight || 0,
            labour: r.labour || 0,
            unitCost: r.unit_cost || 0,
            qty: r.qty || 1,
            remark: r.remark || "",
            includeInSummary: r.include_in_summary !== false,
            sortOrder:
              r.sort_order != null && r.sort_order !== "" ? Number(r.sort_order) : null,
          });
        }
      });

      const { fixedRows: fixedCapped, extraRows: extraCapped } = trimCostingSheetToMaxLines(
        fixed,
        extra,
        MAX_COSTING_SHEET_LINES
      );
      setFixedRows(fixedCapped);
      setExtraRows(extraCapped);
    }
  };

  const saveTender = async () => {
    try {
      await persistCostingTender({ silent: false });
    } catch (err) {
      console.error("Save error:", err);
      toast.warning("Error saving tender ❌: " + (err.message || err));
    }
  };

  useEffect(() => {
    if (!tenderId) return;
    if (skipCostingAutosaveRef.current) {
      skipCostingAutosaveRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await persistCostingTender({ silent: true });
        } catch {
          /* persistCostingTender already set hint on failure when silent */
        }
      })();
    }, 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced snapshot save; persist reads latest state
  }, [fixedRows, extraRows, tenderId]);

  const lockedSubClass =
    "flex min-h-[1.75rem] w-full items-center justify-center rounded border border-slate-200 bg-slate-100 px-1 text-[11px] text-slate-400 select-none";

  const renderSubColumn = (level, row, index, isFixed, { labeled = false } = {}) => {
    const field = `sub${level}`;
    const label = `Sub Category ${level}`;
    let control;

    if (!isFixed) {
      control = <span className={lockedSubClass} title="Use Manual Sub / Make / Brand">—</span>;
    } else {
      const options = getSubOptions(componentTree, row.component, level, row);
      if (options.length > 0) {
        control = (
          <select
            value={row[field]}
            onChange={(e) => handleChange(fixedRows, setFixedRows, index, field, e.target.value)}
            className="w-full max-w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-800"
            aria-label={label}
          >
            <option value="">-- Select --</option>
            {options.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        );
      } else {
        control = <span className={lockedSubClass} title="Use Manual Sub / Make / Brand">—</span>;
      }
    }

    if (!labeled) return control;

    return (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {control}
        {row[field] ? (
          <span className="truncate text-[11px] text-slate-700" title={row[field]}>
            Selected: {row[field]}
          </span>
        ) : null}
      </div>
    );
  };

  const handleExportExcel = async (netTotalRows, accessoriesRows, mocRows) => {
    try {
      await exportFireTenderCostingWorkbook({
        tenderNumber,
        client: clientName,
        template,
        fixedRows,
        extraRows,
        componentTree,
        displayAliases,
        grandTotal,
        chassisTotal,
        accessoriesTotal,
        netTotalRows,
        accessoriesRows,
        mocRows,
      });
    } catch (err) {
      console.error("Excel export failed:", err);
      toast.warning("Could not export costing sheet: " + (err.message || err));
    }
  };

  const th =
    "sticky top-0 z-20 border border-red-100 bg-gradient-to-r from-red-50 to-amber-50 px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-700";
  const td = "border border-slate-200 px-1.5 py-1 align-middle text-[11px] text-slate-800";
  const inputCompact =
    "w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-800";

  return (
    <div className="space-y-4">
      <div className="w-full rounded-lg bg-white p-3 shadow sm:p-4">
        <p className="mb-2 text-[11px] text-slate-500">
          Drag any line by the handle to reorder (formulas unchanged). Use Cost Components checkboxes below to control what appears in summary and export.
        </p>
        <div className="max-h-[calc(100dvh-16rem)] overflow-x-hidden overflow-y-auto">
        <table className="erp-table-exempt w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "11.5%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${th} text-center`}>Sr.</th>
              <th className={th}>Main Cost Component</th>
              <th className={th}>Sub Category</th>
              <th className={th}>Manual Sub / Make / Brand</th>
              <th className={th}>Weight (KG)</th>
              <th className={th}>Labour Cost</th>
              <th className={th}>Unit Cost / Price of Metal</th>
              <th className={th}>Qty</th>
              <th className={th}>Total Price</th>
              <th className={`${th} w-[12rem] min-w-[10rem] max-w-[14rem]`}>Remark</th>
              <th className={`${th} text-center`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, index) => {
              const { row, isCatalog: isFixedRow, kindIndex } = item;
              const metaconeQty = isMetaconeMounting(row.component) ? computeMetaconeQty(allRows) : null;
              const fillStatus = getCostingRowFillStatus(row, allRows, componentTree, isFixedRow);
              const fillHighlightClass =
                fillStatus === "complete"
                  ? "bg-green-100"
                  : fillStatus === "incomplete"
                    ? "bg-red-100"
                    : "bg-white";
              const subSummary = getSubCategorySummary(row);
              const isSubExpanded = expandedSubRows.has(index);
              const hasAnySubOptions =
                isFixedRow &&
                [1, 2, 3, 4, 5].some(
                  (level) => getSubOptions(componentTree, row.component, level, row).length > 0
                );
              const rowKey = isFixedRow ? `c-${row.component || kindIndex}` : `e-${kindIndex}`;

              return (
                <React.Fragment key={rowKey}>
                <tr
                  className={`bg-white hover:bg-slate-50/80 ${dragFromIndex === index ? "opacity-60" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    if (e.target.closest("input, textarea, select, button, a")) {
                      e.preventDefault();
                      return;
                    }
                    setDragFromIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    try {
                      e.dataTransfer.setData("text/plain", String(index));
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragOver={(e) => {
                    if (dragFromIndex == null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragFromIndex;
                    setDragFromIndex(null);
                    reorderCostingRows(from, index);
                  }}
                  onDragEnd={() => setDragFromIndex(null)}
                >
                  <td className={`${td} text-center tabular-nums text-slate-500`}>{index + 1}</td>

                  {/* Main Component (+ drag handle for all lines) */}
                  <td className={`${td} font-medium`}>
                    <div className="flex min-w-0 items-start gap-1">
                      <span
                        className="mt-0.5 shrink-0 cursor-grab text-slate-400 active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-hidden
                      >
                        <FaBars className="h-3 w-3" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {isFixedRow ? (
                          <span className="block break-words font-semibold leading-snug text-slate-900" title={displayAliases[row.component] || row.component}>
                            {displayAliases[row.component] || row.component}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={row.component}
                            onChange={(e) =>
                              handleChange(
                                extraRows,
                                setExtraRows,
                                kindIndex,
                                "component",
                                e.target.value
                              )
                            }
                            className={inputCompact}
                          />
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Single Sub Category column — summary + expand */}
                  <td className={`${td} bg-white`}>
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="min-w-0 flex-1">
                        {subSummary ? (
                          <p className="line-clamp-2 break-words leading-snug text-slate-800" title={subSummary}>
                            {subSummary}
                          </p>
                        ) : (
                          <p className="text-slate-400">
                            {hasAnySubOptions ? "Select subcategory" : "Use manual sub"}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSubExpand(index)}
                        className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                          isSubExpanded
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        }`}
                        title={isSubExpanded ? "Collapse subcategories" : "Edit subcategories"}
                        aria-expanded={isSubExpanded}
                        aria-label={isSubExpanded ? "Collapse subcategories" : "Edit subcategories"}
                      >
                        {isSubExpanded ? <FaChevronUp className="h-2.5 w-2.5" /> : <FaChevronDown className="h-2.5 w-2.5" />}
                        <span>Edit</span>
                      </button>
                    </div>
                  </td>

                  {/* Manual Sub Category — label driven by catalog component name */}
                  <td className={`${td} bg-white`}>
                    <input
                      type="text"
                      value={row.manualSub}
                      title={getManualSubLabel(row.component)}
                      placeholder={getManualSubPlaceholder(row.component) || getManualSubLabel(row.component)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (isFixedRow) {
                          const updated = [...fixedRows];
                          updated[kindIndex] = { ...updated[kindIndex], manualSub: val };
                          setFixedRows(updated);
                        } else {
                          const updated = [...extraRows];
                          updated[kindIndex] = { ...updated[kindIndex], manualSub: val };
                          setExtraRows(updated);
                        }
                      }}
                      className={inputCompact}
                    />
                  </td>

                  {["weight", "labour", "unitCost", "qty"].map((field) => {
                    // If Metacone row and this is quantity field — show computed read-only qty
                    if (field === "qty" && metaconeQty !== null) {
                      return (
                        <td key={field} className={`${td} ${fillHighlightClass}`}>
                          <NumericInput
                            value={isMetaconeMounting(row.component) ? computeMetaconeQty(allRows) : row.qty}
                            readOnly={isMetaconeMounting(row.component)}
                            className={`${inputCompact} bg-gray-100`}
                          />
                        </td>
                      );
                    }

                    // Check if this field is populated from Price Master
                    const isFromPriceMaster = (field === "weight" || field === "unitCost") && 
                      row.component && 
                      (() => {
                        const component = row.component;
                        const sub1 = row.sub1 || '';
                        const sub2 = row.sub2 || '';
                        const sub3 = row.sub3 || '';
                        const sub4 = row.sub4 || '';
                        const sub5 = row.sub5 || '';
                        
                        const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
                        const partialKeys = [
                          `${component}|${sub1}|${sub2}|${sub3}|${sub4}`,
                          `${component}|${sub1}|${sub2}|${sub3}`,
                          `${component}|${sub1}|${sub2}`,
                          `${component}|${sub1}`,
                          `${component}`
                        ];
                        
                        return priceMasterData[priceKey] || partialKeys.some(key => priceMasterData[key]);
                      })();

                    // Check for price drift (orange highlighting)
                    const hasPriceDrift = field === "unitCost" && checkPriceDrift(row);

                    const fieldEditable =
                      field === "weight"
                        ? isWeightFieldEditable(row.component)
                        : field === "labour"
                          ? isLabourFieldEditable(row.component)
                          : true;

                    const highlightField = field === "qty" || field === "unitCost";

                    return (
                        <td
                          key={field}
                          className={`${td} relative ${highlightField ? fillHighlightClass : "bg-white"}`}
                        >
                        <div className="relative">
                          <NumericInput
                            value={row[field]}
                            readOnly={!fieldEditable}
                            aria-label={
                              field === "weight"
                                ? getWeightColumnLabel(row.component)
                                : field === "labour"
                                  ? "Labour cost"
                                  : field
                            }
                            onChange={(val) => {
                              if (!fieldEditable) return;
                              const numeric = val === "" ? "" : parseNumericInput(val, val);

                              if (isFixedRow) {
                                const updated = [...fixedRows];
                                updated[kindIndex] = { ...updated[kindIndex], [field]: numeric };
                                setFixedRows(updated);
                              } else {
                                const updated = [...extraRows];
                                updated[kindIndex] = { ...updated[kindIndex], [field]: numeric };
                                setExtraRows(updated);
                              }
                            }}
                            className={`${inputCompact} ${
                              !fieldEditable
                                ? "bg-gray-100 text-gray-500"
                                : hasPriceDrift
                                  ? "bg-orange-200 border-orange-400"
                                  : isFromPriceMaster
                                    ? "bg-blue-50 border-blue-200"
                                    : ""
                            }`}
                          />
                          {hasPriceDrift && (
                            <div 
                              className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full cursor-help z-10" 
                              title={`Price Changed! Saved: ₹${row.original_unit_cost}, Master: ₹${(() => {
                                const component = row.component;
                                const sub1 = row.sub1 || '';
                                const sub2 = row.sub2 || '';
                                const sub3 = row.sub3 || '';
                                const sub4 = row.sub4 || '';
                                const sub5 = row.sub5 || '';
                                const priceKey = `${component}|${sub1}|${sub2}|${sub3}|${sub4}|${sub5}`;
                                return priceMasterData[priceKey]?.unit_cost || 'N/A';
                              })()}`}
                            ></div>
                          )}
                          {isFromPriceMaster && !hasPriceDrift && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" title="Auto-filled from Price Master"></div>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {/* Total */}
                  <td className={`${td} relative text-right font-semibold tabular-nums ${fillHighlightClass}`}>
                    <span className="whitespace-nowrap">₹ {formatCurrency(calculateTotal(row))}</span>
                    {checkTotalDrift(row) && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" title="Total needs recalculation due to price/weight changes in Price Master"></div>
                    )}
                  </td>

                  {/* Remark */}
                  <td className={`${td} bg-white w-[12rem] min-w-[10rem] max-w-[14rem] overflow-hidden align-top`}>
                    <AutoGrowRemark
                      value={row.remark || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (isFixedRow) {
                          const updated = [...fixedRows];
                          updated[kindIndex] = { ...updated[kindIndex], remark: val };
                          setFixedRows(updated);
                        } else {
                          const updated = [...extraRows];
                          updated[kindIndex] = { ...updated[kindIndex], remark: val };
                          setExtraRows(updated);
                        }
                      }}
                      className={inputCompact}
                    />
                  </td>

                  {/* Action: delete any line (fixed lines stay omitted for this tender in this browser) */}
                  <td className={`${td} bg-white text-center`}>
                    <button
                      type="button"
                      onClick={() => removeCostingRowAt(index)}
                      className="rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-800"
                      title="Remove this line"
                      aria-label="Remove line"
                    >
                      <FaTrash className="inline h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>

                {isSubExpanded ? (
                  <tr className="bg-slate-50">
                    <td colSpan={COSTING_COL_COUNT} className="border border-slate-200 px-3 py-2.5">
                      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-slate-800">
                            Subcategories — {displayAliases[row.component] || row.component || "Line"}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleSubExpand(index)}
                            className="text-[10px] font-medium text-slate-500 hover:text-slate-800"
                          >
                            Collapse
                          </button>
                        </div>
                        <div className="flex max-w-xl flex-col gap-2.5">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div key={level} className="min-w-0">
                              {renderSubColumn(level, row, kindIndex, isFixedRow, { labeled: true })}
                            </div>
                          ))}
                        </div>
                        {!isFixedRow ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Extra lines use Manual Sub / Make / Brand. Catalog subcategory dropdowns apply to fixed components.
                          </p>
                        ) : null}
                        {subSummary ? (
                          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-700">Selected path: </span>
                            {subSummary}
                          </p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Buttons and totals */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={fixedRows.length + extraRows.length >= MAX_COSTING_SHEET_LINES}
          className="text-blue-600 hover:underline text-sm sm:text-base disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
        >
          + Add a line
        </button>
        <span className="text-xs text-slate-600">
          Max {MAX_COSTING_SHEET_LINES} lines ({fixedRows.length + extraRows.length}/{MAX_COSTING_SHEET_LINES} used)
        </span>
      </div>
      <div className="font-bold text-sm sm:text-base">
        Total Fabrication Cost Without Margin (excluding chassis): ₹ {formatCurrency(grandTotal)}
      </div>

      <CostingSummary
        grandTotal={grandTotal}
        chassisTotal={chassisTotal}
        accessoriesTotal={accessoriesTotal}
        tenderId={tenderId}
        tenderSource={tenderSource}
        onExportExcel={handleExportExcel}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="order-first w-full text-xs font-medium text-emerald-700 sm:order-none sm:w-auto">
          Auto-save on{autoSaveHint ? ` · ${autoSaveHint}` : ""}
        </span>
        <Link
          to="/app/fire-tender/costing-hub/costing"
          className="px-5 py-2.5 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition text-sm sm:text-base"
        >
          Back to Costing List
        </Link>

        <button
          onClick={saveTender}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition text-sm sm:text-base"
        >
          Save Costing Tender
        </button>

      </div>

    </div>
  );
};

export default CostingTable;
