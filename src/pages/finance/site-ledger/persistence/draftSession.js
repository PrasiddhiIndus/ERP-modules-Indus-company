/**
 * Per-browser-tab identity for multi-tab draft coordination.
 * Uses sessionStorage so each tab has a stable id for the session lifetime.
 */

const TAB_KEY = "indus.finance.pl.draftTabId";

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @returns {string}
 */
export function getLedgerTabId() {
  try {
    if (typeof sessionStorage !== "undefined") {
      let id = sessionStorage.getItem(TAB_KEY);
      if (!id) {
        id = randomId();
        sessionStorage.setItem(TAB_KEY, id);
      }
      return id;
    }
  } catch {
    /* private mode */
  }
  if (!getLedgerTabId._fallback) getLedgerTabId._fallback = randomId();
  return getLedgerTabId._fallback;
}

/** @type {string|undefined} */
getLedgerTabId._fallback = undefined;

export function __resetLedgerTabIdForTests() {
  getLedgerTabId._fallback = undefined;
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(TAB_KEY);
  } catch {
    /* ignore */
  }
}
