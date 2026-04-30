import React, { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import minWageFlowConfig from "../../../config/manpowerMinWageFlow.json";

const SECTION_LABELS = {
  roles: "Roles",
  "price-master": "Price Master",
  "mail-template": "Mail Template",
  "employee-type": "Employee Type",
  departments: "Departments",
};

const SECTION_TABLES = {
  roles: "manpower_roles",
  "price-master": "manpower_price_master",
  "mail-template": "manpower_mail_templates",
  "employee-type": "manpower_employee_types",
  departments: "manpower_departments",
};

export default function ManpowerConfiguration() {
  const { section } = useParams();
  const label = SECTION_LABELS[section];
  const table = SECTION_TABLES[section];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [priceMasterSelection, setPriceMasterSelection] = useState({
    jurisdictionId: "state_government",
    stateCode: "MH",
    zoneCode: "ZONE_1",
  });

  if (!label) {
    return <Navigate to="/app/manpower/configuration/roles" replace />;
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const { data, error: e } = await supabase.from(table).select("*").order("created_at", { ascending: false });
        if (e) throw e;
        if (!cancelled) setRows(data || []);
      } catch (e) {
        const message = e?.message || String(e);
        if (!cancelled) {
          setRows([]);
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [table]);

  const columns = useMemo(() => {
    const sample = rows?.[0];
    if (!sample || typeof sample !== "object") return [];
    return Object.keys(sample).slice(0, 8);
  }, [rows]);

  const jurisdictionOptions = minWageFlowConfig?.jurisdictions || [];
  const selectedJurisdiction = useMemo(
    () => jurisdictionOptions.find((j) => j.id === priceMasterSelection.jurisdictionId) || jurisdictionOptions[0],
    [jurisdictionOptions, priceMasterSelection.jurisdictionId]
  );
  const stateOptions = selectedJurisdiction?.states || [];
  const selectedState = useMemo(
    () => stateOptions.find((s) => s.code === priceMasterSelection.stateCode) || stateOptions[0],
    [stateOptions, priceMasterSelection.stateCode]
  );
  const zoneOptions = selectedState?.zones || [];

  useEffect(() => {
    if (section !== "price-master") return;
    if (!selectedJurisdiction?.id) return;
    setPriceMasterSelection((prev) => {
      const firstState = (selectedJurisdiction.states || [])[0];
      const nextStateCode = firstState?.code || "";
      const nextZoneCode = (firstState?.zones || [])[0]?.code || "";
      return { ...prev, stateCode: nextStateCode, zoneCode: nextZoneCode };
    });
  }, [section, selectedJurisdiction?.id]);

  useEffect(() => {
    if (section !== "price-master") return;
    if (!selectedState?.code) return;
    setPriceMasterSelection((prev) => {
      const exists = (selectedState.zones || []).some((z) => z.code === prev.zoneCode);
      if (exists) return prev;
      return { ...prev, zoneCode: (selectedState.zones || [])[0]?.code || "" };
    });
  }, [section, selectedState?.code]);


  return (
    <div className="max-w-5xl mx-auto p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h1 className="text-xl font-semibold text-gray-900">Manpower Configuration</h1>
          <p className="text-sm text-gray-600 mt-1">{label}</p>
        </div>
        <div className="p-5">
          {section === "price-master" && (
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Minimum Wage Zone Mapping</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm">
                  <div className="text-slate-600 mb-1">Jurisdiction</div>
                  <select
                    value={priceMasterSelection.jurisdictionId}
                    onChange={(e) =>
                      setPriceMasterSelection((prev) => ({ ...prev, jurisdictionId: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {jurisdictionOptions.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="text-slate-600 mb-1">State / UT / ST</div>
                  <select
                    value={priceMasterSelection.stateCode}
                    onChange={(e) =>
                      setPriceMasterSelection((prev) => ({ ...prev, stateCode: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {stateOptions.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="text-slate-600 mb-1">Zone</div>
                  <select
                    value={priceMasterSelection.zoneCode}
                    onChange={(e) =>
                      setPriceMasterSelection((prev) => ({ ...prev, zoneCode: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {zoneOptions.map((z) => (
                      <option key={z.code} value={z.code}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 text-sm">
              <div className="font-semibold">Could not load configuration data.</div>
              <div className="mt-1">
                Table: <code className="text-xs">{table}</code>
              </div>
              <div className="mt-1">{error}</div>
              <div className="mt-2 text-rose-800/90">
                If this is a new master, create the table in Supabase (and expose it via RLS) so the app can fetch it.
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 text-sm">
              No rows found in <code className="text-xs">{table}</code>.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 100).map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-50">
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {r?.[c] == null ? "—" : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <div className="px-3 py-2 text-xs text-slate-500">Showing first 100 rows.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

