// src/pages/CostingTable.jsx
import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CostingSummary from "./CostingSummary";
import { FaTrash } from "react-icons/fa";
import { supabase } from "../../lib/supabase";
import auditLogger from "../../lib/auditLogger";
import { isRetiredFireTenderMainComponentLabel } from "../../lib/retiredFireTenderMainComponents";

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

const CostingTable = ({ tenderId, accessoriesTotal: accessoriesTotalProp }) => {
  const [componentTree, setComponentTree] = useState({});
  const [fixedRows, setFixedRows] = useState([]);
  const [extraRows, setExtraRows] = useState([]);
  const [mocPrices, setMocPrices] = useState({}); // key: moc, value: price
  const [priceMasterData, setPriceMasterData] = useState({});
  const [priceDriftData, setPriceDriftData] = useState({});

  const [showDriftMonitor, setShowDriftMonitor] = useState(false);

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

        // 1️⃣ Fetch main components tree
        const { data: mainData, error: mainError } = await supabase.from("main_components").select("*");
        if (mainError) throw mainError;
        const mainRows = (mainData || []).filter((r) => !isRetiredFireTenderMainComponentLabel(r.main_component));
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

        const omittedMain = new Set(loadOmittedMainComponents(Number(tenderId)));

        // Build fixed rows (only main components)
        Object.keys(tree).forEach((comp) => {
          // Skip "Tender Mode" as it should only be in CostingSummary
          if (comp === "Tender Mode") return;
          if (omittedMain.has(comp)) return;

          const rowFromDB = existingRows.find((r) => r.main_component === comp);
          let unitCost = rowFromDB?.unit_cost || 0;
          let weight = rowFromDB?.weight || 0;

          // If sub1 exists and matches MOC, overwrite unitCost
          if (rowFromDB?.sub_category1) {
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
            original_unit_cost: rowFromDB?.original_unit_cost,
            original_weight: rowFromDB?.original_weight
          });
        });

        // Extra rows (rows not in main_components)
        existingRows.forEach((r) => {
          // Skip "Tender Mode" as it should only be in CostingSummary
          if (r.main_component === "Tender Mode") return;
          if (omittedMain.has(r.main_component)) return;

          if (!tree[r.main_component]) {
            let unitCost = r.unit_cost || 0;
            let weight = r.weight || 0;

            if (r.sub_category1) {
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
        alert("Error loading tender data: " + (err.message || err));
      }
    };

    fetchData();
  }, [tenderId]);


  const addRow = () => {
    if (fixedRows.length + extraRows.length >= MAX_COSTING_SHEET_LINES) {
      alert(`The costing sheet is limited to ${MAX_COSTING_SHEET_LINES} lines (Sr. 1–${MAX_COSTING_SHEET_LINES}). Remove a line or shorten the main-component list to add more.`);
      return;
    }
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
      },
    ]);
  };

  const removeCostingRowAt = (index) => {
    const total = fixedRows.length + extraRows.length;
    if (index < 0 || index >= total) return;

    if (index < fixedRows.length) {
      const comp = fixedRows[index]?.component;
      if (!comp) return;
      if (
        !window.confirm(
          `Remove line ${index + 1} (“${comp}”) from this tender’s costing sheet?\n\nIt will stay hidden for this tender on this browser until you clear site data.`
        )
      ) {
        return;
      }
      const list = loadOmittedMainComponents(Number(tenderId));
      if (!list.includes(comp)) {
        list.push(comp);
        saveOmittedMainComponents(Number(tenderId), list);
      }
      setFixedRows((prev) => prev.filter((_, i) => i !== index));
      return;
    }

    const extraIndex = index - fixedRows.length;
    if (!window.confirm(`Remove extra line ${index + 1}?`)) return;
    setExtraRows((prev) => prev.filter((_, i) => i !== extraIndex));
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


  // Replace isWaterTank with this
  const isTankComponent = (component) => {
    if (!component) return false;
    const normalized = component.toString().toLowerCase().replace(/\s+/g, "");
    // match variants: watertank, foamtank, or "foam" + "tank" anywhere
    return (
      normalized.includes("watertank") ||
      normalized.includes("foamtank") ||
      (normalized.includes("foam") && normalized.includes("tank"))
    );
  };

  // --- NEW HELPERS for Metacone calculation ---
  const normalize = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, "");

  const isMetaconeMounting = (component) => {
    const n = normalize(component);
    // matches 'metacone', 'metacone mounting', etc.
    return n.includes("metacone");
  };

  const isWaterTank = (component) => {
    const n = normalize(component);
    // water + tank but not foam
    return n.includes("watertank") || (n.includes("water") && n.includes("tank") && !n.includes("foam"));
  };

  const isFoamTank = (component) => {
    const n = normalize(component);
    return n.includes("foamtank") || (n.includes("foam") && n.includes("tank"));
  };


  const parseNumber = (v) => {
    // parse numeric strings, fallback to 0
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const isStructureOrPanelling = (component) => {
    if (!component) return false;
    const n = component.toString().toLowerCase();
    return n.includes("structure") || n.includes("panelling");
  };

  // --- END NEW HELPERS ---

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const allRows = [...fixedRows, ...extraRows];

  // NEW: compute quantity for Metacone from existing water+foam rows
  const computeMetaconeQty = (rows) => {
    let waterWeightSum = 0;
    let foamWeightSum = 0;
    let waterSub2Sum = 0;
    let foamSub2Sum = 0;

    rows.forEach((r) => {
      if (!r) return;
      if (isWaterTank(r.component)) {
        waterWeightSum += Number(r.weight) || 0;
        waterSub2Sum += parseNumber(r.sub2);
      }
      if (isFoamTank(r.component)) {
        foamWeightSum += Number(r.weight) || 0;
        foamSub2Sum += parseNumber(r.sub2);
      }
    });

    const total = waterWeightSum + foamWeightSum + waterSub2Sum + foamSub2Sum;
    // ✅ Round UP to nearest integer
    return total > 0 ? Math.ceil(total / 550) : 0;
  };


  // Updated calculateTotal to support Metacone special formula
  const calculateTotal = (row) => {
    const labour = row.labour === "" ? 0 : Number(row.labour) || 0;
    const unitCost = row.unitCost === "" ? 0 : Number(row.unitCost) || 0;
    const qty = row.qty === "" ? 1 : Number(row.qty) || 1;
    const weight = row.weight === "" ? 0 : Number(row.weight) || 0;

    // METACONE special case: total = unitCost * computedQuantity + labour
    if (isMetaconeMounting(row.component)) {
      const computedQty = computeMetaconeQty(allRows);
      return unitCost * computedQty + labour;
    }

    // Tank weight-based formula preserved (unchanged)
    if (isTankComponent(row.component)) {
      // Weight-based tank formula: weight * (unitCost + labour) * qty
      return weight * (unitCost + labour) * qty;
    }

    // ✅ Structure & Panelling special formula
    if (isStructureOrPanelling(row.component)) {
      return weight * unitCost; // weight * unit cost = total
    }


    // Default behaviour for non-tank rows: (labour + unitCost) * qty
    return (labour + unitCost) * qty;
  };

  // Exclude chassis rows for total calculation
  const grandTotal = allRows
    .filter(row => row.component && !row.component.toLowerCase().includes("chassis"))
    .reduce((sum, row) => sum + calculateTotal(row), 0);

  // Calculate chassis total
  const chassisTotal = allRows
    .filter(row => row.component && row.component.toLowerCase().includes('chassis'))
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
      if (!silent) alert("No tender selected. Please open a Tender before saving.");
      return;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.error("Auth error:", userErr);
      if (!silent) alert("User not authenticated. Please login.");
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
    const allToSave = [...fSave, ...eSave];

    await supabase.from("costing_rows").delete().eq("tender_id", Number(tenderId));

    const rowsToInsert = allToSave
      .filter((row) => !isRetiredFireTenderMainComponentLabel(row.component))
      .map((row) => {
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
        total = weight * unitCost;
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
        user_id: userId,
        original_unit_cost: unitCost,
        original_weight: weight,
        costing_saved_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from("costing_rows").insert(rowsToInsert).select();

    if (error) {
      console.error("Insert error:", error);
      if (!silent) alert("Error saving tender ❌: " + error.message);
      else setAutoSaveHint("Save failed — " + (error.message || "error"));
      throw error;
    }

    if (!silent) {
      console.log("Insert success");
      alert("Costing rows saved successfully ✅");
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
      const omittedMain = new Set(loadOmittedMainComponents(Number(tenderId)));

      Object.keys(componentTree).forEach((comp) => {
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
        });
      });

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
      alert("Error saving tender ❌: " + (err.message || err));
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




  return (
    <div className="space-y-4">
      <div className="bg-white p-4 sm:p-6 shadow rounded-lg w-full">
        <div className="overflow-x-auto">
        <table className="border-collapse border text-xs sm:text-sm min-w-full">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="border px-2 py-1">Sr. No.</th>
              <th className="border px-2 py-1">Main Cost Component</th>
              <th className="border px-2 py-1">Sub Category 1</th>
              <th className="border px-2 py-1">Sub Category 2</th>
              <th className="border px-2 py-1">Sub Category 3</th>
              <th className="border px-2 py-1">Sub Category 4</th>
              <th className="border px-2 py-1">Sub Category 5</th>
              <th className="border px-2 py-1">Manual Sub Category</th>
              <th className="border px-2 py-1">Weight</th>
              <th className="border px-2 py-1">Labour Cost</th>
              <th className="border px-2 py-1">Unit Cost/Price of metal</th>
              <th className="border px-2 py-1">Quantity</th>
              <th className="border px-2 py-1">Total Price</th>
              <th className="border px-2 py-1">Remark</th>
              <th className="border px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, index) => {
              const metaconeQty = isMetaconeMounting(row.component) ? computeMetaconeQty(allRows) : null;

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-center">{index + 1}</td>

                  {/* Main Component */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      <span className="font-semibold">{row.component}</span>
                    ) : (
                      <input
                        type="text"
                        value={row.component}
                        onChange={(e) =>
                          handleChange(
                            extraRows,
                            setExtraRows,
                            index - fixedRows.length,
                            "component",
                            e.target.value
                          )
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>

                  {/* Sub Category 1 */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      (() => {
                        // ✅ compute available options safely
                        const availableOptions = Object.keys(componentTree[row.component] || {});

                        // ✅ if options exist -> show dropdown
                        if (availableOptions && availableOptions.length > 0) {
                          return (
                            <select
                              value={row.sub1}
                              onChange={(e) =>
                                handleChange(fixedRows, setFixedRows, index, "sub1", e.target.value)
                              }
                              className="w-full p-1 border rounded"
                            >
                              <option value="">-- Select --</option>
                              {availableOptions.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          );
                        }
                        return (
                          <input
                            type="text"
                            value={row.sub1}
                            onChange={(e) =>
                              handleChange(fixedRows, setFixedRows, index, "sub1", e.target.value)
                            }
                            className="w-full p-1 border rounded"
                          />
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        value={row.sub1}
                        onChange={(e) =>
                          handleChange(extraRows, setExtraRows, index - fixedRows.length, "sub1", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>


                  {/* Sub Category 2 */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      (() => {
                        // ✅ compute available options safely
                        const availableOptions =
                          row.sub1 &&
                          Object.keys(componentTree[row.component]?.[row.sub1] || {});

                        // ✅ if options exist -> show dropdown
                        if (availableOptions && availableOptions.length > 0) {
                          return (
                            <select
                              value={row.sub2}
                              onChange={(e) =>
                                handleChange(fixedRows, setFixedRows, index, "sub2", e.target.value)
                              }
                              className="w-full p-1 border rounded"
                            >
                              <option value="">-- Select --</option>
                              {availableOptions.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          );
                        }

                        // ❌ if no options -> show plain input
                        return (
                          <input
                            type="text"
                            value={row.sub2}
                            onChange={(e) =>
                              handleChange(fixedRows, setFixedRows, index, "sub2", e.target.value)
                            }
                            className="w-full p-1 border rounded"
                          />
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        value={row.sub2}
                        onChange={(e) =>
                          handleChange(extraRows, setExtraRows, index - fixedRows.length, "sub2", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>


                  {/* Sub Category 3 */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      (() => {
                        // ✅ compute available options safely
                        const availableOptions =
                          row.sub1 &&
                          row.sub2 &&
                          Object.keys(componentTree[row.component]?.[row.sub1]?.[row.sub2] || {});

                        // ✅ if options exist -> show dropdown
                        if (availableOptions && availableOptions.length > 0) {
                          return (
                            <select
                              value={row.sub3}
                              onChange={(e) =>
                                handleChange(fixedRows, setFixedRows, index, "sub3", e.target.value)
                              }
                              className="w-full p-1 border rounded"
                            >
                              <option value="">-- Select --</option>
                              {availableOptions.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          );
                        }

                        // ❌ if no options -> show plain input
                        return (
                          <input
                            type="text"
                            value={row.sub3}
                            onChange={(e) =>
                              handleChange(fixedRows, setFixedRows, index, "sub3", e.target.value)
                            }
                            className="w-full p-1 border rounded"
                          />
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        value={row.sub3}
                        onChange={(e) =>
                          handleChange(extraRows, setExtraRows, index - fixedRows.length, "sub3", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>


                  {/* Sub Category 4 */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      (() => {
                        // ✅ compute available options safely
                        const availableOptions =
                          row.sub1 &&
                          row.sub2 &&
                          row.sub3 &&
                          Object.keys(
                            componentTree[row.component]?.[row.sub1]?.[row.sub2]?.[row.sub3] || {}
                          );

                        // ✅ if options exist -> show dropdown
                        if (availableOptions && availableOptions.length > 0) {
                          return (
                            <select
                              value={row.sub4}
                              onChange={(e) =>
                                handleChange(fixedRows, setFixedRows, index, "sub4", e.target.value)
                              }
                              className="w-full p-1 border rounded"
                            >
                              <option value="">-- Select --</option>
                              {availableOptions.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          );
                        }

                        // ❌ if no options -> show plain input
                        return (
                          <input
                            type="text"
                            value={row.sub4}
                            onChange={(e) =>
                              handleChange(fixedRows, setFixedRows, index, "sub4", e.target.value)
                            }
                            className="w-full p-1 border rounded"
                          />
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        value={row.sub4}
                        onChange={(e) =>
                          handleChange(extraRows, setExtraRows, index - fixedRows.length, "sub4", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>


                  {/* Sub Category 5 */}
                  <td className="border px-2 py-1">
                    {index < fixedRows.length ? (
                      (() => {
                        // ✅ compute available options safely
                        const availableOptions =
                          row.sub1 &&
                          row.sub2 &&
                          row.sub3 &&
                          row.sub4 &&
                          Object.keys(
                            componentTree[row.component]?.[row.sub1]?.[row.sub2]?.[row.sub3]?.[row.sub4] || {}
                          );

                        // ✅ if options exist -> show dropdown
                        if (availableOptions && availableOptions.length > 0) {
                          return (
                            <select
                              value={row.sub5}
                              onChange={(e) =>
                                handleChange(fixedRows, setFixedRows, index, "sub5", e.target.value)
                              }
                              className="w-full p-1 border rounded"
                            >
                              <option value="">-- Select --</option>
                              {availableOptions.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                            </select>
                          );
                        }

                        // ❌ if no options -> show plain input
                        return (
                          <input
                            type="text"
                            value={row.sub5}
                            onChange={(e) =>
                              handleChange(fixedRows, setFixedRows, index, "sub5", e.target.value)
                            }
                            className="w-full p-1 border rounded"
                          />
                        );
                      })()
                    ) : (
                      <input
                        type="text"
                        value={row.sub5}
                        onChange={(e) =>
                          handleChange(extraRows, setExtraRows, index - fixedRows.length, "sub5", e.target.value)
                        }
                        className="w-full p-1 border rounded"
                      />
                    )}
                  </td>


                  {/* Manual Sub Category */}
                  <td className="border px-2 py-1">
                    <input
                      type="text"
                      value={row.manualSub}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (index < fixedRows.length) {
                          const updated = [...fixedRows];
                          updated[index] = { ...updated[index], manualSub: val };
                          setFixedRows(updated);
                        } else {
                          const extraIndex = index - fixedRows.length;
                          const updated = [...extraRows];
                          updated[extraIndex] = { ...updated[extraIndex], manualSub: val };
                          setExtraRows(updated);
                        }
                      }}
                      className="w-full p-1 border rounded"
                    />
                  </td>

                  {["weight", "labour", "unitCost", "qty"].map((field) => {
                    // If Metacone row and this is quantity field — show computed read-only qty
                    if (field === "qty" && metaconeQty !== null) {
                      return (
                        <td key={field} className="border px-2 py-1">
                          <input
                            type="number"
                            value={isMetaconeMounting(row.component) ? computeMetaconeQty(allRows) : row.qty}
                            readOnly={isMetaconeMounting(row.component)}
                            className="w-full p-1 border rounded bg-gray-100"
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

                    // Otherwise render normal editable input
                    return (
                      <td key={field} className="border px-2 py-1 relative">
                        <div className="relative">
                          <input
                            type="number"
                            value={row[field]}
                            onChange={(e) => {
                              const val = e.target.value;
                              const numeric = val === "" ? "" : Number(val);

                              if (index < fixedRows.length) {
                                const updated = [...fixedRows];
                                updated[index] = { ...updated[index], [field]: numeric };
                                setFixedRows(updated);
                              } else {
                                const extraIndex = index - fixedRows.length;
                                const updated = [...extraRows];
                                updated[extraIndex] = { ...updated[extraIndex], [field]: numeric };
                                setExtraRows(updated);
                              }
                            }}
                            className={`w-full p-1 border rounded ${
                              hasPriceDrift ? 'bg-orange-200 border-orange-400' : 
                              isFromPriceMaster ? 'bg-blue-50 border-blue-200' : ''
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
                  <td className={`border px-2 py-1 text-right relative ${
                    checkTotalDrift(row) ? 'bg-red-200 border-red-400' : ''
                  }`}>
                    ₹ {formatCurrency(calculateTotal(row))}
                    {checkTotalDrift(row) && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" title="Total needs recalculation due to price/weight changes in Price Master"></div>
                    )}
                  </td>

                  {/* Remark */}
                  <td className="border px-2 py-1">
                    <input
                      type="text"
                      value={row.remark}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (index < fixedRows.length) {
                          const updated = [...fixedRows];
                          updated[index] = { ...updated[index], remark: val };
                          setFixedRows(updated);
                        } else {
                          const extraIndex = index - fixedRows.length;
                          const updated = [...extraRows];
                          updated[extraIndex] = { ...updated[extraIndex], remark: val };
                          setExtraRows(updated);
                        }
                      }}
                      className="w-full p-1 border rounded"
                    />
                  </td>

                  {/* Action: delete any line (fixed lines stay omitted for this tender in this browser) */}
                  <td className="border px-2 text-center">
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

      <CostingSummary grandTotal={grandTotal} chassisTotal={chassisTotal} accessoriesTotal={accessoriesTotal} tenderId={tenderId} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {autoSaveHint ? (
          <span className="order-first w-full text-xs font-medium text-emerald-700 sm:order-none sm:w-auto" role="status">
            {autoSaveHint}
          </span>
        ) : null}
        <Link
          to="/app/fire-tender/costing"
          className="px-5 py-2.5 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition text-sm sm:text-base"
        >
          ⬅ Back to Costing List
        </Link>

        <button
          onClick={saveTender}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition text-sm sm:text-base"
        >
          💾 Save Costing Tender
        </button>

      </div>

    </div>
  );
};

export default CostingTable;
