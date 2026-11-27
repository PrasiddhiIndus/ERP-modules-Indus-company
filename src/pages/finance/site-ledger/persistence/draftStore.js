/**
 * Client-side draft store for Site Ledger working copies (Phase 2).
 *
 * IndexedDB when available; in-memory fallback for Node/tests, private mode,
 * or IndexedDB/quota failures. Drafts are NEVER treated as committed ledger rows.
 *
 * Isolation: userId + kind + siteCode + periodKey (via recordKey).
 * Multi-tab: conditional delete + BroadcastChannel notifications.
 * Logout: drafts are retained per userId so re-login can recover; only the
 * in-memory coordinator context is cleared on account switch.
 */

import { deepClone, stableStringify } from "../state/workingCopy.js";
import { getLedgerTabId } from "./draftSession.js";

export const DRAFT_DB_NAME = "indus-finance-pl-drafts";
export const DRAFT_DB_VERSION = 2;
export const DRAFT_STORE_NAME = "drafts";

/** @typedef {'pending'|'conflict'|'stale'|'save_failed'|'committed_cleared'} DraftStatus */

/**
 * @typedef {object} LedgerDraft
 * @property {string} id
 * @property {string} userId
 * @property {string} recordKey
 * @property {'period'|'setup'} kind
 * @property {string|null} siteCode
 * @property {string|null} periodKey
 * @property {unknown} payload
 * @property {string|null} sourceRevision
 * @property {string|null} serverFingerprint
 * @property {string|null} payloadFingerprint
 * @property {DraftStatus|string} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string|null} tabId
 * @property {string|null} lastError
 */

/** Fields that must never be persisted in draft payloads. */
const SENSITIVE_KEY_RE = /^(password|token|access_token|refresh_token|authorization|secret|apiKey|api_key)$/i;

/** @type {Map<string, LedgerDraft>|null} */
let memoryStore = null;

/** Optional test doubles */
let idbAdapter = null;

function memoryMap() {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

export function draftStorageKey(userId, recordKey) {
  return `${userId || "anon"}::${recordKey}`;
}

export function canUseIndexedDb() {
  if (idbAdapter) return true;
  try {
    return typeof indexedDB !== "undefined" && indexedDB != null;
  } catch {
    return false;
  }
}

/**
 * Strip credentials / auth material and ephemeral audit blobs from draft payloads.
 * @param {unknown} value
 * @returns {unknown}
 */
export function sanitizeDraftPayload(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeDraftPayload(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (k === "_audit") continue;
    out[k] = sanitizeDraftPayload(v);
  }
  return out;
}

export function fingerprintPayload(value) {
  return stableStringify(sanitizeDraftPayload(value));
}

function isQuotaError(err) {
  if (!err) return false;
  const name = err.name || "";
  const msg = String(err.message || err);
  return (
    name === "QuotaExceededError"
    || /quota/i.test(msg)
    || err.code === 22
  );
}

/**
 * @param {any} err
 * @returns {{ code: 'quota'|'unavailable'|'unknown', message: string, cause?: unknown }}
 */
export function classifyDraftStorageError(err) {
  if (isQuotaError(err)) {
    return {
      code: "quota",
      message: "Browser storage is full. Your changes are kept on screen but the local draft may not survive a refresh.",
      cause: err,
    };
  }
  if (!canUseIndexedDb()) {
    return {
      code: "unavailable",
      message: "Local draft storage is unavailable in this browser session.",
      cause: err,
    };
  }
  return {
    code: "unknown",
    message: err?.message || "Could not write local draft.",
    cause: err,
  };
}

function openDb() {
  if (idbAdapter?.openDb) return idbAdapter.openDb();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const from = event.oldVersion || 0;
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        const store = db.createObjectStore(DRAFT_STORE_NAME, { keyPath: "id" });
        store.createIndex("by_user", "userId", { unique: false });
        store.createIndex("by_user_kind", ["userId", "kind"], { unique: false });
        store.createIndex("by_user_site_period", ["userId", "siteCode", "periodKey"], { unique: false });
      } else if (from < 2) {
        const tx = req.transaction;
        const store = tx.objectStore(DRAFT_STORE_NAME);
        if (!store.indexNames.contains("by_user")) {
          store.createIndex("by_user", "userId", { unique: false });
        }
        if (!store.indexNames.contains("by_user_kind")) {
          store.createIndex("by_user_kind", ["userId", "kind"], { unique: false });
        }
        if (!store.indexNames.contains("by_user_site_period")) {
          store.createIndex("by_user_site_period", ["userId", "siteCode", "periodKey"], { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbPut(row) {
  if (idbAdapter?.put) return idbAdapter.put(row);
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB put failed"));
      tx.objectStore(DRAFT_STORE_NAME).put(row);
    });
  } finally {
    db.close();
  }
}

async function idbGet(id) {
  if (idbAdapter?.get) return idbAdapter.get(id);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, "readonly");
      tx.onerror = () => reject(tx.error || new Error("IndexedDB get failed"));
      const req = tx.objectStore(DRAFT_STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id) {
  if (idbAdapter?.delete) return idbAdapter.delete(id);
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"));
      tx.objectStore(DRAFT_STORE_NAME).delete(id);
    });
  } finally {
    db.close();
  }
}

async function idbGetAllForUser(userId) {
  if (idbAdapter?.getAllForUser) return idbAdapter.getAllForUser(userId);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, "readonly");
      tx.onerror = () => reject(tx.error || new Error("IndexedDB list failed"));
      const store = tx.objectStore(DRAFT_STORE_NAME);
      if (store.indexNames.contains("by_user")) {
        const req = store.index("by_user").getAll(userId || "anon");
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error || new Error("IndexedDB list failed"));
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const uid = userId || "anon";
          resolve((req.result || []).filter((r) => r.userId === uid));
        };
        req.onerror = () => reject(req.error || new Error("IndexedDB list failed"));
      }
    });
  } finally {
    db.close();
  }
}

function normalizeLegacyDraft(row) {
  if (!row || typeof row !== "object") return null;
  const updatedAt = Number(row.updatedAt) || Date.now();
  const payload = row.payload;
  return {
    id: row.id,
    userId: row.userId || "anon",
    recordKey: row.recordKey,
    kind: row.kind || "period",
    siteCode: row.siteCode ?? null,
    periodKey: row.periodKey ?? null,
    payload,
    sourceRevision: row.sourceRevision == null ? null : String(row.sourceRevision),
    serverFingerprint: row.serverFingerprint ?? null,
    payloadFingerprint: row.payloadFingerprint || fingerprintPayload(payload),
    status: row.status || "pending",
    createdAt: Number(row.createdAt) || updatedAt,
    updatedAt,
    tabId: row.tabId ?? null,
    lastError: row.lastError ?? null,
  };
}

function broadcastDraftEvent(type, draftOrKey) {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("indus-finance-pl-drafts");
    ch.postMessage({
      type,
      id: typeof draftOrKey === "string" ? draftOrKey : draftOrKey?.id,
      userId: typeof draftOrKey === "object" ? draftOrKey?.userId : undefined,
      recordKey: typeof draftOrKey === "object" ? draftOrKey?.recordKey : undefined,
      updatedAt: typeof draftOrKey === "object" ? draftOrKey?.updatedAt : undefined,
      tabId: getLedgerTabId(),
      at: Date.now(),
    });
    ch.close();
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   userId?: string,
 *   recordKey: string,
 *   kind?: 'period'|'setup',
 *   siteCode?: string|null,
 *   periodKey?: string|null,
 *   payload: unknown,
 *   sourceRevision?: string|null,
 *   serverSnapshot?: unknown,
 *   status?: DraftStatus|string,
 *   lastError?: string|null,
 *   tabId?: string|null,
 * }} input
 * @returns {Promise<{ draft: LedgerDraft|null, storage: 'indexeddb'|'memory', error?: ReturnType<typeof classifyDraftStorageError> }>}
 */
export async function putDraft(input) {
  const userId = input.userId || "anon";
  const recordKey = input.recordKey;
  if (!recordKey) throw new Error("putDraft: recordKey is required");

  const now = Date.now();
  const id = draftStorageKey(userId, recordKey);
  let createdAt = now;
  try {
    const existing = await getDraft(userId, recordKey);
    if (existing?.createdAt) createdAt = existing.createdAt;
  } catch {
    /* ignore */
  }

  const payload = sanitizeDraftPayload(deepClone(input.payload));
  /** @type {LedgerDraft} */
  const row = {
    id,
    userId,
    recordKey,
    kind: input.kind || "period",
    siteCode: input.siteCode ?? null,
    periodKey: input.periodKey ?? null,
    payload,
    sourceRevision: input.sourceRevision == null ? null : String(input.sourceRevision),
    serverFingerprint: input.serverSnapshot != null
      ? fingerprintPayload(input.serverSnapshot)
      : (input.serverFingerprint ?? null),
    payloadFingerprint: fingerprintPayload(payload),
    status: input.status || "pending",
    createdAt,
    updatedAt: now,
    tabId: input.tabId ?? getLedgerTabId(),
    lastError: input.lastError ?? null,
  };

  if (canUseIndexedDb()) {
    try {
      await idbPut(row);
      memoryMap().set(row.id, row);
      broadcastDraftEvent("draft:put", row);
      return { draft: row, storage: "indexeddb" };
    } catch (err) {
      const classified = classifyDraftStorageError(err);
      memoryMap().set(row.id, row);
      broadcastDraftEvent("draft:put", row);
      return { draft: row, storage: "memory", error: classified };
    }
  }

  memoryMap().set(row.id, row);
  broadcastDraftEvent("draft:put", row);
  return {
    draft: row,
    storage: "memory",
    error: classifyDraftStorageError(new Error("IndexedDB unavailable")),
  };
}

/**
 * @param {string} userId
 * @param {string} recordKey
 * @returns {Promise<LedgerDraft|null>}
 */
export async function getDraft(userId, recordKey) {
  const id = draftStorageKey(userId || "anon", recordKey);
  if (canUseIndexedDb()) {
    try {
      const row = await idbGet(id);
      if (row) {
        const normalized = normalizeLegacyDraft(row);
        memoryMap().set(id, normalized);
        return normalized;
      }
    } catch {
      /* fall through */
    }
  }
  const mem = memoryMap().get(id);
  return mem ? normalizeLegacyDraft(mem) : null;
}

/**
 * Delete only when the stored draft still matches the expected fingerprint / timestamp.
 * Protects other tabs that wrote a newer draft after this tab committed.
 *
 * @param {string} userId
 * @param {string} recordKey
 * @param {{
 *   expectedPayloadFingerprint?: string|null,
 *   expectedUpdatedAt?: number|null,
 *   force?: boolean,
 * }} [opts]
 * @returns {Promise<{ deleted: boolean, reason?: string, kept?: LedgerDraft|null }>}
 */
export async function deleteDraftIfUnchanged(userId, recordKey, opts = {}) {
  const id = draftStorageKey(userId || "anon", recordKey);
  const current = await getDraft(userId, recordKey);
  if (!current) return { deleted: true, reason: "missing" };

  if (!opts.force) {
    if (
      opts.expectedPayloadFingerprint
      && current.payloadFingerprint
      && current.payloadFingerprint !== opts.expectedPayloadFingerprint
    ) {
      return { deleted: false, reason: "fingerprint_mismatch", kept: current };
    }
    if (
      opts.expectedUpdatedAt != null
      && Number(current.updatedAt) > Number(opts.expectedUpdatedAt)
    ) {
      return { deleted: false, reason: "newer_draft", kept: current };
    }
  }

  if (canUseIndexedDb()) {
    try {
      await idbDelete(id);
    } catch {
      /* still clear memory */
    }
  }
  memoryMap().delete(id);
  broadcastDraftEvent("draft:delete", { id, userId, recordKey });
  return { deleted: true };
}

/**
 * Unconditional delete (explicit Discard). Prefer deleteDraftIfUnchanged after save.
 */
export async function deleteDraft(userId, recordKey) {
  return deleteDraftIfUnchanged(userId, recordKey, { force: true });
}

/**
 * @param {string} userId
 * @param {{ kind?: 'period'|'setup', siteCode?: string, periodKey?: string }} [filter]
 * @returns {Promise<LedgerDraft[]>}
 */
export async function listDraftsForUser(userId, filter = {}) {
  const uid = userId || "anon";
  /** @type {LedgerDraft[]} */
  let rows = [];
  if (canUseIndexedDb()) {
    try {
      rows = (await idbGetAllForUser(uid)).map(normalizeLegacyDraft).filter(Boolean);
    } catch {
      rows = [];
    }
  }
  if (!rows.length) {
    rows = [...memoryMap().values()]
      .map(normalizeLegacyDraft)
      .filter((r) => r && r.userId === uid);
  }
  // Merge: prefer fresher of idb/memory by updatedAt
  const byId = new Map();
  for (const r of rows) {
    const prev = byId.get(r.id);
    if (!prev || prev.updatedAt < r.updatedAt) byId.set(r.id, r);
  }
  for (const r of memoryMap().values()) {
    const n = normalizeLegacyDraft(r);
    if (!n || n.userId !== uid) continue;
    const prev = byId.get(n.id);
    if (!prev || prev.updatedAt < n.updatedAt) byId.set(n.id, n);
  }
  let list = [...byId.values()];
  if (filter.kind) list = list.filter((r) => r.kind === filter.kind);
  if (filter.siteCode) list = list.filter((r) => r.siteCode === filter.siteCode);
  if (filter.periodKey) list = list.filter((r) => r.periodKey === filter.periodKey);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Soft account-switch / logout handling.
 *
 * Never deletes draft records (IndexedDB or memory fallback). In environments
 * without IndexedDB the memory map *is* the durable draft store for the page
 * lifetime — wiping it would destroy recoverable work.
 *
 * SaveCoordinator clears its own in-memory working copies separately via setUserId.
 *
 * @param {string|null|undefined} previousUserId
 * @param {{ clearMemoryForPrevious?: boolean }} [opts] ignored for draft rows (kept for API compat)
 */
export function onLedgerUserContextChange(previousUserId, _opts = {}) {
  broadcastDraftEvent("draft:user_context", {
    id: previousUserId || "anon",
    userId: previousUserId || "anon",
  });
}

/** Test helpers */
export function __resetDraftMemoryForTests() {
  memoryStore = new Map();
}

export function __setDraftIdbAdapterForTests(adapter) {
  idbAdapter = adapter;
}
