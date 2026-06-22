/** localStorage keys for in-progress billing forms (survives refresh / module navigation). */
export const BILLING_VERTICAL_STORAGE_KEY = 'billing_vertical_filter';

/** One stable key per form — vertical is stored inside the payload, not in the key. */
export const BILLING_DRAFT_KEYS = {
  createInvoice: 'billing:form:create-invoice',
  addOnInvoice: 'billing:form:add-on-invoice',
  wopoForm: 'billing:form:wopo',
  creditNotesIssue: 'billing:form:credit-notes-issue',
};

export const BILLING_AUTOSAVE_KEYS = {
  createInvoice: () => BILLING_DRAFT_KEYS.createInvoice,
  wopoForm: () => BILLING_DRAFT_KEYS.wopoForm,
  addOnInvoice: () => BILLING_DRAFT_KEYS.addOnInvoice,
  cnDnIssue: (parentId, noteType) => `billing:form:cn-dn:${parentId}:${noteType}`,
  managePa: (invoiceId) => `billing:form:manage-pa:${invoiceId}`,
  creditNotesIssue: () => BILLING_DRAFT_KEYS.creditNotesIssue,
};

export function getBillingVerticalFromStorage() {
  try {
    return window.localStorage.getItem(BILLING_VERTICAL_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function resolveBillingAutosaveVertical(billingVerticalFilter) {
  const v = String(billingVerticalFilter || '').trim();
  return v || getBillingVerticalFromStorage();
}

export function loadBillingFormDraft(key) {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadBillingFormDraftPayload(key) {
  const draft = loadBillingFormDraft(key);
  return draft?.payload && typeof draft.payload === 'object' ? draft.payload : null;
}

/** Load newest draft for a stable key, falling back to legacy per-vertical keys. */
export function loadBillingFormDraftPayloadWithLegacy(stableKey, legacyPrefix) {
  const direct = loadBillingFormDraftPayload(stableKey);
  if (direct) return direct;

  let newest = null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(legacyPrefix)) continue;
      const draft = loadBillingFormDraft(k);
      if (!draft?.payload) continue;
      if (!newest || Number(draft.savedAt || 0) > Number(newest.savedAt || 0)) {
        newest = draft;
      }
    }
  } catch {
    /* ignore */
  }
  if (!newest?.payload) return null;
  saveBillingFormDraft(stableKey, { payload: newest.payload });
  return newest.payload;
}

export function saveBillingFormDraft(key, data) {
  if (!key) return false;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...data,
        savedAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearBillingFormDraft(key) {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
    const legacyPrefixes =
      key === BILLING_DRAFT_KEYS.createInvoice
        ? ['billing:form:create-invoice:']
        : key === BILLING_DRAFT_KEYS.addOnInvoice
          ? ['billing:form:add-on:']
          : key === BILLING_DRAFT_KEYS.wopoForm
            ? ['billing:form:wopo:']
            : key === BILLING_DRAFT_KEYS.creditNotesIssue
              ? ['billing:form:credit-notes-issue:']
              : [];
    if (!legacyPrefixes.length) return;
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (legacyPrefixes.some((prefix) => k.startsWith(prefix))) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
