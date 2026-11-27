/**
 * Phase 3 concurrency helpers — structured conflict codes and merge analysis.
 */

export const FINANCE_ERROR_CODES = Object.freeze({
  REVISION_CONFLICT: "REVISION_CONFLICT",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  MISSING_SITE: "MISSING_SITE",
  MISSING_PERIOD: "MISSING_PERIOD",
  INVALID_DATA: "INVALID_DATA",
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  DEPENDENCY_VIOLATION: "DEPENDENCY_VIOLATION",
  DATABASE_FAILURE: "DATABASE_FAILURE",
  OK: "OK",
});

/**
 * @param {unknown} resultOrError
 * @returns {{
 *   code: string,
 *   message: string,
 *   ok: boolean,
 *   expectedRevision?: number|null,
 *   currentRevision?: number|null,
 *   server?: object|null,
 *   raw?: unknown,
 * }}
 */
export function parseFinanceSaveResult(resultOrError) {
  if (resultOrError && typeof resultOrError === "object" && "ok" in resultOrError) {
    const r = resultOrError;
    return {
      code: String(r.code || (r.ok ? FINANCE_ERROR_CODES.OK : FINANCE_ERROR_CODES.DATABASE_FAILURE)),
      message: String(r.message || (r.ok ? "Saved" : "Save failed")),
      ok: !!r.ok,
      expectedRevision: r.expected_revision ?? r.expectedRevision ?? null,
      currentRevision: r.current_revision ?? r.currentRevision ?? r.revision ?? null,
      server: r.server || null,
      raw: r,
    };
  }

  const msg = typeof resultOrError === "string"
    ? resultOrError
    : (resultOrError?.message || resultOrError?.error?.message || "Save failed");
  const codeFromMsg = /REVISION_CONFLICT/i.test(msg)
    ? FINANCE_ERROR_CODES.REVISION_CONFLICT
    : /PERMISSION|RLS|policy/i.test(msg)
      ? FINANCE_ERROR_CODES.PERMISSION_DENIED
      : /DEPENDENCY/i.test(msg)
        ? FINANCE_ERROR_CODES.DEPENDENCY_VIOLATION
        : FINANCE_ERROR_CODES.DATABASE_FAILURE;

  return {
    code: resultOrError?.code && FINANCE_ERROR_CODES[resultOrError.code]
      ? resultOrError.code
      : codeFromMsg,
    message: String(msg),
    ok: false,
    expectedRevision: resultOrError?.expected_revision ?? null,
    currentRevision: resultOrError?.current_revision ?? null,
    server: resultOrError?.server || null,
    raw: resultOrError,
  };
}

export function isRevisionConflict(parsed) {
  return parsed?.code === FINANCE_ERROR_CODES.REVISION_CONFLICT;
}

/**
 * Compare original / server / pending for conflict UI.
 * Safe keys = changed in pending but unchanged between original and server.
 * Manual keys = changed in both pending and server since original.
 *
 * @param {{ original?: object, server?: object, pending?: object }} input
 */
export function analyzeConflictMerge({ original = {}, server = {}, pending = {} } = {}) {
  const keys = new Set([
    ...Object.keys(original || {}),
    ...Object.keys(server || {}),
    ...Object.keys(pending || {}),
  ]);
  const safe = [];
  const manual = [];
  const serverOnly = [];
  const pendingOnly = [];

  for (const key of keys) {
    if (key.startsWith("_")) continue;
    const o = original?.[key];
    const s = server?.[key];
    const p = pending?.[key];
    const oStr = JSON.stringify(o ?? null);
    const sStr = JSON.stringify(s ?? null);
    const pStr = JSON.stringify(p ?? null);
    const serverChanged = oStr !== sStr;
    const pendingChanged = oStr !== pStr;
    if (pendingChanged && !serverChanged) {
      safe.push({ key, original: o, server: s, pending: p });
    } else if (pendingChanged && serverChanged && pStr !== sStr) {
      manual.push({ key, original: o, server: s, pending: p });
    } else if (serverChanged && !pendingChanged) {
      serverOnly.push({ key, original: o, server: s, pending: p });
    } else if (pendingChanged && serverChanged && pStr === sStr) {
      // both made the same change
      safe.push({ key, original: o, server: s, pending: p });
    } else if (pendingChanged) {
      pendingOnly.push({ key, original: o, server: s, pending: p });
    }
  }

  return { safe, manual, serverOnly, pendingOnly };
}

export function newFinanceRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
