/**
 * Compare a recovered local draft with the latest committed (server) snapshot.
 * Never auto-applies drafts over newer server data.
 */

import { fingerprintsEqual, stableStringify } from "../state/workingCopy.js";
import { fingerprintPayload, sanitizeDraftPayload } from "./draftStore.js";

/**
 * @typedef {'identical'|'draft_only'|'server_newer'|'draft_newer'|'conflict'} DraftCompareKind
 *
 * @typedef {object} DraftFieldDiff
 * @property {string} path
 * @property {unknown} draftValue
 * @property {unknown} serverValue
 *
 * @typedef {object} DraftComparison
 * @property {DraftCompareKind} kind
 * @property {boolean} hasDraft
 * @property {boolean} differsFromServer
 * @property {boolean} isStale
 * @property {boolean} isConflict
 * @property {string|null} draftFingerprint
 * @property {string|null} serverFingerprint
 * @property {string|null} draftSourceRevision
 * @property {string|null} currentSourceRevision
 * @property {number|null} draftUpdatedAt
 * @property {number|null} draftCreatedAt
 * @property {DraftFieldDiff[]} fieldDiffs
 * @property {string} summary
 */

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Collect shallow + one-level nested diffs for Review UI (financial amounts / notes).
 * @param {unknown} draft
 * @param {unknown} server
 * @param {string} [prefix]
 * @param {DraftFieldDiff[]} [out]
 * @param {number} [depth]
 */
export function collectFieldDiffs(draft, server, prefix = "", out = [], depth = 0) {
  const d = sanitizeDraftPayload(draft) || {};
  const s = sanitizeDraftPayload(server) || {};
  if (!isPlainObject(d) && !isPlainObject(s)) {
    if (!fingerprintsEqual(d, s)) {
      out.push({ path: prefix || "(value)", draftValue: d, serverValue: s });
    }
    return out;
  }
  const keys = new Set([
    ...Object.keys(isPlainObject(d) ? d : {}),
    ...Object.keys(isPlainObject(s) ? s : {}),
  ]);
  for (const key of keys) {
    if (key === "_audit") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const dv = isPlainObject(d) ? d[key] : undefined;
    const sv = isPlainObject(s) ? s[key] : undefined;
    if (depth < 1 && (isPlainObject(dv) || isPlainObject(sv)) && key === "reimbursements") {
      if (!fingerprintsEqual(dv, sv)) {
        out.push({ path, draftValue: dv, serverValue: sv });
      }
      continue;
    }
    if (depth < 1 && isPlainObject(dv) && isPlainObject(sv)) {
      collectFieldDiffs(dv, sv, path, out, depth + 1);
      continue;
    }
    if (!fingerprintsEqual(dv, sv)) {
      out.push({ path, draftValue: dv, serverValue: sv });
    }
  }
  return out;
}

/**
 * @param {{
 *   draft: import('./draftStore.js').LedgerDraft|null|undefined,
 *   serverSnapshot?: unknown,
 *   currentSourceRevision?: string|null,
 * }} input
 * @returns {DraftComparison}
 */
export function compareDraftToServer(input) {
  const draft = input.draft || null;
  const serverSnapshot = input.serverSnapshot ?? {};
  const currentSourceRevision = input.currentSourceRevision == null
    ? null
    : String(input.currentSourceRevision);

  if (!draft) {
    return {
      kind: "identical",
      hasDraft: false,
      differsFromServer: false,
      isStale: false,
      isConflict: false,
      draftFingerprint: null,
      serverFingerprint: fingerprintPayload(serverSnapshot),
      draftSourceRevision: null,
      currentSourceRevision,
      draftUpdatedAt: null,
      draftCreatedAt: null,
      fieldDiffs: [],
      summary: "No local draft.",
    };
  }

  const draftFp = draft.payloadFingerprint || fingerprintPayload(draft.payload);
  const serverFp = fingerprintPayload(serverSnapshot);
  const fieldDiffs = collectFieldDiffs(draft.payload, serverSnapshot);
  const differs = draftFp !== serverFp;
  const draftRev = draft.sourceRevision == null ? null : String(draft.sourceRevision);
  const revisionDrift = !!(
    draftRev
    && currentSourceRevision
    && draftRev !== currentSourceRevision
  );
  const serverMovedSinceDraft = !!(
    draft.serverFingerprint
    && draft.serverFingerprint !== serverFp
  );

  let kind = "identical";
  if (!differs) {
    kind = "identical";
  } else if (serverMovedSinceDraft || revisionDrift) {
    kind = "conflict";
  } else if (draft.serverFingerprint && draft.serverFingerprint === serverFp) {
    kind = "draft_newer";
  } else {
    // Server unknown baseline or draft predates fingerprinting — treat as conflict for safety.
    kind = differs ? "conflict" : "identical";
  }

  // If only draft differs and server fingerprint matches what draft was based on → draft_newer
  if (differs && draft.serverFingerprint && draft.serverFingerprint === serverFp) {
    kind = "draft_newer";
  }

  const isConflict = kind === "conflict";
  const isStale = isConflict || (revisionDrift && differs);

  let summary = "Local draft matches the database.";
  if (kind === "draft_newer") {
    summary = "A local draft has uncommitted changes based on the current database values.";
  } else if (kind === "conflict") {
    summary = "This draft may be based on older data. Review before resuming — the database may have changed since the draft was created.";
  } else if (kind === "draft_only") {
    summary = "A local draft exists with no matching server row yet.";
  }

  return {
    kind,
    hasDraft: true,
    differsFromServer: differs,
    isStale,
    isConflict,
    draftFingerprint: draftFp,
    serverFingerprint: serverFp,
    draftSourceRevision: draftRev,
    currentSourceRevision,
    draftUpdatedAt: draft.updatedAt ?? null,
    draftCreatedAt: draft.createdAt ?? null,
    fieldDiffs,
    summary,
  };
}

/**
 * Build a short human-readable review lines list (max N).
 * @param {DraftComparison} comparison
 * @param {number} [limit]
 */
export function formatDraftReviewLines(comparison, limit = 12) {
  const lines = (comparison.fieldDiffs || []).slice(0, limit).map((d) => {
    const left = d.draftValue === undefined || d.draftValue === "" ? "—" : String(
      typeof d.draftValue === "object" ? stableStringify(d.draftValue) : d.draftValue,
    );
    const right = d.serverValue === undefined || d.serverValue === "" ? "—" : String(
      typeof d.serverValue === "object" ? stableStringify(d.serverValue) : d.serverValue,
    );
    return `${d.path}: draft ${left} · database ${right}`;
  });
  if ((comparison.fieldDiffs || []).length > limit) {
    lines.push(`…and ${(comparison.fieldDiffs.length - limit)} more fields`);
  }
  return lines;
}
