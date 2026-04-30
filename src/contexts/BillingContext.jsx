import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  getCommercialPoModuleType,
  withCommercialModuleMarker,
  COMMERCIAL_MODULE_RM_MM_AMC_IEV,
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
  saveCommercialPOs as saveCommercialPOsDb,
  deleteCommercialPOs as deleteCommercialPOsDb,
  fetchInvoices,
  saveInvoice as saveInvoiceDb,
  fetchCreditDebitNotes,
  saveCreditDebitNotes as saveCreditDebitNotesDb,
  fetchPaymentAdvice,
  savePaymentAdvice as savePaymentAdviceDb,
} from '../services/billingApi';

const BillingContext = createContext(null);
const toModuleContext = (moduleScope) =>
  moduleScope
    ? (moduleScope === COMMERCIAL_MODULE_RM_MM_AMC_IEV ? 'rm_mm_amc_iev' : 'manpower_training')
    : null;

const BILLING_VERTICAL_STORAGE_KEY = 'billing_vertical_filter';

// Must match the vertical dropdown lists used in PO Entry screens.
const BILLING_VERTICAL_LABELS = ['Manpower', 'Training', 'R&M', 'M&M', 'AMC', 'IEV'];

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
  };
  return aliases[raw] || raw;
}

function resolvePoVerticalKey(po) {
  const oc = po?.ocNumber || po?.oc_number;
  if (oc && String(oc).includes('-')) {
    const parts = String(oc).split('-');
    if (parts[1]) return normalizeVerticalKey(parts[1]);
  }
  const direct = po?.vertical || po?.poVertical;
  if (direct) return normalizeVerticalKey(direct);
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

  const commercialPOs = useMemo(() => {
    if (!commercialModuleScope) return commercialPOsFull;
    return commercialPOsFull.filter((p) => getCommercialPoModuleType(p) === commercialModuleScope);
  }, [commercialPOsFull, commercialModuleScope]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BILLING_VERTICAL_STORAGE_KEY);
      if (saved) setBillingVerticalFilterState(saved);
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

  const billingVerticalOptions = useMemo(() => {
    return BILLING_VERTICAL_LABELS.map((label) => ({
      id: normalizeVerticalKey(label),
      label,
    }));
  }, []);

  const commercialPOsVisible = useMemo(() => {
    if (!enableVerticalFilter) return commercialPOs;
    if (!billingVerticalFilter) return [];
    return commercialPOs.filter((p) => resolvePoVerticalKey(p) === billingVerticalFilter);
  }, [commercialPOs, billingVerticalFilter, enableVerticalFilter]);

  const invoicesVisible = useMemo(() => {
    if (!enableVerticalFilter) return invoicesFull;
    if (!billingVerticalFilter) return [];
    const allowedPoIds = new Set(commercialPOsVisible.map((p) => String(p.id)));
    return invoicesFull.filter((inv) => allowedPoIds.has(String(inv.poId)));
  }, [invoicesFull, commercialPOsVisible, billingVerticalFilter, enableVerticalFilter]);

  const loadFromDb = useCallback(async () => {
    try {
      const available = await isBillingDbAvailable();
      setUseDb(!!available);
      if (!available) return false;
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
      return true;
    } catch (e) {
      console.warn('Billing DB load failed, using localStorage:', e);
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
        const prevById = new Map((prev || []).map((i) => [String(i.id), i]));
        const changed = (next || []).filter((inv) => {
          const old = prevById.get(String(inv.id));
          if (!old) return true;
          return JSON.stringify(old) !== JSON.stringify(inv);
        });
        Promise.all(changed.map((inv) => saveInvoiceDb(inv))).catch((e) => {
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
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
};

export default BillingContext;
