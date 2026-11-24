/** Compliance Forms context: IN-House vs HR-Site (Fire / Safety). */

export const COMPLIANCE_MODULES = Object.freeze({
  inHouse: "IH",
  hrSite: "HR",
});

export const COMPLIANCE_HR_SUBS = Object.freeze({
  fire: "Fire",
  safety: "Safety",
});

export const COMPLIANCE_MODULE_LABELS = Object.freeze({
  [COMPLIANCE_MODULES.inHouse]: "IN-House",
  [COMPLIANCE_MODULES.hrSite]: "HR-Site",
});

export const COMPLIANCE_HR_SUB_LABELS = Object.freeze({
  [COMPLIANCE_HR_SUBS.fire]: "HR-Fire",
  [COMPLIANCE_HR_SUBS.safety]: "HR-Safety",
});
