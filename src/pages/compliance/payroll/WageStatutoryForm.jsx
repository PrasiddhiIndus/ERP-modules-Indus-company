import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageTaskHeader, SectionCard } from "../../adminOperations/components/AdminUi";
import { toast } from "../../../lib/toast";
import {
  WAGE_FORMS,
  blankWageRow,
  emptyWageHeader,
  getWageSheet,
  saveWageSheet,
} from "./wageFormCatalog";

const KEEP_UPPER = new Set(["UAN", "PAN", "DA", "ESIC", "EPF", "EPS", "EDLI", "ESI", "IFSC", "LIN", "ID", "NCP", "IP", "PF"]);

function sheetHeading(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b[A-Za-z]+\b/g, (word) => (KEEP_UPPER.has(word.toUpperCase()) ? word.toUpperCase() : word));
}

function columnWidth(column) {
  if (column?.width) return column.width;
  const label = String(column?.label || "");
  return Math.min(280, Math.max(168, Math.ceil(label.length * 6.4)));
}

export function WageFormStep({ form, header, rows, onHeader, onRows, readOnly = false }) {
  const safeRows = rows?.length ? rows : [];

  const addRow = () => onRows([...safeRows, blankWageRow(form)]);
  const removeRow = (index) => onRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
  const updateCell = (index, key, value) => {
    onRows(safeRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-center sm:px-5">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{form.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{form.rule}</p>
        <p className="mt-1.5 text-sm font-medium text-slate-800">{form.name}</p>
      </section>

      {form.header?.length ? <SectionCard title="Establishment">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {form.header.map((field) => (
            <label key={field.key} className={field.wide ? "sm:col-span-2" : ""}>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{field.label}</span>
              {readOnly ? (
                <p className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900">
                  {header[field.key] || "—"}
                </p>
              ) : (
                <input
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/25"
                  value={header[field.key] || ""}
                  onChange={(event) => onHeader({ ...header, [field.key]: event.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      </SectionCard> : null}

      <SectionCard
        title="Sheet"
        right={
          readOnly ? null : (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={addRow}
              aria-label="Add row"
              title="Add row"
            >
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Add row</span>
            </button>
          )
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-slate-500">Scroll sideways to reach every column. Headings stay fully visible.</p>
        <div className="max-h-[min(420px,50vh)] overflow-auto rounded-lg border border-slate-200">
          <table className="w-max border-separate border-spacing-0 text-sm">
            <thead>
              {form.columns.some((column) => column.group) ? (
                <tr>
                  <th className="border border-slate-200 bg-[#eef2f6]" />
                  {(() => {
                    const cells = [];
                    form.columns.forEach((column, index) => {
                      const name = column.group || "";
                      const previous = cells[cells.length - 1];
                      if (previous && previous.name === name) previous.span += 1;
                      else cells.push({ name, span: 1, index });
                    });
                    return cells.map((cell) => (
                      <th
                        key={`${cell.index}-${cell.name || "plain"}`}
                        colSpan={cell.span}
                        className="border border-slate-200 bg-[#eef2f6] px-2 py-1 text-center text-[11px] font-medium text-slate-500"
                      >
                        {cell.name}
                      </th>
                    ));
                  })()}
                  {readOnly ? null : <th className="border border-slate-200 bg-[#eef2f6]" />}
                </tr>
              ) : null}
              <tr>
                <th className="sticky left-0 top-0 z-30 w-14 min-w-[56px] border border-slate-200 bg-[#eef2f6] px-2 py-1.5 text-left text-[12px] font-medium text-slate-500">
                  S.No.
                </th>
                {form.columns.map((column, index) => {
                  const width = columnWidth(column);
                  return (
                    <th
                      key={column.key}
                      style={{ width, minWidth: width }}
                      className="sticky top-0 z-20 overflow-hidden border border-slate-200 bg-[#eef2f6] px-2 py-1.5 text-left align-top"
                    >
                      <div className="whitespace-normal break-words text-left text-[12px] font-medium leading-4 text-slate-500">
                        {form.official ? column.label : sheetHeading(column.label).replace(/^\d+\.\s*/, "")}
                      </div>
                    </th>
                  );
                })}
                {readOnly ? null : (
                  <th className="sticky top-0 z-20 w-12 min-w-[48px] border border-slate-200 bg-[#eef2f6]" />
                )}
              </tr>
            </thead>
            <tbody>
              {safeRows.length ? (
                safeRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-white even:bg-slate-50/80">
                    <td className={`sticky left-0 z-10 w-14 border border-slate-200 px-2 text-center text-[13px] text-slate-500 ${rowIndex % 2 ? "bg-slate-50" : "bg-white"}`}>
                      {rowIndex + 1}
                    </td>
                    {form.columns.map((column) => {
                      const width = columnWidth(column);
                      return (
                      <td
                        key={column.key}
                        style={{ width, minWidth: width }}
                        className="overflow-hidden border border-slate-200 p-0"
                      >
                        {readOnly ? (
                          <div className="flex h-7 items-center px-2 text-left text-[13px] font-normal leading-none text-slate-700">
                            <span className="truncate" title={row[column.key] || ""}>{row[column.key] || "—"}</span>
                          </div>
                        ) : (
                          <input
                            className="h-7 w-full bg-transparent px-2 text-left text-[13px] font-normal leading-7 text-slate-700 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-accent/30"
                            value={row[column.key] || ""}
                            onChange={(event) => updateCell(rowIndex, column.key, event.target.value)}
                          />
                        )}
                      </td>
                      );
                    })}
                    {readOnly ? null : (
                      <td className="border border-slate-200 bg-white px-1 text-center">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => removeRow(rowIndex)}
                          aria-label="Remove row"
                          title="Remove row"
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={form.columns.length + 2} className="px-3 py-8 text-center text-sm text-slate-500">
                    No rows. Use + to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{form.note}</p>
      </SectionCard>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 13h6l1-13" />
    </svg>
  );
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sheet-${Date.now()}`;
}

export default function WageStatutoryForm() {
  const { formKey } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const form = WAGE_FORMS[formKey];
  const existing = useMemo(() => getWageSheet(searchParams.get("id") || ""), [searchParams]);

  const [sheetId] = useState(() => existing?.id || newId());
  const [header, setHeader] = useState(() => existing?.header || (form ? emptyWageHeader(form) : {}));
  const [rows, setRows] = useState(() => {
    if (!form) return [];
    if (existing?.rows?.length) return existing.rows;
    return [blankWageRow(form)];
  });

  if (!form) {
    return (
      <SectionCard title="Form not found">
        <Link to="/app/compliance/forms" className="text-xs font-medium text-accent">
          Back to Compliance Forms
        </Link>
      </SectionCard>
    );
  }

  const save = () => {
    const establishment = header.establishment || header.period || "—";
    if (!String(header.establishment || "").trim() && form.id !== "form-v") {
      toast.warning("Enter the name of the establishment");
      return;
    }
    saveWageSheet({
      id: sheetId,
      formKey: form.id,
      header,
      rows,
      label: establishment,
    });
    toast.success("Form saved");
    navigate("/app/compliance/forms");
  };

  return (
    <div className="space-y-4">
      <PageTaskHeader title={form.name} subtitle={`${form.title} ${form.rule}`}>
        <Link to="/app/compliance/forms" className="erp-btn-secondary inline-flex h-9 items-center rounded-control px-3 text-xs">
          Back
        </Link>
        <button type="button" className="erp-btn-primary h-9 rounded-control px-3.5 text-xs" onClick={save}>
          Save form
        </button>
      </PageTaskHeader>
      <WageFormStep form={form} header={header} rows={rows} onHeader={setHeader} onRows={setRows} />
    </div>
  );
}
