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

function blankLoanForm() {
  return {
    principal: "",
    months: "",
    emi: "",
    emiManual: false,
    start_month: currentYm(),
    remarks: "",
  };
}

/**
 * Loan lifecycle on Employee Master:
 * create → update EMI/months while active → hold (pause salary feed) → close (never feeds again).
 */
export default function EmployeeLoanTab({ records, onChange }) {
  const loans = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankLoanForm);
  const [recoverId, setRecoverId] = useState(null);
  const [recoverAmount, setRecoverAmount] = useState("");
  const [recoverMonth, setRecoverMonth] = useState(currentYm());

  const activeCount = useMemo(
    () => loans.filter((l) => l.status === "active").length,
    [loans]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(blankLoanForm());
    setShowForm(true);
  };

  const openEdit = (loan) => {
    if (loan.status === "closed") {
      alert("Closed loans are frozen. They no longer update salary processing. Re-open is not allowed from this screen.");
      return;
    }
    setEditingId(loan.id);
    setForm({
      principal: String(loan.principal ?? ""),
      months: String(loan.months_remaining ?? loan.months ?? ""),
      emi: String(loan.installment_amount ?? ""),
      emiManual: true,
      start_month: loan.start_month || currentYm(),
      remarks: loan.remarks || "",
    });
    setShowForm(true);
  };

  const syncEmi = (principal, months, keepManual) => {
    if (keepManual) return;
    const emi = suggestEmi(parseMoney(principal), Number(months));
    setForm((prev) => ({ ...prev, emi: emi > 0 ? String(emi) : "" }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    const principal = parseMoney(form.principal);
    const months = Math.max(0, Math.floor(Number(form.months) || 0));
    const emi = parseMoney(form.emi);
    if (principal == null || principal <= 0) {
      alert("Enter a loan principal greater than zero.");
      return;
    }
    if (months <= 0) {
      alert("Enter the number of EMI months.");
      return;
    }
    if (emi == null || emi <= 0) {
      alert("Enter an EMI amount greater than zero.");
      return;
    }
    if (!form.start_month) {
      alert("Set a start month.");
      return;
    }

    const end_month = addMonthsYm(form.start_month, months - 1);
    const now = new Date().toISOString();

    if (editingId) {
      onChange(
        loans.map((l) => {
          if (l.id !== editingId) return l;
          return {
            ...l,
            // Principal stays as original unless still equal to balance on first edit window
            months,
            months_remaining: months,
            installment_amount: emi,
            start_month: form.start_month,
            end_month,
            remarks: form.remarks || "",
            // Recalculate balance only if user reduced tenure aggressively — keep balance, recompute months
            balance_outstanding: round2(l.balance_outstanding),
            updated_at: now,
          };
        })
      );
    } else {
      onChange([
        {
          id: newId("loan"),
          principal: round2(principal),
          balance_outstanding: round2(principal),
          months,
          months_remaining: months,
          installment_amount: emi,
          start_month: form.start_month,
          end_month,
          status: "active",
          remarks: form.remarks || "",
          recoveries: [],
          created_at: now,
          updated_at: now,
        },
        ...loans,
      ]);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(blankLoanForm());
  };

  const setStatus = (id, status) => {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    if (loan.status === "closed") {
      alert("This loan is already closed and will not update salary processing.");
      return;
    }
    if (status === "closed") {
      const ok = window.confirm(
        "Close this loan? After closing it will not feed EMI into salary processing anywhere. You can still view history."
      );
      if (!ok) return;
    }
    onChange(
      loans.map((l) =>
        l.id === id
          ? {
              ...l,
              status,
              closed_at: status === "closed" ? new Date().toISOString() : l.closed_at || null,
              updated_at: new Date().toISOString(),
            }
          : l
      )
    );
  };

  const applyRecovery = (loan) => {
    const amount = parseMoney(recoverAmount);
    if (amount == null || amount <= 0) {
      alert("Enter a recovery amount greater than zero.");
      return;
    }
    if (loan.status === "closed") {
      alert("Cannot recover against a closed loan.");
      return;
    }
    const nextBalance = round2(Math.max(0, Number(loan.balance_outstanding) - amount));
    const monthsLeft = Math.max(
      0,
      nextBalance <= 0
        ? 0
        : Math.ceil(nextBalance / Math.max(Number(loan.installment_amount) || 1, 1))
    );
    const recovery = {
      id: newId("rec"),
      amount: round2(amount),
      month: recoverMonth || currentYm(),
      at: new Date().toISOString(),
    };
    const updated = {
      ...loan,
      balance_outstanding: nextBalance,
      months_remaining: monthsLeft,
      recoveries: [recovery, ...(loan.recoveries || [])],
      updated_at: new Date().toISOString(),
      status: nextBalance <= 0 ? "closed" : loan.status,
      closed_at: nextBalance <= 0 ? new Date().toISOString() : loan.closed_at || null,
    };
    onChange(loans.map((l) => (l.id === loan.id ? updated : l)));
    if (nextBalance <= 0) {
      alert("Balance cleared. Loan closed automatically — it will no longer update salary processing.");
    }
    setRecoverId(null);
    setRecoverAmount("");
  };

  return (
    <div className="space-y-4">
      <ShellBanner>
        Active loans can feed monthly EMI into salary processing once rewired. Held loans pause
        recovery. Closed loans are frozen and never update processing again. Changes here are kept
        on this profile until the salary backend is reconnected.
      </ShellBanner>

      <SectionCard
        title="Loans"
        right={
          <PrimaryButton onClick={openCreate}>New loan</PrimaryButton>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {activeCount} active loan{activeCount === 1 ? "" : "s"} feeding salary when processing is
          live.
        </p>

        {showForm ? (
          <form onSubmit={handleSave} className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Update EMI / months" : "Enter new loan"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Principal (₹)" hint={editingId ? "Original principal is kept; edit EMI & months." : null}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.principal}
                  disabled={Boolean(editingId)}
                  onChange={(e) => {
                    const principal = e.target.value;
                    setForm((prev) => ({ ...prev, principal }));
                    syncEmi(principal, form.months, form.emiManual);
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Months (EMI tenure)">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.months}
                  onChange={(e) => {
                    const months = e.target.value;
                    setForm((prev) => ({ ...prev, months }));
                    syncEmi(form.principal, months, form.emiManual && Boolean(editingId));
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="EMI / month (₹)" hint="Auto from principal ÷ months; edit to override.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.emi}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, emi: e.target.value, emiManual: true }))
                  }
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Start month">
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
                placeholder="Optional"
              />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <PrimaryButton type="submit">{editingId ? "Save EMI / months" : "Save loan"}</PrimaryButton>
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

        {!loans.length && !showForm ? (
          <EmptyState
            title="No loans yet"
            body="Add a loan with principal, EMI months, and monthly EMI. While active it can recover through salary; close it to stop all updates."
            action={<PrimaryButton onClick={openCreate}>New loan</PrimaryButton>}
          />
        ) : null}

        {loans.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Principal</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                  <th className="px-2 py-2 text-right">EMI</th>
                  <th className="px-2 py-2 text-center">Months left</th>
                  <th className="px-2 py-2 text-left">Period</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Salary feed</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <React.Fragment key={loan.id}>
                    <tr className="border-t border-gray-100 align-top">
                      <td className="px-2 py-2">
                        <MoneyText value={loan.principal} strong />
                        {loan.remarks ? (
                          <p className="text-[10px] text-gray-500 mt-0.5 max-w-[12rem] truncate" title={loan.remarks}>
                            {loan.remarks}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={loan.balance_outstanding} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={loan.installment_amount} />
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {loan.months_remaining ?? loan.months ?? "—"}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-700">
                        {loan.start_month || "—"} → {loan.end_month || "—"}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={loan.status} />
                      </td>
                      <td className="px-2 py-2 text-gray-600">
                        {feedsSalaryProcessing(loan.status) ? "Yes (EMI)" : "No"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {loan.status !== "closed" ? (
                            <>
                              <SecondaryButton onClick={() => openEdit(loan)}>EMI / months</SecondaryButton>
                              <SecondaryButton
                                onClick={() => {
                                  setRecoverId(loan.id);
                                  setRecoverAmount(String(loan.installment_amount || ""));
                                  setRecoverMonth(currentYm());
                                }}
                              >
                                Recover
                              </SecondaryButton>
                              {loan.status === "active" ? (
                                <SecondaryButton onClick={() => setStatus(loan.id, "hold")}>
                                  Hold
                                </SecondaryButton>
                              ) : (
                                <SecondaryButton onClick={() => setStatus(loan.id, "active")}>
                                  Resume
                                </SecondaryButton>
                              )}
                              <DangerButton onClick={() => setStatus(loan.id, "closed")}>Close</DangerButton>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-500">Closed — frozen</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {recoverId === loan.id ? (
                      <tr className="bg-blue-50/60">
                        <td colSpan={8} className="px-3 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <Field label="Recovery amount (₹)">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={recoverAmount}
                                onChange={(e) => setRecoverAmount(e.target.value)}
                                className={inputClass + " w-40"}
                              />
                            </Field>
                            <Field label="For month">
                              <MonthInput
                                value={recoverMonth}
                                onChange={(e) => setRecoverMonth(e.target.value)}
                              />
                            </Field>
                            <PrimaryButton onClick={() => applyRecovery(loan)}>Apply recovery</PrimaryButton>
                            <SecondaryButton onClick={() => setRecoverId(null)}>Cancel</SecondaryButton>
                            <p className="text-[11px] text-gray-600 self-center">
                              Balance after:{" "}
                              {formatINR(
                                Math.max(
                                  0,
                                  round2(Number(loan.balance_outstanding) - (parseMoney(recoverAmount) || 0))
                                )
                              )}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {(loan.recoveries || []).length ? (
                      <tr className="bg-gray-50/80">
                        <td colSpan={8} className="px-3 py-2 text-[11px] text-gray-600">
                          Recoveries:{" "}
                          {(loan.recoveries || []).slice(0, 6).map((r) => (
                            <span key={r.id} className="inline-block mr-3">
                              {r.month}: {formatINR(r.amount)}
                            </span>
                          ))}
                          {(loan.recoveries || []).length > 6 ? "…" : null}
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
