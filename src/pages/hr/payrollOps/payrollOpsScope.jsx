import React, { createContext, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ATTENDANCE_SYNCED_AT,
  INITIAL_SITES,
  buildNotifications,
  createInitialEmployees,
} from "./payrollOpsData";
import { payrollOpsAppPath } from "./payrollOpsNav";

const PayrollOpsContext = createContext(null);

function seedExtraSheets(employeesBySite, sites) {
  const init = {};
  Object.keys(employeesBySite).forEach((sid) => {
    const site = sites.find((s) => s.id === sid);
    init[sid] = (site?.sheets || []).map((name) => ({
      name,
      columns: [
        { key: "code", label: "Emp Code", type: "text" },
        { key: "name", label: "Name of Employee", type: "text" },
        { key: "amount", label: "Amount", type: "number" },
      ],
      rows: (employeesBySite[sid] || []).map((e) => ({ code: e.code, name: e.name, amount: 0 })),
    }));
  });
  return init;
}

export function PayrollOpsProvider({ children }) {
  const navigate = useNavigate();
  const [sites, setSites] = useState(INITIAL_SITES);
  const [employeesBySite, setEmployeesBySite] = useState(createInitialEmployees);
  const [month, setMonth] = useState("July");
  const [year, setYear] = useState("2026");
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [processingSiteId, setProcessingSiteId] = useState("s1");
  const [batchSiteIds, setBatchSiteIds] = useState(["s1"]);
  const [holds, setHolds] = useState({});
  const [extraSheets, setExtraSheets] = useState(() => seedExtraSheets(createInitialEmployees(), INITIAL_SITES));

  const notifications = useMemo(
    () => buildNotifications(sites, employeesBySite),
    [sites, employeesBySite]
  );

  const openProcess = (siteId, batchIds) => {
    const batch = batchIds?.length ? batchIds : [siteId];
    setProcessingSiteId(siteId);
    setBatchSiteIds(batch);
    navigate(`${payrollOpsAppPath("process-salary")}?site=${encodeURIComponent(siteId)}`);
  };

  const value = {
    sites,
    setSites,
    employeesBySite,
    setEmployeesBySite,
    month,
    setMonth,
    year,
    setYear,
    selectedSiteIds,
    setSelectedSiteIds,
    processingSiteId,
    setProcessingSiteId,
    batchSiteIds,
    setBatchSiteIds,
    holds,
    setHolds,
    extraSheets,
    setExtraSheets,
    notifications,
    openProcess,
    attendanceSyncedAt: ATTENDANCE_SYNCED_AT,
  };

  return <PayrollOpsContext.Provider value={value}>{children}</PayrollOpsContext.Provider>;
}

export function usePayrollOps() {
  const ctx = useContext(PayrollOpsContext);
  if (!ctx) throw new Error("usePayrollOps must be used within PayrollOpsProvider");
  return ctx;
}
