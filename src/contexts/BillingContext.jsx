import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
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
  billingVerticalFilter: '',
  setBillingVerticalFilter: () => {},
  billingVerticalOptions: [],
  billingPoBasisFilter: PO_BASIS_FILTER_ALL,
  setBillingPoBasisFilter: () => {},
  billingPoBasisOptions: [],
  enableVerticalFilter: false,
  useBillingDb: false,
  billingError: 'Billing context not ready.',
  clearBillingError: () => {},
  refreshBilling: async () => false,
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

const BILLING_VERTICAL_STORAGE_KEY = 'billing_vertical_filter';
const BILLING_PO_BASIS_STORAGE_KEY = 'billing_po_basis_filter';

// Must match the vertical dropdown lists used in PO Entry screens.
const BILLING_VERTICAL_LABELS = ['Manpower', 'Training', 'R&M', 'M&M', 'AMC', 'IEV', 'Projects'];

const BILLING_PO_BASIS_OPTIONS = [
  { id: PO_BASIS_FILTER_ALL, label: 'Everything — jobs with or without a PO paper' },
  { id: 'with_po', label: 'Only jobs that have a PO / WO number' },
  { id: 'without_po', label: 'Only jobs billed without a PO (still has a dummy WO)' },
];

function normalizeVerticalKey(v) {
  const raw = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const aliases = {
    // OC-number abbreviations / legacy keys
    bill: 'manpower',
    manp: 'manpower',
    manpower: 'manpower',
    mp: 'manpower',
    train: 'training',
    trng: 'training',
    training: 'training',
    rm: 'rm',
    mm: 'mm',
    amc: 'amc',
    iev: 'iev',
    projects: 'projects',
    project: 'projects',
  };
  return aliases[raw] || raw;
}

function resolvePoVerticalKey(po) {
  // Prefer explicit vertical from PO entry; OC segment can be stale if vertical was edited later.
  const direct = po?.vertical || po?.poVertical;
  if (direct) {
    const dk = normalizeVerticalKey(direct);
    if (dk) return dk;
  }
  const oc = po?.ocNumber || po?.oc_number;
  if (oc && String(oc).includes('-')) {
    const parts = String(oc).split('-');
    if (parts[1]) return normalizeVerticalKey(parts[1]);
  }
  return '';
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
    return BILLING_VERTICAL_LABELS.map((label) => ({
      id: normalizeVerticalKey(label),
      label,
    }));
  }, []);

  const commercialPOsVisible = useMemo(() => {
    if (!enableVerticalFilter) return commercialPOs;
    if (!billingVerticalFilter) return [];
    let rows = commercialPOs.filter((p) => resolvePoVerticalKey(p) === billingVerticalFilter);
    if (billingPoBasisFilter) {
      rows = rows.filter((p) => resolveBillingPoBasis(p) === billingPoBasisFilter);
    }
    return rows;
  }, [commercialPOs, billingVerticalFilter, billingPoBasisFilter, enableVerticalFilter]);

  const invoicesVisible = useMemo(() => {
    if (!enableVerticalFilter) return invoicesFull;
    if (!billingVerticalFilter) return [];
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
      setCommercialPOsFull(pos);
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
        setCommercialPOsFull(getCommercialPOs());
        setContactHistoryState(getContactHistory());
        setInvoicesState(getInvoices());
        setCreditDebitNotesState(getCreditDebitNotes());
        setPaymentAdviceState(getPaymentAdvice());
      }
    })();
    return () => { mounted = false; };
  }, [loadFromDb]);

  /** When DB billing is active, refetch POs (and related data) on po_wo changes — e.g. approval_status after Commercial Manager approves. */
  const refreshDebounceRef = useRef(null);
  useEffect(() => {
    if (useDb !== true) return undefined;
    const scheduleRefresh = () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        loadFromDb();
      }, 280);
    };
    const channel = supabase
      .channel('billing-po-wo-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'billing', table: 'po_wo' },
        () => scheduleRefresh()
      )
      .subscribe();
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      channel.unsubscribe();
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
        let next;
        if (!scoped) {
          next = nextSlice;
        } else {
          const others = prevAll.filter((p) => getCommercialPoModuleType(p) !== scoped);
          const stamped = (nextSlice || []).map((po) => ({
            ...po,
            moduleType: scoped,
            updateHistory: withCommercialModuleMarker(po.updateHistory, scoped),
          }));
          next = [...others, ...stamped];
        }
        setBillingError(null);
        Promise.resolve()
          .then(async () => {
            // Persist deletes first so removed rows don't reappear after realtime refresh.
            if (removedIds.length) await deleteCommercialPOsDb(removedIds);
            await saveCommercialPOsDb(next, { moduleContext: toModuleContext(scoped) });
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
    [commercialModuleScope]
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
            Number(old.totalAmount || 0) !== Number(inv.totalAmount || 0)
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
    creditDebitNotes,
    setCreditDebitNotes,
    paymentAdvice,
    setPaymentAdvice,
    invoiceDraft,
    setInvoiceDraft,
    billingVerticalFilter,
    setBillingVerticalFilter,
    billingVerticalOptions,
    billingPoBasisFilter,
    setBillingPoBasisFilter,
    billingPoBasisOptions: BILLING_PO_BASIS_OPTIONS,
    enableVerticalFilter,
    useBillingDb: !!useDb,
    billingError,
    clearBillingError: () => setBillingError(null),
    refreshBilling: loadFromDb,
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
