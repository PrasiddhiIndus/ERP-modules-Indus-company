import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

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

/** No checkbox for these NET TOTAL rows. */
const NET_TOTAL_NO_CHECKBOX = new Set([
  "Inflation Cost %",
  "Overhead cost %",
  "Financial cost%",
  "Cost of negogiation %",
  "BD cost ",
  "IEVPL Margin",
  "RTO charges ",
  "Insurance ",
  "Tender Mode",
  COMPONENT_GEM_COST,
]);

/** Enter 0–100 (%); stored `unitCost` = %; `total` = rupees = fabrication × % / 100. */
const NET_TOTAL_PERCENT_OF_FABRICATION = new Set([
  "Inflation Cost %",
  "Overhead cost %",
  "Financial cost%",
  "Cost of negogiation %",
]);

/** Enter amount in ₹; `unitCost` and `total` both = rupees (used directly in downstream sums). */
const NET_TOTAL_RUPEE_ENTRY = new Set([
  "BD cost ",
  "IEVPL Margin",
  "RTO charges ",
  "Insurance ",
]);

/** Tender Mode: enter a plain % (not % of fabrication); `total` is unused (kept 0). */
const NET_TOTAL_TENDER_MODE_PERCENT = new Set(["Tender Mode"]);

function clampPercent0to100(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, x));
}

function percentOfBaseToRupees(percent, fabricationTotal) {
  const base = Number(fabricationTotal) || 0;
  return (base * clampPercent0to100(percent)) / 100;
}

function formatInrLine(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  if (comp === "BD cost " || comp === "IEVPL Margin" || comp === "RTO charges " || comp === "Insurance ") {
    return `Formula: amount entered (₹)\n₹${f(row.total)} on this line`;
  }

  if (comp === COMPONENT_GEM_COST) {
    const finalT = tot("Final Tender Cost (inc. GST)");
    const mode = clampPercent0to100(uc("Tender Mode"));
    return `Formula: Final Tender (inc. GST) × Tender Mode % ÷ 100\n₹${f(finalT)} × ${f(mode)}% ÷ 100 = ₹${f(row.total)}`;
  }

  if (comp === COMPONENT_TOTAL_PRICE_FABRICATION) {
    const bd = tot("BD cost ");
    const ie = tot("IEVPL Margin");
    const fab = tot(COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE);
    const le = letter(COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE);
    return `Formula: BD + IEVPL + line ${le} (fabrication + overhead…)\n₹${f(bd)} + ₹${f(ie)} + ₹${f(fab)} = ₹${f(row.total)}`;
  }

  if (comp === "CHASSIS PRICE") {
    return `Formula: sum of “chassis” rows on costing sheet\n→ ₹${f(chassisTotal)}`;
  }

  if (comp === "ACCESSORIES") {
    return `Formula: Σ (qty × price) from accessories costing\n→ ₹${f(accessoriesTotal)}`;
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

  if (comp === "Final Tender Cost (inc. GST)") {
    const m = tot("Total Price with chassis ");
    const h = tot(COMPONENT_TOTAL_PRICE_FABRICATION);
    const base = m === 0 ? h : m;
    const which = m === 0 ? letter(COMPONENT_TOTAL_PRICE_FABRICATION) : letter("Total Price with chassis ");
    return `Formula: (if M>0 use M else H) × 1.18 (GST)\nBase ${which}: ₹${f(base)}\n₹${f(base)} × 1.18 = ₹${f(row.total)}`;
  }

  if (comp === "Tender Mode") {
    return `Formula: tender % (0–100)\n${f(clampPercent0to100(uc(comp)))}% — used as: Gem cost = Final Tender (inc. GST) × this % ÷ 100`;
  }

  return "—";
}

const CostingSummary = ({ grandTotal = 0, chassisTotal = 0, accessoriesTotal = 0, tenderId }) => {
  console.log("CostingSummary component loaded with new checklist items");
  const [rows, setRows] = useState([
    { component: "Inflation Cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Overhead cost %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Financial cost%", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Cost of negogiation %", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "IEVPL Margin", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "BD cost ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: COMPONENT_TOTAL_PRICE_FABRICATION, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "CHASSIS PRICE", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "RTO charges ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Insurance ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "ACCESSORIES", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Total Price with chassis ", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Final Tender Cost (inc. GST)", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: "Tender Mode", unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
    { component: COMPONENT_GEM_COST, unitCost: 0, unitRate: 0, qty: 1, total: 0, include: false },
  ]);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryAutoHint, setSummaryAutoHint] = useState("");
  const skipSummaryAutosaveRef = useRef(true);

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
        .eq("tender_id", Number(tenderId))
        .eq("user_id", user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const filtered = data.filter(
          (item) =>
            item.component !== LEGACY_ROW_FABRICATION_WITHOUT_MARGIN &&
            item.component !== LEGACY_ROW_TOTAL_PRICE_WITHOUT_CHASSIS &&
            item.component !== LEGACY_ROW_IMAXX &&
            item.component !== LEGACY_ROW_FINAL_CHASSIS_BASIC
        );
        // Load existing data
        const loadedRows = filtered.map((item) => {
          let component = item.component;
          if (component === LEGACY_COMPONENT_TOTAL_FABRICATION_IEVPL) {
            component = COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE;
          }
          let unitCost = Number(item.unit_cost) || 0;
          let total = Number(item.total) || 0;
          if (component === "Tender Mode") {
            // Legacy rows stored GEM/Non-GEM in `total` (0|1); new field is % in `unit_cost`.
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
          };
        });
        setRows(loadedRows);
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

    await supabase
      .from("costing_summary")
      .delete()
      .eq("tender_id", Number(tenderId))
      .eq("user_id", userId);

    const payload = rows.map((row) => ({
      tender_id: Number(tenderId),
      component: row.component,
      unit_cost: Number(row.unitCost) || 0,
      unit_rate: Number(row.unitRate) || 0,
      qty: Number(row.qty) || 1,
      total: Number(row.total) || 0,
      include: NET_TOTAL_NO_CHECKBOX.has(row.component) ? true : row.include === true,
      user_id: userId,
    }));

    const { error } = await supabase.from("costing_summary").insert(payload);

    if (error) throw error;

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
    if (!tenderId) {
      alert("No tender selected. Please open a tender before approving.");
      return;
    }

    // Get only checked items
    const checkedItems = rows.filter((row) => row.include !== false);

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

      // 🔹 1️⃣ Delete existing approved items for this tender and user
      await supabase
        .from("approved_quotation_items")
        .delete()
        .eq("tender_id", Number(tenderId))
        .eq("user_id", userId);

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

      // 🔹 3️⃣ Check if quotation already exists for this tender and user
      const { data: existingQuotation, error: fetchError } = await supabase
        .from("quotations")
        .select("id, quotation_number")
        .eq("tender_id", Number(tenderId))
        .eq("user_id", userId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = "No rows found" → not an actual error here
        throw fetchError;
      }

      if (!existingQuotation) {
        // 🔹 4️⃣ Generate unique quotation number (count user's quotations)
        const { count, error: countError } = await supabase
          .from("quotations")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);

        if (countError) throw countError;

        const paddedIndex = String((count || 0) + 1).padStart(4, "0");
        const quotationNumber = `QN/IFSPL/FT/${paddedIndex}`;

        // 🔹 5️⃣ Insert quotation record with user_id
        const { error: quotationInsertError } = await supabase.from("quotations").insert([
          {
            tender_id: Number(tenderId),
            quotation_number: quotationNumber,
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
    setRows(prevRows => {
      const updated = [...prevRows];

      // Sync %‑of‑fabrication rows, rupee entry rows, and Tender Mode % before aggregations
      updated.forEach((row, i) => {
        if (NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component)) {
          const pct = clampPercent0to100(row.unitCost);
          updated[i].unitCost = pct;
          updated[i].total = percentOfBaseToRupees(pct, grandTotal);
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

      // Update Total fabrication cost without IEVPL margin
      const totalFabricationIndex = updated.findIndex(row =>
        row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE
      );

      if (totalFabricationIndex !== -1) {
        const inflationCost = updated.find(row => row.component === "Inflation Cost %")?.total || 0;
        const financialCost = updated.find(row => row.component === "Financial cost%")?.total || 0;
        const overheadCost = updated.find(row => row.component === "Overhead cost %")?.total || 0;
        const negotiationCost = updated.find(row => row.component === "Cost of negogiation %")?.total || 0;

        updated[totalFabricationIndex].total = inflationCost + financialCost + overheadCost + negotiationCost + grandTotal;
      }

      // Update Total Price of fabrication with overall cost and margin
      const totalPriceFabricationIndex = updated.findIndex(row =>
        row.component === COMPONENT_TOTAL_PRICE_FABRICATION
      );

      if (totalPriceFabricationIndex !== -1) {
        const bdCost = updated.find(row => row.component === "BD cost ")?.total || 0;
        const ievplMargin = updated.find(row => row.component === "IEVPL Margin")?.total || 0;
        const totalFabricationCost = updated.find(row => row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE)?.total || 0;

        updated[totalPriceFabricationIndex].total = bdCost + ievplMargin + totalFabricationCost;
      }

      // Update CHASSIS PRICE
      const chassisPriceIndex = updated.findIndex(row =>
        row.component === "CHASSIS PRICE"
      );

      if (chassisPriceIndex !== -1) {
        updated[chassisPriceIndex].total = chassisTotal;
      }

      // Update ACCESSORIES
      const accessoriesIndex = updated.findIndex(row =>
        row.component === "ACCESSORIES"
      );

      if (accessoriesIndex !== -1) {
        console.log("CostingSummary: Updating ACCESSORIES total to", accessoriesTotal);
        updated[accessoriesIndex].total = accessoriesTotal;
      } else {
        console.warn("CostingSummary: ACCESSORIES row not found in rows array");
      }

      // Total Price with chassis = H + I + J + K + L (fabrication + chassis + RTO + insurance + accessories)
      const totalPriceWithChassisIndex = updated.findIndex(row =>
        row.component === "Total Price with chassis "
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

      // Update Final Tender Cost (inc. GST)
      const finalTenderCostIndex = updated.findIndex(row =>
        row.component === "Final Tender Cost (inc. GST)"
      );

      if (finalTenderCostIndex !== -1) {
        const totalPriceWithChassis = updated.find(row => row.component === "Total Price with chassis ")?.total || 0;
        const totalPriceWithoutChassis =
          updated.find((row) => row.component === COMPONENT_TOTAL_PRICE_FABRICATION)?.total || 0;

        // Conditional logic: if Total Price with chassis = 0, use fabrication total * 1.18, otherwise use Total Price with chassis * 1.18
        const baseAmount = totalPriceWithChassis === 0 ? totalPriceWithoutChassis : totalPriceWithChassis;
        updated[finalTenderCostIndex].total = baseAmount * 1.18;
      }

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

      updated.forEach((r, i) => {
        if (NET_TOTAL_NO_CHECKBOX.has(r.component)) {
          updated[i].include = true;
        }
      });

      return updated;
    });
  }, [grandTotal, chassisTotal, accessoriesTotal, loading]);

  // Update row values
  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    const currentRow = updated[index];

    if (field === "include" && NET_TOTAL_NO_CHECKBOX.has(currentRow.component)) {
      return;
    }

    // List of read-only items that should not have their totals recalculated
    const readOnlyItems = [
      COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE,
      COMPONENT_TOTAL_PRICE_FABRICATION,
      "CHASSIS PRICE",
      "ACCESSORIES",
      "Total Price with chassis ",
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
      let parsed = parseFloat(String(value).replace(/%/g, "").trim());
      if (!Number.isFinite(parsed)) parsed = 0;
      if (parsed > 100) {
        alert("Percentage cannot exceed 100.");
        parsed = 100;
      }
      if (parsed < 0) parsed = 0;
      updated[index].unitCost = parsed;
      updated[index].total = percentOfBaseToRupees(parsed, grandTotal);
    } else if (field === "unitCost" && NET_TOTAL_RUPEE_ENTRY.has(currentRow.component)) {
      const parsed = Math.max(
        0,
        parseFloat(String(value).replace(/[,₹\s]/g, "").trim()) || 0
      );
      updated[index].unitCost = parsed;
      updated[index].total = parsed;
    } else if (field === "unitCost" && NET_TOTAL_TENDER_MODE_PERCENT.has(currentRow.component)) {
      let parsed = parseFloat(String(value).replace(/%/g, "").trim());
      if (!Number.isFinite(parsed)) parsed = 0;
      if (parsed > 100) {
        alert("Percentage cannot exceed 100.");
        parsed = 100;
      }
      if (parsed < 0) parsed = 0;
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
      NET_TOTAL_RUPEE_ENTRY.has(updated[index].component)
    ) {
      // Totals already set when unitCost changed; keep in sync if another field changed
      if (NET_TOTAL_PERCENT_OF_FABRICATION.has(updated[index].component)) {
        const pct = clampPercent0to100(updated[index].unitCost);
        updated[index].unitCost = pct;
        updated[index].total = percentOfBaseToRupees(pct, grandTotal);
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

    // Auto-calculate total fabrication cost
    const totalFabricationIndex = updated.findIndex(row =>
      row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE
    );

    if (totalFabricationIndex !== -1) {
      const inflationCost = updated.find(row => row.component === "Inflation Cost %")?.total || 0;
      const financialCost = updated.find(row => row.component === "Financial cost%")?.total || 0;
      const overheadCost = updated.find(row => row.component === "Overhead cost %")?.total || 0;
      const negotiationCost = updated.find(row => row.component === "Cost of negogiation %")?.total || 0;

      updated[totalFabricationIndex].total = inflationCost + financialCost + overheadCost + negotiationCost + grandTotal;
    }

    // Auto-calculate Total Price of fabrication with overall cost and margin
    const totalPriceFabricationIndex = updated.findIndex(row =>
      row.component === COMPONENT_TOTAL_PRICE_FABRICATION
    );

    if (totalPriceFabricationIndex !== -1) {
      const bdCost = updated.find(row => row.component === "BD cost ")?.total || 0;
      const ievplMargin = updated.find(row => row.component === "IEVPL Margin")?.total || 0;
      const totalFabricationCost = updated.find(row => row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE)?.total || 0;

      updated[totalPriceFabricationIndex].total = bdCost + ievplMargin + totalFabricationCost;
    }

    // Preserve CHASSIS PRICE and ACCESSORIES from props before H+I+J+K+L
    const accessoriesIndexEarly = updated.findIndex(row => row.component === "ACCESSORIES");
    if (accessoriesIndexEarly !== -1) {
      updated[accessoriesIndexEarly].total = accessoriesTotal;
    }
    const chassisPriceIndexEarly = updated.findIndex(row => row.component === "CHASSIS PRICE");
    if (chassisPriceIndexEarly !== -1) {
      updated[chassisPriceIndexEarly].total = chassisTotal;
    }

    // Update Total Price with chassis
    const totalPriceWithChassisIndex = updated.findIndex(row =>
      row.component === "Total Price with chassis "
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

    // Update Final Tender Cost (inc. GST)
    const finalTenderCostIndex = updated.findIndex(row =>
      row.component === "Final Tender Cost (inc. GST)"
    );

    if (finalTenderCostIndex !== -1) {
      const totalPriceWithChassis = updated.find(row => row.component === "Total Price with chassis ")?.total || 0;
      const totalPriceWithoutChassis =
        updated.find((row) => row.component === COMPONENT_TOTAL_PRICE_FABRICATION)?.total || 0;

      // Conditional logic: if Total Price with chassis = 0, use fabrication total * 1.18, otherwise use Total Price with chassis * 1.18
      const baseAmount = totalPriceWithChassis === 0 ? totalPriceWithoutChassis : totalPriceWithChassis;
      updated[finalTenderCostIndex].total = baseAmount * 1.18;
    }

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

    setRows(updated);
  };

  // Calculate net totals (fixed % rows always count)
  const rowTotal = rows.reduce((sum, row) => {
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
        {/* Updated checklist items */}

        {/* Render the rows array with checkboxes */}
        <div className="mb-6">
          <h4 className="font-semibold mb-3">Cost Components</h4>
          <div className="space-y-2">
            {rows.map((row, index) => {
              const hidesUnitRateQty =
                NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component) ||
                NET_TOTAL_RUPEE_ENTRY.has(row.component) ||
                NET_TOTAL_TENDER_MODE_PERCENT.has(row.component);
              const isPercentOfFabric = NET_TOTAL_PERCENT_OF_FABRICATION.has(row.component);
              const isRupeeEntryField = NET_TOTAL_RUPEE_ENTRY.has(row.component);
              const isTenderModePercent = NET_TOTAL_TENDER_MODE_PERCENT.has(row.component);
              const showRupeeFabHint =
                isRupeeEntryField && grandTotal > 0 && Number(row.total) > 0;
              const isNoCheckbox = NET_TOTAL_NO_CHECKBOX.has(row.component);
              const isTotalFabrication = row.component === COMPONENT_TOTAL_FABRICATION_OVERHEAD_FINANCE;
              const isTotalPriceFabrication = row.component === COMPONENT_TOTAL_PRICE_FABRICATION;
              const isChassisPrice = row.component === "CHASSIS PRICE";
              const isAccessories = row.component === "ACCESSORIES";
              const isTotalPriceWithChassis = row.component === "Total Price with chassis ";
              const isFinalTenderCost = row.component === "Final Tender Cost (inc. GST)";
              const isGemCost = row.component === COMPONENT_GEM_COST;
              const isReadOnlyItem =
                isTotalPriceFabrication ||
                isTotalFabrication ||
                isChassisPrice ||
                isAccessories ||
                isTotalPriceWithChassis ||
                isFinalTenderCost ||
                isGemCost;

              return (
                <div
                  key={index}
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
                    {indexToNetTotalLetters(index)}. {row.component}:
                  </span>
                  {isTenderModePercent ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={row.unitCost}
                        onChange={(e) => handleRowChange(index, "unitCost", e.target.value)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="%"
                        title="Tender percentage (0–100%)"
                      />
                      <span className="text-sm font-medium text-slate-600 shrink-0">%</span>
                    </div>
                  ) : isReadOnlyItem ? (
                    <span className="w-32 p-2 bg-gray-100 border rounded text-right font-medium text-sm">
                      ₹{row.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : !isTotalFabrication &&
                    !isTotalPriceFabrication &&
                    !isChassisPrice &&
                    !isAccessories &&
                    !isTotalPriceWithChassis &&
                    !isFinalTenderCost &&
                    !isGemCost &&
                    !isTenderModePercent && (
                    isPercentOfFabric ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={row.unitCost}
                          onChange={(e) => handleRowChange(index, "unitCost", e.target.value)}
                          className="w-24 p-2 border rounded text-sm"
                          placeholder="%"
                          title="Enter % of Total Fabrication Cost Without Margin (max 100%)"
                        />
                        <span className="text-sm font-medium text-slate-600 shrink-0">%</span>
                      </div>
                    ) : isRupeeEntryField ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-slate-600 shrink-0">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.unitCost}
                          onChange={(e) => handleRowChange(index, "unitCost", e.target.value)}
                          className="w-28 min-w-[7rem] p-2 border rounded text-sm"
                          placeholder="Amount"
                          title="Enter amount in rupees (applied directly to this line total)"
                        />
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={row.unitCost}
                        onChange={(e) => handleRowChange(index, "unitCost", e.target.value)}
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
                    !isFinalTenderCost &&
                    !isGemCost && (
                    <>
                      <input
                        type="number"
                        value={row.unitRate}
                        onChange={(e) => handleRowChange(index, 'unitRate', e.target.value)}
                        className="w-24 p-2 border rounded text-sm"
                        placeholder="Unit Rate"
                        disabled={row.include === false}
                      />
                      <input
                        type="number"
                        value={row.qty}
                        onChange={(e) => handleRowChange(index, 'qty', e.target.value)}
                        className="w-20 p-2 border rounded text-sm"
                        placeholder="Qty"
                        disabled={row.include === false}
                      />
                    </>
                  )}
                  {!isReadOnlyItem && !isTenderModePercent && (
                    <span className="min-w-[10rem] flex-shrink-0 text-right font-medium text-sm">
                      <span className="block">
                        ₹
                        {Number(row.total || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      {isPercentOfFabric && (
                        <span className="block text-xs font-normal text-slate-500">
                          ({Number(row.unitCost || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}% of
                          fabrication)
                        </span>
                      )}
                      {showRupeeFabHint && (
                        <span className="block text-xs font-normal text-slate-500">
                          (
                          {((Number(row.total) / grandTotal) * 100).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          % of fabrication)
                        </span>
                      )}
                    </span>
                  )}
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
          {summaryAutoHint ? (
            <span className="w-full text-xs font-medium text-emerald-700 sm:w-auto" role="status">
              {summaryAutoHint}
            </span>
          ) : null}
          <button
            onClick={saveSummaryData}
            disabled={saving || loading}
            className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Save Summary"}
          </button>

          <button className="px-4 py-2 bg-purple-700 text-white rounded hover:bg-purple-800">
            Calculate
          </button>
          <button className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
            Export Costing Sheet XLSX Report
          </button>

          <button
            onClick={approveForQuotation}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition text-sm sm:text-base"
          >
            ✅ Approve Into Quotation
          </button>

        </div>
      </div>
    </div>
  );
};

export default CostingSummary;
