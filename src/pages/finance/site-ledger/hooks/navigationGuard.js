/**
 * Browser + in-app navigation protection for unsaved Site Ledger edits.
 *
 * Does NOT flush financial data to the database on pagehide/visibilitychange.
 * Callers may optionally persist drafts via onHidden.
 */

/**
 * @param {{
 *   shouldBlock: () => boolean,
 *   onHidden?: () => void,
 *   message?: string,
 * }} opts
 * @returns {() => void} unsubscribe
 */
export function attachLedgerNavigationGuard(opts) {
  const shouldBlock = opts.shouldBlock || (() => false);
  const onHidden = opts.onHidden || null;

  const onBeforeUnload = (e) => {
    if (!shouldBlock()) return undefined;
    e.preventDefault();
    e.returnValue = opts.message || "";
    return opts.message || "";
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      onHidden?.();
    }
  };

  const onPageHide = () => {
    onHidden?.();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
  }

  return () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

/**
 * Confirm leaving an in-app view when dirty.
 * @param {{ isDirty: boolean, message?: string, confirmFn?: (opts: object) => Promise<boolean> }} opts
 * @returns {Promise<boolean>} true when navigation may proceed
 */
export async function confirmLeaveIfDirty(opts) {
  if (!opts.isDirty) return true;
  const message = opts.message
    || "You have unsaved changes. Leave without saving? Your draft is kept in this browser until you discard it.";
  if (typeof opts.confirmFn === "function") {
    return !!(await opts.confirmFn({
      title: "Unsaved changes",
      message,
      confirmLabel: "Leave",
      tone: "danger",
    }));
  }
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return false;
}
