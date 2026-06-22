import { isRetiredFireTenderMainComponentLabel } from "../../lib/retiredFireTenderMainComponents";

/** Serial numbers to hide globally (catalog order by main_components.id). */
export const GLOBAL_OMIT_SERIAL_NUMBERS = new Set([33, 34, 37, 40, 41, 42, 43]);

/** Override display label for a catalog serial number. */
export const SERIAL_DISPLAY_ALIASES = { 39: "Electrical Components" };

export const ALUMINIUM_EXTENSION_LADDER = {
  name: "Aluminium Extension Ladder",
  description: "10.5 Meters Length IS:4571 Double Extension Trussed",
};

/** Tender source value from New Tender — enables NET TOTAL rows O & P. */
export const GEM_PORTAL_SOURCE = "Gem Portal";

/** NET TOTAL rows shown only when tender source is Gem Portal. */
export const GEM_ONLY_NET_TOTAL_COMPONENTS = new Set([
  "Tender Mode",
  "Total Price with chassis (Gem Cost)",
]);

/**
 * Dynamic per-component field hints (matched on normalised catalog main_component names).
 * Values are labels/flags only — never fixed makes, brands, or prices.
 */
export const COMPONENT_FIELD_RULES = [
  {
    patterns: ["crewcabin", "crewcab"],
    manualSubLabel: "Seat make",
    manualSubPlaceholder: "Enter seat make",
    manualSubRequired: false,
  },
  {
    patterns: ["highpressurehosereel", "hosereel"],
    manualSubLabel: "Brand name",
    manualSubPlaceholder: "Enter brand name",
  },
  {
    patterns: ["waterandfoamlevelindicator", "waterlevelindicator", "foamlevelindicator", "levelindicator"],
    manualSubLabel: "Digital / Non-digital",
    manualSubPlaceholder: "e.g. Digital or Non-digital",
  },
  {
    patterns: ["telescopiclightmast", "lightmast"],
    manualSubLabel: "Make",
    manualSubPlaceholder: "Enter make",
  },
  {
    patterns: ["dcp"],
    excludePatterns: ["dcpo"],
    weightLabel: "KG weight (vessel capacity)",
    weightEditable: true,
  },
];

export function isGemPortalSource(source) {
  return String(source || "").trim() === GEM_PORTAL_SOURCE;
}

export function filterNetTotalRowsForSource(rows, source) {
  if (isGemPortalSource(source)) return rows;
  return (rows || []).filter((r) => !GEM_ONLY_NET_TOTAL_COMPONENTS.has(r.component));
}

export function normalizeComponentName(s) {
  return (s || "").toString().toLowerCase().replace(/\s+/g, "");
}

export function getComponentFieldRule(component) {
  const n = normalizeComponentName(component);
  if (!n) return null;
  return (
    COMPONENT_FIELD_RULES.find((rule) => {
      if (rule.excludePatterns?.some((ex) => n.includes(ex))) return false;
      return rule.patterns.some((p) => n.includes(p));
    }) || null
  );
}

export function getManualSubLabel(component) {
  return getComponentFieldRule(component)?.manualSubLabel || "Manual Sub Category";
}

export function getManualSubPlaceholder(component) {
  return getComponentFieldRule(component)?.manualSubPlaceholder || "";
}

export function getWeightColumnLabel(component) {
  return getComponentFieldRule(component)?.weightLabel || "Weight";
}

export function manualSubAlwaysShown(component) {
  return Boolean(getComponentFieldRule(component)?.manualSubLabel);
}

export function isMetaconeMounting(component) {
  return normalizeComponentName(component).includes("metacone");
}

export function isWaterTank(component) {
  const n = normalizeComponentName(component);
  return n.includes("watertank") || (n.includes("water") && n.includes("tank") && !n.includes("foam"));
}

export function isFoamTank(component) {
  const n = normalizeComponentName(component);
  return n.includes("foamtank") || (n.includes("foam") && n.includes("tank"));
}

export function isTankComponent(component) {
  return isWaterTank(component) || isFoamTank(component);
}

export function isDcpComponent(component) {
  const n = normalizeComponentName(component);
  if (n.includes("dcpo")) return false;
  return n.includes("dcp");
}

export function isStructureOrPanelling(component) {
  if (!component) return false;
  const n = component.toString().toLowerCase();
  return n.includes("structure") || n.includes("panelling");
}

export function isWeightFieldEditable(component) {
  if (!component) return false;
  const rule = getComponentFieldRule(component);
  if (rule?.weightEditable) return true;
  if (isMetaconeMounting(component)) return false;
  if (isTankComponent(component)) return true;
  if (isStructureOrPanelling(component)) return true;
  if (isDcpComponent(component)) return true;
  return false;
}

export function isLabourFieldEditable(component) {
  if (!component) return false;
  if (isMetaconeMounting(component)) return true;
  if (isTankComponent(component)) return true;
  if (isStructureOrPanelling(component)) return true;
  return false;
}

export function parseCostingNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse 0–100 % with up to 2 decimal places (e.g. 4.50). */
export function parsePercentValue(raw, { max = 100, decimals = 2 } = {}) {
  const cleaned = String(raw ?? "")
    .replace(/%/g, "")
    .replace(/[,₹\s]/g, "")
    .trim();
  if (cleaned === "") return 0;
  let parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** decimals;
  parsed = Math.round(parsed * factor) / factor;
  return Math.min(max, Math.max(0, parsed));
}

export function getOrderedMainComponents(mainRows) {
  const sorted = [...mainRows].sort((a, b) => (a.id || 0) - (b.id || 0));
  const seen = new Set();
  const ordered = [];
  for (const r of sorted) {
    const comp = r.main_component;
    if (!comp || seen.has(comp)) continue;
    if (isRetiredFireTenderMainComponentLabel(comp)) continue;
    if (comp === "Tender Mode") continue;
    seen.add(comp);
    ordered.push(comp);
  }
  return ordered;
}

export function getGlobalOmittedComponents(orderedComponents) {
  const omitted = new Set();
  orderedComponents.forEach((comp, i) => {
    if (GLOBAL_OMIT_SERIAL_NUMBERS.has(i + 1)) omitted.add(comp);
  });
  return omitted;
}

export function getComponentDisplayAliases(orderedComponents) {
  const map = {};
  orderedComponents.forEach((comp, i) => {
    const alias = SERIAL_DISPLAY_ALIASES[i + 1];
    if (alias) map[comp] = alias;
  });
  return map;
}

export function getSubOptions(componentTree, component, level, row) {
  if (!component || !componentTree[component]) return [];
  if (level === 1) return Object.keys(componentTree[component] || {});
  if (level === 2 && row.sub1) return Object.keys(componentTree[component]?.[row.sub1] || {});
  if (level === 3 && row.sub1 && row.sub2)
    return Object.keys(componentTree[component]?.[row.sub1]?.[row.sub2] || {});
  if (level === 4 && row.sub1 && row.sub2 && row.sub3)
    return Object.keys(componentTree[component]?.[row.sub1]?.[row.sub2]?.[row.sub3] || {});
  if (level === 5 && row.sub1 && row.sub2 && row.sub3 && row.sub4)
    return Object.keys(componentTree[component]?.[row.sub1]?.[row.sub2]?.[row.sub3]?.[row.sub4] || {});
  return [];
}

export function subFieldRequiresManualEntry(componentTree, row, isFixedRow) {
  const rule = getComponentFieldRule(row.component);
  if (rule?.manualSubRequired) return true;
  if (manualSubAlwaysShown(row.component)) return false;
  if (!isFixedRow) return true;
  for (let level = 1; level <= 5; level += 1) {
    if (getSubOptions(componentTree, row.component, level, row).length > 0) return false;
  }
  return true;
}

export function computeMetaconeQty(rows) {
  let total = 0;
  rows.forEach((r) => {
    if (!r) return;
    if (isWaterTank(r.component)) {
      total += parseCostingNumber(r.weight) + parseCostingNumber(r.sub2);
    }
    if (isFoamTank(r.component)) {
      total += parseCostingNumber(r.weight) + parseCostingNumber(r.sub2);
    }
  });
  return total > 0 ? Math.ceil(total / 550) : 0;
}

export function calculateCostingRowTotal(row, allRows) {
  const labour = parseCostingNumber(row.labour);
  const unitCost = parseCostingNumber(row.unitCost);
  const qty = row.qty === "" ? 1 : parseCostingNumber(row.qty) || 1;
  const weight = parseCostingNumber(row.weight);

  if (isMetaconeMounting(row.component)) {
    return unitCost * computeMetaconeQty(allRows) + labour;
  }
  if (isTankComponent(row.component)) {
    return weight * (unitCost + labour) * qty;
  }
  if (isStructureOrPanelling(row.component)) {
    return weight * unitCost + labour;
  }
  if (isDcpComponent(row.component) && weight > 0) {
    return weight * unitCost * qty + labour;
  }
  return (labour + unitCost) * qty;
}

export function getCostingRowFillStatus(row, allRows, componentTree, isFixedRow) {
  if (!row?.component?.trim()) return "neutral";

  const unitCost = parseCostingNumber(row.unitCost);
  const weight = parseCostingNumber(row.weight);
  const qty = parseCostingNumber(row.qty);
  const manual = String(row.manualSub || "").trim();
  const rule = getComponentFieldRule(row.component);

  let complete = false;

  if (isTankComponent(row.component)) {
    complete = weight > 0 && unitCost > 0 && qty > 0;
  } else if (isStructureOrPanelling(row.component)) {
    complete = weight > 0 && unitCost > 0;
  } else if (isDcpComponent(row.component)) {
    complete = weight > 0 && unitCost > 0;
  } else if (isMetaconeMounting(row.component)) {
    complete = unitCost > 0;
  } else {
    complete = unitCost > 0 && qty > 0;
  }

  if (subFieldRequiresManualEntry(componentTree, row, isFixedRow) && !manual) {
    complete = false;
  }

  if (rule?.manualSubRequired && !manual) {
    complete = false;
  }

  if (complete) return "complete";
  const hasInput =
    manual ||
    unitCost > 0 ||
    weight > 0 ||
    parseCostingNumber(row.labour) > 0 ||
    qty > 0 ||
    [row.sub1, row.sub2, row.sub3, row.sub4, row.sub5].some((s) => String(s || "").trim());
  return hasInput ? "incomplete" : "incomplete";
}

/** GST rate applied to final tender (quotation inc-GST line). */
export const FIRE_TENDER_GST_RATE = 0.18;

export function applyGstInclusive(amountExGst) {
  const base = Number(amountExGst) || 0;
  return base * (1 + FIRE_TENDER_GST_RATE);
}

let costingSummaryRemarkColumnCache = null;

export function isSupabaseMissingColumnError(error, columnName) {
  const msg = String(error?.message || "");
  return (
    error?.code === "PGRST204" &&
    msg.includes(`'${columnName}'`) &&
    msg.toLowerCase().includes("schema cache")
  );
}

/** Probes whether `costing_summary.remark` exists (migration may not be applied on remote DB). */
export async function costingSummarySupportsRemarkColumn(supabaseClient) {
  if (costingSummaryRemarkColumnCache !== null) return costingSummaryRemarkColumnCache;
  const { error } = await supabaseClient.from("costing_summary").select("remark").limit(1);
  if (isSupabaseMissingColumnError(error, "remark")) {
    costingSummaryRemarkColumnCache = false;
    return false;
  }
  costingSummaryRemarkColumnCache = true;
  return true;
}

export function resetCostingSummaryRemarkColumnCache() {
  costingSummaryRemarkColumnCache = null;
}

const NET_TOTAL_REMARKS_STORAGE_PREFIX = "fire_tender_net_total_remarks_";

export function loadLocalNetTotalRemarks(tenderId) {
  if (!tenderId) return {};
  try {
    const raw = localStorage.getItem(`${NET_TOTAL_REMARKS_STORAGE_PREFIX}${Number(tenderId)}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLocalNetTotalRemarks(tenderId, remarksByComponent) {
  if (!tenderId) return;
  try {
    localStorage.setItem(
      `${NET_TOTAL_REMARKS_STORAGE_PREFIX}${Number(tenderId)}`,
      JSON.stringify(remarksByComponent || {})
    );
  } catch {
    /* ignore quota errors */
  }
}
