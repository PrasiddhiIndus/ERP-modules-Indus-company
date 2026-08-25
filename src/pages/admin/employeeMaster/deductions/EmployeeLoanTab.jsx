import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import {
  addLoanRecovery,
  createLoan,
  setLoanStatus,
  updateLoan,
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
import { toast } from "../../../../lib/toast";

function blankLoanForm() {
  return {
    principal: "",
    months: "",
    emi: "",
    emiManual: false,
    start_month: currentYm(),
    entry_date: new Date().toISOString().slice(0, 10),
    remarks: "",
  };
}

/**
 * Loan lifecycle (DB-backed):
 * create → update EMI/months → hold → close / recover complete.
 */
export default function EmployeeLoanTab({ employeeId, records, onReload }) {
  const loans = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankLoanForm);
  const [recoverId, setRecoverId] = useState(null);
  const [recoverAmount, setRecoverAmount] = useState("");
  const [recoverMonth, setRecoverMonth] = useState(currentYm());
  const [recoverDate, setRecoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const activeCount = useMemo(
    () => loans.filter((l) => l.status === "active").length,
    [loans]
  );

  const refresh = async () => {
    if (typeof onReload === "function") await onReload();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(blankLoanForm());
    setShowForm(true);
  };

  const openEdit = (loan) => {
    if (loan.status === "closed") {
      toast.warning("Closed loans are frozen and cannot be edited.");
      return;
    }
    setEditingId(loan.id);
    setForm({
      principal: String(loan.principal ?? ""),
      months: String(loan.months_remaining ?? loan.months ?? ""),
      emi: String(loan.installment_amount ?? ""),
      emiManual: true,
      start_month: loan.start_month || currentYm(),
      entry_date: loan.entry_date || new Date().toISOString().slice(0, 10),
      remarks: loan.remarks || "",
    });
    setShowForm(true);
  };

  const syncEmi = (principal, months, keepManual) => {
    if (keepManual) return;
    const emi = suggestEmi(parseMoney(principal), Number(months));
    setForm((prev) => ({ ...prev, emi: emi > 0 ? String(emi) : "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!employeeId) return;
    const principal = parseMoney(form.principal);
    const months = Math.max(0, Math.floor(Number(form.months) || 0));
    const emi = parseMoney(form.emi) ?? 0;
    if (!editingId && (principal == null || principal <= 0)) {
      toast.warning("Enter a loan principal greater than zero.");
      return;
    }
    if (!editingId && months <= 0) {
      toast.warning("Enter EMI tenure in months (e.g. 3).");
      return;
    }
    if (months > 0 && emi <= 0) {
      toast.warning("Enter an EMI amount, or set months to 0 to stop salary deduction.");
      return;
    }
    if (!form.start_month) {
      toast.warning("Set a start month.");
      return;
    }

    setBusy(true);
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) {
        await updateLoan(editingId, {
          months_remaining: months,
          months: months > 0 ? months : undefined,
          installment_amount: months > 0 ? emi : 0,
          start_month: form.start_month,
          entry_date: form.entry_date,
          remarks: form.remarks || "",
        });
      } else {
        await createLoan(employeeId, {
          principal,
          months,
          installment_amount: emi,
          start_month: form.start_month,
          entry_date: form.entry_date,
          remarks: form.remarks || "",
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(blankLoanForm());
      await refresh();
      toast.success(wasEditing ? "Loan updated." : "Loan saved.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save loan.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id, status) => {
    const loan = loans.find((l) => l.id === id);
    if (!loan || loan.status === "closed") return;
    if (status === "closed") {
      const ok = window.confirm(
        "Close this loan? It will not feed EMI into salary processing again."
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setLoanStatus(id, status);
      await refresh();
      toast.success(status === "closed" ? "Loan closed." : status === "hold" ? "Loan on hold." : "Loan resumed.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to update loan status.");
    } finally {
      setBusy(false);
    }
  };

  const applyRecovery = async (loan) => {
    const amount = parseMoney(recoverAmount);
    if (amount == null || amount <= 0) {
      toast.warning("Enter a recovery amount greater than zero.");
      return;
    }
    setBusy(true);
    try {
      await addLoanRecovery(loan.id, {
        amount,
        month_key: recoverMonth || currentYm(),
        recovery_date: recoverDate || new Date().toISOString().slice(0, 10),
      });
      setRecoverId(null);
      setRecoverAmount("");
      await refresh();
      const nextBal = Math.max(0, round2(Number(loan.balance_outstanding) - amount));
      if (nextBal <= 0) {
        toast.success("Loan recovered and closed.");
      } else {
        toast.success("Loan recovery saved.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save recovery.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Loans" right={<PrimaryButton onClick={openCreate} disabled={busy}>New loan</PrimaryButton>}>
        <p className="text-xs text-gray-500 mb-3">
          {activeCount} active loan{activeCount === 1 ? "" : "s"} — EMI hits salary only inside
          tenure.
        </p>

        {showForm ? (
          <form onSubmit={handleSave} className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Update EMI / months" : "Enter new loan"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <Field label="Principal (₹)" hint={editingId ? "Original principal is kept." : null}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.principal}
                  disabled={Boolean(editingId) || busy}
                  onChange={(e) => {
                    const principal = e.target.value;
                    setForm((prev) => ({ ...prev, principal }));
                    syncEmi(principal, form.months, form.emiManual);
                  }}
                  className={inputClass}
                  required={!editingId}
                />
              </Field>
              <Field
                label="Months (EMI tenure)"
                hint={editingId ? "0 = stop salary deduction." : "e.g. 3 pay months from start."}
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
                    syncEmi(form.principal, months, form.emiManual && Boolean(editingId));
                  }}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="EMI / month (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.emi}
                  disabled={busy}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, emi: e.target.value, emiManual: true }))
                  }
                  className={inputClass}
                  required={Number(form.months) > 0}
                />
              </Field>
              <Field label="Start month" hint="First salary month that deducts EMI.">
                <MonthInput
                  value={form.start_month}
                  disabled={busy}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_month: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Entry date" hint="Day this loan / plan was saved.">
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
                placeholder="Optional"
              />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? "Saving…" : editingId ? "Save EMI / months" : "Save loan"}
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

        {!loans.length && !showForm ? (
          <EmptyState
            title="No loans yet"
            body="Add principal, tenure, monthly EMI, start month, and entry date. Saved to the salary database."
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
                  <th className="px-2 py-2 text-left">Period / entry</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">This month</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const payYm = currentYm();
                  const hits = deductionActiveForMonth(loan, payYm);
                  const hitAmt = deductionAmountForMonth(loan, payYm);
                  return (
                    <React.Fragment key={loan.id}>
                      <tr className="border-t border-gray-100 align-top">
                        <td className="px-2 py-2">
                          <MoneyText value={loan.principal} strong />
                          {loan.remarks ? (
                            <p
                              className="text-[10px] text-gray-500 mt-0.5 max-w-[12rem] truncate"
                              title={loan.remarks}
                            >
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
                        <td className="px-2 py-2 text-gray-700">
                          <div className="whitespace-nowrap">
                            {loan.start_month || "—"} → {loan.end_month || "—"}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            Entry {loan.entry_date || "—"}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge status={loan.status} />
                        </td>
                        <td className="px-2 py-2 text-gray-600">
                          {!feedsSalaryProcessing(loan.status)
                            ? "No"
                            : hits ? (
                                <span className="text-red-700 tabular-nums">−{formatINR(hitAmt)}</span>
                              ) : (
                                "—"
                              )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {loan.status !== "closed" ? (
                              <>
                                <SecondaryButton disabled={busy} onClick={() => openEdit(loan)}>
                                  EMI / months
                                </SecondaryButton>
                                <SecondaryButton
                                  disabled={busy}
                                  onClick={() => {
                                    setRecoverId(loan.id);
                                    setRecoverAmount(String(loan.installment_amount || ""));
                                    setRecoverMonth(currentYm());
                                    setRecoverDate(new Date().toISOString().slice(0, 10));
                                  }}
                                >
                                  Recover
                                </SecondaryButton>
                                {loan.status === "active" ? (
                                  <SecondaryButton disabled={busy} onClick={() => setStatus(loan.id, "hold")}>
                                    Hold
                                  </SecondaryButton>
                                ) : (
                                  <SecondaryButton disabled={busy} onClick={() => setStatus(loan.id, "active")}>
                                    Resume
                                  </SecondaryButton>
                                )}
                                <DangerButton disabled={busy} onClick={() => setStatus(loan.id, "closed")}>
                                  Close
                                </DangerButton>
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
                                  disabled={busy}
                                  onChange={(e) => setRecoverAmount(e.target.value)}
                                  className={inputClass + " w-40"}
                                />
                              </Field>
                              <Field label="For pay month">
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
                              <PrimaryButton disabled={busy} onClick={() => applyRecovery(loan)}>
                                {busy ? "Saving…" : "Apply recovery"}
                              </PrimaryButton>
                              <SecondaryButton disabled={busy} onClick={() => setRecoverId(null)}>
                                Cancel
                              </SecondaryButton>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {(loan.recoveries || []).length ? (
                        <tr className="bg-gray-50/80">
                          <td colSpan={8} className="px-3 py-2 text-[11px] text-gray-600">
                            History:{" "}
                            {(loan.recoveries || []).slice(0, 12).map((r) => (
                              <span key={r.id} className="inline-block mr-3">
                                {r.recovery_date || r.at?.slice?.(0, 10) || "—"} ({r.month}):{" "}
                                {formatINR(r.amount)}
                                {r.source === "salary_sheet" ? " · salary" : ""}
                              </span>
                            ))}
                            {(loan.recoveries || []).length > 12 ? "…" : null}
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
