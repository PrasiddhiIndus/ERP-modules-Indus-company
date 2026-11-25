import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/projectsApi', () => ({ projectsTable: vi.fn() }));

import {
  clearLocalDraft,
  hasDraftContent,
  isDraftTableMissing,
  loadLocalDraft,
  mergeDraftIntoForm,
  pickNewerDraft,
  readFormOpenFlag,
  sanitizeDraftForm,
  saveLocalDraft,
  setFormOpenFlag,
} from '../src/pages/projects/enquiry/enquiryDraftStore.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('enquiry draft store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('treats defaults-only forms as empty', () => {
    const baseline = { receipt_date: '2026-11-23', client_name: '' };
    expect(hasDraftContent({ ...baseline }, baseline)).toBe(false);
    expect(hasDraftContent({ ...baseline, client_name: '  ' }, baseline)).toBe(false);
    expect(hasDraftContent({ ...baseline, client_name: 'ACME' }, baseline)).toBe(true);
    expect(hasDraftContent({ ...baseline, receipt_date: '2026-11-20' }, baseline)).toBe(true);
  });

  it('keeps drafts separate per user', () => {
    saveLocalDraft('user-a', { client_name: 'A Corp' });
    saveLocalDraft('user-b', { client_name: 'B Corp' });
    expect(loadLocalDraft('user-a').form.client_name).toBe('A Corp');
    expect(loadLocalDraft('user-b').form.client_name).toBe('B Corp');
    clearLocalDraft('user-a');
    expect(loadLocalDraft('user-a')).toBeNull();
    expect(loadLocalDraft('user-b').form.client_name).toBe('B Corp');
    expect(loadLocalDraft(null)).toBeNull();
  });

  it('rejects a stored draft whose owner does not match', () => {
    window.localStorage.setItem(
      'erp.projects.enquiryDraft.v1:user-a',
      JSON.stringify({ userId: 'user-b', form: { client_name: 'X' } })
    );
    expect(loadLocalDraft('user-a')).toBeNull();
  });

  it('survives corrupt storage', () => {
    window.localStorage.setItem('erp.projects.enquiryDraft.v1:user-a', '{not json');
    expect(loadLocalDraft('user-a')).toBeNull();
  });

  it('merges only fields the form still has', () => {
    const empty = { client_name: '', scope_of_work: '', receipt_date: '2026-11-23' };
    const merged = mergeDraftIntoForm(empty, { client_name: 'ACME', removed_field: 'x' });
    expect(merged).toEqual({ client_name: 'ACME', scope_of_work: '', receipt_date: '2026-11-23' });
  });

  it('drops non-plain values', () => {
    expect(sanitizeDraftForm({ a: 'x', b: 2, c: null, d: { nested: 1 }, e: () => 1 })).toEqual({
      a: 'x',
      b: 2,
      c: null,
    });
  });

  it('picks the newer of browser and server drafts', () => {
    const local = { updatedAt: '2026-11-23T10:00:00Z' };
    const server = { updatedAt: '2026-11-23T11:00:00Z' };
    expect(pickNewerDraft(local, server)).toBe(server);
    expect(pickNewerDraft({ updatedAt: '2026-11-23T12:00:00Z' }, server).updatedAt).toBe('2026-11-23T12:00:00Z');
    expect(pickNewerDraft(null, server)).toBe(server);
    expect(pickNewerDraft(local, null)).toBe(local);
  });

  it('remembers the open form per user in the tab session', () => {
    setFormOpenFlag('user-a', true);
    expect(readFormOpenFlag('user-a')).toBe(true);
    expect(readFormOpenFlag('user-b')).toBe(false);
    setFormOpenFlag('user-a', false);
    expect(readFormOpenFlag('user-a')).toBe(false);
  });

  it('detects a missing drafts table', () => {
    expect(isDraftTableMissing({ code: '42P01' })).toBe(true);
    expect(isDraftTableMissing({ code: 'PGRST205' })).toBe(true);
    expect(isDraftTableMissing({ message: 'relation "projects.enquiry_drafts" does not exist' })).toBe(true);
    expect(isDraftTableMissing({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
