export const COMMERCIAL_MODULE_MANPOWER_TRAINING = "manpower-training";
/** Legacy shared bag (Maintenance M&M still uses this marker). */
export const COMMERCIAL_MODULE_RM_MM_AMC_IEV = "rm-mm-amc-iev";
/** R&M module only — exclusive of Manpower/Training, Maintenance M&M, AMC, IEV, Projects. */
export const COMMERCIAL_MODULE_RM = "rm";
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

function normalizeVerticalKey(po) {
  return String(po?.vertical || po?.poVertical || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** Infer module from OC / vertical when markers are missing or still on the legacy shared bag. */
function moduleTypeFromVertical(v) {
  if (v === "projects" || v === "project") return COMMERCIAL_MODULE_PROJECTS;
  if (v === "rm" || v === "r&m" || v === "rm&m") return COMMERCIAL_MODULE_RM;
  if (v === "mm" || v === "m&m" || v === "amc" || v === "iev") return COMMERCIAL_MODULE_RM_MM_AMC_IEV;
  const mtSet = new Set(["manp", "manpower", "train", "training", "bill"]);
  if (mtSet.has(v)) return COMMERCIAL_MODULE_MANPOWER_TRAINING;
  return null;
}

export function getCommercialPoModuleType(po) {
  const explicit = po?.moduleType;
  if (explicit === COMMERCIAL_MODULE_RM) return COMMERCIAL_MODULE_RM;
  if (explicit && explicit !== COMMERCIAL_MODULE_RM_MM_AMC_IEV) return explicit;

  const fromMarker = getCommercialModuleTypeFromUpdateHistory(po?.updateHistory);
  const v = normalizeVerticalKey(po);

  // Legacy shared marker: split by vertical so R&M no longer shares Maintenance/AMC/IEV scope.
  if (fromMarker === COMMERCIAL_MODULE_RM_MM_AMC_IEV || explicit === COMMERCIAL_MODULE_RM_MM_AMC_IEV) {
    const inferred = moduleTypeFromVertical(v);
    if (inferred) return inferred;
    return COMMERCIAL_MODULE_RM_MM_AMC_IEV;
  }
  if (fromMarker === COMMERCIAL_MODULE_RM) return COMMERCIAL_MODULE_RM;
  if (fromMarker) return fromMarker;

  const inferred = moduleTypeFromVertical(v);
  if (inferred) return inferred;
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
