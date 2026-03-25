import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  fetchInvoices,
  saveInvoice as saveInvoiceDb,
  saveInvoices as saveInvoicesDb,
  fetchCreditDebitNotes,
  saveCreditDebitNotes as saveCreditDebitNotesDb,
  fetchPaymentAdvice,
  savePaymentAdvice as savePaymentAdviceDb,
} from '../services/billingApi';

const BillingContext = createContext(null);

export const BillingProvider = ({ children }) => {
  const [commercialPOs, setCommercialPOsState] = useState([]);
  const [contactHistory, setContactHistoryState] = useState({});
  const [invoices, setInvoicesState] = useState([]);
  const [creditDebitNotes, setCreditDebitNotesState] = useState([]);
  const [paymentAdvice, setPaymentAdviceState] = useState({});
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [useDb, setUseDb] = useState(null);
  const [billingError, setBillingError] = useState(null);

  const loadFromDb = useCallback(async () => {
    try {
      const available = await isBillingDbAvailable();
      setUseDb(!!available);
      if (!available) return false;
      const [pos, invs, notes, pa] = await Promise.all([
        fetchCommercialPOs(),
        fetchInvoices(),
        fetchCreditDebitNotes(),
        fetchPaymentAdvice(),
      ]);
      setCommercialPOsState(pos);
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
  }, []);

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
        setCommercialPOsState(getCommercialPOs());
        setContactHistoryState(getContactHistory());
        setInvoicesState(getInvoices());
        setCreditDebitNotesState(getCreditDebitNotes());
        setPaymentAdviceState(getPaymentAdvice());
      }
    })();
    return () => { mounted = false; };
  }, [loadFromDb]);

  const setCommercialPOs = useCallback((updater) => {
    setCommercialPOsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setBillingError(null);
      saveCommercialPOsDb(next)
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
  }, [useDb]);

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
        saveInvoicesDb(next).catch((e) => console.warn('Billing DB save invoices failed:', e));
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
    commercialPOs,
    setCommercialPOs,
    contactHistory,
    setContactHistory,
    invoices,
    setInvoices,
    creditDebitNotes,
    setCreditDebitNotes,
    paymentAdvice,
    setPaymentAdvice,
    invoiceDraft,
    setInvoiceDraft,
    useBillingDb: !!useDb,
    billingError,
    clearBillingError: () => setBillingError(null),
    refreshBilling: loadFromDb,
    wopoList: commercialPOs,
    setWopoList: setCommercialPOs,
    bills: invoices,
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
