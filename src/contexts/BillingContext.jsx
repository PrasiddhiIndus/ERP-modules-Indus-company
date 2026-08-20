import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { isSupabaseRealtimeEnabled } from '../lib/supabaseConfig';
import { useAuth } from './AuthContext';
import {
  getCommercialPoModuleType,
  withCommercialModuleMarker,
  COMMERCIAL_MODULE_RM_MM_AMC_IEV,
  COMMERCIAL_MODULE_PROJECTS,
} from '../constants/commercialModuleType';
import {
  getCommercialPOs,
  setCommercialPOs as saveCommercialPOsLocal,
  getContactHistory,
  setContactHistory as saveContactHistoryLocal,
  getInvoices,
  setInvoices as saveInvoicesLocal,
  getCreditDebitNotes,
  setCreditDebitNotes as saveCreditDebitNotesLocal,
  getPaymentAdvice,
  setPaymentAdvice as savePaymentAdviceLocal,
} from '../data/billingStore';
import {
  BILLING_DRAFT_KEYS,
  BILLING_VERTICAL_STORAGE_KEY,
  clearBillingFormDraft,
  loadBillingFormDraftPayloadWithLegacy,
  saveBillingFormDraft,
} from '../utils/billingFormAutosave';
import {
  isBillingDbAvailable,
  fetchCommercialPOs,
  billingErrorMsg,
  saveCommercialPOs as saveCommercialPOsDb,
  deleteCommercialPOs as deleteCommercialPOsDb,
  fetchInvoices,
  saveInvoice as saveInvoiceDb,
  saveInvoices as saveInvoicesDb,
  fetchCreditDebitNotes,
  saveCreditDebitNotes as saveCreditDebitNotesDb,
  fetchPaymentAdvice,
  savePaymentAdvice as savePaymentAdviceDb,
} from '../services/billingApi';
import { PO_BASIS_FILTER_ALL, resolveBillingPoBasis } from '../constants/poBasis';
import { normalizeBillingVerticalKey, resolveBillingVerticalKey } from '../utils/billingPoListFilters';
import {
  BILLING_VERTICAL_CATALOG,
  isBillingVerticalSuperRole,
  resolveBillingVerticalOptionsForUser,
} from '../lib/billingVerticalAccess';

const BillingContext = createContext({
  __missingProvider: true,
  commercialPOs: [],
  commercialPOsAllModules: [],
  setCommercialPOs: () => {},
  contactHistory: {},
  setContactHistory: () => {},
  invoices: [],
  invoicesAll: [],
  setInvoices: () => {},
  creditDebitNotes: [],
  setCreditDebitNotes: () => {},
  paymentAdvice: {},
  setPaymentAdvice: () => {},
  invoiceDraft: null,
  setInvoiceDraft: () => {},
  getCreateInvoiceFormDraft: () => null,
  setCreateInvoiceFormDraft: () => {},
  clearCreateInvoiceFormDraft: () => {},
  getAddOnInvoiceFormDraft: () => null,
  setAddOnInvoiceFormDraft: () => {},
  clearAddOnInvoiceFormDraft: () => {},
  billingVerticalFilter: '',
  setBillingVerticalFilter: () => {},
  billingVerticalOptions: [],
  billingVerticalAccessBlocked: false,
  billingVerticalGrantsReady: false,
  billingPoBasisFilter: PO_BASIS_FILTER_ALL,
  setBillingPoBasisFilter: () => {},
  billingPoBasisOptions: [],
  enableVerticalFilter: false,
  useBillingDb: false,
  billingError: 'Billing context not ready.',
  clearBillingError: () => {},
  refreshBilling: async () => false,
  upsertInvoice: async () => null,
  wopoList: [],
  setWopoList: () => {},
  bills: [],
  setBills: () => {},
  billingHistory: [],
  setBillingHistory: () => {},
  billingAlerts: [],
  setBillingAlerts: () => {},
});
const toModuleContext = (moduleScope) =>
  moduleScope
    ? moduleScope === COMMERCIAL_MODULE_RM_MM_AMC_IEV || moduleScope === COMMERCIAL_MODULE_PROJECTS
      ? 'rm_mm_amc_iev'
      : 'manpower_training'
    : null;

const BILLING_PO_BASIS_STORAGE_KEY = 'billing_po_basis_filter';

// Must match billing.vertical lookup + PO Entry screens.
const BILLING_VERTICAL_LABELS = BILLING_VERTICAL_CATALOG.map((v) => v.label);

const BILLING_PO_BASIS_OPTIONS = [
  { id: PO_BASIS_FILTER_ALL, label: 'All' },
  { id: 'with_po', label: 'With PO' },
  { id: 'without_po', label: 'Without PO' },
];

function normalizeVerticalKey(v) {
  return normalizeBillingVerticalKey(v);
}

function resolvePoVerticalKey(po) {
  return resolveBillingVerticalKey(po);
}

function labelVertical(key) {
  const k = normalizeVerticalKey(key);
  if (!k) return '';
  const known = {
    manpower: 'Manpower',
    training: 'Training',
    rm: 'R&M',
    mm: 'M&M',
    amc: 'AMC',
    iev: 'IEV',
    projects: 'Projects',
  };
  if (known[k]) return known[k];
  // fallback label
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export const BillingProvider = ({ children, commercialModuleScope = null, enableVerticalFilter = false }) => {
  const { userProfile } = useAuth();
  /** Full PO list from DB/localStorage (all modules). */
  const [commercialPOsFull, setCommercialPOsFull] = useState([]);
  const [contactHistory, setContactHistoryState] = useState({});
  const [invoicesFull, setInvoicesState] = useState([]);
  const [creditDebitNotes, setCreditDebitNotesState] = useState([]);
  const [paymentAdvice, setPaymentAdviceState] = useState({});
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [useDb, setUseDb] = useState(null);
  const [billingError, setBillingError] = useState(null);
  const [billingVerticalFilter, setBillingVerticalFilterState] = useState('');
  const [billingPoBasisFilter, setBillingPoBasisFilterState] = useState(PO_BASIS_FILTER_ALL);

  const createInvoiceFormDraftRef = useRef(
    loadBillingFormDraftPayloadWithLegacy(
      BILLING_DRAFT_KEYS.createInvoice,
      'billing:form:create-invoice:'
    )
  );
  const addOnInvoiceFormDraftRef = useRef(
    loadBillingFormDraftPayloadWithLegacy(BILLING_DRAFT_KEYS.addOnInvoice, 'billing:form:add-on:')
  );

  const getCreateInvoiceFormDraft = useCallback(() => createInvoiceFormDraftRef.current, []);
  const setCreateInvoiceFormDraft = useCallback((payload) => {
    createInvoiceFormDraftRef.current = payload ?? null;
    if (payload) saveBillingFormDraft(BILLING_DRAFT_KEYS.createInvoice, { payload });
  }, []);
  const clearCreateInvoiceFormDraft = useCallback(() => {
    createInvoiceFormDraftRef.current = null;
    clearBillingFormDraft(BILLING_DRAFT_KEYS.createInvoice);
  }, []);

  const getAddOnInvoiceFormDraft = useCallback(() => addOnInvoiceFormDraftRef.current, []);
  const setAddOnInvoiceFormDraft = useCallback((payload) => {
    addOnInvoiceFormDraftRef.current = payload ?? null;
    if (payload) saveBillingFormDraft(BILLING_DRAFT_KEYS.addOnInvoice, { payload });
  }, []);
  const clearAddOnInvoiceFormDraft = useCallback(() => {
    addOnInvoiceFormDraftRef.current = null;
    clearBillingFormDraft(BILLING_DRAFT_KEYS.addOnInvoice);
  }, []);

  const commercialPOs = useMemo(() => {
    if (!commercialModuleScope) return commercialPOsFull;
    return commercialPOsFull.filter((p) => getCommercialPoModuleType(p) === commercialModuleScope);
  }, [commercialPOsFull, commercialModuleScope]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BILLING_VERTICAL_STORAGE_KEY);
      if (saved) setBillingVerticalFilterState(saved);
      const savedBasis = window.localStorage.getItem(BILLING_PO_BASIS_STORAGE_KEY);
      if (savedBasis === 'with_po' || savedBasis === 'without_po') setBillingPoBasisFilterState(savedBasis);
    } catch {
      /* ignore */
    }
  }, []);

  const setBillingVerticalFilter = useCallback((next) => {
    const v = normalizeVerticalKey(next);
    setBillingVerticalFilterState(v);
    try {
      if (!v) window.localStorage.removeItem(BILLING_VERTICAL_STORAGE_KEY);
      else window.localStorage.setItem(BILLING_VERTICAL_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setBillingPoBasisFilter = useCallback((next) => {
    const raw = String(next || '').trim();
    const v =
      raw === 'with_po' || raw === 'without_po' ? raw : PO_BASIS_FILTER_ALL;
    setBillingPoBasisFilterState(v);
    try {
      if (!v) window.localStorage.removeItem(BILLING_PO_BASIS_STORAGE_KEY);
      else window.localStorage.setItem(BILLING_PO_BASIS_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const billingVerticalOptions = useMemo(() => {
    if (!enableVerticalFilter) {
      return BILLING_VERTICAL_LABELS.map((label) => ({
        id: normalizeVerticalKey(label),
        label,
      }));
    }
    return resolveBillingVerticalOptionsForUser({
      role: userProfile?.role,
      grantCodes: userProfile?.billing_vertical_codes || [],
      grantsReady: userProfile?.billing_vertical_grants_ready !== false,
    });
  }, [
    enableVerticalFilter,
    userProfile?.role,
    userProfile?.billing_vertical_codes,
    userProfile?.billing_vertical_grants_ready,
  ]);

  const billingVerticalAccessBlocked = useMemo(() => {
    if (!enableVerticalFilter) return false;
    if (!userProfile) return false;
    if (isBillingVerticalSuperRole(userProfile?.role)) return false;
    if (userProfile?.billing_vertical_grants_ready === false) return false;
    return (billingVerticalOptions || []).length === 0;
  }, [
    enableVerticalFilter,
    userProfile,
    userProfile?.role,
    userProfile?.billing_vertical_grants_ready,
    billingVerticalOptions,
  ]);

  // Keep selected vertical inside granted set; empty = all granted verticals.
  useEffect(() => {
    if (!enableVerticalFilter) return;
    const opts = billingVerticalOptions || [];
    if (!opts.length) {
      if (billingVerticalFilter) setBillingVerticalFilter('');
      return;
    }
    const allowed = new Set(opts.map((o) => o.id));
    if (billingVerticalFilter && !allowed.has(billingVerticalFilter)) {
      setBillingVerticalFilter('');
    }
  }, [enableVerticalFilter, billingVerticalOptions, billingVerticalFilter, setBillingVerticalFilter]);

  const commercialPOsVisible = useMemo(() => {
    if (!enableVerticalFilter) return commercialPOs;
    if (billingVerticalAccessBlocked) return [];
    const allowed = new Set((billingVerticalOptions || []).map((o) => o.id));
    let rows = commercialPOs.filter((p) => allowed.has(resolvePoVerticalKey(p)));
    if (billingVerticalFilter) {
      rows = rows.filter((p) => resolvePoVerticalKey(p) === billingVerticalFilter);
    }
    if (billingPoBasisFilter) {
      rows = rows.filter((p) => resolveBillingPoBasis(p) === billingPoBasisFilter);
    }
    return rows;
  }, [
    commercialPOs,
    billingVerticalFilter,
    billingPoBasisFilter,
    billingVerticalOptions,
    enableVerticalFilter,
    billingVerticalAccessBlocked,
  ]);

  const invoicesVisible = useMemo(() => {
    if (!enableVerticalFilter) return invoicesFull;
    if (billingVerticalAccessBlocked) return [];
    const visibleParents = new Set(commercialPOsVisible.map((p) => String(p.id)));
    const supplementaryChildIdsForVisibleParents = new Set();
    commercialPOsFull.forEach((p) => {
      if (!p?.isSupplementary) return;
      const pid = String(p?.supplementaryParentPoId || p?.supplementary_parent_po_id || '');
      if (pid && visibleParents.has(pid)) supplementaryChildIdsForVisibleParents.add(String(p.id));
    });
    return invoicesFull.filter((inv) => {
      const pid = String(inv.poId || '');
      return visibleParents.has(pid) || supplementaryChildIdsForVisibleParents.has(pid);
    });
  }, [
    invoicesFull,
    commercialPOsVisible,
    commercialPOsFull,
    billingVerticalFilter,
    enableVerticalFilter,
    billingVerticalAccessBlocked,
  ]);

  const creditDebitNotesVisible = useMemo(() => {
    if (!enableVerticalFilter) return creditDebitNotes;
    if (billingVerticalAccessBlocked) return [];
    const visibleInvoiceIds = new Set(invoicesVisible.map((inv) => String(inv.id)));
    return (creditDebitNotes || []).filter((n) => {
      const parentId = String(n.parentInvoiceId || n.parent_invoice_id || '');
      return parentId && visibleInvoiceIds.has(parentId);
    });
  }, [
    creditDebitNotes,
    invoicesVisible,
    enableVerticalFilter,
    billingVerticalAccessBlocked,
    billingVerticalFilter,
  ]);

  const paymentAdviceVisible = useMemo(() => {
    if (!enableVerticalFilter) return paymentAdvice;
    if (billingVerticalAccessBlocked) return {};
    const visibleInvoiceIds = new Set(invoicesVisible.map((inv) => String(inv.id)));
    const next = {};
    Object.entries(paymentAdvice || {}).forEach(([key, val]) => {
      if (visibleInvoiceIds.has(String(key))) next[key] = val;
    });
    return next;
  }, [
    paymentAdvice,
    invoicesVisible,
    enableVerticalFilter,
    billingVerticalAccessBlocked,
    billingVerticalFilter,
  ]);

  const loadFromDb = useCallback(async () => {
    try {
      const available = await isBillingDbAvailable();
      setUseDb(!!available);
      if (!available) {
        setBillingError('Billing DB is not available (schema/RLS). Using localStorage.');
        return false;
      }
      const [pos, invs, notes, pa] = await Promise.all([
        fetchCommercialPOs({
          moduleType: commercialModuleScope || undefined,
          moduleContext: toModuleContext(commercialModuleScope),
        }),
        fetchInvoices(),
        fetchCreditDebitNotes(),
        fetchPaymentAdvice(),
      ]);
      setCommercialPOsFull((prevAll) => {
        if (!commercialModuleScope) return pos;
        const others = prevAll.filter((p) => getCommercialPoModuleType(p) !== commercialModuleScope);
        return [...others, ...pos];
      });
      setInvoicesState(invs);
      setCreditDebitNotesState(notes);
      setPaymentAdviceState(pa);
      contactHistoryFromPOs(pos);
      setBillingError(null);
      return true;
    } catch (e) {
      console.warn('Billing DB load failed, using localStorage:', e);
      setBillingError(billingErrorMsg(e, 'Billing DB load'));
      setUseDb(false);
      return false;
    }
  }, [commercialModuleScope]);

  function contactHistoryFromPOs(pos) {
    const byPoId = {};
    (pos || []).forEach((po) => {
      if (po.id && (po.contactHistoryLog || []).length) {
        byPoId[po.id] = po.contactHistoryLog;
      }
    });
    setContactHistoryState(byPoId);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await loadFromDb();
      if (!mounted) return;
      if (!ok) {
        setCommercialPOsFull(commercialModuleScope ? [] : getCommercialPOs());
        setContactHistoryState(getContactHistory());
        setInvoicesState(getInvoices());
        setCreditDebitNotesState(getCreditDebitNotes());
        setPaymentAdviceState(getPaymentAdvice());
      }
    })();
    return () => { mounted = false; };
  }, [loadFromDb]);

  const billingRefreshSkipUntilRef = useRef(0);

  /** Persist one invoice to DB (or local), then reload full billing snapshot so Manage Invoices stays in sync. */
  const upsertInvoice = useCallback(
    async (inv) => {
      if (!inv) return null;
      setBillingError(null);
      billingRefreshSkipUntilRef.current = Date.now() + 1200;
      if (useDb === true) {
        const id = await saveInvoiceDb(inv);
        const [pos, invs, notes, pa] = await Promise.all([
          fetchCommercialPOs({
            moduleType: commercialModuleScope || undefined,
            moduleContext: toModuleContext(commercialModuleScope),
          }),
          fetchInvoices(),
          fetchCreditDebitNotes(),
          fetchPaymentAdvice(),
        ]);
        setCommercialPOsFull((prevAll) => {
          if (!commercialModuleScope) return pos;
          const others = prevAll.filter((p) => getCommercialPoModuleType(p) !== commercialModuleScope);
          return [...others, ...pos];
        });
        setInvoicesState(invs);
        setCreditDebitNotesState(notes);
        setPaymentAdviceState(pa);
        contactHistoryFromPOs(pos);
        return id;
      }
      setInvoicesState((prev) => {
        const id = String(inv.id || '');
        const exists = (prev || []).some((p) => String(p.id) === id);
        const next = exists
          ? (prev || []).map((p) => (String(p.id) === id ? { ...p, ...inv } : p))
          : [...(prev || []), inv];
        saveInvoicesLocal(next);
        return next;
      });
      return inv.id;
    },
    [commercialModuleScope, useDb]
  );

  /** When DB billing is active, refetch on po_wo / invoice changes (debounced). */
  const refreshDebounceRef = useRef(null);
  useEffect(() => {
    if (useDb !== true) return undefined;
    const scheduleRefresh = () => {
      if (Date.now() < billingRefreshSkipUntilRef.current) return;
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        loadFromDb();
      }, 320);
    };
    const handleFocus = () => {
      if (navigator.onLine !== false) scheduleRefresh();
    };
    const handleOnline = () => scheduleRefresh();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    let channel = null;
    if (isSupabaseRealtimeEnabled()) {
      channel = supabase
        .channel('billing-workflow-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'billing', table: 'po_wo' },
          () => scheduleRefresh()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'billing', table: 'invoice' },
          () => scheduleRefresh()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'billing', table: 'invoice_line_item' },
          () => scheduleRefresh()
        )
        .subscribe();
    }
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (channel) supabase.removeChannel(channel);
    };
  }, [useDb, loadFromDb]);

  const setCommercialPOs = useCallback(
    (updater) => {
      setCommercialPOsFull((prevAll) => {
        const scoped = commercialModuleScope;
        const sliceForUpdater = scoped
          ? prevAll.filter((p) => getCommercialPoModuleType(p) === scoped)
          : prevAll;
        const nextSlice = typeof updater === 'function' ? updater(sliceForUpdater) : updater;
        const prevIds = new Set((sliceForUpdater || []).map((p) => String(p?.id)));
        const nextIds = new Set((nextSlice || []).map((p) => String(p?.id)));
        const removedIds = [];
        prevIds.forEach((id) => {
          if (id && !nextIds.has(id)) removedIds.push(id);
        });
        const stampedSlice = scoped
          ? (nextSlice || []).map((po) => ({
              ...po,
              moduleType: scoped,
              updateHistory: withCommercialModuleMarker(po.updateHistory, scoped),
            }))
          : nextSlice || [];
        let next;
        if (!scoped) {
          next = stampedSlice;
        } else {
          const others = prevAll.filter((p) => getCommercialPoModuleType(p) !== scoped);
          next = [...others, ...stampedSlice];
        }
        setBillingError(null);
        billingRefreshSkipUntilRef.current = Date.now() + 1200;
        const toPersist = stampedSlice.filter((po) => {
          const id = String(po?.id ?? '');
          const prev = (sliceForUpdater || []).find((p) => String(p.id) === id);
          if (!prev) return true;
          try {
            return JSON.stringify(prev) !== JSON.stringify(po);
          } catch {
            return true;
          }
        });
        // Field-ACL meta is only for the DB save path — never keep it in React state / localStorage.
        const stripAcl = (row) => {
          if (!row || typeof row !== 'object' || !('__poEntryFieldAcl' in row)) return row;
          const { __poEntryFieldAcl: _acl, ...rest } = row;
          return rest;
        };
        next = (next || []).map(stripAcl);
        Promise.resolve()
          .then(async () => {
            // Persist deletes first so removed rows don't reappear after realtime refresh.
            if (removedIds.length) await deleteCommercialPOsDb(removedIds);
            // Only upsert POs that changed in the active commercial scope.
            if (toPersist.length) {
              await saveCommercialPOsDb(
                toPersist,
                scoped ? { moduleContext: toModuleContext(scoped) } : {}
              );
            }
            const reloadOk = await loadFromDb();
            // If fetch/filter lagged, keep freshly saved rows visible in the scoped module.
            if (reloadOk && scoped && toPersist.length) {
              setCommercialPOsFull((prevAll) => {
                const scopedRows = prevAll.filter(
                  (p) => getCommercialPoModuleType(p) === scoped
                );
                const scopedIds = new Set(scopedRows.map((p) => String(p.id)));
                const missing = toPersist.filter((p) => !scopedIds.has(String(p.id)));
                if (!missing.length) return prevAll;
                const others = prevAll.filter((p) => getCommercialPoModuleType(p) !== scoped);
                return [...others, ...scopedRows, ...missing];
              });
            }
          })
          .then(() => setUseDb(true))
          .catch((e) => {
            console.warn('Billing DB save POs failed:', e);
            setBillingError(e?.message || 'Could not save to database. Data saved locally.');
            setUseDb(false);
            saveCommercialPOsLocal(next);
          });
        setContactHistoryState((byPo) => {
          const nextByPo = {};
          (next || []).forEach((po) => {
            if (po.id && Array.isArray(po.contactHistoryLog) && po.contactHistoryLog.length)
              nextByPo[po.id] = po.contactHistoryLog;
          });
          return nextByPo;
        });
        return next;
      });
    },
    [commercialModuleScope, loadFromDb]
  );

  const setContactHistory = useCallback((updater) => {
    setContactHistoryState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (useDb !== true) saveContactHistoryLocal(next);
      return next;
    });
  }, [useDb]);

  const setInvoices = useCallback((updater) => {
    setInvoicesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (useDb === true) {
        const prevById = new Map((prev || []).map((inv) => [String(inv?.id || ''), inv]));
        const changed = (next || []).filter((inv) => {
          const id = String(inv?.id || '');
          const old = prevById.get(id);
          if (!old) return true;
          return (
            String(old.updated_at || old.updatedAt || '') !== String(inv.updated_at || inv.updatedAt || '') ||
            String(old.taxInvoiceNumber || old.tax_invoice_number || '') !== String(inv.taxInvoiceNumber || inv.tax_invoice_number || '') ||
            Number(old.totalAmount || 0) !== Number(inv.totalAmount || 0) ||
            String(old.digitalSignatureDataUrl || old.digital_signature_data_url || '') !==
              String(inv.digitalSignatureDataUrl || inv.digital_signature_data_url || '')
          );
        });
        const persist = changed.length
          ? Promise.all(changed.map((inv) => saveInvoiceDb(inv)))
          : saveInvoicesDb(next);
        persist.catch((e) => {
          console.warn('Billing DB save invoices failed:', e);
          setBillingError(e?.message || 'Could not save invoices to database. Data saved locally.');
          setUseDb(false);
          saveInvoicesLocal(next);
        });
      } else {
        saveInvoicesLocal(next);
      }
      return next;
    });
  }, [useDb]);

  const setCreditDebitNotes = useCallback((updater) => {
    setCreditDebitNotesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (useDb === true) {
        saveCreditDebitNotesDb(next).catch((e) => console.warn('Billing DB save credit/debit notes failed:', e));
      } else {
        saveCreditDebitNotesLocal(next);
      }
      return next;
    });
  }, [useDb]);

  const setPaymentAdvice = useCallback((updater) => {
    setPaymentAdviceState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (useDb === true) {
        savePaymentAdviceDb(next).catch((e) => console.warn('Billing DB save payment advice failed:', e));
      } else {
        savePaymentAdviceLocal(next);
      }
      return next;
    });
  }, [useDb]);

  const value = {
    commercialPOs: commercialPOsVisible,
    commercialPOsAllModules: commercialPOsFull,
    setCommercialPOs,
    contactHistory,
    setContactHistory,
    invoices: invoicesVisible,
    invoicesAll: invoicesFull,
    setInvoices,
    creditDebitNotes: creditDebitNotesVisible,
    setCreditDebitNotes,
    paymentAdvice: paymentAdviceVisible,
    setPaymentAdvice,
    invoiceDraft,
    setInvoiceDraft,
    getCreateInvoiceFormDraft,
    setCreateInvoiceFormDraft,
    clearCreateInvoiceFormDraft,
    getAddOnInvoiceFormDraft,
    setAddOnInvoiceFormDraft,
    clearAddOnInvoiceFormDraft,
    billingVerticalFilter,
    setBillingVerticalFilter,
    billingVerticalOptions,
    billingVerticalAccessBlocked,
    billingVerticalGrantsReady: userProfile?.billing_vertical_grants_ready !== false,
    billingPoBasisFilter,
    setBillingPoBasisFilter,
    billingPoBasisOptions: BILLING_PO_BASIS_OPTIONS,
    enableVerticalFilter,
    useBillingDb: !!useDb,
    billingError,
    clearBillingError: () => setBillingError(null),
    refreshBilling: loadFromDb,
    upsertInvoice,
    wopoList: commercialPOsVisible,
    setWopoList: setCommercialPOs,
    bills: invoicesVisible,
    setBills: setInvoices,
    billingHistory: [],
    setBillingHistory: () => {},
    billingAlerts: [],
    setBillingAlerts: () => {},
  };

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
};

export const useBilling = () => {
  const ctx = useContext(BillingContext);
  if (ctx?.__missingProvider) {
    // eslint-disable-next-line no-console
    console.warn('useBilling used outside BillingProvider');
  }
  return ctx;
};

export default BillingContext;
