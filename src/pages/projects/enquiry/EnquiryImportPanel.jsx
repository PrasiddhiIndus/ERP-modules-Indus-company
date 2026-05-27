import React, { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { projectsTable } from '../../../services/projectsApi';
import {
  downloadEnquiryImportTemplate,
  parseEnquiryImportRows,
  readEnquiryExcelRows,
} from './enquiryExcelImport';

const BATCH_SIZE = 50;

function ConfirmModal({ preview, onConfirm, onCancel, confirming }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100">
          <div className="rounded-xl bg-amber-100 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Confirm Import</h3>
            <p className="text-xs text-slate-500 mt-0.5">Review the details before proceeding</p>
          </div>
          <button type="button" onClick={onCancel} className="ml-auto p-1 rounded hover:bg-amber-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">File</span>
              <span className="font-medium text-slate-900 truncate max-w-[200px]">{preview.fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Rows found</span>
              <span className="font-medium text-slate-900">{preview.totalRows}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Ready to import</span>
              <span className="font-semibold text-emerald-700">{preview.payloads} row(s)</span>
            </div>
            {preview.skipped > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Will be skipped</span>
                <span className="font-semibold text-amber-700">{preview.skipped} row(s) (missing Client Name)</span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">
            This will add <strong>{preview.payloads}</strong> new enquiry record(s) to the database. Existing records will not be changed.
          </p>
        </div>

        <div className="flex gap-2 px-5 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {confirming ? 'Importing…' : 'Import now'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnquiryImportPanel({ databaseFields, allFields, onImported, onError }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  const resolvedFields = allFields?.length ? allFields : databaseFields;

  const handleTemplate = () => downloadEnquiryImportTemplate(databaseFields);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError?.('');
    setResult(null);
    try {
      const excelRows = await readEnquiryExcelRows(file);
      if (!excelRows.length) {
        setResult({ ok: 0, skipped: [{ reason: 'No data rows in file' }] });
        return;
      }
      const { payloads, skipped } = parseEnquiryImportRows(excelRows, resolvedFields);
      setPending({ file, fileName: file.name, totalRows: excelRows.length, payloads, skipped });
    } catch (err) {
      onError?.(err?.message || 'Could not read file.');
    }
  };

  const handleConfirm = async () => {
    if (!pending?.payloads?.length) return;
    setConfirming(true);
    onError?.('');
    try {
      let inserted = 0;
      const insertErrors = [];
      for (let i = 0; i < pending.payloads.length; i += BATCH_SIZE) {
        const batch = pending.payloads.slice(i, i + BATCH_SIZE).map((p) => ({ data: p.data }));
        const { error } = await projectsTable('enquiries').insert(batch);
        if (error) { insertErrors.push(error.message); break; }
        inserted += batch.length;
      }
      if (insertErrors.length) onError?.(insertErrors[0]);
      setResult({ ok: inserted, skipped: pending.skipped });
      setPending(null);
      if (inserted > 0) onImported?.();
    } catch (err) {
      onError?.(err?.message || 'Import failed.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      {pending && (
        <ConfirmModal
          preview={{
            fileName: pending.fileName,
            totalRows: pending.totalRows,
            payloads: pending.payloads.length,
            skipped: pending.skipped.length,
          }}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
          confirming={confirming}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTemplate}
          disabled={!databaseFields.length}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 shadow-sm"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Download template
        </button>
        <button
          type="button"
          disabled={!databaseFields.length}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
        >
          <Upload className="h-4 w-4" />
          Import from Excel
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.ods,.csv"
          className="hidden"
          onChange={handleFile}
        />

        {result && (
          <span
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${
              result.ok > 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}
          >
            {result.ok > 0 ? `✓ ${result.ok} row(s) imported` : 'No rows imported'}
            {result.skipped?.length > 0 && `, ${result.skipped.length} skipped`}
          </span>
        )}
      </div>
    </>
  );
}
