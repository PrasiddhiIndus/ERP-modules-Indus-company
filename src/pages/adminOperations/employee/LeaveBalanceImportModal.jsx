import React, { useCallback, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Modal } from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import {
  downloadLeaveBalanceSampleSheet,
  LEAVE_BALANCE_SAMPLE_HEADERS,
  parseLeaveLedgerImportFile,
} from "../../../lib/leaveLedgerExcel";
import { upsertLeaveBalancesBatch } from "../../../lib/leaveManagement";

const PREVIEW_ROWS = 15;

export function LeaveBalanceImportModal({ open, year, employees = [], onClose, onImported }) {
  const fileRef = useRef(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [payloads, setPayloads] = useState([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetState = useCallback(() => {
    setParseErrors([]);
    setPayloads([]);
    setSkipped(0);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    resetState();
    onClose?.();
  }, [busy, onClose, resetState]);

  const employeeRows = useCallback(
    () =>
      employees
        .filter((e) => e.employeeName)
        .map((e) => ({
          empCode: normalizeAttendanceEmpCode(e.empCode),
          employeeName: e.employeeName || "",
          department: e.department || "",
        })),
    [employees]
  );

  const downloadTemplate = useCallback(() => {
    downloadLeaveBalanceSampleSheet(year, employeeRows());
  }, [employeeRows, year]);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setError("");
      setParseErrors([]);
      setPayloads([]);
      setSkipped(0);
      try {
        const { rows, errors, skipped: skipCount } = await parseLeaveLedgerImportFile(file, year, {
          employees: employeeRows(),
        });
        setParseErrors(errors);
        setPayloads(rows);
        setSkipped(skipCount);
        if (!rows.length) {
          setError(errors.join(" ") || "No valid leave balance rows found in file.");
        }
      } catch (e) {
        setError(e?.message || "Could not read import file.");
        setPayloads([]);
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [employeeRows, year]
  );

  const handleImport = useCallback(async () => {
    if (!payloads.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const { count } = await upsertLeaveBalancesBatch(supabase, payloads);
      const warn = parseErrors.length ? ` Warnings: ${parseErrors.slice(0, 3).join(" ")}` : "";
      const message = `Imported ${count} leave balance row(s) for ${year}.${skipped ? ` Skipped ${skipped}.` : ""}${warn}`;
      onImported?.(message);
      resetState();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, onClose, onImported, parseErrors, payloads, resetState, skipped, year]);

  const previewRows = payloads.slice(0, PREVIEW_ROWS);

  return (
    <Modal
      open={open}
      title={`Import leave balances · ${year}`}
      onClose={handleClose}
      widthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {payloads.length
              ? `${payloads.length} employee row(s) ready to import`
              : "Upload a filled sample sheet to continue"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy || !payloads.length}
              className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs font-semibold disabled:opacity-60"
            >
              {busy ? "Importing…" : "Import balances"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <p className="text-gray-600">
          Import employee leave balances using the sample sheet columns:{" "}
          {LEAVE_BALANCE_SAMPLE_HEADERS.slice(3).join(", ")}.
        </p>

        <ol className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 list-decimal list-inside text-gray-700">
          <li>Download the sample sheet for {year}.</li>
          <li>Fill leave balances for each employee (Employee Code is required).</li>
          <li>Upload the completed file and review the preview.</li>
          <li>Click Import balances to save to the yearly ledger.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={busy}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Download sample sheet
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-900 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-60"
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

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>
        ) : null}

        {parseErrors.length > 0 && payloads.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 space-y-1">
            {parseErrors.slice(0, 5).map((msg) => (
              <p key={msg}>{msg}</p>
            ))}
            {parseErrors.length > 5 ? <p>…and {parseErrors.length - 5} more warning(s).</p> : null}
          </div>
        ) : null}

        {previewRows.length > 0 ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
              Preview ({Math.min(previewRows.length, payloads.length)} of {payloads.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-white text-left text-gray-500">
                    <th className="px-2 py-1.5">Code</th>
                    <th className="px-2 py-1.5">PL Open</th>
                    <th className="px-2 py-1.5">SL Open</th>
                    <th className="px-2 py-1.5">CL Open</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={`${row.employee_code}-${row.year}`} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 font-medium text-gray-900">{row.employee_code}</td>
                      <td className="px-2 py-1.5 tabular-nums">{row.opening_pl ?? 0}</td>
                      <td className="px-2 py-1.5 tabular-nums">{row.opening_sl ?? 0}</td>
                      <td className="px-2 py-1.5 tabular-nums">{row.opening_cl ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
