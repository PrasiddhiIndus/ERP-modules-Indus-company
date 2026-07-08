import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  Modal,
} from "../components/AdminUi";
import FormDateInput from "../../../components/FormDateInput";
import { supabase } from "../../../lib/supabase";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  deleteNationalPublicHoliday,
  fetchNationalPublicHolidays,
  HOLIDAY_TYPE_OPTIONS,
  holidayTypeLabel,
  upsertNationalPublicHoliday,
  upsertNationalPublicHolidaysBatch,
} from "../../../lib/nationalPublicHolidays";
import {
  downloadHolidaySampleSheet,
  exportHolidaysToExcel,
  parseHolidayImportFile,
} from "../../../lib/nationalPublicHolidaysExcel";

const YEAR_DEFAULT = new Date().getFullYear();
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const emptyForm = () => ({
  holiday_date: "",
  calendar_year: YEAR_DEFAULT,
  holiday_type: "",
  remarks: "",
});

function HolidayFormModal({ open, row, saving, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        holiday_date: row.holiday_date || "",
        calendar_year: row.calendar_year || YEAR_DEFAULT,
        holiday_type: row.holiday_type || "",
        remarks: row.remarks || "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, row]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={row ? "Edit holiday" : "Add holiday"}
      onClose={onClose}
      widthClass="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={saving}
            className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        <label className="block text-gray-600">
          Date *
          <FormDateInput
            value={form.holiday_date}
            onChange={(e) => {
              const v = e?.target?.value ?? "";
              setForm((p) => ({
                ...p,
                holiday_date: v,
                calendar_year: v ? Number(String(v).slice(0, 4)) : p.calendar_year,
              }));
            }}
            className="mt-1 w-full"
            disabled={saving}
            required
          />
        </label>
        <label className="block text-gray-600">
          Year
          <TinyInput
            type="number"
            value={form.calendar_year}
            onChange={(e) => setForm((p) => ({ ...p, calendar_year: Number(e.target.value) }))}
            className="mt-1 w-full"
            disabled={saving}
          />
        </label>
        <label className="block text-gray-600">
          Holiday Type (NH/PH) *
          <TinySelect
            value={form.holiday_type}
            onChange={(e) => setForm((p) => ({ ...p, holiday_type: e.target.value }))}
            className="mt-1 w-full"
            disabled={saving}
            required
          >
            <option value="">Select holiday type</option>
            {HOLIDAY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </TinySelect>
        </label>
        <label className="block text-gray-600">
          Remarks
          <textarea
            value={form.remarks}
            onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            disabled={saving}
          />
        </label>
      </div>
    </Modal>
  );
}

function HolidayImportModal({ open, year, existingRows = [], onClose, onImported }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parseErrors, setParseErrors] = useState([]);
  const [payloads, setPayloads] = useState([]);
  const [skipped, setSkipped] = useState(0);

  const reset = useCallback(() => {
    setError("");
    setParseErrors([]);
    setPayloads([]);
    setSkipped(0);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleFile = async (file) => {
    if (!file) return;
    reset();
    try {
      const { rows, errors, skipped: skipCount } = await parseHolidayImportFile(file);
      setParseErrors(errors);
      setPayloads(rows);
      setSkipped(skipCount);
      if (!rows.length) setError(errors.join(" ") || "No valid rows to import.");
    } catch (e) {
      setError(e?.message || "Could not read file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!payloads.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const { count } = await upsertNationalPublicHolidaysBatch(supabase, payloads, existingRows);
      const warn = parseErrors.length ? ` Warnings: ${parseErrors.slice(0, 3).join(" ")}` : "";
      onImported?.(`Imported ${count} holiday row(s).${skipped ? ` Skipped ${skipped}.` : ""}${warn}`);
      reset();
      onClose();
    } catch (e) {
      setError(e?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Import holidays · ${year}`}
      onClose={handleClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} disabled={busy} className="h-8 px-3 rounded border border-gray-300 bg-white text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={busy || !payloads.length}
            className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-semibold disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-xs">
        <p className="text-gray-600">
          Upload Excel/CSV with columns: Sr. No., Date, Year, Holiday Type (NH/PH), Remarks.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadHolidaySampleSheet(year)}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5" />
            Download sample
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-900 text-xs font-semibold"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div> : null}
        {payloads.length > 0 ? (
          <p className="text-emerald-800">{payloads.length} holiday row(s) ready to import.</p>
        ) : null}
      </div>
    </Modal>
  );
}

export function NationalPublicHolidaysPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(YEAR_DEFAULT);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editRow, setEditRow] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchNationalPublicHolidays(supabase, { year });
      setRows(data || []);
    } catch (e) {
      setError(e?.message || "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, year, pageSize]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (typeFilter !== "all" && r.holiday_type !== typeFilter) return false;
      if (!needle) return true;
      const hay = [
        r.sr_no,
        r.holiday_date,
        r.calendar_year,
        r.holiday_type,
        r.remarks,
        formatDateDdMmYyyy(r.holiday_date),
        holidayTypeLabel(r.holiday_type),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  const handleSave = useCallback(
    async (form) => {
      if (!form.holiday_date?.trim()) {
        setError("Date is required.");
        return;
      }
      if (!form.holiday_type?.trim()) {
        setError("Please select a holiday type (NH or PH).");
        return;
      }
      setSaving(true);
      setError("");
      try {
        await upsertNationalPublicHoliday(supabase, form, {
          id: editRow?.id || null,
          existingRows: rows,
        });
        setFormOpen(false);
        setEditRow(null);
        setMessage(editRow ? "Holiday updated." : "Holiday added.");
        setTimeout(() => setMessage(""), 4000);
        await reload();
      } catch (e) {
        setError(e?.message || "Could not save holiday");
      } finally {
        setSaving(false);
      }
    },
    [editRow, reload, rows]
  );

  const handleDelete = useCallback(
    async (row) => {
      if (!row?.id) return;
      if (!window.confirm(`Delete holiday on ${formatDateDdMmYyyy(row.holiday_date)}?`)) return;
      setError("");
      try {
        await deleteNationalPublicHoliday(supabase, row.id);
        setMessage("Holiday deleted.");
        setTimeout(() => setMessage(""), 4000);
        await reload();
      } catch (e) {
        setError(e?.message || "Could not delete holiday");
      }
    },
    [reload]
  );

  const columns = useMemo(
    () => [
      {
        key: "sr_no",
        label: "Sr. No.",
        render: (r) => r.sr_no ?? "—",
        headerClassName: "min-w-[72px]",
      },
      {
        key: "holiday_date",
        label: "Date",
        render: (r) => formatDateDdMmYyyy(r.holiday_date),
        headerClassName: "min-w-[110px]",
      },
      {
        key: "calendar_year",
        label: "Year",
        render: (r) => r.calendar_year ?? "—",
        headerClassName: "min-w-[72px]",
      },
      {
        key: "holiday_type",
        label: "Holiday Type",
        render: (r) => r.holiday_type || "—",
        headerClassName: "min-w-[88px]",
      },
      {
        key: "remarks",
        label: "Remarks",
        render: (r) => r.remarks || "—",
        headerClassName: "min-w-[200px]",
      },
      {
        key: "actions",
        label: "Actions",
        render: (r) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditRow(r);
                setFormOpen(true);
              }}
              className="text-[11px] font-semibold text-blue-700 hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(r)}
              className="text-[11px] font-semibold text-rose-700 hover:underline"
            >
              Delete
            </button>
          </div>
        ),
        headerClassName: "min-w-[100px]",
      },
    ],
    [handleDelete]
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title={`National / Public Holidays · ${year}`}
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditRow(null);
                setFormOpen(true);
              }}
              className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-semibold"
            >
              Add holiday
            </button>
            <button
              type="button"
              onClick={() => downloadHolidaySampleSheet(year)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50"
            >
              Download sample
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-900 text-xs font-semibold"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => exportHolidaysToExcel(filteredRows, year)}
              className="h-8 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
            >
              Export
            </button>
          </div>
        }
      >
        <p className="text-[11px] text-gray-500 mb-3">
          Configured dates automatically appear as NH/PH on the Daily Attendance Register for all employees.
        </p>

        <FilterBar>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Search</label>
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Date, remarks, type…"
              className="min-w-[220px]"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Year</label>
            <TinyInput
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-[120px]"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Holiday type</label>
            <TinySelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[120px]">
              <option value="all">All</option>
              {HOLIDAY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </TinySelect>
          </div>
          <button
            type="button"
            onClick={() => setYear(YEAR_DEFAULT)}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold self-end"
          >
            Current year
          </button>
        </FilterBar>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}
        {message ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            {message}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
          <span>
            {loading ? "Loading…" : `Showing ${filteredRows.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredRows.length)} of ${filteredRows.length} holidays`}
          </span>
          <div className="flex items-center gap-2">
            <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[110px]">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </TinySelect>
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)} className="h-8 px-2 rounded border text-xs disabled:opacity-50">
              First
            </button>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2 rounded border text-xs disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2 rounded border text-xs disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="h-8 px-2 rounded border text-xs disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>

        <div className="mt-2">
          <DenseTable rows={pageRows} rowKey="id" columns={columns} />
        </div>
      </SectionCard>

      <HolidayFormModal
        open={formOpen}
        row={editRow}
        saving={saving}
        onClose={() => {
          if (saving) return;
          setFormOpen(false);
          setEditRow(null);
        }}
        onSave={handleSave}
      />

      <HolidayImportModal
        open={importOpen}
        year={year}
        existingRows={rows}
        onClose={() => setImportOpen(false)}
        onImported={(msg) => {
          setMessage(msg);
          setTimeout(() => setMessage(""), 6000);
          void reload();
        }}
      />
    </div>
  );
}
