export const COMMERCIAL_MODULE_MANPOWER_TRAINING = "manpower-training";
export const COMMERCIAL_MODULE_RM_MM_AMC_IEV = "rm-mm-amc-iev";
/** Projects module PO Entry — same billing.po_wo row shape as R&M family; scoped by update_history marker. */
export const COMMERCIAL_MODULE_PROJECTS = "projects";

const MODULE_MARKER_PREFIX = "__COMMERCIAL_MODULE__:";

export function getCommercialModuleTypeFromUpdateHistory(updateHistory) {
  if (!Array.isArray(updateHistory)) return null;
  for (const item of updateHistory) {
    if (typeof item === "string" && item.startsWith(MODULE_MARKER_PREFIX)) {
      return item.slice(MODULE_MARKER_PREFIX.length) || null;
    }
    if (
      item &&
      typeof item === "object" &&
      typeof item.summary === "string" &&
      item.summary.startsWith(MODULE_MARKER_PREFIX)
    ) {
      return item.summary.slice(MODULE_MARKER_PREFIX.length) || null;
    }
  }
  return null;
}

export function withCommercialModuleMarker(updateHistory, moduleType) {
  const list = Array.isArray(updateHistory) ? [...updateHistory] : [];
  if (!moduleType) return list;
  const marker = `${MODULE_MARKER_PREFIX}${moduleType}`;
  const hasMarker = list.some((item) => {
    if (typeof item === "string") return item === marker;
    return item && typeof item === "object" && item.summary === marker;
  });
  if (!hasMarker) list.unshift(marker);
  return list;
}

export function isCommercialModuleMarker(entry) {
  if (typeof entry === "string") return entry.startsWith(MODULE_MARKER_PREFIX);
  return !!(entry && typeof entry === "object" && typeof entry.summary === "string" && entry.summary.startsWith(MODULE_MARKER_PREFIX));
}

export function getCommercialPoModuleType(po) {
  const explicit = po?.moduleType;
  if (explicit) return explicit;
  const fromMarker = getCommercialModuleTypeFromUpdateHistory(po?.updateHistory);
  if (fromMarker) return fromMarker;
  // Fallback: infer from PO vertical when markers are missing (legacy rows / older DB data).
  const v = String(po?.vertical || po?.poVertical || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (v === 'projects' || v === 'project') return COMMERCIAL_MODULE_PROJECTS;
  const rmSet = new Set(['rm', 'mm', 'amc', 'iev', 'rm&m', 'm&m']);
  if (rmSet.has(v)) return COMMERCIAL_MODULE_RM_MM_AMC_IEV;
  // DB stores MANP/TRAIN as vertical segments too
  const mtSet = new Set(['manp', 'manpower', 'train', 'training', 'bill']);
  if (mtSet.has(v)) return COMMERCIAL_MODULE_MANPOWER_TRAINING;
  return COMMERCIAL_MODULE_MANPOWER_TRAINING;
}

export function getEnquiryCommercialModuleType(row) {
  return row?.duration?.__commercialModule || COMMERCIAL_MODULE_MANPOWER_TRAINING;
}

export function withEnquiryCommercialModule(duration, moduleType) {
  const next = duration && typeof duration === "object" ? { ...duration } : {};
  if (moduleType) next.__commercialModule = moduleType;
  return next;
}
