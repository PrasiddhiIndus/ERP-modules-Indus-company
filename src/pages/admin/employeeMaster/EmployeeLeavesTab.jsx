import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import {
  DEFAULT_ANNUAL_ENTITLEMENTS,
  fetchLeaveBalanceForEmployee,
  fetchLeaveUsageFromDailyRegister,
  formatLeaveBalanceError,
  getLeaveCarryForwardRules,
  processLeaveBalanceForEmployee,
  syncEmployeeYearlyLeaveFromRegister,
  upsertLeaveBalanceYearly,
  upsertPlEncashPrefs,
  fetchPlEncashPrefs,
} from "../../../lib/leaveManagement";
import { SectionCard } from "../../adminOperations/components/AdminUi";
import { toast } from "../../../lib/toast";
import {
  PrimaryButton,
  SecondaryButton,
  ShellBanner,
  inputClass,
} from "./deductions/deductionsUi";

const YEAR_DEFAULT = new Date().getFullYear();

const LEAVE_TYPES = [
  { key: "pl", label: "PL", opening: "opening_pl", entitlement: "pl_entitlement", used: "used_pl", unused: "unused_pl", carried: "carried_pl", expired: "expired_pl", encashed: "encashed_pl" },
  { key: "sl", label: "SL", opening: "opening_sl", entitlement: "sl_entitlement", used: "used_sl", unused: "unused_sl", carried: "carried_sl", expired: "expired_sl" },
  { key: "cl", label: "CL", opening: "opening_cl", entitlement: "cl_entitlement", used: "used_cl", unused: "unused_cl", carried: "carried_cl", expired: "expired_cl" },
  { key: "sbel", label: "S BeL", opening: "opening_sbel", entitlement: "sbel_entitlement", used: "used_sbel", unused: "unused_sbel" },
  { key: "spla", label: "SPLA", opening: "opening_spla", entitlement: "spla_entitlement", used: "used_spla", unused: "unused_spla" },
  { key: "splb", label: "SPLB", opening: "opening_splb", entitlement: "splb_entitlement", used: "used_splb", unused: "unused_splb" },
  { key: "splm", label: "SPLM", opening: "opening_splm", entitlement: "splm_entitlement", used: "used_splm", unused: "unused_splm" },
  { key: "coff", label: "C/OFF", opening: "opening_coff", used: "used_coff", unused: "unused_coff" },
  { key: "paternity", label: "Paternity", opening: "opening_paternity", entitlement: "paternity_entitlement", used: "used_paternity", unused: "unused_paternity" },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function emptyDraft() {
  const d = {
    pl_entitlement: DEFAULT_ANNUAL_ENTITLEMENTS.PL,
    sl_entitlement: DEFAULT_ANNUAL_ENTITLEMENTS.SL,
    cl_entitlement: DEFAULT_ANNUAL_ENTITLEMENTS.CL,
  };
  for (const t of LEAVE_TYPES) {
    d[t.opening] = 0;
    d[t.used] = 0;
    if (t.entitlement) d[t.entitlement] = d[t.entitlement] ?? 0;
    if (t.carried) d[t.carried] = 0;
    if (t.expired) d[t.expired] = 0;
    if (t.encashed) d[t.encashed] = 0;
  }
  return d;
}

function rowToDraft(row) {
  if (!row) return emptyDraft();
  const d = emptyDraft();
  for (const t of LEAVE_TYPES) {
    d[t.opening] = num(row[t.opening]);
    d[t.used] = num(row[t.used]);
    if (t.entitlement) d[t.entitlement] = num(row[t.entitlement]);
    if (t.carried) d[t.carried] = num(row[t.carried]);
    if (t.expired) d[t.expired] = num(row[t.expired]);
    if (t.encashed) d[t.encashed] = num(row[t.encashed]);
  }
  return d;
}

/**
 * Employee Master — Leaves tab.
 * Reads/writes indus_one.employee_leave_balances_yearly; year-end PL/SL via processLeaveBalanceForEmployee.
 */
export default function EmployeeLeavesTab({ employee }) {
  const empCode = normalizeAttendanceEmpCode(employee?.employee_code || employee?.employee_id || "");
  const [year, setYear] = useState(YEAR_DEFAULT);
  const [balance, setBalance] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState("");
  const [rules, setRules] = useState({ pl_carry_forward_max: 7, sl_carry_forward_max: 8 });
  const [encashPl, setEncashPl] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState([]);

  const load = useCallback(async () => {
    if (!empCode) {
      setBalance(null);
      setDraft(emptyDraft());
      setLoading(false);
      setError("This employee has no employee code — leave balances are keyed by employee code.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const [row, usageByCode, carryRules, prefs, ledgerRes] = await Promise.all([
        fetchLeaveBalanceForEmployee(supabase, empCode, year),
        fetchLeaveUsageFromDailyRegister(supabase, year),
        getLeaveCarryForwardRules(supabase),
        fetchPlEncashPrefs(supabase),
        supabase
          .schema("indus_one")
          .from("admin_leave_balance_ledger")
          .select("id, leave_type_code, delta_days, entry_type, note, year, created_at")
          .eq("employee_code", empCode)
          .eq("year", year)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      const liveUsed = usageByCode?.[empCode] || {};
      const mergedRow = row
        ? {
            ...row,
            used_pl: Number(liveUsed.used_pl ?? row.used_pl ?? 0),
            used_sl: Number(liveUsed.used_sl ?? row.used_sl ?? 0),
            used_cl: Number(liveUsed.used_cl ?? row.used_cl ?? 0),
            used_sbel: Number(liveUsed.used_sbel ?? row.used_sbel ?? 0),
            used_spla: Number(liveUsed.used_spla ?? row.used_spla ?? 0),
            used_splb: Number(liveUsed.used_splb ?? row.used_splb ?? 0),
            used_splm: Number(liveUsed.used_splm ?? row.used_splm ?? 0),
            used_coff: Number(liveUsed.used_coff ?? row.used_coff ?? 0),
            used_paternity: Number(liveUsed.used_paternity ?? row.used_paternity ?? 0),
          }
        : null;
      setBalance(mergedRow);
      setDraft(rowToDraft(mergedRow));
      setRules(carryRules || { pl_carry_forward_max: 7, sl_carry_forward_max: 8, cl_carry_forward_max: 0 });
      setEncashPl(!!prefs[empCode]);
      if (ledgerRes.error) {
        console.warn("Leave ledger audit load skipped", ledgerRes.error);
        setLedgerEntries([]);
      } else {
        setLedgerEntries(ledgerRes.data || []);
      }
    } catch (e) {
      console.error("Employee Leaves tab: load failed", e);
      setError(e?.message || "Could not load leave balances.");
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [empCode, year]);

  useEffect(() => {
    load();
  }, [load]);

  const display = editing ? draft : rowToDraft(balance);

  const rolloverPreview = useMemo(() => {
    const unused_pl = Math.max(0, num(display.opening_pl) - num(display.used_pl));
    const unused_sl = Math.max(0, num(display.opening_sl) - num(display.used_sl));
    const plCap = num(rules.pl_carry_forward_max);
    const slCap = num(rules.sl_carry_forward_max);
    const plCarry = Math.min(unused_pl, plCap);
    const slCarry = Math.min(unused_sl, slCap);
    return {
      unused_pl,
      unused_sl,
      carried_pl: encashPl ? 0 : plCarry,
      encashed_pl: encashPl ? plCarry : 0,
      expired_pl: Math.max(0, unused_pl - plCarry),
      carried_sl: slCarry,
      expired_sl: Math.max(0, unused_sl - slCarry),
      nextYear: year + 1,
    };
  }, [display, encashPl, rules, year]);

  const syncUsed = async () => {
    if (!empCode) return;
    try {
      setSaving(true);
      await syncEmployeeYearlyLeaveFromRegister(supabase, empCode, year);
      await load();
      toast.success("Used days synced from attendance.");
    } catch (e) {
      toast.error(e?.message || "Failed to sync used leave.");
    } finally {
      setSaving(false);
    }
  };

  const saveLedger = async () => {
    if (!empCode) return;
    try {
      setSaving(true);
      await upsertLeaveBalanceYearly(
        supabase,
        {
          employee_code: empCode,
          ...draft,
        },
        year,
        { skipEntitlementRecalc: true }
      );
      const row = await fetchLeaveBalanceForEmployee(supabase, empCode, year);
      setBalance(row);
      setDraft(rowToDraft(row));
      setEditing(false);
      toast.success("Leave ledger saved.");
    } catch (e) {
      toast.error(formatLeaveBalanceError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveEncashPref = async (next) => {
    if (!empCode) return;
    try {
      setEncashPl(next);
      await upsertPlEncashPrefs(supabase, { [empCode]: next });
      toast.success(
        next ? "PL encash preference saved." : "PL carry-forward preference saved."
      );
    } catch (e) {
      setEncashPl(!next);
      toast.error(e?.message || "Failed to save PL encash preference.");
    }
  };

  const runRollover = async () => {
    if (!empCode) return;
    const ok = window.confirm(
      `Run year-end PL/SL rollover for ${empCode} for ${year}?\n\n` +
        `This updates carried / expired / encashed for ${year} and seeds openings for ${year + 1} from the carry amounts.\n` +
        `Same rules as Leave Management (PL max ${rules.pl_carry_forward_max}, SL max ${rules.sl_carry_forward_max}).`
    );
    if (!ok) return;
    try {
      setRolling(true);
      const result = await processLeaveBalanceForEmployee(supabase, empCode, year);
      await load();
      toast.success(
        `Rollover done for ${year}`,
        `PL carried ${fmt(result.carried_pl)}, encashed ${fmt(result.encashed_pl)}, expired ${fmt(result.expired_pl)}; SL carried ${fmt(result.carried_sl)}, expired ${fmt(result.expired_sl)}. Openings seeded for ${result.nextYear}.`
      );
    } catch (e) {
      toast.error(e?.message || "Year-end rollover failed.");
    } finally {
      setRolling(false);
    }
  };

  if (!empCode) {
    return (
      <SectionCard title="Leaves">
        <p className="text-sm text-amber-800">
          Add an employee code on Personal details to manage leave balances (balances are stored by
          employee code).
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <ShellBanner>
        Leave balances come from the yearly leave register (same source as Leave Management and Indus
        One). Edit the ledger carefully — used days also sync from the attendance register. Year-end
        rollover applies PL/SL carry caps for this employee only.
      </ShellBanner>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-600">
            Year
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => {
                setEditing(false);
                setYear(Number(e.target.value) || YEAR_DEFAULT);
              }}
              className={`${inputClass} mt-1 w-28`}
            />
          </label>
          <p className="text-xs text-gray-500 self-end pb-2">
            Code <span className="font-mono text-gray-800">{empCode}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={syncUsed} disabled={saving || loading}>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Sync used from attendance
            </span>
          </SecondaryButton>
          <Link
            to="/app/admin/employee/leave-management"
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center"
          >
            Open Leave Management
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <SectionCard
        title={`Balances · ${year}`}
        right={
          editing ? (
            <div className="flex gap-2">
              <SecondaryButton
                onClick={() => {
                  setDraft(rowToDraft(balance));
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton onClick={saveLedger} disabled={saving}>
                {saving ? "Saving…" : "Save ledger"}
              </PrimaryButton>
            </div>
          ) : (
            <PrimaryButton
              onClick={() => {
                setDraft(rowToDraft(balance));
                setEditing(true);
              }}
              disabled={loading}
            >
              Edit ledger
            </PrimaryButton>
          )
        }
      >
        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-right">Opening</th>
                  <th className="px-2 py-2 text-right">Entitlement</th>
                  <th className="px-2 py-2 text-right">Used</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">Carried</th>
                  <th className="px-2 py-2 text-right">Expired</th>
                  <th className="px-2 py-2 text-right">Encashed</th>
                </tr>
              </thead>
              <tbody>
                {LEAVE_TYPES.map((t) => {
                  const opening = num(display[t.opening]);
                  const used = num(display[t.used]);
                  const balanceVal = Math.max(0, opening - used);
                  const cell = (field, editable = true) => {
                    if (!field) return <td className="px-2 py-2 text-right text-gray-400">—</td>;
                    if (editing && editable) {
                      return (
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={draft[field] ?? 0}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [field]: e.target.value }))
                            }
                            className="h-7 w-16 rounded border border-gray-300 px-1 text-right tabular-nums"
                          />
                        </td>
                      );
                    }
                    return (
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(display[field])}</td>
                    );
                  };
                  return (
                    <tr key={t.key} className="border-t border-gray-100">
                      <td className="px-2 py-2 font-semibold text-gray-900">{t.label}</td>
                      {cell(t.opening)}
                      {cell(t.entitlement, Boolean(t.entitlement))}
                      {cell(t.used)}
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">
                        {fmt(balanceVal)}
                      </td>
                      {cell(t.carried, Boolean(t.carried))}
                      {cell(t.expired, Boolean(t.expired))}
                      {cell(t.encashed, Boolean(t.encashed))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!balance && !editing ? (
              <p className="text-xs text-gray-500 mt-3">
                No balance row for {year} yet. Click Edit ledger to create one, or run year-end
                rollover from the prior year.
              </p>
            ) : null}
            {balance?.processed_at ? (
              <p className="text-[11px] text-gray-500 mt-2">
                Last processed: {new Date(balance.processed_at).toLocaleString("en-IN")}
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Year-end rollover (PL & SL)">
        <p className="text-xs text-gray-600 mb-3">
          Applies carry-forward caps from Leave Management rules. PL may be encashed instead of
          carried when the preference below is on. CL does not carry forward.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-800 mb-4">
          <input
            type="checkbox"
            checked={encashPl}
            onChange={(e) => saveEncashPref(e.target.checked)}
          />
          Encash PL at year-end (instead of carrying forward)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-gray-500">PL unused → carry / encash / expire</p>
            <p className="mt-1 font-semibold text-gray-900">
              {fmt(rolloverPreview.unused_pl)} → {fmt(rolloverPreview.carried_pl)} /{" "}
              {fmt(rolloverPreview.encashed_pl)} / {fmt(rolloverPreview.expired_pl)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">Cap {fmt(rules.pl_carry_forward_max)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-gray-500">SL unused → carry / expire</p>
            <p className="mt-1 font-semibold text-gray-900">
              {fmt(rolloverPreview.unused_sl)} → {fmt(rolloverPreview.carried_sl)} /{" "}
              {fmt(rolloverPreview.expired_sl)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">Cap {fmt(rules.sl_carry_forward_max)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 sm:col-span-2">
            <p className="text-gray-500">Next year openings</p>
            <p className="mt-1 font-semibold text-gray-900">
              {rolloverPreview.nextYear}: PL {fmt(rolloverPreview.carried_pl)}, SL{" "}
              {fmt(rolloverPreview.carried_sl)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              Seeded only if next-year openings are not already set.
            </p>
          </div>
        </div>
        <PrimaryButton onClick={runRollover} disabled={rolling || loading || !empCode}>
          {rolling ? "Running rollover…" : `Run PL/SL rollover for ${year}`}
        </PrimaryButton>
      </SectionCard>

      <SectionCard title={`Approval ledger · ${year}`}>
        <p className="text-xs text-gray-500 mb-2">
          Read-only deduct/restore entries from approved leave requests (not editable here).
        </p>
        {ledgerEntries.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">When</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Entry</th>
                  <th className="px-2 py-2 text-right">Days</th>
                  <th className="px-2 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="px-2 py-2 whitespace-nowrap text-gray-700">
                      {e.created_at ? new Date(e.created_at).toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-2 py-2 font-medium">{e.leave_type_code || "—"}</td>
                    <td className="px-2 py-2 capitalize">{e.entry_type || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(e.delta_days)}</td>
                    <td className="px-2 py-2 text-gray-600 max-w-[16rem] truncate" title={e.note || ""}>
                      {e.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-gray-500 py-2">No approval ledger rows for this year.</p>
        )}
      </SectionCard>
    </div>
  );
}
