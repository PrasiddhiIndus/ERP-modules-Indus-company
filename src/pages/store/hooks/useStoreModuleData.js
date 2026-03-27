import { useMemo, useState } from "react";
import { buildPlannerRows, safeNumber } from "../utils/calculations";

const initialItems = [
  {
    id: "item-ppe-set",
    itemCode: "PPE-SET",
    itemName: "PPE Set",
    category: "PPE",
    subcategory: "General",
    uom: "set",
    itemType: "PPE",
    issueType: "consumable",
    annualEntitlementApplicable: true,
    defaultAnnualQtyPerPerson: 2,
    reorderLevel: 120,
    minStock: 80,
    active: true,
    remarks: "",
  },
  {
    id: "item-helmet",
    itemCode: "SAFE-HELMET",
    itemName: "Helmet",
    category: "Safety",
    subcategory: "Head",
    uom: "nos",
    itemType: "safety",
    issueType: "semi-returnable",
    annualEntitlementApplicable: true,
    defaultAnnualQtyPerPerson: 1,
    reorderLevel: 150,
    minStock: 100,
    active: true,
    remarks: "",
  },
  {
    id: "item-gloves",
    itemCode: "PPE-GLOVE",
    itemName: "Gloves",
    category: "PPE",
    subcategory: "Hand",
    uom: "pair",
    itemType: "consumable",
    issueType: "consumable",
    annualEntitlementApplicable: true,
    defaultAnnualQtyPerPerson: 2,
    reorderLevel: 300,
    minStock: 200,
    active: true,
    remarks: "",
  },
];

const initialStores = [
  {
    id: "store-central",
    storeCode: "STR-CEN-001",
    storeName: "Central Main Store",
    storeType: "Central Store",
    linkedSiteId: null,
    location: "Head Office Campus",
    incharge: "Store Admin",
    active: true,
  },
  {
    id: "store-site-a",
    storeCode: "STR-SITE-A",
    storeName: "Site A Store",
    storeType: "Site Store",
    linkedSiteId: "site-a",
    location: "Site A",
    incharge: "Site Keeper A",
    active: true,
  },
  {
    id: "store-site-b",
    storeCode: "STR-SITE-B",
    storeName: "Site B Store",
    storeType: "Site Store",
    linkedSiteId: "site-b",
    location: "Site B",
    incharge: "Site Keeper B",
    active: true,
  },
];

const initialSites = [
  { id: "site-a", siteName: "Plant Alpha", contractType: "Industrial Fire Safety", activePersonnelCount: 50, active: true, storeId: "store-site-a" },
  { id: "site-b", siteName: "Depot Bravo", contractType: "Manpower + PPE", activePersonnelCount: 80, active: true, storeId: "store-site-b" },
];

const initialSiteRules = [
  { siteId: "site-a", itemOverrides: { "item-gloves": 3 } },
  { siteId: "site-b", itemOverrides: {} },
];

const initialBalances = {
  "store-central:item-ppe-set": 600,
  "store-central:item-helmet": 500,
  "store-central:item-gloves": 1000,
  "store-site-a:item-ppe-set": 30,
  "store-site-a:item-helmet": 20,
  "store-site-a:item-gloves": 40,
  "store-site-b:item-ppe-set": 40,
  "store-site-b:item-helmet": 35,
  "store-site-b:item-gloves": 50,
};

function makeLedgerEntry(type, payload) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    type,
    ...payload,
  };
}

export function useStoreModuleData() {
  const [items, setItems] = useState(initialItems);
  const [stores, setStores] = useState(initialStores);
  const [sites, setSites] = useState(initialSites);
  const [siteRules, setSiteRules] = useState(initialSiteRules);
  const [balances, setBalances] = useState(initialBalances);
  const [ledger, setLedger] = useState([]);
  const [returnsPending] = useState(22);
  const [inTransit] = useState(18);
  const [reconciliations, setReconciliations] = useState([]);

  const applyDelta = (storeId, itemId, delta) => {
    const key = `${storeId}:${itemId}`;
    setBalances((prev) => ({ ...prev, [key]: Math.max(safeNumber(prev[key]) + safeNumber(delta), 0) }));
  };

  const createInward = (payload) => {
    payload.rows.forEach((r) => applyDelta(payload.destinationStoreId, r.itemId, r.qty));
    setLedger((prev) => [makeLedgerEntry("INWARD", payload), ...prev]);
  };

  const createOutward = (payload) => {
    payload.rows.forEach((r) => applyDelta(payload.sourceStoreId, r.itemId, -safeNumber(r.qty)));
    if (payload.destinationStoreId) {
      payload.rows.forEach((r) => applyDelta(payload.destinationStoreId, r.itemId, safeNumber(r.qty)));
    }
    setLedger((prev) => [makeLedgerEntry("OUTWARD", payload), ...prev]);
  };

  const createReturn = (payload) => {
    payload.rows.forEach((r) => {
      applyDelta(payload.destinationStoreId, r.itemId, r.goodQty);
    });
    setLedger((prev) => [makeLedgerEntry("RETURN", payload), ...prev]);
  };

  const createTransfer = (payload) => {
    payload.rows.forEach((r) => {
      applyDelta(payload.fromStoreId, r.itemId, -safeNumber(r.qty));
      if (payload.status === "received") applyDelta(payload.toStoreId, r.itemId, safeNumber(r.qty));
    });
    setLedger((prev) => [makeLedgerEntry("TRANSFER", payload), ...prev]);
  };

  const addItem = (item) => {
    setItems((prev) => [...prev, { ...item, id: crypto.randomUUID() }]);
  };

  const addStore = (store) => {
    setStores((prev) => [...prev, { ...store, id: crypto.randomUUID() }]);
  };

  const setSiteOverride = (siteId, itemId, qty) => {
    setSiteRules((prev) =>
      prev.map((r) => (r.siteId === siteId ? { ...r, itemOverrides: { ...r.itemOverrides, [itemId]: qty } } : r))
    );
  };

  const addReconciliation = (row) => {
    setReconciliations((prev) => [{ id: crypto.randomUUID(), ...row }, ...prev]);
  };

  const stockByStoreItem = useMemo(() => balances, [balances]);

  const issuedBySiteItem = useMemo(() => {
    const map = {};
    ledger
      .filter((l) => l.type === "OUTWARD" && l.linkedSiteId)
      .forEach((l) => {
        l.rows.forEach((r) => {
          const key = `${l.linkedSiteId}:${r.itemId}`;
          map[key] = safeNumber(map[key]) + safeNumber(r.qty);
        });
      });
    return map;
  }, [ledger]);

  const planner = useMemo(
    () =>
      buildPlannerRows({
        items,
        sites,
        siteRules,
        issuedBySiteItem,
        siteStockByItem: stockByStoreItem,
      }),
    [items, issuedBySiteItem, siteRules, sites, stockByStoreItem]
  );

  const lowStockItems = useMemo(
    () =>
      items.filter((item) => {
        const total = stores.reduce((sum, s) => sum + safeNumber(stockByStoreItem[`${s.id}:${item.id}`]), 0);
        return total <= safeNumber(item.reorderLevel);
      }),
    [items, stores, stockByStoreItem]
  );

  const alerts = useMemo(() => {
    const out = [];
    if (lowStockItems.length) out.push({ type: "low_stock", message: `${lowStockItems.length} items below reorder` });
    if (returnsPending > 0) out.push({ type: "pending_returns", message: `${returnsPending} pending return entries` });
    planner.forEach((p) => {
      const shortages = p.rows.filter((r) => r.shortfall > 0);
      if (shortages.length) out.push({ type: "site_shortage", message: `${p.site.siteName}: ${shortages.length} item shortages` });
    });
    return out;
  }, [lowStockItems.length, planner, returnsPending]);

  return {
    // master/state
    items,
    stores,
    sites,
    siteRules,
    stockByStoreItem,
    ledger,
    planner,
    alerts,
    reconciliations,
    returnsPending,
    inTransit,
    lowStockItems,
    // operations
    addItem,
    addStore,
    createInward,
    createOutward,
    createReturn,
    createTransfer,
    setSiteOverride,
    addReconciliation,
  };
}

