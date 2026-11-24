/**
 * Local persistence for HR-Site Format Master, site form maps, and generated documents.
 * Replaced by server tables when compliance_forms / compliance_documents ship.
 */

import { DEFAULT_HR_FORMS } from "./hrSiteFormCatalog";

const FORMS_KEY = "indus-hr-compliance-formats-v1";
const SITE_FORMS_KEY = "indus-compliance-site-forms-v1";
const DOCS_KEY = "indus-hr-compliance-docs-v1";
const PAYROLL_KEY = "indus-hr-compliance-payroll-flags-v1";
const ENTRIES_KEY = "indus-hr-compliance-entries-v1";

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cloneDefaults() {
  return DEFAULT_HR_FORMS.map((form) => ({
    ...form,
    appliesTo: [...(form.appliesTo || [])],
    payrollSources: [...(form.payrollSources || [])],
    columns: [...(form.columns || [])],
  }));
}

export function listHrFormats() {
  const stored = readJson(FORMS_KEY, null);
  if (!Array.isArray(stored) || !stored.length) {
    const seed = cloneDefaults();
    writeJson(FORMS_KEY, seed);
    return seed;
  }
  return stored.map((form) => ({
    ...form,
    appliesTo: Array.isArray(form.appliesTo) ? form.appliesTo : [],
    payrollSources: Array.isArray(form.payrollSources) ? form.payrollSources : [],
    columns: Array.isArray(form.columns) ? form.columns : [],
  }));
}

export function saveHrFormats(forms) {
  writeJson(FORMS_KEY, Array.isArray(forms) ? forms : []);
  return listHrFormats();
}

export function upsertHrFormat(form) {
  const all = listHrFormats();
  const idx = all.findIndex((row) => row.id === form.id);
  if (idx >= 0) all[idx] = { ...all[idx], ...form };
  else all.push({ ...form, id: form.id || `f${Date.now()}` });
  return saveHrFormats(all);
}

export function setHrFormatActive(formId, active) {
  const all = listHrFormats();
  const row = all.find((f) => f.id === formId);
  if (!row) return all;
  row.active = Boolean(active);
  return saveHrFormats(all);
}

function siteBucket(all, siteType) {
  const typeKey = siteType || "All";
  if (!all[typeKey]) all[typeKey] = {};
  return { all, typeKey, bucket: all[typeKey] };
}

export function getSiteFormMap(siteType, siteId) {
  const all = readJson(SITE_FORMS_KEY, {});
  const map = all[siteType || "All"]?.[String(siteId)];
  return map && typeof map === "object" ? { ...map } : {};
}

export function setSiteFormEnabled(siteType, siteId, formId, enabled, defaultBill = false) {
  const raw = readJson(SITE_FORMS_KEY, {});
  const { all, typeKey, bucket } = siteBucket(raw, siteType);
  const sid = String(siteId);
  if (!bucket[sid]) bucket[sid] = {};
  if (enabled) {
    bucket[sid][formId] = { bill: Boolean(bucket[sid][formId]?.bill ?? defaultBill) };
  } else {
    delete bucket[sid][formId];
  }
  writeJson(SITE_FORMS_KEY, all);
  return getSiteFormMap(typeKey, sid);
}

export function setSiteFormBill(siteType, siteId, formId, bill) {
  const raw = readJson(SITE_FORMS_KEY, {});
  const { all, typeKey, bucket } = siteBucket(raw, siteType);
  const sid = String(siteId);
  if (!bucket[sid]?.[formId]) return getSiteFormMap(typeKey, sid);
  bucket[sid][formId] = { bill: Boolean(bill) };
  writeJson(SITE_FORMS_KEY, all);
  return getSiteFormMap(typeKey, sid);
}

export function copySiteForms(siteType, fromSiteId, toSiteIds) {
  const raw = readJson(SITE_FORMS_KEY, {});
  const { all, typeKey, bucket } = siteBucket(raw, siteType);
  const source = { ...(bucket[String(fromSiteId)] || {}) };
  (toSiteIds || []).forEach((id) => {
    const sid = String(id);
    if (sid === String(fromSiteId)) return;
    bucket[sid] = { ...source };
  });
  writeJson(SITE_FORMS_KEY, all);
  return typeKey;
}

export function countSiteForms(siteType, siteId) {
  return Object.keys(getSiteFormMap(siteType, siteId)).length;
}

export function countSitesUsingForm(siteType, formId, siteIds = []) {
  const all = readJson(SITE_FORMS_KEY, {});
  const bucket = all[siteType || "All"] || {};
  return (siteIds.length ? siteIds : Object.keys(bucket)).filter((id) => bucket[String(id)]?.[formId]).length;
}

/** Seed site with all eligible forms if never configured. */
export function ensureSiteDefaults(siteType, siteId, eligibleForms) {
  const map = getSiteFormMap(siteType, siteId);
  if (Object.keys(map).length) return map;
  (eligibleForms || []).forEach((form) => {
    setSiteFormEnabled(siteType, siteId, form.id, true, Boolean(form.withBill));
  });
  return getSiteFormMap(siteType, siteId);
}

function docKey(siteId, period, formId) {
  return `${siteId}|${period}|${formId}`;
}

export function listGeneratedDocs() {
  const rows = readJson(DOCS_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function getDoc(siteId, period, formId) {
  return listGeneratedDocs().find(
    (row) =>
      String(row.siteId) === String(siteId) &&
      row.period === period &&
      row.formId === formId
  ) || null;
}

export function entryStorageKey({ formId, siteId = "", period = "" } = {}) {
  if (siteId && period) return `${siteId}|${period}|${formId}`;
  return `master|${formId}`;
}

export function getFormEntry(keyParts) {
  const key = typeof keyParts === "string" ? keyParts : entryStorageKey(keyParts || {});
  const all = readJson(ENTRIES_KEY, {});
  const row = all[key];
  if (!row || typeof row !== "object") {
    return {
      header: {
        establishment: "",
        employer: "",
        panTan: "",
        lin: "",
        monthOf: "",
      },
      rows: [],
    };
  }
  return {
    header: {
      establishment: "",
      employer: "",
      panTan: "",
      lin: "",
      monthOf: "",
      ...(row.header || {}),
    },
    rows: Array.isArray(row.rows) ? row.rows.map((r) => ({ ...(r || {}) })) : [],
  };
}

export function saveFormEntry(keyParts, entry) {
  const key = typeof keyParts === "string" ? keyParts : entryStorageKey(keyParts || {});
  const all = readJson(ENTRIES_KEY, {});
  all[key] = {
    header: { ...(entry?.header || {}) },
    rows: Array.isArray(entry?.rows) ? entry.rows.map((r) => ({ ...(r || {}) })) : [],
    savedAt: new Date().toISOString(),
  };
  writeJson(ENTRIES_KEY, all);
  return getFormEntry(key);
}

export function blankEntryRow(columns = []) {
  const row = {};
  (columns || []).forEach((col) => {
    row[col] = "";
  });
  return row;
}

export function generateDoc({ siteId, siteName, siteType, period, formId, formLabel, header, rows }) {
  const all = listGeneratedDocs();
  const existing = all.find(
    (row) =>
      String(row.siteId) === String(siteId) &&
      row.period === period &&
      row.formId === formId
  );
  const now = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (header || rows) {
    saveFormEntry({ siteId, period, formId }, { header, rows });
  }
  if (existing) {
    existing.version = (existing.version || 1) + 1;
    existing.generatedAt = now;
    existing.status = "current";
    existing.stale = false;
    existing.siteName = siteName || existing.siteName;
    existing.siteType = siteType || existing.siteType;
    existing.formLabel = formLabel || existing.formLabel;
  } else {
    all.push({
      id: docKey(siteId, period, formId),
      siteId: String(siteId),
      siteName: siteName || "",
      siteType: siteType || "",
      period,
      formId,
      formLabel: formLabel || formId,
      version: 1,
      generatedAt: now,
      status: "current",
      stale: false,
    });
  }
  writeJson(DOCS_KEY, all);
  return getDoc(siteId, period, formId);
}

export function markDocsStale(siteId, period) {
  const all = listGeneratedDocs().map((row) => {
    if (String(row.siteId) === String(siteId) && row.period === period) {
      return { ...row, stale: true, status: "stale" };
    }
    return row;
  });
  writeJson(DOCS_KEY, all);
}

export function isPayrollProcessed(siteId, period) {
  const flags = readJson(PAYROLL_KEY, {});
  const key = `${siteId}|${period}`;
  if (Object.prototype.hasOwnProperty.call(flags, key)) return Boolean(flags[key]);
  // Default: treat current and past months as processed so Generate is usable until HR payroll links in.
  const [y, m] = String(period).split("-").map(Number);
  const now = new Date();
  const periodDate = new Date(y, m - 1, 1);
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  return periodDate <= current;
}

export function setPayrollProcessed(siteId, period, processed) {
  const flags = readJson(PAYROLL_KEY, {});
  flags[`${siteId}|${period}`] = Boolean(processed);
  writeJson(PAYROLL_KEY, flags);
}

export function periodLabel(period) {
  const [y, m] = String(period || "").split("-").map(Number);
  if (!y || !m) return period || "";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[m - 1]} ${y}`;
}

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
