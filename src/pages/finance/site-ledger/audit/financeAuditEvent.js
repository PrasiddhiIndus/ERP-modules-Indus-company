/**
 * Structured finance P&L audit event builder (client-side).
 * Does not write to the database by itself — callers attach to existing
 * activity / enqueueSave audit channels. No new migration required.
 *
 * Recovery that rewrites history must create a *new* revision later;
 * this helper only describes what happened.
 */

/**
 * @typedef {object} FinanceAuditEvent
 * @property {string} schema
 * @property {string} module
 * @property {string} operation
 * @property {string} recordType
 * @property {string|null} siteCode
 * @property {string|null} periodKey
 * @property {string|null} userId
 * @property {number|null} revision
 * @property {string|null} requestId
 * @property {string} saveStatus
 * @property {string} timestamp
 * @property {unknown} [previousValue]
 * @property {unknown} [newValue]
 * @property {string|null} [transactionId]
 * @property {object} [meta]
 */

/**
 * @param {Partial<FinanceAuditEvent> & { operation: string, recordType: string }} input
 * @returns {FinanceAuditEvent}
 */
export function buildFinanceAuditEvent(input) {
  return {
    schema: "finance",
    module: "site_ledger_pl",
    operation: String(input.operation || "unknown"),
    recordType: String(input.recordType || "unknown"),
    siteCode: input.siteCode ?? null,
    periodKey: input.periodKey ?? null,
    userId: input.userId ?? null,
    revision: input.revision != null ? Number(input.revision) : null,
    requestId: input.requestId ?? null,
    saveStatus: String(input.saveStatus || "unknown"),
    timestamp: input.timestamp || new Date().toISOString(),
    previousValue: input.previousValue,
    newValue: input.newValue,
    transactionId: input.transactionId ?? null,
    meta: input.meta || {},
  };
}

/** Compact summary suitable for toast / activity log text. */
export function summarizeFinanceAuditEvent(event) {
  if (!event) return "";
  const parts = [
    event.operation,
    event.recordType,
    event.siteCode && `site=${event.siteCode}`,
    event.periodKey && `period=${event.periodKey}`,
    event.revision != null && `rev=${event.revision}`,
    event.saveStatus,
  ].filter(Boolean);
  return parts.join(" · ");
}
