/**
 * Working-copy primitives for Site Ledger financial workspaces.
 *
 * Three states must stay distinct:
 * - original  — last successfully loaded / refreshed server snapshot (immutable conceptually)
 * - working   — user's pending edits
 * - committed — last payload confirmed persisted by the database
 */

export function deepClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      /* fall through for non-cloneable */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function fingerprintsEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/**
 * @typedef {object} WorkingCopyRecord
 * @property {string} key
 * @property {'period'|'setup'} kind
 * @property {unknown} original
 * @property {unknown} working
 * @property {unknown|null} committed
 * @property {boolean} dirty
 * @property {number} localGen
 * @property {string|null} sourceRevision
 * @property {'idle'|'dirty'|'saving'|'saved'|'error'} status
 * @property {string|null} lastError
 * @property {number|null} updatedAt
 */

/**
 * @param {{ key: string, kind?: 'period'|'setup', original?: unknown, sourceRevision?: string|null }} opts
 * @returns {WorkingCopyRecord}
 */
export function createWorkingCopy({
  key,
  kind = "period",
  original = null,
  sourceRevision = null,
} = {}) {
  if (!key) throw new Error("createWorkingCopy: key is required");
  const snap = deepClone(original);
  return {
    key,
    kind,
    original: snap,
    working: deepClone(snap),
    committed: snap == null ? null : deepClone(snap),
    dirty: false,
    localGen: 0,
    sourceRevision: sourceRevision == null ? null : String(sourceRevision),
    status: "idle",
    lastError: null,
    updatedAt: Date.now(),
  };
}

/**
 * Replace the server snapshot. Does not wipe newer local edits unless `forceReset`.
 * @param {WorkingCopyRecord} record
 * @param {unknown} serverValue
 * @param {{ sourceRevision?: string|null, forceReset?: boolean }} [opts]
 */
export function hydrateFromServer(record, serverValue, opts = {}) {
  const next = { ...record };
  const snap = deepClone(serverValue);
  next.sourceRevision = opts.sourceRevision == null
    ? next.sourceRevision
    : String(opts.sourceRevision);

  if (opts.forceReset || !next.dirty) {
    next.original = snap;
    next.working = deepClone(snap);
    next.committed = deepClone(snap);
    next.dirty = false;
    next.status = "idle";
    next.lastError = null;
    next.localGen += 1;
    next.updatedAt = Date.now();
    return next;
  }

  // Keep working edits; refresh original/committed baselines for conflict awareness.
  next.original = snap;
  if (next.committed == null) next.committed = deepClone(snap);
  next.updatedAt = Date.now();
  return next;
}

/**
 * Apply a patch or replacement to the working copy only.
 * Never mutates `original`.
 * @param {WorkingCopyRecord} record
 * @param {unknown|((prev: unknown) => unknown)} patchOrUpdater
 */
export function applyWorkingEdit(record, patchOrUpdater) {
  const prevWorking = record.working;
  const nextWorking = typeof patchOrUpdater === "function"
    ? patchOrUpdater(deepClone(prevWorking))
    : deepClone(patchOrUpdater);

  const dirty = !fingerprintsEqual(nextWorking, record.original);
  return {
    ...record,
    working: nextWorking,
    dirty,
    localGen: record.localGen + 1,
    status: dirty ? "dirty" : "idle",
    lastError: dirty ? record.lastError : null,
    updatedAt: Date.now(),
  };
}

export function markSaving(record) {
  return {
    ...record,
    status: "saving",
    lastError: null,
    updatedAt: Date.now(),
  };
}

/**
 * After a confirmed DB write of `savedPayload` that was captured at `savedGen`.
 * If the user edited again while the request was in flight, keep dirty + working.
 * @param {WorkingCopyRecord} record
 * @param {unknown} savedPayload
 * @param {number} savedGen
 */
export function markSaveSucceeded(record, savedPayload, savedGen) {
  const committed = deepClone(savedPayload);
  if (record.localGen !== savedGen) {
    return {
      ...record,
      original: deepClone(committed),
      committed,
      dirty: true,
      status: "dirty",
      lastError: null,
      updatedAt: Date.now(),
    };
  }
  return {
    ...record,
    original: deepClone(committed),
    working: deepClone(committed),
    committed,
    dirty: false,
    status: "saved",
    lastError: null,
    updatedAt: Date.now(),
  };
}

/**
 * Failed save: never clear working copy or dirty flag.
 * @param {WorkingCopyRecord} record
 * @param {string|Error} error
 */
export function markSaveFailed(record, error) {
  const message = typeof error === "string"
    ? error
    : (error?.message || "Save failed");
  return {
    ...record,
    status: "error",
    lastError: message,
    dirty: true,
    updatedAt: Date.now(),
  };
}

/**
 * Discard working edits and restore from original snapshot.
 * @param {WorkingCopyRecord} record
 */
export function discardWorkingCopy(record) {
  return {
    ...record,
    working: deepClone(record.original),
    dirty: false,
    localGen: record.localGen + 1,
    status: "idle",
    lastError: null,
    updatedAt: Date.now(),
  };
}

/**
 * Restore a draft into working without treating it as committed.
 * @param {WorkingCopyRecord} record
 * @param {unknown} draftPayload
 * @param {{ sourceRevision?: string|null }} [meta]
 */
export function restoreDraftIntoWorking(record, draftPayload, meta = {}) {
  const working = deepClone(draftPayload);
  const dirty = !fingerprintsEqual(working, record.original);
  return {
    ...record,
    working,
    dirty,
    localGen: record.localGen + 1,
    sourceRevision: meta.sourceRevision != null
      ? String(meta.sourceRevision)
      : record.sourceRevision,
    status: dirty ? "dirty" : "idle",
    lastError: null,
    updatedAt: Date.now(),
  };
}

export function periodRecordKey(siteCode, periodKey) {
  return `period:${siteCode}__${periodKey}`;
}

export function setupRecordKey(scope = "ledger") {
  return `setup:${scope}`;
}
