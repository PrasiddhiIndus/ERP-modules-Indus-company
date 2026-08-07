import React, { useCallback, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Modal } from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  buildMasterPatchFromBankRow,
  downloadSalaryBankSampleSheet,
  parseSalaryBankImportFile,
} from "../../../lib/salaryBankExcel";

const PREVIEW_ROWS = 12;

async function applyBankRowsToMaster(rows) {
  let updated = 0;
  const failures = [];
  for (const row of rows) {
    if (!row.employeeMasterId) continue;
    const patch = buildMasterPatchFromBankRow(row);
    const keys = Object.keys(patch).filter((k) => k !== "updated_at");
    if (!keys.length) continue;
    const { error } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .update(patch)
      .eq("id", row.employeeMasterId);
    if (error) {
      console.error("Salary bank import: master update failed", row.empCode, error);
      failures.push(row.empCode);
    } else {
      updated += 1;
    }
  }
  return { updated, failures };
}

/**
 * Upload Indus salary bank Excel sheets → match Emp. Code → save onto employee master
 * (and return matched rows so Salary Processing can fill the current month).
 */
export function SalaryBankImportModal({ open, employees = [], onClose, onImported }) {
  const fileRef = useRef(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const resetState = useCallback(() => {
    setParseErrors([]);
    setMatched([]);
    setUnmatched([]);
    setSkipped(0);
    setError("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    resetState();
    onClose?.();
  }, [busy, onClose, resetState]);

  const downloadTemplate = useCallback(() => {
    downloadSalaryBankSampleSheet(employees);
  }, [employees]);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setError("");
      setParseErrors([]);
      setMatched([]);
      setUnmatched([]);
      setSkipped(0);
      setFileName(file.name || "");
      try {
        const result = await parseSalaryBankImportFile(file, { employees });
        setParseErrors(result.errors || []);
        setMatched(result.rows || []);
        setUnmatched(result.unmatched || []);
        setSkipped(result.skipped || 0);
        if (!(result.rows || []).length && !(result.unmatched || []).length) {
          setError((result.errors || []).join(" ") || "No employee rows found in this file.");
        }
      } catch (e) {
        console.error("Salary bank import: parse failed", e);
        setError(e?.message || "Could not read this file.");
        setMatched([]);
        setUnmatched([]);
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [employees]
  );

  const handleImport = useCallback(async () => {
    if (!matched.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const { updated, failures } = await applyBankRowsToMaster(matched);
      const warnParts = [];
      if (parseErrors.length) warnParts.push(parseErrors.slice(0, 2).join(" "));
      if (failures.length) {
        warnParts.push(`Could not save ${failures.length} employee profile(s).`);
      }
      if (unmatched.length) {
        warnParts.push(`${unmatched.length} code(s) not in Employee Master — add them first.`);
      }
      const message = `Saved bank details for ${updated} employee(s)${
        skipped ? ` · skipped ${skipped}` : ""
      }${fileName ? ` from ${fileName}` : ""}.${warnParts.length ? ` ${warnParts.join(" ")}` : ""}`;

      onImported?.({
        message,
        rows: matched,
        unmatched,
        updated,
      });
      resetState();
      onClose?.();
    } catch (e) {
      console.error("Salary bank import: save failed", e);
      setError(e?.message || "Could not save bank details. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    fileName,
    matched,
    onClose,
    onImported,
    parseErrors,
    resetState,
    skipped,
    unmatched,
  ]);

  const previewMatched = matched.slice(0, PREVIEW_ROWS);
  const previewUnmatched = unmatched.slice(0, 8);

  return (
    <Modal
      open={open}
      title="Upload employee bank details"
      onClose={handleClose}
      widthClass="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {matched.length
              ? `${matched.length} matched · ${unmatched.length} not in master`
              : "Upload a salary bank Excel sheet to continue"}
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
              disabled={busy || !matched.length}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
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
          {fileName ? (
            <span className="inline-flex items-center h-8 px-2 text-[11px] text-slate-600">{fileName}</span>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>
        ) : null}

        {parseErrors.length > 0 && (matched.length > 0 || unmatched.length > 0) ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 space-y-1">
            {parseErrors.slice(0, 5).map((msg) => (
              <p key={msg}>{msg}</p>
            ))}
            {parseErrors.length > 5 ? <p>…and {parseErrors.length - 5} more warning(s).</p> : null}
          </div>
        ) : null}

        {previewMatched.length > 0 ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
              Matched preview ({Math.min(previewMatched.length, matched.length)} of {matched.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-white text-left text-gray-500">
                    <th className="px-2 py-1.5 font-semibold">Code</th>
                    <th className="px-2 py-1.5 font-semibold">Name</th>
                    <th className="px-2 py-1.5 font-semibold">Account</th>
                    <th className="px-2 py-1.5 font-semibold">IFSC</th>
                    <th className="px-2 py-1.5 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewMatched.map((r) => (
                    <tr key={`${r.empCode}-${r.sheetRow}`} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 tabular-nums">{r.empCode}</td>
                      <td className="px-2 py-1.5">{r.employeeName || r.masterName || "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.accountNo || "—"}</td>
                      <td className="px-2 py-1.5">{r.ifsc || "—"}</td>
                      <td className="px-2 py-1.5 text-amber-800">
                        {r.matchStatus === "left"
                          ? r.confirmationNote || "Left"
                          : r.matchStatus === "new_flag"
                            ? r.confirmationNote || "New"
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {previewUnmatched.length > 0 ? (
          <div className="rounded-lg border border-amber-200 overflow-hidden">
            <div className="bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              Not in Employee Master ({unmatched.length}) — create the profile, then upload again
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-amber-100 bg-white text-left text-amber-800/80">
                    <th className="px-2 py-1.5 font-semibold">Code</th>
                    <th className="px-2 py-1.5 font-semibold">Name</th>
                    <th className="px-2 py-1.5 font-semibold">Account</th>
                    <th className="px-2 py-1.5 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewUnmatched.map((r) => (
                    <tr key={`u-${r.empCode}-${r.sheetRow}`} className="border-b border-amber-50">
                      <td className="px-2 py-1.5 tabular-nums">{r.empCode}</td>
                      <td className="px-2 py-1.5">{r.employeeName || "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.accountNo || "—"}</td>
                      <td className="px-2 py-1.5">{r.confirmationNote || (r.isNew ? "New" : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unmatched.length > previewUnmatched.length ? (
              <p className="px-3 py-2 text-[11px] text-amber-800">
                …and {unmatched.length - previewUnmatched.length} more
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
