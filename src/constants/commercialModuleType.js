export const COMMERCIAL_MODULE_MANPOWER_TRAINING = "manpower-training";
export const COMMERCIAL_MODULE_RM_MM_AMC_IEV = "rm-mm-amc-iev";

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
  return po?.moduleType || getCommercialModuleTypeFromUpdateHistory(po?.updateHistory) || COMMERCIAL_MODULE_MANPOWER_TRAINING;
}

export function getEnquiryCommercialModuleType(row) {
  return row?.duration?.__commercialModule || COMMERCIAL_MODULE_MANPOWER_TRAINING;
}

export function withEnquiryCommercialModule(duration, moduleType) {
  const next = duration && typeof duration === "object" ? { ...duration } : {};
  if (moduleType) next.__commercialModule = moduleType;
  return next;
}
