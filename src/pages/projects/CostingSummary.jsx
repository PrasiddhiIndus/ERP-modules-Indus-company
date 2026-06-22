import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  FIRE_TENDER_APPROVER_MODULE_KEYS,
  userCanApproveInModules,
  userCanEditInModules,
} from "../../config/roles";
import { fetchQuotationByTenderId } from "../../lib/fireTenderShared";
import { NumericInput } from "../../components/NumericInput";
import {
  filterNetTotalRowsForSource,
  isGemPortalSource,
  parsePercentValue,
  applyGstInclusive,
  FIRE_TENDER_GST_RATE,
  costingSummarySupportsRemarkColumn,
  loadLocalNetTotalRemarks,
  saveLocalNetTotalRemarks,
} from "./fireTenderCostingConfig";

/** NET TOTAL row labels: A, B, … Z, then AA, AB, … (Excel-style). */
function indexToNetTotalLetters(i) {
  let n = i + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/** Read-only NET TOTAL line — legacy `costing_summary` rows (removed from UI; total shown on costing table). */
const LEGACY_ROW_FABRICATION_WITHOUT_MARGIN =
  "Total Fabrication Cost Without Margin (without chassis)";

/** NET TOTAL row label (replaces long IEVPL wording). */
const COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE =
  "Total fabrication cost  considering Overahead and finance cost";

/** Fabrication price line — also the "without chassis" amount for downstream totals when that row is omitted. */
const COMPONENT_TOTAL_PRICE_FABRICATION =
  "Total Price of fabrication with overall cost and margin (with out chassis)";

/** Gem line: `total` = Final Tender (inc. GST) × Tender Mode % ÷ 100 (not a manual ₹ entry). */
const COMPONENT_GEM_COST = "Total Price with chassis (Gem Cost)";

/** Legacy `costing_summary` row removed from UI. */
const LEGACY_ROW_TOTAL_PRICE_WITHOUT_CHASSIS = "Total Price without chassis ";

/** Legacy NET TOTAL rows removed from UI. */
const LEGACY_ROW_IMAXX = "Imaxx";
const LEGACY_ROW_FINAL_CHASSIS_BASIC =
  "Final price of Chassis (basic price) with temparory RTO reg.";

/** Legacy `costing_summary.component` value — mapped on load to new label. */
const LEGACY_COMPONENT_TOTAL_FABRICATION_IEVPL =
  "Total fabrication cost without IEVPL  margin(without chassis and with considering Overahead and finance cost)";

/** Legacy rupee-based IEVPL row — migrated to % on load. */
const LEGACY_IEVPL_MARGIN = "IEVPL Margin";

/** IEVPL margin as % of fabrication base (same as inflation / overhead rows). */
const COMPONENT_IEVPL_MARGIN_PCT = "IEVPL Margin %";

const COMPONENT_CHASSIS_MARGIN_PCT = "Chassis Margin %";
const COMPONENT_ACCESSORIES_MARGIN_PCT = "Accessories Margin %";

const COMPONENT_FINAL_TENDER_EX_GST = "Final Tender Cost (ex. GST)";

/** No checkbox for these NET TOTAL rows. */
const NET_TOTAL_NO_CHECKBOX = new Set([
  "Inflation Cost %",
  "Overhead cost %",
  "Financial cost%",
  "Cost of negogiation %",
  COMPONENT_IEVPL_MARGIN_PCT,
  "BD cost ",
  COMPONENT_CHASSIS_MARGIN_PCT,
  "RTO charges ",
  "Insurance ",
  COMPONENT_ACCESSORIES_MARGIN_PCT,
  "Tender Mode",
  COMPONENT_GEM_COST,
]);

/** Enter 0–100 (%); stored `unitCost` = %; `total` = rupees = fabrication × % / 100. */
const NET_TOTAL_PERCENT_OF_FABRICATION = new Set([
  "Inflation Cost %",
  "Overhead cost %",
  "Financial cost%",
  "Cost of negogiation %",
  COMPONENT_IEVPL_MARGIN_PCT,
]);

/** % of chassis base (from costing sheet chassis rows). */
const NET_TOTAL_PERCENT_OF_CHASSIS = new Set([COMPONENT_CHASSIS_MARGIN_PCT]);

/** % of accessories total (from accessories sheet). */
const NET_TOTAL_PERCENT_OF_ACCESSORIES = new Set([COMPONENT_ACCESSORIES_MARGIN_PCT]);

/** Enter amount in ₹; `unitCost` and `total` both = rupees (used directly in downstream sums). */
const NET_TOTAL_RUPEE_ENTRY = new Set(["BD cost ", "RTO charges ", "Insurance "]);

/** Tender Mode: enter a plain % (not % of fabrication); `total` is unused (kept 0). */
const NET_TOTAL_TENDER_MODE_PERCENT = new Set(["Tender Mode"]);

function clampPercent0to100(n) {
  return parsePercentValue(n);
}

function percentOfBaseToRupees(percent, fabricationTotal) {
  const base = Number(fabricationTotal) || 0;
  return (base * clampPercent0to100(percent)) / 100;
}

function normalizeSummaryComponentName(component) {
  if (component === LEGACY_IEVPL_MARGIN) return COMPONENT_IEVPL_MARGIN_PCT;
  if (component === LEGACY_COMPONENT_TOTAL_FABRICATION_IEVPL) {
    return COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE;
  }
  return component;
}

function migrateLegacyIevplRow(row, fabricationBase) {
  if (!row || row.component !== LEGACY_IEVPL_MARGIN) return row;
  const total = Number(row.total) || 0;
  const uc = Number(row.unitCost) || 0;
  const base = Number(fabricationBase) || 0;
  let pct = uc;
  if (total > 0 && base > 0 && (uc > 100 || total === uc)) {
    pct = (total / base) * 100;
  } else if (total > 0 && base > 0 && uc === 0) {
    pct = (total / base) * 100;
  }
  return {
    ...row,
    component: COMPONENT_IEVPL_MARGIN_PCT,
    unitCost: clampPercent0to100(pct),
    total: percentOfBaseToRupees(pct, base),
  };
}

function mergeSummaryRowsWithDefaults(defaultRows, loadedRows, fabricationBase) {
  const byComponent = new Map();
  loadedRows.forEach((row) => {
    const key = normalizeSummaryComponentName(row.component);
    const migrated =
      row.component === LEGACY_IEVPL_MARGIN
        ? migrateLegacyIevplRow(row, fabricationBase)
        : { ...row, component: key };
    byComponent.set(key, migrated);
  });
  return defaultRows.map((def) => {
    const saved = byComponent.get(def.component);
    return saved ? { ...def, ...saved, component: def.component } : { ...def };
  });
}

function formatInrLine(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function applyNetTotalDerivedTotals(updated, { grandTotal, chassisTotal, accessoriesTotal, showGemPortalRows }) {
  updated.forEach((row, i) => {
    if (NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component)) {
      const pct = clampPercent0to100(row.unitCost);
      updated[i].unitCost = pct;
      updated[i].total = percentOfBaseToRupees(pct, grandTotal);
    } else if (NET_TOTAL_PERCENT_OF_CHASSIS.has(row.component)) {
      const pct = clampPercent0to100(row.unitCost);
      updated[i].unitCost = pct;
      updated[i].total = percentOfBaseToRupees(pct, chassisTotal);
    } else if (NET_TOTAL_PERCENT_OF_ACCESSORIES.has(row.component)) {
      const pct = clampPercent0to100(row.unitCost);
      updated[i].unitCost = pct;
      updated[i].total = percentOfBaseToRupees(pct, accessoriesTotal);
    } else if (NET_TOTAL_RUPEE_ENTRY.has(row.component)) {
      const amt = Math.max(0, Number(row.unitCost) || 0);
      updated[i].unitCost = amt;
      updated[i].total = amt;
    } else if (NET_TOTAL_TENDER_MODE_PERCENT.has(row.component)) {
      const pct = clampPercent0to100(row.unitCost);
      updated[i].unitCost = pct;
      updated[i].total = 0;
    }
  });

  const totalFabricationIndex = updated.findIndex(
    (row) => row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE
  );
  if (totalFabricationIndex !== -1) {
    const inflationCost = updated.find((row) => row.component === "Inflation Cost %")?.total || 0;
    const financialCost = updated.find((row) => row.component === "Financial cost%")?.total || 0;
    const overheadCost = updated.find((row) => row.component === "Overhead cost %")?.total || 0;
    const negotiationCost = updated.find((row) => row.component === "Cost of negogiation %")?.total || 0;
    updated[totalFabricationIndex].total =
      inflationCost + financialCost + overheadCost + negotiationCost + grandTotal;
  }

  const totalPriceFabricationIndex = updated.findIndex(
    (row) => row.component === COMPONENT_TOTAL_PRICE_FABRICATION
  );
  if (totalPriceFabricationIndex !== -1) {
    const bdCost = updated.find((row) => row.component === "BD cost ")?.total || 0;
    const ievplMargin =
      updated.find((row) => row.component === COMPONENT_IEVPL_MARGIN_PCT)?.total || 0;
    const totalFabricationCost =
      updated.find((row) => row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE)?.total || 0;
    updated[totalPriceFabricationIndex].total = bdCost + ievplMargin + totalFabricationCost;
  }

  const chassisMargin =
    updated.find((row) => row.component === COMPONENT_CHASSIS_MARGIN_PCT)?.total || 0;
  const chassisPriceIndex = updated.findIndex((row) => row.component === "CHASSIS PRICE");
  if (chassisPriceIndex !== -1) {
    updated[chassisPriceIndex].total = chassisTotal + chassisMargin;
  }

  const accessoriesMargin =
    updated.find((row) => row.component === COMPONENT_ACCESSORIES_MARGIN_PCT)?.total || 0;
  const accessoriesIndex = updated.findIndex((row) => row.component === "ACCESSORIES");
  if (accessoriesIndex !== -1) {
    updated[accessoriesIndex].total = accessoriesTotal + accessoriesMargin;
  }

  const totalPriceWithChassisIndex = updated.findIndex(
    (row) => row.component === "Total Price with chassis "
  );
  if (totalPriceWithChassisIndex !== -1) {
    const h =
      updated.find((row) => row.component === COMPONENT_TOTAL_PRICE_FABRICATION)?.total || 0;
    const i = updated.find((row) => row.component === "CHASSIS PRICE")?.total || 0;
    const j = updated.find((row) => row.component === "RTO charges ")?.total || 0;
    const k = updated.find((row) => row.component === "Insurance ")?.total || 0;
    const l = updated.find((row) => row.component === "ACCESSORIES")?.total || 0;
    updated[totalPriceWithChassisIndex].total = h + i + j + k + l;
  }

  const totalPriceWithChassis =
    updated.find((row) => row.component === "Total Price with chassis ")?.total || 0;
  const totalPriceWithoutChassis =
    updated.find((row) => row.component === COMPONENT_TOTAL_PRICE_FABRICATION)?.total || 0;
  const quoteBaseExGst =
    totalPriceWithChassis === 0 ? totalPriceWithoutChassis : totalPriceWithChassis;

  const finalExIndex = updated.findIndex((row) => row.component === COMPONENT_FINAL_TENDER_EX_GST);
  if (finalExIndex !== -1) {
    updated[finalExIndex].total = quoteBaseExGst;
  }

  const finalTenderCostIndex = updated.findIndex(
    (row) => row.component === "Final Tender Cost (inc. GST)"
  );
  if (finalTenderCostIndex !== -1) {
    updated[finalTenderCostIndex].total = applyGstInclusive(quoteBaseExGst);
  }

  if (showGemPortalRows) {
    const gemCostIndex = updated.findIndex((row) => row.component === COMPONENT_GEM_COST);
    if (gemCostIndex !== -1) {
      const finalT =
        updated.find((row) => row.component === "Final Tender Cost (inc. GST)")?.total || 0;
      const modePct = clampPercent0to100(
        updated.find((row) => row.component === "Tender Mode")?.unitCost || 0
      );
      updated[gemCostIndex].total = (Number(finalT) || 0) * (modePct / 100);
      updated[gemCostIndex].unitCost = 0;
    }
  }

  updated.forEach((r, i) => {
    if (NET_TOTAL_NO_CHECKBOX.has(r.component)) {
      updated[i].include = true;
    }
  });

  return updated;
}

/**
 * Right-column copy: formula name + numbers showing how `row.total` is built.
 * Uses current `rows` so letter labels (H, I, …) match the live NET TOTAL order.
 */
function getNetTotalFormulaText(row, rows, ctx) {
  const { grandTotal, chassisTotal, accessoriesTotal } = ctx;
  const findR = (c) => rows.find((r) => r.component === c);
  const tot = (c) => Number(findR(c)?.total || 0);
  const uc = (c) => Number(findR(c)?.unitCost || 0);
  const letter = (c) => {
    const i = rows.findIndex((r) => r.component === c);
    return i >= 0 ? indexToNetTotalLetters(i) : "?";
  };
  const f = formatInrLine;
  const comp = row.component;

  if (NET_TOTAL_PERCENT_OF_FABRICATION.has(comp)) {
    const pct = clampPercent0to100(uc(comp));
    return `Formula: fabrication base × % ÷ 100\n₹${f(grandTotal)} × ${f(pct)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE) {
    const a = tot("Inflation Cost %");
    const b = tot("Overhead cost %");
    const c = tot("Financial cost%");
    const d = tot("Cost of negogiation %");
    return `Formula: ${letter("Inflation Cost %")}+${letter("Overhead cost %")}+${letter("Financial cost%")}+${letter("Cost of negogiation %")} + fabrication base\n₹${f(a)} + ₹${f(b)} + ₹${f(c)} + ₹${f(d)} + ₹${f(grandTotal)} = ₹${f(row.total)}`;
  }

  if (comp === "BD cost " || comp === "RTO charges " || comp === "Insurance ") {
    return `Formula: amount entered (₹)\n₹${f(row.total)} on this line`;
  }

  if (comp === COMPONENT_IEVPL_MARGIN_PCT) {
    const pct = clampPercent0to100(uc(comp));
    return `Formula: fabrication base × IEVPL % ÷ 100\n₹${f(grandTotal)} × ${f(pct)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_CHASSIS_MARGIN_PCT) {
    const pct = clampPercent0to100(uc(comp));
    return `Formula: chassis base × Chassis margin % ÷ 100\n₹${f(chassisTotal)} × ${f(pct)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_ACCESSORIES_MARGIN_PCT) {
    const pct = clampPercent0to100(uc(comp));
    return `Formula: accessories total × Accessories margin % ÷ 100\n₹${f(accessoriesTotal)} × ${f(pct)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_GEM_COST) {
    const finalT = tot("Final Tender Cost (inc. GST)");
    const mode = clampPercent0to100(uc("Tender Mode"));
    return `Formula: Final Tender (inc. GST) × Tender Mode % ÷ 100\n₹${f(finalT)} × ${f(mode)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_TOTAL_PRICE_FABRICATION) {
    const bd = tot("BD cost ");
    const ie = tot(COMPONENT_IEVPL_MARGIN_PCT);
    const fab = tot(COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE);
    const le = letter(COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE);
    return `Formula: BD + IEVPL % + line ${le} (fabrication + overhead…)\n₹${f(bd)} + ₹${f(ie)} + ₹${f(fab)} = ₹${f(row.total)}`;
  }

  if (comp === "CHASSIS PRICE") {
    const margin = tot(COMPONENT_CHASSIS_MARGIN_PCT);
    return `Formula: chassis rows on costing sheet + Chassis margin %\n₹${f(chassisTotal)} + ₹${f(margin)} = ₹${f(row.total)}`;
  }

  if (comp === "ACCESSORIES") {
    const margin = tot(COMPONENT_ACCESSORIES_MARGIN_PCT);
    return `Formula: Σ accessories + Accessories margin %\n₹${f(accessoriesTotal)} + ₹${f(margin)} = ₹${f(row.total)}`;
  }

  if (comp === "Total Price with chassis ") {
    const h = COMPONENT_TOTAL_PRICE_FABRICATION;
    const hT = tot(h);
    const iT = tot("CHASSIS PRICE");
    const jT = tot("RTO charges ");
    const kT = tot("Insurance ");
    const lT = tot("ACCESSORIES");
    return `Formula: H + I + J + K + L\n${letter(h)} ₹${f(hT)} + ${letter("CHASSIS PRICE")} ₹${f(iT)} + ${letter("RTO charges ")} ₹${f(jT)} + ${letter("Insurance ")} ₹${f(kT)} + ${letter("ACCESSORIES")} ₹${f(lT)} = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_FINAL_TENDER_EX_GST) {
    const m = tot("Total Price with chassis ");
    const h = tot(COMPONENT_TOTAL_PRICE_FABRICATION);
    const base = m === 0 ? h : m;
    const which = m === 0 ? letter(COMPONENT_TOTAL_PRICE_FABRICATION) : letter("Total Price with chassis ");
    return `Formula: quotation base (ex. GST)\nUses line ${which}: ₹${f(base)}`;
  }

  if (comp === "Final Tender Cost (inc. GST)") {
    const ex = tot(COMPONENT_FINAL_TENDER_EX_GST);
    const pct = Math.round(FIRE_TENDER_GST_RATE * 100);
    return `Formula: Final Tender (ex. GST) × ${1 + FIRE_TENDER_GST_RATE} (${pct}% GST)\n₹${f(ex)} × ${1 + FIRE_TENDER_GST_RATE} = ₹${f(row.total)}`;
  }

  if (comp === "Tender Mode") {
    return `Formula: tender % (0–100)\n${f(clampPercent0to100(uc(comp)))}% — used as: Gem cost = Final Tender (inc. GST) × this % ÷ 100`;
  }

  return "—";
}

const CostingSummary = ({
  grandTotal = 0,
  chassisTotal = 0,
  accessoriesTotal = 0,
  tenderId,
  tenderSource = "",
  onExportExcel,
}) => {
  const showGemPortalRows = isGemPortalSource(tenderSource);
  console.log("CostingSummary component loaded with new checklist items");
  const { userProfile, accessibleModules } = useAuth();
  const canApproveQuotation = userCanApproveInModules(
    userProfile,
    accessibleModules,
    FIRE_TENDER_APPROVER_MODULE_KEYS
  );
  const canEditSummary = userCanEditInModules(
    userProfile,
    accessibleModules,
    FIRE_TENDER_APPROVER_MODULE_KEYS
  );
  const defaultNetTotalRows = () => [
    { component: "Inflation Cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Overhead cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Financial cost%", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Cost of negogiation %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_IEVPL_MARGIN_PCT, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "BD cost ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_TOTAL_PRICE_FABRICATION, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_CHASSIS_MARGIN_PCT, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "CHASSIS PRICE", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "RTO charges ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Insurance ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_ACCESSORIES_MARGIN_PCT, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "ACCESSORIES", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Total Price with chassis ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_FINAL_TENDER_EX_GST, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Final Tender Cost (inc. GST)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: "Tender Mode", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
    { component: COMPONENT_GEM_COST, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false, remark: "" },
  ];

  const [rows, setRows] = useState(defaultNetTotalRows);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryAutoHint, setSummaryAutoHint] = useState("");
  const skipSummaryAutosaveRef = useRef(true);
  const [remarkColumnSupported, setRemarkColumnSupported] = useState(true);

  useEffect(() => {
    skipSummaryAutosaveRef.current = true;
  }, [tenderId]);

  // Load existing data when tenderId changes
  useEffect(() => {
    if (!tenderId) return;
    loadSummaryData();
  }, [tenderId]);

  const loadSummaryData = async () => {
    setLoading(true);
    try {
      const supportsRemark = await costingSummarySupportsRemarkColumn(supabase);
      setRemarkColumnSupported(supportsRemark);
      const localRemarks = supportsRemark ? {} : loadLocalNetTotalRemarks(tenderId);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Auth error:", userError);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("costing_summary")
        .select("*")
        .eq("tender_id", Number(tenderId));

      if (error) throw error;

      if (data && data.length > 0) {
        const filtered = data.filter(
          (item) =>
            item.component !== LEGACY_ROW_FABRICATION_WITHOUT_MARGIN &&
            item.component !== LEGACY_ROW_TOTAL_PRICE_WITHOUT_CHASSIS &&
            item.component !== LEGACY_ROW_IMAXX &&
            item.component !== LEGACY_ROW_FINAL_CHASSIS_BASIC
        );
        const loadedRows = filtered.map((item) => {
          let component = normalizeSummaryComponentName(item.component);
          let unitCost = Number(item.unit_cost) || 0;
          let total = Number(item.total) || 0;
          if (component === "Tender Mode") {
            if (unitCost === 0 && (total === 0 || total === 1)) {
              unitCost = total === 1 ? 5 : 0;
            }
            total = 0;
            unitCost = clampPercent0to100(unitCost);
          }
          return {
            component,
            unitCost,
            unitRate: Number(item.unit_rate) || 0,
            qty: Number(item.qty) || 1,
            total,
            include: NET_TOTAL_NO_CHECKBOX.has(component) ? true : item.include === true,
            remark: supportsRemark ? item.remark || "" : localRemarks[component] || "",
          };
        });
        setRows(mergeSummaryRowsWithDefaults(defaultNetTotalRows(), loadedRows, grandTotal));
        skipSummaryAutosaveRef.current = true;
      } else {
        const defaults = defaultNetTotalRows().map((row) => ({
          ...row,
          remark: localRemarks[row.component] || "",
        }));
        setRows(defaults);
        skipSummaryAutosaveRef.current = true;
      }
    } catch (err) {
      console.error("Error loading summary data:", err);
    } finally {
      setLoading(false);
      skipSummaryAutosaveRef.current = true;
    }
  };

  const persistSummaryData = async ({ silent = false } = {}) => {
    if (!tenderId) {
      if (!silent) alert("No tender selected. Please open a tender before saving.");
      return;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.error("Auth error:", userErr);
      if (!silent) alert("User not authenticated. Please login.");
      else setSummaryAutoHint("NET TOTAL: could not save — not signed in.");
      return;
    }

    const userId = user.id;

    const supportsRemark = await costingSummarySupportsRemarkColumn(supabase);
    setRemarkColumnSupported(supportsRemark);

    const { data: backupSummary, error: backupErr } = await supabase
      .from("costing_summary")
      .select("*")
      .eq("tender_id", Number(tenderId));

    if (backupErr) throw backupErr;

    const { error: deleteError } = await supabase
      .from("costing_summary")
      .delete()
      .eq("tender_id", Number(tenderId));

    if (deleteError) throw deleteError;

    const payload = filterNetTotalRowsForSource(rows, tenderSource).map((row) => {
      const item = {
        tender_id: Number(tenderId),
        component: row.component,
        unit_cost: Number(row.unitCost) || 0,
        unit_rate: Number(row.unitRate) || 0,
        qty: Number(row.qty) || 1,
        total: Number(row.total) || 0,
        include: NET_TOTAL_NO_CHECKBOX.has(row.component) ? true : row.include === true,
        user_id: userId,
      };
      if (supportsRemark) {
        item.remark = row.remark || null;
      }
      return item;
    });

    if (!supportsRemark) {
      const remarksByComponent = {};
      filterNetTotalRowsForSource(rows, tenderSource).forEach((row) => {
        if (row.remark) remarksByComponent[row.component] = row.remark;
      });
      saveLocalNetTotalRemarks(tenderId, remarksByComponent);
    }

    const { error } = await supabase.from("costing_summary").insert(payload);

    if (error) {
      if (backupSummary?.length) {
        const restorePayload = backupSummary.map((r) => {
          const { id, created_at, updated_at, ...rest } = r;
          if (!supportsRemark) delete rest.remark;
          return rest;
        });
        await supabase.from("costing_summary").insert(restorePayload);
      }
      throw error;
    }

    if (!silent) {
      alert("✅ Costing summary saved successfully!");
    } else {
      const t = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      setSummaryAutoHint(`NET TOTAL saved · ${t}`);
      window.setTimeout(() => setSummaryAutoHint(""), 5000);
    }
  };

  const saveSummaryData = async () => {
    setSaving(true);
    try {
      await persistSummaryData({ silent: false });
    } catch (err) {
      console.error("Save error:", err);
      alert("❌ Failed to save costing summary: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!tenderId || loading) return;
    if (skipSummaryAutosaveRef.current) {
      skipSummaryAutosaveRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await persistSummaryData({ silent: true });
        } catch (e) {
          console.error("NET TOTAL auto-save:", e);
          setSummaryAutoHint("NET TOTAL: auto-save failed");
          window.setTimeout(() => setSummaryAutoHint(""), 6000);
        }
      })();
    }, 2000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced persist uses latest `rows` from closure
  }, [rows, tenderId, loading]);

  const approveForQuotation = async () => {
    if (!canApproveQuotation) {
      alert("Only managers and admins with Fire Tender access can approve into quotation.");
      return;
    }
    if (!tenderId) {
      alert("No tender selected. Please open a tender before approving.");
      return;
    }

    const checkedItems = filterNetTotalRowsForSource(rows, tenderSource).filter(
      (row) => row.include !== false
    );

    if (checkedItems.length === 0) {
      alert("Please select at least one item to approve for quotation.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        console.error("Auth error:", userErr);
        alert("User not authenticated. Please login.");
        return;
      }

      const userId = user.id;

      // 🔹 1️⃣ Replace approved items for this tender (shared team workflow)
      await supabase
        .from("approved_quotation_items")
        .delete()
        .eq("tender_id", Number(tenderId));

      // 🔹 2️⃣ Insert approved items
      const payload = checkedItems.map((row) => ({
        tender_id: Number(tenderId),
        component: row.component,
        unit_cost: Number(row.unitCost) || 0,
        unit_rate: Number(row.unitRate) || 0,
        qty: Number(row.qty) || 1,
        total: Number(row.total) || 0,
        include: true,
        user_id: userId,
      }));

      const { error: insertError } = await supabase
        .from("approved_quotation_items")
        .insert(payload);

      if (insertError) throw insertError;

      // 🔹 3️⃣ Ensure one quotation row per tender (unique on tender_id)
      const existingQuotation = await fetchQuotationByTenderId(supabase, tenderId);

      if (!existingQuotation) {
        const { count, error: countError } = await supabase
          .from("quotations")
          .select("*", { count: "exact", head: true });

        if (countError) throw countError;

        const paddedIndex = String((count || 0) + 1).padStart(4, "0");
        const quotationNumber = `QN/IFSPL/FT/${paddedIndex}`;

        const { error: quotationInsertError } = await supabase.from("quotations").insert([
          {
            tender_id: Number(tenderId),
            quotation_number: quotationNumber,
            base_quotation_no: quotationNumber,
            version: 0,
            user_id: userId,
          },
        ]);

        if (quotationInsertError) throw quotationInsertError;

        alert(`✅ Quotation created: ${quotationNumber}`);
      } else {
        alert(`✅ Quotation already exists: ${existingQuotation.quotation_number}`);
      }

      alert(`✅ ${checkedItems.length} items approved for quotation successfully!`);
    } catch (err) {
      console.error("Approve error:", err);
      alert("❌ Failed to approve items for quotation: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Apply costing-table totals into NET TOTAL rows. Re-run when `loading` clears so
  // `costing_summary` load does not leave CHASSIS PRICE / accessories stuck at DB values.
  useEffect(() => {
    if (loading) return;
    setRows((prevRows) =>
      applyNetTotalDerivedTotals([...prevRows], {
        grandTotal,
        chassisTotal,
        accessoriesTotal,
        showGemPortalRows,
      })
    );
  }, [grandTotal, chassisTotal, accessoriesTotal, loading, showGemPortalRows]);

  // Update row values
  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    const currentRow = updated[index];

    if (field === "include" && NET_TOTAL_NO_CHECKBOX.has(currentRow.component)) {
      return;
    }

    if (field === "remark") {
      updated[index].remark = value;
      setRows(updated);
      return;
    }

    // List of read-only items that should not have their totals recalculated
    const readOnlyItems = [
      COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE,
      COMPONENT_TOTAL_PRICE_FABRICATION,
      "CHASSIS PRICE",
      "ACCESSORIES",
      "Total Price with chassis ",
      COMPONENT_FINAL_TENDER_EX_GST,
      "Final Tender Cost (inc. GST)",
      COMPONENT_GEM_COST,
    ];
    
    // If it's just a checkbox toggle (include field), don't recalculate totals for read-only items
    if (field === 'include' && readOnlyItems.includes(currentRow.component)) {
      updated[index][field] = value;
      setRows(updated);
      return; // Exit early, don't recalculate
    }

    if (field === "unitCost" && NET_TOTAL_PERCENT_OF_FABRICATION.has(currentRow.component)) {
      const parsed = parsePercentValue(value);
      updated[index].unitCost = parsed;
      updated[index].total = percentOfBaseToRupees(parsed, grandTotal);
    } else if (field === "unitCost" && NET_TOTAL_PERCENT_OF_CHASSIS.has(currentRow.component)) {
      const parsed = parsePercentValue(value);
      updated[index].unitCost = parsed;
      updated[index].total = percentOfBaseToRupees(parsed, chassisTotal);
    } else if (field === "unitCost" && NET_TOTAL_PERCENT_OF_ACCESSORIES.has(currentRow.component)) {
      const parsed = parsePercentValue(value);
      updated[index].unitCost = parsed;
      updated[index].total = percentOfBaseToRupees(parsed, accessoriesTotal);
    } else if (field === "unitCost" && NET_TOTAL_RUPEE_ENTRY.has(currentRow.component)) {
      const parsed = Math.max(
        0,
        parseFloat(String(value).replace(/[,₹\s]/g, "").trim()) || 0
      );
      updated[index].unitCost = parsed;
      updated[index].total = parsed;
    } else if (field === "unitCost" && NET_TOTAL_TENDER_MODE_PERCENT.has(currentRow.component)) {
      const parsed = parsePercentValue(value);
      updated[index].unitCost = parsed;
      updated[index].total = 0;
    } else {
      updated[index][field] = value;
    }

    // Don't recalculate total for read-only items
    if (readOnlyItems.includes(currentRow.component)) {
      // Skip total recalculation for read-only items
    } else if (
      NET_TOTAL_PERCENT_OF_FABRICATION.has(updated[index].component) ||
      NET_TOTAL_PERCENT_OF_CHASSIS.has(updated[index].component) ||
      NET_TOTAL_PERCENT_OF_ACCESSORIES.has(updated[index].component) ||
      NET_TOTAL_RUPEE_ENTRY.has(updated[index].component)
    ) {
      if (NET_TOTAL_PERCENT_OF_FABRICATION.has(updated[index].component)) {
        const pct = clampPercent0to100(updated[index].unitCost);
        updated[index].unitCost = pct;
        updated[index].total = percentOfBaseToRupees(pct, grandTotal);
      } else if (NET_TOTAL_PERCENT_OF_CHASSIS.has(updated[index].component)) {
        const pct = clampPercent0to100(updated[index].unitCost);
        updated[index].unitCost = pct;
        updated[index].total = percentOfBaseToRupees(pct, chassisTotal);
      } else if (NET_TOTAL_PERCENT_OF_ACCESSORIES.has(updated[index].component)) {
        const pct = clampPercent0to100(updated[index].unitCost);
        updated[index].unitCost = pct;
        updated[index].total = percentOfBaseToRupees(pct, accessoriesTotal);
      } else if (NET_TOTAL_RUPEE_ENTRY.has(updated[index].component)) {
        const amt = Math.max(0, Number(updated[index].unitCost) || 0);
        updated[index].unitCost = amt;
        updated[index].total = amt;
      }
    } else if (NET_TOTAL_TENDER_MODE_PERCENT.has(updated[index].component)) {
      const pct = clampPercent0to100(updated[index].unitCost);
      updated[index].unitCost = pct;
      updated[index].total = 0;
    } else {
      // For other items, use normal calculation
      updated[index].total =
        (Number(updated[index].unitRate) * Number(updated[index].qty)) || 0;
    }

    setRows(
      applyNetTotalDerivedTotals(updated, {
        grandTotal,
        chassisTotal,
        accessoriesTotal,
        showGemPortalRows,
      })
    );
  };

  const visibleRows = filterNetTotalRowsForSource(rows, tenderSource);

  // Calculate net totals (fixed % rows always count)
  const rowTotal = visibleRows.reduce((sum, row) => {
    const alwaysOn = NET_TOTAL_NO_CHECKBOX.has(row.component);
    if (alwaysOn || row.include !== false) return sum + (Number(row.total) || 0);
    return sum;
  }, 0);
  const subtotal = rowTotal;

  const gstAmount = (subtotal * 18) / 100; // Fixed 18% GST
  const finalTotal = subtotal + gstAmount;

  return (
    <div className="p-6">
      {/* Net Total Section */}
      <div className="bg-white p-6 shadow rounded-lg mt-6">
        <h3 className="text-lg font-bold mb-4">NET TOTAL</h3>
        <p className="mb-3 text-xs text-slate-600">
          Quotation values use <strong>Final Tender Cost (ex. GST)</strong> as the primary amount.
          GST ({Math.round(FIRE_TENDER_GST_RATE * 100)}%) is shown separately on the inc-GST line.
        </p>
        {!showGemPortalRows ? (
          <p className="mb-3 text-xs text-slate-500">
            Tender Mode (O) and Gem Cost (P) are available only when the tender source is Gem Portal.
          </p>
        ) : null}
        {!remarkColumnSupported ? (
          <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            NET TOTAL remarks are stored in this browser until the database migration for{" "}
            <code className="text-[11px]">costing_summary.remark</code> is applied on Supabase.
          </p>
        ) : null}

        <div className="mb-6">
          <h4 className="font-semibold mb-3">Cost Components</h4>
          <div className="space-y-2">
            {visibleRows.map((row, displayIndex) => {
              const index = rows.findIndex((r) => r.component === row.component);
              const hidesUnitRateQty =
                NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component) ||
                NET_TOTAL_PERCENT_OF_CHASSIS.has(row.component) ||
                NET_TOTAL_PERCENT_OF_ACCESSORIES.has(row.component) ||
                NET_TOTAL_RUPEE_ENTRY.has(row.component) ||
                NET_TOTAL_TENDER_MODE_PERCENT.has(row.component);
              const isPercentOfFabric = NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component);
              const isPercentOfChassis = NET_TOTAL_PERCENT_OF_CHASSIS.has(row.component);
              const isPercentOfAccessories = NET_TOTAL_PERCENT_OF_ACCESSORIES.has(row.component);
              const isPercentEntry = isPercentOfFabric || isPercentOfChassis || isPercentOfAccessories;
              const isRupeeEntryField = NET_TOTAL_RUPEE_ENTRY.has(row.component);
              const isTenderModePercent = NET_TOTAL_TENDER_MODE_PERCENT.has(row.component);
              const isNoCheckbox = NET_TOTAL_NO_CHECKBOX.has(row.component);
              const isTotalFabrication = row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE;
              const isTotalPriceFabrication = row.component === COMPONENT_TOTAL_PRICE_FABRICATION;
              const isChassisPrice = row.component === "CHASSIS PRICE";
              const isAccessories = row.component === "ACCESSORIES";
              const isTotalPriceWithChassis = row.component === "Total Price with chassis ";
              const isFinalTenderEx = row.component === COMPONENT_FINAL_TENDER_EX_GST;
              const isFinalTenderCost = row.component === "Final Tender Cost (inc. GST)";
              const isGemCost = row.component === COMPONENT_GEM_COST;
              const isReadOnlyItem =
                isTotalPriceFabrication ||
                isTotalFabrication ||
                isChassisPrice ||
                isAccessories ||
                isTotalPriceWithChassis ||
                isFinalTenderEx ||
                isFinalTenderCost ||
                isGemCost;

              return (
                <div
                  key={row.component}
                  className="flex flex-col gap-2 border-b border-slate-200 bg-gray-50 p-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  {isNoCheckbox ? (
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={row.include !== false}
                      onChange={(e) => handleRowChange(index, "include", e.target.checked)}
                      className="mr-2 shrink-0"
                    />
                  )}
                  <span className="w-64 font-medium text-sm flex-shrink-0">
                    {indexToNetTotalLetters(displayIndex)}. {row.component}:
                  </span>
                  {isTenderModePercent ? (
                    <div className="flex items-center gap-1">
                      <NumericInput
                        value={row.unitCost}
                        onChange={(val) => handleRowChange(index, "unitCost", val)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="%"
                        aria-label="Tender percentage"
                      />
                      <span className="text-sm font-medium text-slate-600 shrink-0">%</span>
                    </div>
                  ) : isReadOnlyItem ? (
                    <span
                      className={`min-w-[10rem] flex-shrink-0 p-2 bg-gray-100 border rounded text-right font-medium text-sm ${
                        isFinalTenderEx ? "text-emerald-800 ring-1 ring-emerald-200" : ""
                      }`}
                    >
                      ₹{row.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {isFinalTenderEx ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase text-emerald-700">ex. GST</span>
                      ) : null}
                      {isFinalTenderCost ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-500">inc. GST</span>
                      ) : null}
                    </span>
                  ) : !isTotalFabrication &&
                    !isTotalPriceFabrication &&
                    !isChassisPrice &&
                    !isAccessories &&
                    !isTotalPriceWithChassis &&
                    !isFinalTenderEx &&
                    !isFinalTenderCost &&
                    !isGemCost &&
                    !isTenderModePercent && (
                    isPercentEntry ? (
                      <div className="flex items-center gap-1">
                        <NumericInput
                          value={row.unitCost}
                          onChange={(val) => handleRowChange(index, "unitCost", val)}
                          className="w-24 p-2 border rounded text-sm"
                          placeholder="0.00"
                          aria-label={
                            isPercentOfChassis
                              ? "Chassis margin percent"
                              : isPercentOfAccessories
                                ? "Accessories margin percent"
                                : "Percent of fabrication cost"
                          }
                        />
                        <span className="text-sm font-medium text-slate-600 shrink-0">%</span>
                      </div>
                    ) : isRupeeEntryField ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-slate-600 shrink-0">₹</span>
                        <NumericInput
                          value={row.unitCost}
                          onChange={(val) => handleRowChange(index, "unitCost", val)}
                          className="w-28 min-w-[7rem] p-2 border rounded text-sm"
                          placeholder="Amount"
                          aria-label="Amount in rupees"
                        />
                      </div>
                    ) : (
                      <NumericInput
                        value={row.unitCost}
                        onChange={(val) => handleRowChange(index, "unitCost", val)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="Unit Cost"
                        disabled={row.include === false}
                      />
                    )
                  )}
                  {!hidesUnitRateQty &&
                    !isTotalFabrication &&
                    !isTotalPriceFabrication &&
                    !isChassisPrice &&
                    !isAccessories &&
                    !isTotalPriceWithChassis &&
                    !isFinalTenderEx &&
                    !isFinalTenderCost &&
                    !isGemCost && (
                    <>
                      <NumericInput
                        value={row.unitRate}
                        onChange={(val) => handleRowChange(index, "unitRate", val)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="Unit Rate"
                        disabled={row.include === false}
                      />
                      <NumericInput
                        value={row.qty}
                        onChange={(val) => handleRowChange(index, "qty", val)}
                        className="w-20 p-2 border rounded text-sm"
                        placeholder="Qty"
                        disabled={row.include === false}
                      />
                    </>
                  )}
                  {!isReadOnlyItem && !isTenderModePercent && (
                    <span className="min-w-[10rem] flex-shrink-0 text-right font-medium text-sm">
                      ₹
                      {Number(row.total || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                  <input
                    type="text"
                    value={row.remark || ""}
                    onChange={(e) => handleRowChange(index, "remark", e.target.value)}
                    placeholder="Remarks"
                    className="min-w-[10rem] flex-1 rounded border border-slate-200 p-2 text-sm"
                  />
                  </div>
                  <div className="w-full shrink-0 rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-snug text-slate-700 sm:max-w-md sm:flex-1 whitespace-pre-wrap sm:border-l-2 sm:border-t-0">
                    {getNetTotalFormulaText(row, rows, {
                      grandTotal,
                      chassisTotal,
                      accessoriesTotal,
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>


        {/* Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="w-full text-xs font-medium text-emerald-700 sm:w-auto">
            Auto-save on{summaryAutoHint ? ` · ${summaryAutoHint}` : ""}
          </span>
          <button
            onClick={saveSummaryData}
            disabled={saving || loading || !canEditSummary}
            className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Save Summary"}
          </button>

          <button className="px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-800">
            Calculate
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!onExportExcel) return;
              try {
                const { data: mocData } = await supabase
                  .from("moc_prices")
                  .select("moc, unit, price")
                  .eq("tender_id", Number(tenderId));
                const { data: accCosting } = await supabase
                  .from("costing_accessories")
                  .select("accessory_id, qty, price")
                  .eq("tender_id", Number(tenderId));
                const { data: accCatalog } = await supabase.from("accessories").select("id, name, description");
                const accMap = new Map((accCatalog || []).map((a) => [String(a.id), a]));
                const accessoriesRows = (accCosting || []).map((c) => {
                  const cat = accMap.get(String(c.accessory_id)) || {};
                  return {
                    title: cat.name || "",
                    description: cat.description || "",
                    qty: c.qty,
                    price: c.price,
                  };
                });
                const netRows = filterNetTotalRowsForSource(rows, tenderSource).map((row) => ({
                  ...row,
                  formulaText: getNetTotalFormulaText(row, rows, {
                    grandTotal,
                    chassisTotal,
                    accessoriesTotal,
                  }),
                }));
                await onExportExcel(netRows, accessoriesRows, mocData || []);
              } catch (err) {
                console.error(err);
                alert("Export failed: " + (err.message || err));
              }
            }}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
          >
            Export Costing Sheet XLSX Report
          </button>

          {canApproveQuotation && (
            <button
              onClick={approveForQuotation}
              className="px-5 py-2.5 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition text-sm sm:text-base"
            >
              ✅ Approve Into Quotation
            </button>
          )}

        </div>
      </div>
    </div>
  );
};

export default CostingSummary;
