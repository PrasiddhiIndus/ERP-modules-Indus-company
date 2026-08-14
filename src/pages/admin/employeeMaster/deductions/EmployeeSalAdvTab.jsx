import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import {
  addSalaryAdvanceRecovery,
  createSalaryAdvance,
  setSalaryAdvanceStatus,
  updateSalaryAdvance,
} from "./deductionsDb";
import {
  currentYm,
  deductionActiveForMonth,
  deductionAmountForMonth,
  feedsSalaryProcessing,
  formatINR,
  parseMoney,
  round2,
  suggestEmi,
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

function blankForm() {
  return {
    amount: "",
    months: "1",
    recovery: "",
    recoveryManual: false,
    start_month: currentYm(),
    entry_date: new Date().toISOString().slice(0, 10),
    remarks: "",
  };
}

/**
 * Salary advance lifecycle (DB-backed):
 * disburse → recovery plan → hold / close / recover complete.
 */
export default function EmployeeSalAdvTab({ employeeId, records, onReload }) {
  const rows = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [recoverId, setRecoverId] = useState(null);
  const [recoverAmount, setRecoverAmount] = useState("");
  const [recoverMonth, setRecoverMonth] = useState(currentYm());
  const [recoverDate, setRecoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openActive = useMemo(
    () => rows.filter((r) => r.status === "active").length,
    [rows]
  );

  const refresh = async () => {
    if (typeof onReload === "function") await onReload();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setError("");
    setShowForm(true);
  };

  const openEdit = (row) => {
    if (row.status === "closed") {
      alert("Closed salary advances are frozen and will not recover through salary again.");
      return;
    }
    setEditingId(row.id);
    setForm({
      amount: String(row.amount ?? ""),
      months: String(row.months_remaining ?? row.months ?? "1"),
      recovery: String(row.recovery_amount ?? ""),
      recoveryManual: true,
      start_month: row.start_month || currentYm(),
      entry_date: row.entry_date || new Date().toISOString().slice(0, 10),
      remarks: row.remarks || "",
    });
    setError("");
    setShowForm(true);
  };

  const syncRecovery = (amount, months, keepManual) => {
    if (keepManual) return;
    const emi = suggestEmi(parseMoney(amount), Number(months));
    setForm((prev) => ({ ...prev, recovery: emi > 0 ? String(emi) : "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!employeeId) return;
    const amount = parseMoney(form.amount);
    const months = Math.max(0, Math.floor(Number(form.months) || 0));
    const recovery = parseMoney(form.recovery) ?? 0;
    if (!editingId && (amount == null || amount <= 0)) {
      alert("Enter the advance amount.");
      return;
    }
    if (!editingId && months <= 0) {
      alert("Enter recovery months (e.g. 3).");
      return;
    }
    if (months > 0 && recovery <= 0) {
      alert("Enter monthly recovery, or set months to 0 to stop salary recovery.");
      return;
    }
    if (!form.start_month) {
      alert("Set a start month for recovery.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (editingId) {
        await updateSalaryAdvance(editingId, {
          months_remaining: months,
          months: months > 0 ? months : undefined,
          recovery_amount: months > 0 ? recovery : 0,
          start_month: form.start_month,
          entry_date: form.entry_date,
          remarks: form.remarks || "",
        });
      } else {
        await createSalaryAdvance(employeeId, {
          amount,
          months,
          recovery_amount: recovery,
          start_month: form.start_month,
          entry_date: form.entry_date,
          remarks: form.remarks || "",
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(blankForm());
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save salary advance.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === "closed") return;
    if (status === "closed") {
      const ok = window.confirm(
        "Close this salary advance? It will stop recovering from salary processing."
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      await setSalaryAdvanceStatus(id, status);
      await refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  const applyRecovery = async (row) => {
    const amount = parseMoney(recoverAmount);
    if (amount == null || amount <= 0) {
      alert("Enter a recovery amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addSalaryAdvanceRecovery(row.id, {
        amount,
        month_key: recoverMonth || currentYm(),
        recovery_date: recoverDate || new Date().toISOString().slice(0, 10),
      });
      setRecoverId(null);
      setRecoverAmount("");
      await refresh();
      const nextBal = Math.max(0, round2(Number(row.balance_outstanding) - amount));
      if (nextBal <= 0) {
        alert("Advance fully recovered and closed — no further salary recovery.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save recovery.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Salary advances"
        right={
          <PrimaryButton onClick={openCreate} disabled={busy}>
            New advance
          </PrimaryButton>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {openActive} open advance{openActive === 1 ? "" : "s"} — recovery hits salary only inside
          tenure.
        </p>

        {showForm ? (
          <form
            onSubmit={handleSave}
            className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Update recovery plan" : "Enter salary advance"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <Field label="Advance amount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  disabled={Boolean(editingId) || busy}
                  onChange={(e) => {
                    const amount = e.target.value;
                    setForm((prev) => ({ ...prev, amount }));
                    syncRecovery(amount, form.months, form.recoveryManual);
                  }}
                  className={inputClass}
                  required={!editingId}
                />
              </Field>
              <Field
                label="Recovery months"
                hint={editingId ? "0 = stop salary recovery." : "e.g. 3 pay months from start."}
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
                    syncRecovery(form.amount, months, form.recoveryManual && Boolean(editingId));
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Monthly recovery (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.recovery}
                  disabled={busy}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      recovery: e.target.value,
                      recoveryManual: true,
                    }))
                  }
                  className={inputClass}
                  required={Number(form.months) > 0}
                />
              </Field>
              <Field label="Recovery start month">
                <MonthInput
                  value={form.start_month}
                  disabled={busy}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_month: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Entry date" hint="Day this advance / plan was saved.">
                <input
                  type="date"
                  value={form.entry_date}
                  disabled={busy}
                  onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))}
                  className={inputClass}
                  required
                />
              </Field>
            </div>
            <Field label="Remarks">
              <input
                type="text"
                value={form.remarks}
                disabled={busy}
                onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Saving…" : editingId ? "Save plan" : "Save advance"}
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
            title="No salary advances"
            body="Record amount, recovery months, monthly recovery, start month, and entry date. Saved to the salary database."
            action={<PrimaryButton onClick={openCreate}>New advance</PrimaryButton>}
          />
        ) : null}

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Advance</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">Monthly recovery</th>
                  <th className="px-2 py-2 text-center">Months left</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">This month</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const payYm = currentYm();
                  const hits = deductionActiveForMonth(row, payYm, {
                    amountKey: "recovery_amount",
                  });
                  const hitAmt = deductionAmountForMonth(row, payYm, {
                    amountKey: "recovery_amount",
                  });
                  return (
                    <React.Fragment key={row.id}>
                      <tr className="border-t border-gray-100">
                        <td className="px-2 py-2">
                          <MoneyText value={row.amount} strong />
                          <p className="text-[10px] text-gray-500">
                            {row.start_month || "—"} → {row.end_month || "—"} · Entry{" "}
                            {row.entry_date || "—"}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <MoneyText value={row.balance_outstanding} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <MoneyText value={row.recovery_amount} />
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          {row.months_remaining ?? row.months ?? "—"}
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-2 py-2">
                          {!feedsSalaryProcessing(row.status)
                            ? "No"
                            : hits ? (
                                <span className="text-red-700 tabular-nums">−{formatINR(hitAmt)}</span>
                              ) : (
                                "—"
                              )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {row.status !== "closed" ? (
                              <>
                                <SecondaryButton disabled={busy} onClick={() => openEdit(row)}>
                                  EMI / months
                                </SecondaryButton>
                                <SecondaryButton
                                  disabled={busy}
                                  onClick={() => {
                                    setRecoverId(row.id);
                                    setRecoverAmount(String(row.recovery_amount || ""));
                                    setRecoverMonth(currentYm());
                                    setRecoverDate(new Date().toISOString().slice(0, 10));
                                  }}
                                >
                                  Recover
                                </SecondaryButton>
                                {row.status === "active" ? (
                                  <SecondaryButton disabled={busy} onClick={() => setStatus(row.id, "hold")}>
                                    Hold
                                  </SecondaryButton>
                                ) : (
                                  <SecondaryButton disabled={busy} onClick={() => setStatus(row.id, "active")}>
                                    Resume
                                  </SecondaryButton>
                                )}
                                <DangerButton disabled={busy} onClick={() => setStatus(row.id, "closed")}>
                                  Close
                                </DangerButton>
                              </>
                            ) : (
                              <span className="text-[11px] text-gray-500">Closed — frozen</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {recoverId === row.id ? (
                        <tr className="bg-blue-50/60">
                          <td colSpan={7} className="px-3 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <Field label="Recovery (₹)">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={recoverAmount}
                                  disabled={busy}
                                  onChange={(e) => setRecoverAmount(e.target.value)}
                                  className={inputClass + " w-40"}
                                />
                              </Field>
                              <Field label="Pay month">
                                <MonthInput
                                  value={recoverMonth}
                                  disabled={busy}
                                  onChange={(e) => setRecoverMonth(e.target.value)}
                                />
                              </Field>
                              <Field label="Recovery day">
                                <input
                                  type="date"
                                  value={recoverDate}
                                  disabled={busy}
                                  onChange={(e) => setRecoverDate(e.target.value)}
                                  className={inputClass}
                                />
                              </Field>
                              <PrimaryButton disabled={busy} onClick={() => applyRecovery(row)}>
                                {busy ? "Saving…" : "Apply"}
                              </PrimaryButton>
                              <SecondaryButton disabled={busy} onClick={() => setRecoverId(null)}>
                                Cancel
                              </SecondaryButton>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {(row.recoveries || []).length ? (
                        <tr className="bg-gray-50/80">
                          <td colSpan={7} className="px-3 py-2 text-[11px] text-gray-600">
                            History:{" "}
                            {(row.recoveries || []).slice(0, 12).map((r) => (
                              <span key={r.id} className="inline-block mr-3">
                                {r.recovery_date || r.at?.slice?.(0, 10) || "—"} ({r.month}):{" "}
                                {formatINR(r.amount)}
                                {r.source === "salary_sheet" ? " · salary" : ""}
                              </span>
                            ))}
                            {(row.recoveries || []).length > 12 ? "…" : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
