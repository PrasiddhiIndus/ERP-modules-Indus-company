import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import { currentYm, formatINR, newId, parseMoney, round2 } from "./deductionsStore";
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
    kind: "unpaid", // unpaid = company owes employee; paid = already paid / to recover or adjust
    amount: "",
    month: currentYm(),
    remarks: "",
  };
}

/**
 * Unpaid / Paid salary register:
 * - Unpaid: arrears owed to employee → settle in a payroll month → closed (stops carrying forward)
 * - Paid: salary already paid / held excess → adjust or recover → close when cleared
 */
export default function EmployeeUnpaidPaidTab({ records, onChange }) {
  const rows = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [settleId, setSettleId] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMonth, setSettleMonth] = useState(currentYm());

  const openCount = useMemo(() => rows.filter((r) => r.status === "open").length, [rows]);

  const openCreate = (kind = "unpaid") => {
    setEditingId(null);
    setForm({ ...blankForm(), kind });
    setShowForm(true);
  };

  const openEdit = (row) => {
    if (row.status === "closed") {
      alert("Closed entries are frozen and will not update salary processing.");
      return;
    }
    setEditingId(row.id);
    setForm({
      kind: row.kind || "unpaid",
      amount: String(row.balance_outstanding ?? row.amount ?? ""),
      month: row.month || currentYm(),
      remarks: row.remarks || "",
    });
    setShowForm(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const amount = parseMoney(form.amount);
    if (amount == null || amount <= 0) {
      alert("Enter an amount greater than zero.");
      return;
    }
    if (!form.month) {
      alert("Select the related salary month.");
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      onChange(
        rows.map((r) =>
          r.id === editingId
            ? {
                ...r,
                kind: form.kind,
                amount: round2(Math.max(Number(r.amount) || amount, amount)),
                balance_outstanding: round2(amount),
                month: form.month,
                remarks: form.remarks || "",
                updated_at: now,
              }
            : r
        )
      );
    } else {
      onChange([
        {
          id: newId("ups"),
          kind: form.kind,
          amount: round2(amount),
          balance_outstanding: round2(amount),
          month: form.month,
          status: "open",
          remarks: form.remarks || "",
          settlements: [],
          created_at: now,
          updated_at: now,
        },
        ...rows,
      ]);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const closeEntry = (id) => {
    const ok = window.confirm(
      "Close this entry? It will stop carrying into salary processing (no further unpaid/paid adjustment)."
    );
    if (!ok) return;
    onChange(
      rows.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "closed",
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
  };

  const applySettlement = (row) => {
    const amount = parseMoney(settleAmount);
    if (amount == null || amount <= 0) {
      alert("Enter a settlement amount.");
      return;
    }
    if (row.status === "closed") return;
    const nextBalance = round2(Math.max(0, Number(row.balance_outstanding) - amount));
    const updated = {
      ...row,
      balance_outstanding: nextBalance,
      settlements: [
        {
          id: newId("uset"),
          amount: round2(amount),
          month: settleMonth || currentYm(),
          at: new Date().toISOString(),
        },
        ...(row.settlements || []),
      ],
      status: nextBalance <= 0 ? "closed" : "open",
      closed_at: nextBalance <= 0 ? new Date().toISOString() : row.closed_at || null,
      updated_at: new Date().toISOString(),
    };
    onChange(rows.map((r) => (r.id === row.id ? updated : r)));
    if (nextBalance <= 0) {
      alert("Fully settled and closed — will not update salary processing further.");
    }
    setSettleId(null);
    setSettleAmount("");
  };

  const kindLabel = (kind) =>
    kind === "paid" ? "Paid / excess" : "Unpaid (arrears)";

  return (
    <div className="space-y-4">
      <ShellBanner>
        <strong>Unpaid</strong> = salary still owed to the employee (pays out / clears in a later
        run). <strong>Paid</strong> = already paid or held amount to adjust. Edit while open; settle
        or close to stop any further effect on salary processing.
      </ShellBanner>

      <SectionCard
        title="Unpaid / Paid salary"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => openCreate("paid")}>Record paid / excess</SecondaryButton>
            <PrimaryButton onClick={() => openCreate("unpaid")}>Record unpaid</PrimaryButton>
          </div>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          {openCount} open entr{openCount === 1 ? "y" : "ies"} that can still affect a pay run.
        </p>

        {showForm ? (
          <form
            onSubmit={handleSave}
            className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Edit open entry" : "New unpaid / paid entry"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Type">
                <select
                  value={form.kind}
                  onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
                  className={inputClass}
                >
                  <option value="unpaid">Unpaid (company owes employee)</option>
                  <option value="paid">Paid / excess (adjust or recover)</option>
                </select>
              </Field>
              <Field label="Amount (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Related month">
                <MonthInput
                  value={form.month}
                  onChange={(e) => setForm((prev) => ({ ...prev, month: e.target.value }))}
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
                placeholder="e.g. March arrears / festival advance pay"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit">{editingId ? "Save changes" : "Save entry"}</PrimaryButton>
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
            title="No unpaid / paid entries"
            body="Track arrears owed to the employee or amounts already paid that need adjustment. Settle or close so processing stops carrying them."
            action={<PrimaryButton onClick={() => openCreate("unpaid")}>Record unpaid</PrimaryButton>}
          />
        ) : null}

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Month</th>
                  <th className="px-2 py-2 text-right">Original</th>
                  <th className="px-2 py-2 text-right">Balance</th>
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
                        <span className="font-medium text-gray-900">{kindLabel(row.kind)}</span>
                        {row.remarks ? (
                          <p className="text-[10px] text-gray-500 max-w-[14rem] truncate" title={row.remarks}>
                            {row.remarks}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.month || "—"}</td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={row.amount} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText value={row.balance_outstanding} strong />
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={row.status === "open" ? "open" : "closed"} />
                      </td>
                      <td className="px-2 py-2">
                        {row.status === "open" ? "Yes (adjustment)" : "No"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.status === "open" ? (
                            <>
                              <SecondaryButton onClick={() => openEdit(row)}>Edit</SecondaryButton>
                              <SecondaryButton
                                onClick={() => {
                                  setSettleId(row.id);
                                  setSettleAmount(String(row.balance_outstanding || ""));
                                  setSettleMonth(currentYm());
                                }}
                              >
                                Settle
                              </SecondaryButton>
                              <DangerButton onClick={() => closeEntry(row.id)}>Close</DangerButton>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-500">Closed — frozen</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {settleId === row.id ? (
                      <tr className="bg-blue-50/60">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <Field label="Settlement amount (₹)">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={settleAmount}
                                onChange={(e) => setSettleAmount(e.target.value)}
                                className={inputClass + " w-40"}
                              />
                            </Field>
                            <Field label="In salary month">
                              <MonthInput
                                value={settleMonth}
                                onChange={(e) => setSettleMonth(e.target.value)}
                              />
                            </Field>
                            <PrimaryButton onClick={() => applySettlement(row)}>
                              Apply settlement
                            </PrimaryButton>
                            <SecondaryButton onClick={() => setSettleId(null)}>Cancel</SecondaryButton>
                            <p className="text-[11px] text-gray-600 self-center">
                              Balance after:{" "}
                              {formatINR(
                                Math.max(
                                  0,
                                  round2(Number(row.balance_outstanding) - (parseMoney(settleAmount) || 0))
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
