import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../contexts/AuthContext";
import { getLinkedEmployees, getLinkedSites } from "../../data/linkedData";
import {
  bulkUpsertDahejEntries,
  closeDahejMonth,
  computeRunningBalance,
  entriesForMonth,
  isMonthClosed,
  loadDahejBookingLocations,
  loadDahejEntries,
  loadDahejVehicles,
  loadMonthClosings,
  rowTotalExpense,
  saveDahejBookingLocations,
  saveDahejVehicles,
  softDeleteDahejEntry,
  upsertDahejBookingLocation,
  upsertDahejEntry,
  upsertDahejVehicle,
} from "../data/dahejExpenseStorage";

const DahejExpensesContext = createContext(null);

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DahejExpensesProvider({ children }) {
  const { user, userProfile } = useAuth();
  const actor = userProfile?.full_name || user?.email || "User";

  const [entries, setEntries] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [bookingLocations, setBookingLocations] = useState([]);
  const [monthClosings, setMonthClosings] = useState([]);
  const [sites, setSites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [linkedSites, linkedEmployees] = await Promise.all([getLinkedSites(), getLinkedEmployees()]);
      setSites(linkedSites);
      setEmployees(linkedEmployees);
      setEntries(loadDahejEntries());
      setVehicles(loadDahejVehicles());
      setBookingLocations(loadDahejBookingLocations());
      setMonthClosings(loadMonthClosings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const monthEntries = useMemo(
    () => computeRunningBalance(entries.filter((e) => e.month_key === selectedMonth)),
    [entries, selectedMonth]
  );

  const monthClosed = useMemo(() => isMonthClosed(selectedMonth), [selectedMonth, monthClosings]);

  const dashboard = useMemo(() => {
    const rows = monthEntries;
    const totalAdvances = rows.reduce((s, r) => s + (Number(r.advance_amount_paid) || 0), 0);
    const fuel = rows.reduce(
      (s, r) => s + (Number(r.fuel_camper) || 0) + (Number(r.fuel_maruti_eco) || 0) + (Number(r.fuel_bike) || 0) + (Number(r.fuel_fire_tender) || 0),
      0
    );
    const maintenance = rows.reduce(
      (s, r) =>
        s +
        (Number(r.service_camper) || 0) +
        (Number(r.service_maruti_eco) || 0) +
        (Number(r.service_bike) || 0) +
        (Number(r.service_fire_tender) || 0),
      0
    );
    const inventory = rows.reduce((s, r) => s + (Number(r.inventory_item) || 0), 0);
    const other = rows.reduce((s, r) => s + (Number(r.other_service_supplies) || 0), 0);
    const totalExpenses = rows.reduce((s, r) => s + rowTotalExpense(r), 0);
    const balance = totalAdvances - totalExpenses;

    const byCategory = {};
    rows.forEach((r) => {
      const cat = r.expense_type || "Uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + rowTotalExpense(r);
    });
    const topCategories = Object.entries(byCategory)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const byVehicle = {};
    rows.forEach((r) => {
      const v = r.vehicle_utilized_for || "—";
      byVehicle[v] = (byVehicle[v] || 0) + rowTotalExpense(r);
    });
    const vehicleAnalysis = Object.entries(byVehicle)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      totalAdvances,
      totalExpenses,
      fuel,
      maintenance,
      inventory,
      other,
      balance,
      topCategories,
      vehicleAnalysis,
      rowCount: rows.length,
    };
  }, [monthEntries]);

  const saveEntry = useCallback(
    (entry) => {
      const saved = upsertDahejEntry({ ...entry, month_key: entry.month_key || selectedMonth }, actor);
      setEntries(loadDahejEntries());
      return saved;
    },
    [actor, selectedMonth]
  );

  const deleteEntry = useCallback(
    (id) => {
      softDeleteDahejEntry(id, actor);
      setEntries(loadDahejEntries());
    },
    [actor]
  );

  const importEntries = useCallback(
    (rows) => {
      bulkUpsertDahejEntries(rows.map((r) => ({ ...r, month_key: r.month_key || selectedMonth })), actor);
      setEntries(loadDahejEntries());
    },
    [actor, selectedMonth]
  );

  const addBlankRows = useCallback(
    (count = 1) => {
      const maxSr = monthEntries.reduce((m, r) => Math.max(m, Number(r.sr_no) || 0), 0);
      const newRows = Array.from({ length: count }, (_, i) => ({
        month_key: selectedMonth,
        sr_no: maxSr + i + 1,
        status: "draft",
      }));
      newRows.forEach((r) => upsertDahejEntry(r, actor));
      setEntries(loadDahejEntries());
    },
    [actor, monthEntries, selectedMonth]
  );

  const saveVehicle = useCallback(
    (v) => {
      const saved = upsertDahejVehicle(v, actor);
      setVehicles(loadDahejVehicles());
      return saved;
    },
    [actor]
  );

  const saveBookingLocation = useCallback(
    (loc) => {
      const saved = upsertDahejBookingLocation(loc, actor);
      setBookingLocations(loadDahejBookingLocations());
      return saved;
    },
    [actor]
  );

  const closeMonth = useCallback(
    (monthKey = selectedMonth) => {
      const rows = entriesForMonth(monthKey);
      const summary = {
        advances: rows.reduce((s, r) => s + (Number(r.advance_amount_paid) || 0), 0),
        expenses: rows.reduce((s, r) => s + rowTotalExpense(r), 0),
        rows: rows.length,
      };
      closeDahejMonth(monthKey, actor, summary);
      setMonthClosings(loadMonthClosings());
    },
    [actor, selectedMonth]
  );

  const submitForApproval = useCallback(
    (ids) => {
      ids.forEach((id) => {
        const e = entries.find((x) => x.id === id);
        if (!e) return;
        upsertDahejEntry(
          {
            ...e,
            status: "submitted",
            approval_history: [
              ...(e.approval_history || []),
              { at: new Date().toISOString(), by: actor, action: "submitted" },
            ],
          },
          actor
        );
      });
      setEntries(loadDahejEntries());
    },
    [actor, entries]
  );

  const value = useMemo(
    () => ({
      entries,
      monthEntries,
      vehicles,
      bookingLocations,
      monthClosings,
      sites,
      employees,
      selectedMonth,
      setSelectedMonth,
      monthClosed,
      dashboard,
      loading,
      refresh,
      saveEntry,
      deleteEntry,
      importEntries,
      addBlankRows,
      saveVehicle,
      saveBookingLocation,
      closeMonth,
      submitForApproval,
      actor,
    }),
    [
      entries,
      monthEntries,
      vehicles,
      bookingLocations,
      monthClosings,
      sites,
      employees,
      selectedMonth,
      monthClosed,
      dashboard,
      loading,
      refresh,
      saveEntry,
      deleteEntry,
      importEntries,
      addBlankRows,
      saveVehicle,
      saveBookingLocation,
      closeMonth,
      submitForApproval,
      actor,
    ]
  );

  return <DahejExpensesContext.Provider value={value}>{children}</DahejExpensesContext.Provider>;
}

export function useDahejExpenses() {
  const ctx = useContext(DahejExpensesContext);
  if (!ctx) throw new Error("useDahejExpenses must be used within DahejExpensesProvider");
  return ctx;
}
