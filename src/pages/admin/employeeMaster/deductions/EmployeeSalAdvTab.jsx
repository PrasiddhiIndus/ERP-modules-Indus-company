import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import {
  addMonthsYm,
  currentYm,
  feedsSalaryProcessing,
  formatINR,
  newId,
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
  ShellBanner,
  StatusBadge,
} from "./deductionsUi";

function blankForm() {
  return {
    amount: "",
    months: "1",
    recovery: "",
    recoveryManual: false,
    start_month: currentYm(),
    remarks: "",
  };
}

/**
 * Salary advance lifecycle:
 * disburse → set recovery EMI / months → recover via salary → close (stops all further recovery).
 */
export default function EmployeeSalAdvTab({ records, onChange }) {
  const rows = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [recoverId, setRecoverId] = useState(null);
  const [recoverAmount, setRecoverAmount] = useState("");
  const [recoverMonth, setRecoverMonth] = useState(currentYm());

  const openActive = useMemo(
    () => rows.filter((r) => r.status === "active").length,
    [rows]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
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
      remarks: row.remarks || "",
    });
    setShowForm(true);
  };

  const syncRecovery = (amount, months, keepManual) => {
    if (keepManual) return;
    const emi = suggestEmi(parseMoney(amount), Number(months));
    setForm((prev) => ({ ...prev, recovery: emi > 0 ? String(emi) : "" }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    const amount = parseMoney(form.amount);
    const months = Math.max(1, Math.floor(Number(form.months) || 0));
    const recovery = parseMoney(form.recovery);
    if (amount == null || amount <= 0) {
      alert("Enter the advance amount.");
      return;
    }
    if (recovery == null || recovery <= 0) {
      alert("Enter the monthly recovery amount.");
      return;
    }
    if (!form.start_month) {
      alert("Set a start month for recovery.");
      return;
    }
    const end_month = addMonthsYm(form.start_month, months - 1);
    const now = new Date().toISOString();

    if (editingId) {
      onChange(
        rows.map((r) =>
          r.id === editingId
            ? {
                ...r,
                months,
                months_remaining: months,
                recovery_amount: recovery,
                start_month: form.start_month,
                end_month,
                remarks: form.remarks || "",
                updated_at: now,
              }
            : r
        )
      );
    } else {
      onChange([
        {
          id: newId("sadv"),
          amount: round2(amount),
          balance_outstanding: round2(amount),
          months,
          months_remaining: months,
          recovery_amount: recovery,
          start_month: form.start_month,
          end_month,
          status: "active",
          remarks: form.remarks || "",
          recoveries: [],
          created_at: now,
          updated_at: now,
        },
        ...rows,
      ]);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const setStatus = (id, status) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === "closed") return;
    if (status === "closed") {
      const ok = window.confirm(
        "Close this salary advance? It will stop recovering from salary processing."
      );
      if (!ok) return;
    }
    onChange(
      rows.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              closed_at: status === "closed" ? new Date().toISOString() : r.closed_at || null,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const applyRecovery = (row) => {
    const amount = parseMoney(recoverAmount);
    if (amount == null || amount <= 0) {
      alert("Enter a recovery amount.");
      return;
    }
    if (row.status === "closed") return;
    const nextBalance = round2(Math.max(0, Number(row.balance_outstanding) - amount));
    const monthsLeft =
      nextBalance <= 0
        ? 0
        : Math.ceil(nextBalance / Math.max(Number(row.recovery_amount) || 1, 1));
    const updated = {
      ...row,
      balance_outstanding: nextBalance,
      months_remaining: monthsLeft,
      recoveries: [
        {
          id: newId("srec"),
          amount: round2(amount),
          month: recoverMonth || currentYm(),
          at: new Date().toISOString(),
        },
        ...(row.recoveries || []),
      ],
      status: nextBalance <= 0 ? "closed" : row.status,
      closed_at: nextBalance <= 0 ? new Date().toISOString() : row.closed_at || null,
      updated_at: new Date().toISOString(),
    };
    onChange(rows.map((r) => (r.id === row.id ? updated : r)));
    if (nextBalance <= 0) {
      alert("Advance fully recovered and closed — no further salary recovery.");
    }
    setRecoverId(null);
    setRecoverAmount("");
  };

  return (
    <div className="space-y-4">
      <ShellBanner>
        Salary advances disburse cash now and recover through future salary. Update recovery EMI or
        months while open. Closing (or clearing the balance) stops all further recovery in processing.
      </ShellBanner>

      <SectionCard
        title="Salary advances"
        right={<PrimaryButton onClick={openCreate}>New advance</PrimaryButton>}
      >
        <p className="text-xs text-gray-500 mb-3">
          {openActive} open advance{openActive === 1 ? "" : "s"} recovering via salary when processing
          is live.
        </p>

        {showForm ? (
          <form
            onSubmit={handleSave}
            className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Update recovery plan" : "Enter salary advance"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Advance amount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  disabled={Boolean(editingId)}
                  onChange={(e) => {
                    const amount = e.target.value;
                    setForm((prev) => ({ ...prev, amount }));
                    syncRecovery(amount, form.months, form.recoveryManual);
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Recovery months" hint="1 = full recovery in one salary month.">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.months}
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
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      recovery: e.target.value,
                      recoveryManual: true,
                    }))
                  }
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Recovery start month">
                <MonthInput
                  value={form.start_month}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_month: e.target.value }))}
                  required
                />
              </Field>
            </div>
            <Field label="Remarks">
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit">{editingId ? "Save plan" : "Save advance"}</PrimaryButton>
              <SecondaryButton
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
            body="Record an advance amount and how many salary months (and EMI) to recover it. Close when recovered so processing stops."
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
                  <th className="px-2 py-2 text-left">Salary feed</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="border-t border-gray-100">
                      <td className="px-2 py-2">
                        <MoneyText value={row.amount} strong />
                        <p className="text-[10px] text-gray-500">
                          {row.start_month || "—"} → {row.end_month || "—"}
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
                        {feedsSalaryProcessing(row.status) ? "Yes (recovery)" : "No"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.status !== "closed" ? (
                            <>
                              <SecondaryButton onClick={() => openEdit(row)}>
                                EMI / months
                              </SecondaryButton>
                              <SecondaryButton
                                onClick={() => {
                                  setRecoverId(row.id);
                                  setRecoverAmount(String(row.recovery_amount || ""));
                                  setRecoverMonth(currentYm());
                                }}
                              >
                                Recover
                              </SecondaryButton>
                              {row.status === "active" ? (
                                <SecondaryButton onClick={() => setStatus(row.id, "hold")}>
                                  Hold
                                </SecondaryButton>
                              ) : (
                                <SecondaryButton onClick={() => setStatus(row.id, "active")}>
                                  Resume
                                </SecondaryButton>
                              )}
                              <DangerButton onClick={() => setStatus(row.id, "closed")}>
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
                                onChange={(e) => setRecoverAmount(e.target.value)}
                                className={inputClass + " w-40"}
                              />
                            </Field>
                            <Field label="Month">
                              <MonthInput
                                value={recoverMonth}
                                onChange={(e) => setRecoverMonth(e.target.value)}
                              />
                            </Field>
                            <PrimaryButton onClick={() => applyRecovery(row)}>Apply</PrimaryButton>
                            <SecondaryButton onClick={() => setRecoverId(null)}>Cancel</SecondaryButton>
                            <p className="text-[11px] text-gray-600 self-center">
                              Balance after:{" "}
                              {formatINR(
                                Math.max(
                                  0,
                                  round2(Number(row.balance_outstanding) - (parseMoney(recoverAmount) || 0))
                                )
                              )}
                            </p>
                          </div>
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
