import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const QuotationDraftContext = createContext(null);

function newDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft-${crypto.randomUUID()}`;
  }
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Session-scoped BOQ trees keyed by quotation id (real or draft-*).
 * Survives tab switches while the hub stays mounted; not persisted.
 */
export function QuotationDraftProvider({ children }) {
  const [activeQuotationId, setActiveQuotationIdState] = useState(null);
  const [boqTrees, setBoqTrees] = useState({});
  const [quotationLabels, setQuotationLabels] = useState({});
  /** sourceItemIds currently present in Entry lines, keyed by quotation id */
  const [entryFetchedItemIds, setEntryFetchedItemIdsState] = useState({});

  const setActiveQuotationId = useCallback((id, label) => {
    setActiveQuotationIdState(id);
    if (id && label != null && String(label).trim()) {
      setQuotationLabels((prev) => ({ ...prev, [id]: String(label).trim() }));
    }
    if (id) {
      setBoqTrees((prev) => (prev[id] != null ? prev : { ...prev, [id]: [] }));
    }
  }, []);

  const setQuotationLabel = useCallback((id, label) => {
    if (!id) return;
    setQuotationLabels((prev) => ({
      ...prev,
      [id]: String(label || '').trim() || prev[id] || 'New Quotation (unsaved)',
    }));
  }, []);

  const setEntryFetchedItemIds = useCallback((quotationId, ids) => {
    if (!quotationId) return;
    const list = [...(ids instanceof Set ? ids : ids || [])];
    setEntryFetchedItemIdsState((prev) => ({ ...prev, [quotationId]: list }));
  }, []);

  const getActiveFetchedItemIds = useCallback(() => {
    if (!activeQuotationId) return new Set();
    return new Set(entryFetchedItemIds[activeQuotationId] || []);
  }, [activeQuotationId, entryFetchedItemIds]);

  const getActiveTree = useCallback(() => {
    if (!activeQuotationId) return [];
    return boqTrees[activeQuotationId] ?? [];
  }, [activeQuotationId, boqTrees]);

  const setActiveTree = useCallback(
    (treeOrUpdater) => {
      setBoqTrees((prev) => {
        if (!activeQuotationId) return prev;
        const current = prev[activeQuotationId] ?? [];
        const next =
          typeof treeOrUpdater === 'function' ? treeOrUpdater(current) : treeOrUpdater;
        return { ...prev, [activeQuotationId]: next ?? [] };
      });
    },
    [activeQuotationId]
  );

  const startNewDraft = useCallback(() => {
    const id = newDraftId();
    setBoqTrees((prev) => ({ ...prev, [id]: [] }));
    setQuotationLabels((prev) => ({ ...prev, [id]: 'New Quotation (unsaved)' }));
    setEntryFetchedItemIdsState((prev) => ({ ...prev, [id]: [] }));
    setActiveQuotationIdState(id);
    return id;
  }, []);

  const getLabel = useCallback(
    (id) => {
      if (!id) return '';
      if (quotationLabels[id]) return quotationLabels[id];
      if (String(id).startsWith('draft-')) return 'New Quotation (unsaved)';
      return id;
    },
    [quotationLabels]
  );

  const value = useMemo(
    () => ({
      activeQuotationId,
      boqTrees,
      quotationLabels,
      entryFetchedItemIds,
      setActiveQuotationId,
      setQuotationLabel,
      setEntryFetchedItemIds,
      getActiveFetchedItemIds,
      getActiveTree,
      setActiveTree,
      startNewDraft,
      getLabel,
    }),
    [
      activeQuotationId,
      boqTrees,
      quotationLabels,
      entryFetchedItemIds,
      setActiveQuotationId,
      setQuotationLabel,
      setEntryFetchedItemIds,
      getActiveFetchedItemIds,
      getActiveTree,
      setActiveTree,
      startNewDraft,
      getLabel,
    ]
  );

  return (
    <QuotationDraftContext.Provider value={value}>{children}</QuotationDraftContext.Provider>
  );
}

const EMPTY_FALLBACK = {
  activeQuotationId: null,
  boqTrees: {},
  quotationLabels: {},
  entryFetchedItemIds: {},
  setActiveQuotationId: () => {},
  setQuotationLabel: () => {},
  setEntryFetchedItemIds: () => {},
  getActiveFetchedItemIds: () => new Set(),
  getActiveTree: () => [],
  setActiveTree: () => {},
  startNewDraft: () => '',
  getLabel: () => '',
};

export function useQuotationDraft() {
  const ctx = useContext(QuotationDraftContext);
  return ctx || EMPTY_FALLBACK;
}
