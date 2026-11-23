/**
 * Enquiry Registration drafts — one draft per signed-in user.
 *
 * Two layers, both keyed by the user's auth id so one person's draft never
 * reaches another person on a shared browser:
 *   1. Browser autosave (localStorage) — written on every change, survives
 *      refresh and moving between modules, works offline.
 *   2. Server draft (projects.enquiry_drafts, RLS: own row only) — written on
 *      "Save as Draft", so the draft follows the user to another browser/PC.
 *
 * On open, the newer of the two is restored.
 */
import { projectsTable } from '../../../services/projectsApi';

const LOCAL_PREFIX = 'erp.projects.enquiryDraft.v1:';
const FORM_OPEN_PREFIX = 'erp.projects.enquiryFormOpen.v1:';
const DRAFTS_TABLE = 'enquiry_drafts';

function storage(kind = 'local') {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function blank(value) {
  return value == null || String(value).trim() === '';
}

/** Keep only plain field values (string / number / boolean / null). */
export function sanitizeDraftForm(form) {
  const out = {};
  if (!form || typeof form !== 'object') return out;
  for (const [key, value] of Object.entries(form)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return out;
}

/**
 * True when the form holds something the user typed — i.e. it differs from the
 * blank form (which already carries defaults such as today's receipt date).
 */
export function hasDraftContent(form, baseline = {}) {
  if (!form) return false;
  return Object.entries(form).some(([key, value]) => {
    if (blank(value)) return false;
    return String(value).trim() !== String(baseline?.[key] ?? '').trim();
  });
}

/**
 * Merge a stored draft into the current blank form: only keys the form still
 * knows (field definitions may have changed since the draft was saved).
 */
export function mergeDraftIntoForm(emptyForm, draftForm) {
  const next = { ...emptyForm };
  if (!draftForm) return next;
  for (const key of Object.keys(emptyForm)) {
    if (Object.prototype.hasOwnProperty.call(draftForm, key)) next[key] = draftForm[key];
  }
  return next;
}

/** Pick the most recently updated of the local and server drafts. */
export function pickNewerDraft(local, server) {
  if (!local) return server || null;
  if (!server) return local;
  const l = Date.parse(local.updatedAt) || 0;
  const s = Date.parse(server.updatedAt) || 0;
  return s > l ? server : local;
}

// ---------------------------------------------------------------------------
// Browser autosave
// ---------------------------------------------------------------------------

export function loadLocalDraft(userId) {
  const store = storage();
  if (!userId || !store) return null;
  try {
    const raw = store.getItem(LOCAL_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId || !parsed.form) return null;
    return { ...parsed, source: 'local' };
  } catch {
    return null;
  }
}

export function saveLocalDraft(userId, form, extra = {}) {
  const store = storage();
  if (!userId || !store) return null;
  const entry = {
    userId,
    form: sanitizeDraftForm(form),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  try {
    store.setItem(LOCAL_PREFIX + userId, JSON.stringify(entry));
    return entry;
  } catch {
    return null;
  }
}

export function clearLocalDraft(userId) {
  const store = storage();
  if (!userId || !store) return;
  try {
    store.removeItem(LOCAL_PREFIX + userId);
  } catch {
    // ignore
  }
}

/** Remember (per tab) that the Add Enquiry form was open, so a refresh reopens it. */
export function setFormOpenFlag(userId, open) {
  const store = storage('session');
  if (!userId || !store) return;
  try {
    if (open) store.setItem(FORM_OPEN_PREFIX + userId, '1');
    else store.removeItem(FORM_OPEN_PREFIX + userId);
  } catch {
    // ignore
  }
}

export function readFormOpenFlag(userId) {
  const store = storage('session');
  if (!userId || !store) return false;
  try {
    return store.getItem(FORM_OPEN_PREFIX + userId) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Server draft
// ---------------------------------------------------------------------------

/** Table not deployed yet → callers fall back to the browser draft only. */
export function isDraftTableMissing(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('enquiry_drafts') && (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

export async function fetchServerDraft(userId) {
  if (!userId) return null;
  const { data, error } = await projectsTable(DRAFTS_TABLE)
    .select('user_id, form, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) return null;
  return { userId, form: data.form || {}, updatedAt: data.updated_at, source: 'server' };
}

export async function saveServerDraft(userId, form) {
  if (!userId) throw new Error('Not signed in.');
  const { data, error } = await projectsTable(DRAFTS_TABLE)
    .upsert({ user_id: userId, form: sanitizeDraftForm(form) }, { onConflict: 'user_id' })
    .select('updated_at')
    .single();
  if (error) throw error;
  return data?.updated_at || new Date().toISOString();
}

export async function deleteServerDraft(userId) {
  if (!userId) return;
  const { error } = await projectsTable(DRAFTS_TABLE).delete().eq('user_id', userId);
  if (error && !isDraftTableMissing(error)) throw error;
}

/** Remove the user's draft everywhere (after a successful registration or a discard). */
export async function clearAllDrafts(userId) {
  clearLocalDraft(userId);
  try {
    await deleteServerDraft(userId);
  } catch {
    // Browser copy is gone; a stale server copy is harmless and replaced on next save.
  }
}
