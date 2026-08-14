import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import {
  addUnpaidPaidSettlement,
  createUnpaidPaid,
  setUnpaidPaidStatus,
  updateUnpaidPaid,
} from "./deductionsDb";
import {
  currentYm,
  feedsSalaryProcessing,
  formatINR,
  normalizeUnpaidKind,
  parseMoney,
  round2,
  suggestEmi,
  unpaidKindLabel,
  unpaidSignedAmountForMonth,
} from "./deductionsStore";
import {
  DangerButton,
  EmptyState,
  Field,
  inputClass,
  MoneyText,
  MonthInput,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "./deductionsUi";

function blankForm(kind = "company_owes") {
  return {
    kind,
    amount: "",
    months: "1",
    monthly: "",
    monthlyManual: false,
    start_month: currentYm(),
    remarks: "",
  };
}

/**
 * Unpaid / Paid (DB-backed), same pattern as Salary advances:
 * - Type: Unpaid (company owes) → credit on salary
 * - Type: Paid / excess → deduct / recover on salary
 * Hits Salary Processing by start month + tenure only (no entry date).
 * Set months / monthly / amount to 0 → no hit (blank/null on processing).
 */
export default function EmployeeUnpaidPaidTab({ employeeId, records, onReload }) {
  const rows = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => blankForm());
  const [settleId, setSettleId] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMonth, setSettleMonth] = useState(currentYm());
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openRows = useMemo(
    () => rows.filter((r) => r.status !== "closed"),
    [rows]
  );
  const closedRows = useMemo(
    () => rows.filter((r) => r.status === "closed"),
    [rows]
  );
  const sortedRows = useMemo(() => [...openRows, ...closedRows], [openRows, closedRows]);

  const openCount = useMemo(
    () => openRows.filter((r) => feedsSalaryProcessing(r.status)).length,
    [openRows]
  );

  const refresh = async () => {
    if (typeof onReload === "function") await onReload();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm("company_owes"));
    setError("");
    setShowForm(true);
  };

  const openEdit = (row) => {
    if (row.status === "closed") {
      alert("Closed entries are frozen and will not update salary processing.");
      return;
    }
    setEditingId(row.id);
    setForm({
      kind: normalizeUnpaidKind(row.kind),
      amount: String(row.balance_outstanding ?? row.amount ?? ""),
      months: String(row.months_remaining ?? row.months ?? "1"),
      monthly: String(row.monthly_amount ?? ""),
      monthlyManual: true,
      start_month: row.start_month || row.month || currentYm(),
      remarks: row.remarks || "",
    });
    setError("");
    setShowForm(true);
  };

  const syncMonthly = (amount, months, keepManual) => {
    if (keepManual) return;
    const emi = suggestEmi(parseMoney(amount), Number(months));
    setForm((prev) => ({ ...prev, monthly: emi > 0 ? String(emi) : "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!employeeId) return;
    const amount = parseMoney(form.amount);
    const months = Math.max(0, Math.floor(Number(form.months) || 0));
    const monthly = parseMoney(form.monthly) ?? 0;

    if (!form.start_month) {
      alert("Set the month this should hit on Salary Processing.");
      return;
    }

    if (editingId) {
      // Zero amount / months / monthly → stop salary feed (shows blank on processing)
      const bal = amount == null ? 0 : amount;
      if (bal < 0) {
        alert("Amount cannot be negative.");
        return;
      }
      if (months > 0 && bal > 0 && monthly < 0) {
        alert("Monthly amount cannot be negative.");
        return;
      }
    } else {
      if (amount == null || amount <= 0) {
        alert("Enter an amount greater than zero.");
        return;
      }
      if (months <= 0) {
        alert("Enter how many salary months this should hit (e.g. 1).");
        return;
      }
      if (monthly <= 0) {
        alert("Enter the monthly amount that hits Salary Processing.");
        return;
      }
    }

    setBusy(true);
    setError("");
    try {
      if (editingId) {
        const bal = amount == null ? 0 : amount;
        const stopHit = months <= 0 || monthly <= 0 || bal <= 0;
        await updateUnpaidPaid(editingId, {
          kind: form.kind,
          amount: bal,
          months_remaining: stopHit ? 0 : months,
          months: stopHit ? 0 : months,
          monthly_amount: stopHit ? 0 : monthly,
          start_month: form.start_month,
          remarks: form.remarks || "",
          clear_salary_hit: stopHit,
        });
      } else {
        await createUnpaidPaid(employeeId, {
          kind: form.kind,
          amount,
          months,
          monthly_amount: monthly,
          start_month: form.start_month,
          remarks: form.remarks || "",
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(blankForm());
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === "closed") return;
    if (status === "closed") {
      const ok = window.confirm(
        "Close this entry? It will stop affecting salary processing. History stays visible."
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      await setUnpaidPaidStatus(id, status);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  const applySettlement = async (row) => {
    const amount = parseMoney(settleAmount);
    if (amount == null || amount <= 0) {
      alert("Enter a settlement amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addUnpaidPaidSettlement(row.id, {
        amount,
        month_key: settleMonth || currentYm(),
        settlement_date: settleDate || new Date().toISOString().slice(0, 10),
      });
      setSettleId(null);
      setSettleAmount("");
      await refresh();
      const nextBal = Math.max(0, round2(Number(row.balance_outstanding) - amount));
      if (nextBal <= 0) {
        alert("Fully settled and closed — no further salary effect.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save settlement.");
    } finally {
      setBusy(false);
    }
  };

  const renderThisMonth = (row) => {
    if (!feedsSalaryProcessing(row.status)) return "—";
    const signed = unpaidSignedAmountForMonth(row, currentYm());
    if (!signed) return "—";
    const abs = Math.abs(signed);
    // Unpaid (company owes) → credit to employee; Paid → deduct
    if (signed < 0) {
      return <span className="text-emerald-700 tabular-nums">+{formatINR(abs)}</span>;
    }
    return <span className="text-red-700 tabular-nums">−{formatINR(abs)}</span>;
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Unpaid / Paid"
        right={
          <PrimaryButton disabled={busy} onClick={openCreate}>
            New entry
          </PrimaryButton>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {openCount} open entr{openCount === 1 ? "y" : "ies"} — hits Salary Processing for the start
          month and tenure only. After paid off, set amount / months / monthly to 0 so processing
          shows blank.
        </p>

        {showForm ? (
          <form
            onSubmit={handleSave}
            className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Edit open entry" : "New unpaid / paid entry"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <Field label="Type">
                <select
                  value={normalizeUnpaidKind(form.kind)}
                  disabled={busy}
                  onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
                  className={inputClass}
                >
                  <option value="company_owes">Unpaid (company owes employee)</option>
                  <option value="employee_owes">Paid / excess (adjust or recover)</option>
                </select>
              </Field>
              <Field
                label="Amount (₹)"
                hint={editingId ? "Set to 0 to clear salary hit." : null}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  disabled={busy}
                  onChange={(e) => {
                    const amount = e.target.value;
                    setForm((prev) => ({ ...prev, amount }));
                    syncMonthly(amount, form.months, form.monthlyManual);
                  }}
                  className={inputClass}
                  required={!editingId}
                />
              </Field>
              <Field
                label="Months"
                hint={
                  editingId
                    ? "0 = no salary hit (null on processing)."
                    : "e.g. 1 = hits only the start month."
                }
              >
                <input
                  type="number"
                  min={editingId ? "0" : "1"}
                  step="1"
                  value={form.months}
                  disabled={busy}
                  onChange={(e) => {
                    const months = e.target.value;
                    setForm((prev) => ({ ...prev, months }));
                    syncMonthly(form.amount, months, form.monthlyManual && Boolean(editingId));
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field
                label="Monthly (₹)"
                hint={editingId ? "0 = null on Salary Processing." : "Amount applied each pay month."}
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthly}
                  disabled={busy}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      monthly: e.target.value,
                      monthlyManual: true,
                    }))
                  }
                  className={inputClass}
                  required={!editingId && Number(form.months) > 0}
                />
              </Field>
              <Field label="Month" hint="Pay month this starts hitting Salary Processing.">
                <MonthInput
                  value={form.start_month}
                  disabled={busy}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_month: e.target.value }))}
                  required
                />
              </Field>
            </div>
            <Field label="Remarks" hint="e.g. March arrears / festival advance paid">
              <input
                type="text"
                value={form.remarks}
                disabled={busy}
                onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                className={inputClass}
                placeholder="e.g. March arrears / festival advance paid"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Saving…" : editingId ? "Save" : "Save entry"}
              </PrimaryButton>
              <SecondaryButton
                disabled={busy}
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </SecondaryButton>
            </div>
          </form>
        ) : null}

        {!rows.length && !showForm ? (
          <EmptyState
            title="No unpaid / paid entries"
            body="Choose type, amount, months, monthly, and month. It hits Salary Processing for that month window. Set amount/months/monthly to 0 after paid to clear processing."
            action={<PrimaryButton onClick={openCreate}>New entry</PrimaryButton>}
          />
        ) : null}

        {sortedRows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">Monthly</th>
                  <th className="px-2 py-2 text-center">Months left</th>
                  <th className="px-2 py-2 text-left">Month period</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">This month</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`border-t border-gray-100 align-top ${
                        row.status === "closed" ? "opacity-70 bg-gray-50/40" : ""
                      }`}
                    >
                      <td className="px-2 py-2">
                        <span className="font-medium text-gray-800">
                          {unpaidKindLabel(row.kind)}
                        </span>
                        {row.remarks ? (
                          <p
                            className="text-[10px] text-gray-500 mt-0.5 max-w-[14rem] truncate"
                            title={row.remarks}
                          >
                            {row.remarks}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={row.amount} strong />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={row.balance_outstanding} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {Number(row.monthly_amount) > 0 ? (
                          <MoneyText value={row.monthly_amount} />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {row.months_remaining ?? row.months ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-gray-700 whitespace-nowrap">
                        {row.start_month || row.month || "—"}
                        {row.end_month && row.end_month !== row.start_month
                          ? ` → ${row.end_month}`
                          : ""}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-2 py-2 tabular-nums">{renderThisMonth(row)}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.status !== "closed" ? (
                            <>
                              <SecondaryButton disabled={busy} onClick={() => openEdit(row)}>
                                Edit
                              </SecondaryButton>
                              <SecondaryButton
                                disabled={busy}
                                onClick={() => {
                                  setSettleId(row.id);
                                  setSettleAmount(
                                    String(row.monthly_amount || row.balance_outstanding || "")
                                  );
                                  setSettleMonth(currentYm());
                                  setSettleDate(new Date().toISOString().slice(0, 10));
                                }}
                              >
                                Settle
                              </SecondaryButton>
                              {row.status === "hold" ? (
                                <SecondaryButton
                                  disabled={busy}
                                  onClick={() => setStatus(row.id, "open")}
                                >
                                  Resume
                                </SecondaryButton>
                              ) : (
                                <SecondaryButton
                                  disabled={busy}
                                  onClick={() => setStatus(row.id, "hold")}
                                >
                                  Hold
                                </SecondaryButton>
                              )}
                              <DangerButton
                                disabled={busy}
                                onClick={() => setStatus(row.id, "closed")}
                              >
                                Close
                              </DangerButton>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-500">Closed — history only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {settleId === row.id ? (
                      <tr className="bg-blue-50/60">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <Field label="Settlement (₹)">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={settleAmount}
                                disabled={busy}
                                onChange={(e) => setSettleAmount(e.target.value)}
                                className={inputClass + " w-40"}
                              />
                            </Field>
                            <Field label="Pay month">
                              <MonthInput
                                value={settleMonth}
                                disabled={busy}
                                onChange={(e) => setSettleMonth(e.target.value)}
                              />
                            </Field>
                            <Field label="Settlement day">
                              <input
                                type="date"
                                value={settleDate}
                                disabled={busy}
                                onChange={(e) => setSettleDate(e.target.value)}
                                className={inputClass}
                              />
                            </Field>
                            <PrimaryButton disabled={busy} onClick={() => applySettlement(row)}>
                              {busy ? "Saving…" : "Apply"}
                            </PrimaryButton>
                            <SecondaryButton disabled={busy} onClick={() => setSettleId(null)}>
                              Cancel
                            </SecondaryButton>
                            <p className="text-[11px] text-gray-600 self-center">
                              Balance after:{" "}
                              {formatINR(
                                Math.max(
                                  0,
                                  round2(
                                    Number(row.balance_outstanding) - (parseMoney(settleAmount) || 0)
                                  )
                                )
                              )}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {(row.settlements || []).length ? (
                      <tr className="bg-gray-50/80">
                        <td colSpan={9} className="px-3 py-2 text-[11px] text-gray-600">
                          History:{" "}
                          {(row.settlements || []).slice(0, 12).map((s) => (
                            <span key={s.id} className="inline-block mr-3">
                              {s.settlement_date || s.at?.slice?.(0, 10) || "—"} ({s.month}):{" "}
                              {formatINR(s.amount)}
                              {s.source === "salary_sheet" ? " · salary" : ""}
                            </span>
                          ))}
                          {(row.settlements || []).length > 12 ? "…" : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
