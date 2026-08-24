import React, { useMemo, useState } from "react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import { newId, parseMoney, round2 } from "./deductionsStore";
import {
  DangerButton,
  EmptyState,
  Field,
  inputClass,
  MoneyText,
  PrimaryButton,
  SecondaryButton,
  ShellBanner,
  StatusBadge,
} from "./deductionsUi";
import { toast } from "../../../../lib/toast";

function currentFyLabel() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based; FY in India starts April (3)
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function blankForm() {
  return {
    financial_year: currentFyLabel(),
    part: "both", // a | b | both
    gross_salary: "",
    total_tds: "",
    certificate_no: "",
    issued_on: "",
    file_name: "",
    remarks: "",
  };
}

/**
 * Form 16 lifecycle per employee:
 * draft → issue (available for FY) → replace (supersedes prior for same FY) → cancel (frozen, not current).
 */
export default function EmployeeForm16Tab({ records, onChange, employeeName = "" }) {
  const rows = Array.isArray(records) ? records : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);

  const issuedCount = useMemo(
    () => rows.filter((r) => r.status === "issued").length,
    [rows]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  };

  const openEdit = (row) => {
    if (row.status === "cancelled") {
      toast.warning("Cancelled Form 16 records are frozen and cannot be edited.");
      return;
    }
    setEditingId(row.id);
    setForm({
      financial_year: row.financial_year || currentFyLabel(),
      part: row.part || "both",
      gross_salary: row.gross_salary != null ? String(row.gross_salary) : "",
      total_tds: row.total_tds != null ? String(row.total_tds) : "",
      certificate_no: row.certificate_no || "",
      issued_on: row.issued_on || "",
      file_name: row.file_name || "",
      remarks: row.remarks || "",
    });
    setShowForm(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const fy = String(form.financial_year || "").trim();
    if (!fy) {
      toast.warning("Enter the financial year (e.g. 2025-26).");
      return;
    }
    const gross = parseMoney(form.gross_salary);
    const tds = parseMoney(form.total_tds);
    const now = new Date().toISOString();
    const wasEditing = Boolean(editingId);

    if (editingId) {
      onChange(
        rows.map((r) =>
          r.id === editingId
            ? {
                ...r,
                financial_year: fy,
                part: form.part,
                gross_salary: gross != null ? round2(gross) : null,
                total_tds: tds != null ? round2(tds) : null,
                certificate_no: form.certificate_no || "",
                issued_on: form.issued_on || null,
                file_name: form.file_name || "",
                remarks: form.remarks || "",
                updated_at: now,
              }
            : r
        )
      );
    } else {
      onChange([
        {
          id: newId("f16"),
          financial_year: fy,
          part: form.part,
          gross_salary: gross != null ? round2(gross) : null,
          total_tds: tds != null ? round2(tds) : null,
          certificate_no: form.certificate_no || "",
          issued_on: form.issued_on || null,
          file_name: form.file_name || "",
          remarks: form.remarks || "",
          status: "draft",
          employee_label: employeeName || "",
          created_at: now,
          updated_at: now,
        },
        ...rows,
      ]);
    }
    setShowForm(false);
    setEditingId(null);
    toast.success(wasEditing ? "Form 16 updated." : "Form 16 draft saved.");
  };

  const issue = (id) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === "cancelled") return;
    const ok = window.confirm(
      `Issue Form 16 for FY ${row.financial_year}? Any other issued certificate for the same FY will be marked superseded.`
    );
    if (!ok) return;
    const now = new Date().toISOString();
    onChange(
      rows.map((r) => {
        if (r.id === id) {
          return {
            ...r,
            status: "issued",
            issued_on: r.issued_on || now.slice(0, 10),
            updated_at: now,
          };
        }
        if (
          r.financial_year === row.financial_year &&
          r.status === "issued" &&
          r.id !== id
        ) {
          return { ...r, status: "superseded", updated_at: now };
        }
        return r;
      })
    );
    toast.success("Form 16 issued.");
  };

  const cancel = (id) => {
    const ok = window.confirm(
      "Cancel this Form 16? It will be frozen and will no longer be treated as the current certificate for that year."
    );
    if (!ok) return;
    onChange(
      rows.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
    toast.success("Form 16 cancelled.");
  };

  const statusLabel = (status) => {
    if (status === "issued") return "active";
    if (status === "superseded") return "hold";
    if (status === "cancelled") return "closed";
    if (status === "draft") return "open";
    return status || "open";
  };

  return (
    <div className="space-y-4">
      <ShellBanner>
        Maintain Form 16 by financial year: save a draft, issue when ready, replace to supersede an
        older issue for the same FY, or cancel so it is no longer current. File storage can be wired
        later — for now keep certificate number / file name on the record.
      </ShellBanner>

      <SectionCard
        title="Form 16"
        right={<PrimaryButton onClick={openCreate}>Add Form 16</PrimaryButton>}
      >
        <p className="text-xs text-gray-500 mb-3">
          {issuedCount} issued certificate{issuedCount === 1 ? "" : "s"} on this profile.
        </p>

        {showForm ? (
          <form
            onSubmit={handleSave}
            className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-gray-900">
              {editingId ? "Edit Form 16" : "New Form 16"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Financial year" hint="e.g. 2025-26">
                <input
                  type="text"
                  value={form.financial_year}
                  onChange={(e) => setForm((prev) => ({ ...prev, financial_year: e.target.value }))}
                  className={inputClass}
                  placeholder="2025-26"
                  required
                />
              </Field>
              <Field label="Part">
                <select
                  value={form.part}
                  onChange={(e) => setForm((prev) => ({ ...prev, part: e.target.value }))}
                  className={inputClass}
                >
                  <option value="both">Part A + B</option>
                  <option value="a">Part A only</option>
                  <option value="b">Part B only</option>
                </select>
              </Field>
              <Field label="Gross salary (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.gross_salary}
                  onChange={(e) => setForm((prev) => ({ ...prev, gross_salary: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Total TDS (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.total_tds}
                  onChange={(e) => setForm((prev) => ({ ...prev, total_tds: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Certificate no.">
                <input
                  type="text"
                  value={form.certificate_no}
                  onChange={(e) => setForm((prev) => ({ ...prev, certificate_no: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Issued on">
                <input
                  type="date"
                  value={form.issued_on}
                  onChange={(e) => setForm((prev) => ({ ...prev, issued_on: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="File name / reference" hint="PDF name or TRACES reference until upload is wired.">
                <input
                  type="text"
                  value={form.file_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, file_name: e.target.value }))}
                  className={inputClass}
                  placeholder="Form16_2025-26.pdf"
                />
              </Field>
              <Field label="Remarks">
                <input
                  type="text"
                  value={form.remarks}
                  onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit">{editingId ? "Save changes" : "Save draft"}</PrimaryButton>
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
            title="No Form 16 yet"
            body="Add a Form 16 for a financial year, then issue it when ready. Cancelling freezes that certificate so it is no longer current."
            action={<PrimaryButton onClick={openCreate}>Add Form 16</PrimaryButton>}
          />
        ) : null}

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">FY</th>
                  <th className="px-2 py-2 text-left">Part</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2 text-right">TDS</th>
                  <th className="px-2 py-2 text-left">Certificate</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-2 font-medium text-gray-900">{row.financial_year}</td>
                    <td className="px-2 py-2 uppercase text-gray-700">
                      {row.part === "a" ? "A" : row.part === "b" ? "B" : "A+B"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText value={row.gross_salary} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText value={row.total_tds} />
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-gray-800">{row.certificate_no || "—"}</p>
                      {row.file_name ? (
                        <p className="text-[10px] text-gray-500 truncate max-w-[12rem]" title={row.file_name}>
                          {row.file_name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={statusLabel(row.status)} />
                      <p className="text-[10px] text-gray-500 mt-0.5 capitalize">{row.status}</p>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {row.status !== "cancelled" ? (
                          <>
                            <SecondaryButton onClick={() => openEdit(row)}>Edit</SecondaryButton>
                            {row.status !== "issued" ? (
                              <PrimaryButton onClick={() => issue(row.id)}>Issue</PrimaryButton>
                            ) : null}
                            <DangerButton onClick={() => cancel(row.id)}>Cancel</DangerButton>
                          </>
                        ) : (
                          <span className="text-[11px] text-gray-500">Cancelled — frozen</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
