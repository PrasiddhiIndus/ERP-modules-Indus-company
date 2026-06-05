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

export function isStructureOrPanelling(component) {
  if (!component) return false;
  const n = component.toString().toLowerCase();
  return n.includes("structure") || n.includes("panelling");
}

export function isWeightFieldEditable(component) {
  if (!component) return false;
  if (isMetaconeMounting(component)) return false;
  if (isTankComponent(component)) return true;
  if (isStructureOrPanelling(component)) return true;
  return false;
}

export function isLabourFieldEditable(component) {
  if (!component) return false;
  if (isMetaconeMounting(component)) return true;
  if (isTankComponent(component)) return true;
  if (isStructureOrPanelling(component)) return false;
  return false;
}

export function parseCostingNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
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
    return weight * unitCost;
  }
  return (labour + unitCost) * qty;
}

export function getCostingRowFillStatus(row, allRows, componentTree, isFixedRow) {
  if (!row?.component?.trim()) return "neutral";

  const unitCost = parseCostingNumber(row.unitCost);
  const weight = parseCostingNumber(row.weight);
  const qty = parseCostingNumber(row.qty);
  const manual = String(row.manualSub || "").trim();

  let complete = false;

  if (isTankComponent(row.component)) {
    complete = weight > 0 && unitCost > 0 && qty > 0;
  } else if (isStructureOrPanelling(row.component)) {
    complete = weight > 0 && unitCost > 0;
  } else if (isMetaconeMounting(row.component)) {
    complete = unitCost > 0;
  } else {
    complete = unitCost > 0 && qty > 0;
  }

  if (subFieldRequiresManualEntry(componentTree, row, isFixedRow) && !manual) {
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
