/**
 * Save Coordinator — Site Ledger financial writes behind siteLedgerStore.
 * Phase 2: richer draft lifecycle, conditional multi-tab cleanup, conflict peek.
 */

import {
  applyWorkingEdit,
  createWorkingCopy,
  deepClone,
  discardWorkingCopy,
  hydrateFromServer,
  markSaveFailed,
  markSaveSucceeded,
  markSaving,
  periodRecordKey,
  restoreDraftIntoWorking,
  setupRecordKey,
} from "../state/workingCopy.js";
import { compareDraftToServer } from "./draftCompare.js";
import {
  deleteDraft,
  deleteDraftIfUnchanged,
  getDraft,
  onLedgerUserContextChange,
  putDraft,
} from "./draftStore.js";
import {
  FINANCE_ERROR_CODES,
  isRevisionConflict,
  parseFinanceSaveResult,
} from "./financeConcurrency.js";

function normalizeError(err) {
  if (typeof err === "string") return err;
  return err?.message || "Save failed";
}

/**
 * @typedef {object} SaveCoordinatorOptions
 * @property {string} [userId]
 * @property {(draft: object, meta?: object) => void} [onDraftChange]
 * @property {(key: string, record: object) => void} [onRecordChange]
 * @property {(warning: object|null) => void} [onDraftStorageWarning]
 */

export class SaveCoordinator {
  /** @param {SaveCoordinatorOptions} [opts] */
  constructor(opts = {}) {
    this.userId = opts.userId || "anon";
    this.onDraftChange = opts.onDraftChange || null;
    this.onRecordChange = opts.onRecordChange || null;
    this.onDraftStorageWarning = opts.onDraftStorageWarning || null;
    /** @type {Map<string, import('../state/workingCopy.js').WorkingCopyRecord>} */
    this.records = new Map();
    /** @type {Map<string, Promise<unknown>>} */
    this.saveChains = new Map();
    /** @type {Map<string, number>} */
    this.saveTokens = new Map();
    /** Last draft write meta per key (for conditional delete). */
    this.lastDraftMeta = new Map();
    this.lastStorageWarning = null;
  }

  setUserId(userId) {
    const next = userId || "anon";
    if (next === this.userId) return;
    const prev = this.userId;
    this.userId = next;
    // Keep IndexedDB drafts for prev user (recoverable). Clear in-memory working copies.
    this.records.clear();
    this.saveChains.clear();
    this.saveTokens.clear();
    this.lastDraftMeta.clear();
    onLedgerUserContextChange(prev);
  }

  /**
   * @param {string} key
   * @returns {import('../state/workingCopy.js').WorkingCopyRecord|null}
   */
  getRecord(key) {
    return this.records.get(key) || null;
  }

  /** @returns {boolean} */
  hasAnyDirty() {
    for (const rec of this.records.values()) {
      if (rec.dirty || rec.status === "saving" || rec.status === "error") return true;
    }
    return false;
  }

  /** @returns {boolean} */
  hasDirtyFigures() {
    for (const rec of this.records.values()) {
      if (rec.kind !== "period") continue;
      if (rec.dirty || rec.status === "saving" || rec.status === "error") return true;
    }
    return false;
  }

  /** @returns {boolean} */
  hasDirtySetup() {
    for (const rec of this.records.values()) {
      if (rec.kind !== "setup") continue;
      if (rec.dirty || rec.status === "saving" || rec.status === "error") return true;
    }
    return false;
  }

  /**
   * @param {string} key
   * @param {import('../state/workingCopy.js').WorkingCopyRecord} next
   */
  #setRecord(key, next) {
    this.records.set(key, next);
    this.onRecordChange?.(key, next);
  }

  loadPeriod(siteCode, periodKey, serverRecord, opts = {}) {
    const key = periodRecordKey(siteCode, periodKey);
    const existing = this.records.get(key);
    if (!existing) {
      const created = createWorkingCopy({
        key,
        kind: "period",
        original: serverRecord || {},
        sourceRevision: opts.sourceRevision ?? null,
      });
      this.#setRecord(key, created);
      return created;
    }
    const next = hydrateFromServer(existing, serverRecord || {}, opts);
    this.#setRecord(key, next);
    return next;
  }

  loadSetup(serverSnapshot, opts = {}) {
    const key = setupRecordKey(opts.scope || "ledger");
    const existing = this.records.get(key);
    if (!existing) {
      const created = createWorkingCopy({
        key,
        kind: "setup",
        original: serverSnapshot,
        sourceRevision: opts.sourceRevision ?? null,
      });
      this.#setRecord(key, created);
      return created;
    }
    const next = hydrateFromServer(existing, serverSnapshot, opts);
    this.#setRecord(key, next);
    return next;
  }

  editPeriod(siteCode, periodKey, patchOrUpdater, opts = {}) {
    const key = periodRecordKey(siteCode, periodKey);
    let rec = this.records.get(key);
    if (!rec) {
      rec = createWorkingCopy({ key, kind: "period", original: {} });
      this.records.set(key, rec);
    }
    const next = applyWorkingEdit(rec, patchOrUpdater);
    this.#setRecord(key, next);
    if (opts.persistDraft !== false) {
      void this.#persistDraft(next, {
        siteCode: opts.siteCode ?? siteCode,
        periodKey: opts.periodKey ?? periodKey,
        status: "pending",
      });
    }
    return next;
  }

  editSetup(patchOrUpdater, opts = {}) {
    const key = setupRecordKey(opts.scope || "ledger");
    let rec = this.records.get(key);
    if (!rec) {
      rec = createWorkingCopy({ key, kind: "setup", original: null });
      this.records.set(key, rec);
    }
    const next = applyWorkingEdit(rec, patchOrUpdater);
    this.#setRecord(key, next);
    if (opts.persistDraft !== false) {
      void this.#persistDraft(next, { status: "pending" });
    }
    return next;
  }

  /**
   * @param {import('../state/workingCopy.js').WorkingCopyRecord} record
   * @param {{ siteCode?: string|null, periodKey?: string|null, status?: string, lastError?: string|null }} meta
   */
  async #persistDraft(record, meta = {}) {
    try {
      const result = await putDraft({
        userId: this.userId,
        recordKey: record.key,
        kind: record.kind,
        siteCode: meta.siteCode ?? null,
        periodKey: meta.periodKey ?? null,
        payload: deepClone(record.working),
        sourceRevision: record.sourceRevision,
        serverSnapshot: record.original,
        status: meta.status || "pending",
        lastError: meta.lastError ?? null,
      });
      if (result.draft) {
        this.lastDraftMeta.set(record.key, {
          updatedAt: result.draft.updatedAt,
          payloadFingerprint: result.draft.payloadFingerprint,
        });
      }
      this.lastStorageWarning = result.error || null;
      this.onDraftStorageWarning?.(result.error || null);
      this.onDraftChange?.(result.draft, { storage: result.storage, error: result.error });
      return result;
    } catch (err) {
      this.lastStorageWarning = {
        code: "unknown",
        message: err?.message || "Draft persist failed",
      };
      this.onDraftStorageWarning?.(this.lastStorageWarning);
      return { draft: null, storage: "memory", error: this.lastStorageWarning };
    }
  }

  async peekPeriodDraft(siteCode, periodKey) {
    return getDraft(this.userId, periodRecordKey(siteCode, periodKey));
  }

  /**
   * Evaluate draft vs current server snapshot without applying.
   */
  async evaluatePeriodDraft(siteCode, periodKey, serverSnapshot, currentSourceRevision = null) {
    const draft = await this.peekPeriodDraft(siteCode, periodKey);
    return {
      draft,
      comparison: compareDraftToServer({
        draft,
        serverSnapshot: serverSnapshot || {},
        currentSourceRevision,
      }),
      storageWarning: this.lastStorageWarning,
    };
  }

  async resumePeriodDraft(siteCode, periodKey) {
    const key = periodRecordKey(siteCode, periodKey);
    const draft = await getDraft(this.userId, key);
    if (!draft) return null;
    let rec = this.records.get(key);
    if (!rec) {
      rec = createWorkingCopy({ key, kind: "period", original: {} });
    }
    const next = restoreDraftIntoWorking(rec, draft.payload, {
      sourceRevision: draft.sourceRevision,
    });
    this.#setRecord(key, next);
    return next;
  }

  async discardPeriodDraft(siteCode, periodKey) {
    const key = periodRecordKey(siteCode, periodKey);
    await deleteDraft(this.userId, key);
    this.lastDraftMeta.delete(key);
    const rec = this.records.get(key);
    if (!rec) return null;
    const next = discardWorkingCopy(rec);
    this.#setRecord(key, next);
    return next;
  }

  discardPeriodWorking(siteCode, periodKey) {
    const key = periodRecordKey(siteCode, periodKey);
    const rec = this.records.get(key);
    if (!rec) return null;
    const next = discardWorkingCopy(rec);
    this.#setRecord(key, next);
    void deleteDraft(this.userId, key);
    this.lastDraftMeta.delete(key);
    return next;
  }

  #runExclusive(key, task) {
    const prev = this.saveChains.get(key) || Promise.resolve();
    const run = prev
      .catch(() => {})
      .then(() => task());
    this.saveChains.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  savePeriod(siteCode, periodKey, handlers) {
    const key = periodRecordKey(siteCode, periodKey);
    return this.#runExclusive(key, () => this.#savePeriodInner(siteCode, periodKey, handlers));
  }

  async #savePeriodInner(siteCode, periodKey, handlers) {
    const key = periodRecordKey(siteCode, periodKey);
    const rec = this.records.get(key);
    if (!rec) {
      return { ok: false, error: "No working copy loaded for this period." };
    }
    if (!rec.dirty && rec.status !== "error") {
      return { ok: true, skipped: true, record: rec };
    }

    const validationError = handlers.validate?.(rec.working) || null;
    if (validationError) {
      const failed = markSaveFailed(rec, validationError);
      this.#setRecord(key, failed);
      await this.#persistDraft(failed, {
        siteCode,
        periodKey,
        status: "save_failed",
        lastError: validationError,
      });
      return { ok: false, error: validationError, record: failed };
    }

    const savedGen = rec.localGen;
    const payload = deepClone(rec.working);
    const token = (this.saveTokens.get(key) || 0) + 1;
    this.saveTokens.set(key, token);
    const draftMetaAtStart = this.lastDraftMeta.get(key) || null;

    this.#setRecord(key, markSaving(rec));

    try {
      const persistResult = await handlers.persist(payload, { siteCode, periodKey, localGen: savedGen });

      if (this.saveTokens.get(key) !== token) {
        return { ok: true, staleIgnored: true, record: this.records.get(key) };
      }

      // Prefer server-returned revision over client-side guessing.
      let committedPayload = payload;
      if (persistResult && typeof persistResult === "object") {
        const serverRev = persistResult.revision ?? persistResult._revision
          ?? persistResult.currentRevision;
        if (serverRev != null && Number.isFinite(Number(serverRev))) {
          committedPayload = { ...payload, _revision: Number(serverRev) };
        }
      }

      const current = this.records.get(key) || rec;
      const next = markSaveSucceeded(current, committedPayload, savedGen);
      this.#setRecord(key, next);
      if (!next.dirty) {
        // Clear draft only when no newer pending modifications remain.
        await deleteDraftIfUnchanged(this.userId, key, {
          expectedPayloadFingerprint: draftMetaAtStart?.payloadFingerprint
            || this.lastDraftMeta.get(key)?.payloadFingerprint,
          expectedUpdatedAt: draftMetaAtStart?.updatedAt
            || this.lastDraftMeta.get(key)?.updatedAt,
        });
        this.lastDraftMeta.delete(key);
      } else {
        await this.#persistDraft(next, { siteCode, periodKey, status: "pending" });
      }
      return { ok: true, record: next, persistResult };
    } catch (err) {
      if (this.saveTokens.get(key) !== token) {
        return { ok: false, staleIgnored: true, error: normalizeError(err), record: this.records.get(key) };
      }
      const current = this.records.get(key) || rec;
      const parsed = parseFinanceSaveResult(err?.financeResult || err);
      const failed = markSaveFailed(current, err);
      // Preserve working copy + draft on revision conflict (never treat as committed).
      const withConflict = isRevisionConflict(parsed) || err?.code === FINANCE_ERROR_CODES.REVISION_CONFLICT
        ? {
          ...failed,
          status: "error",
          lastError: parsed.message || failed.lastError,
          conflict: {
            code: FINANCE_ERROR_CODES.REVISION_CONFLICT,
            expectedRevision: parsed.expectedRevision,
            currentRevision: parsed.currentRevision,
            server: parsed.server,
          },
        }
        : failed;
      this.#setRecord(key, withConflict);
      await this.#persistDraft(withConflict, {
        siteCode,
        periodKey,
        status: withConflict.conflict ? "conflict" : "save_failed",
        lastError: normalizeError(err),
      });
      return {
        ok: false,
        error: normalizeError(err),
        conflict: withConflict.conflict || null,
        record: withConflict,
      };
    }
  }

  saveSetup(handlers) {
    const key = setupRecordKey(handlers.scope || "ledger");
    return this.#runExclusive(key, () => this.#saveSetupInner(handlers));
  }

  async #saveSetupInner(handlers) {
    const key = setupRecordKey(handlers.scope || "ledger");
    const rec = this.records.get(key);
    if (!rec) {
      return { ok: false, error: "No Site Setup working copy loaded." };
    }
    if (!rec.dirty && rec.status !== "error") {
      return { ok: true, skipped: true, record: rec };
    }

    const validationError = handlers.validate?.(rec.working) || null;
    if (validationError) {
      const failed = markSaveFailed(rec, validationError);
      this.#setRecord(key, failed);
      await this.#persistDraft(failed, { status: "save_failed", lastError: validationError });
      return { ok: false, error: validationError, record: failed };
    }

    const savedGen = rec.localGen;
    const payload = deepClone(rec.working);
    const token = (this.saveTokens.get(key) || 0) + 1;
    this.saveTokens.set(key, token);
    const draftMetaAtStart = this.lastDraftMeta.get(key) || null;
    this.#setRecord(key, markSaving(rec));

    try {
      const persistResult = await handlers.persist(payload, { localGen: savedGen });
      if (this.saveTokens.get(key) !== token) {
        return { ok: true, staleIgnored: true, record: this.records.get(key) };
      }
      const current = this.records.get(key) || rec;
      const next = markSaveSucceeded(current, payload, savedGen);
      this.#setRecord(key, next);
      if (!next.dirty) {
        await deleteDraftIfUnchanged(this.userId, key, {
          expectedPayloadFingerprint: draftMetaAtStart?.payloadFingerprint
            || this.lastDraftMeta.get(key)?.payloadFingerprint,
          expectedUpdatedAt: draftMetaAtStart?.updatedAt
            || this.lastDraftMeta.get(key)?.updatedAt,
        });
        this.lastDraftMeta.delete(key);
      }
      return { ok: true, record: next, persistResult };
    } catch (err) {
      if (this.saveTokens.get(key) !== token) {
        return { ok: false, staleIgnored: true, error: normalizeError(err), record: this.records.get(key) };
      }
      const current = this.records.get(key) || rec;
      const failed = markSaveFailed(current, err);
      this.#setRecord(key, failed);
      await this.#persistDraft(failed, { status: "save_failed", lastError: normalizeError(err) });
      return { ok: false, error: normalizeError(err), record: failed };
    }
  }

  /** Test helper */
  __resetForTests() {
    this.records.clear();
    this.saveChains.clear();
    this.saveTokens.clear();
    this.lastDraftMeta.clear();
    this.lastStorageWarning = null;
  }
}

let sharedCoordinator = null;

export function getSharedSaveCoordinator(opts = {}) {
  if (!sharedCoordinator) {
    sharedCoordinator = new SaveCoordinator(opts);
  } else if (opts.userId) {
    sharedCoordinator.setUserId(opts.userId);
  }
  return sharedCoordinator;
}

export function __resetSharedSaveCoordinatorForTests() {
  sharedCoordinator = null;
}
