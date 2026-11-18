import React, { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { projectsTable } from '../../../services/quotationApi';
import {
  downloadQuotationImportTemplate,
  parseQuotationImportRows,
  readQuotationExcelRows,
} from './quotationExcelImport';
import QuotationImportSkippedList from './QuotationImportSkippedList';

const BATCH_SIZE = 50;
const MAX_ROWS = 2000;

function ConfirmModal({ preview, skippedRows, onConfirm, onCancel, confirming }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100 shrink-0">
          <div className="rounded-xl bg-amber-100 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Confirm Import</h3>
            <p className="text-xs text-slate-500 mt-0.5">Review before proceeding — rows are added, not overwritten</p>
          </div>
          <button type="button" onClick={onCancel} className="ml-auto p-1 rounded hover:bg-amber-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 space-y-1.5 text-sm">
            <InfoRow label="File" value={preview.fileName} />
            <InfoRow label="Rows found" value={preview.totalRows} />
            <InfoRow label="Ready to import" value={`${preview.payloads} row(s)`} green />
            {preview.skipped > 0 && (
              <InfoRow label="Will be skipped" value={`${preview.skipped} row(s)`} amber />
            )}
          </div>

          <QuotationImportSkippedList
            rows={skippedRows}
            title="Skipped rows (will not be imported)"
            maxHeightClass="max-h-48"
          />

          <p className="text-xs text-slate-500">
            This will add <strong>{preview.payloads}</strong> new quotation record(s). Existing records are not changed.
          </p>
        </div>

        <div className="flex gap-2 px-5 pb-4 shrink-0">
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
            disabled={confirming || !preview.payloads}
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

function InfoRow({ label, value, green, amber }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600 shrink-0">{label}</span>
      <span
        className={`font-medium text-right truncate max-w-[220px] ${
          green ? 'text-emerald-700 font-semibold' : amber ? 'text-amber-700 font-semibold' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function QuotationImportPanel({ onImported, onError }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  const handleTemplate = () => downloadQuotationImportTemplate();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onError?.('');
    setResult(null);
    try {
      const excelRows = await readQuotationExcelRows(file);
      if (!excelRows.length) {
        setResult({ ok: 0, skipped: [{ reason: 'No data rows found in file' }] });
        return;
      }
      if (excelRows.length > MAX_ROWS) {
        onError?.(`File has ${excelRows.length} rows — maximum is ${MAX_ROWS} per import.`);
        return;
      }
      const { payloads, skipped } = parseQuotationImportRows(excelRows);
      setPending({
        file,
        fileName: file.name,
        totalRows: excelRows.length,
        payloads,
        skipped,
      });
    } catch (err) {
      onError?.(err?.message || 'Could not read file — ensure it is a valid .xlsx or .csv.');
    }
  };

  const handleConfirm = async () => {
    if (!pending?.payloads?.length) return;
    setConfirming(true);
    onError?.('');
    try {
      const offerNos = [
        ...new Set(
          pending.payloads
            .map((p) => String(p.payload?.offer_no || '').trim())
            .filter(Boolean)
        ),
      ];
      const existing = new Set();
      for (let i = 0; i < offerNos.length; i += BATCH_SIZE) {
        const chunk = offerNos.slice(i, i + BATCH_SIZE);
        const { data, error: readErr } = await projectsTable('quotations')
          .select('offer_no')
          .in('offer_no', chunk);
        if (readErr) throw readErr;
        for (const row of data || []) {
          const key = String(row.offer_no || '').trim().toLowerCase();
          if (key) existing.add(key);
        }
      }

      const toInsert = [];
      const alreadySkipped = [];
      for (const item of pending.payloads) {
        const key = String(item.payload?.offer_no || '').trim().toLowerCase();
        if (key && existing.has(key)) {
          alreadySkipped.push({
            row: item.excelRow,
            sheet: item.sheet,
            reason: `Offer No already exists (${item.payload.offer_no})`,
          });
          continue;
        }
        toInsert.push(item.payload);
      }

      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        let error = (await projectsTable('quotations').insert(batch)).error;
        if (error && /order_converted_date/i.test(error.message || '')) {
          const stripped = batch.map(({ order_converted_date, ...rest }) => rest);
          error = (await projectsTable('quotations').insert(stripped)).error;
        }
        if (error) {
          onError?.(error.message || 'Import failed.');
          break;
        }
        inserted += batch.length;
      }
      const skippedAll = [...pending.skipped, ...alreadySkipped];
      setResult({ ok: inserted, skipped: skippedAll });
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
          skippedRows={pending.skipped}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
          confirming={confirming}
        />
      )}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 shadow-sm font-medium"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Download sample template
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-medium"
          >
            <Upload className="h-4 w-4" />
            Import from Excel
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
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
              {result.ok > 0 ? `✓ ${result.ok} quotation(s) imported` : 'No rows imported'}
              {result.skipped?.length > 0 && `, ${result.skipped.length} skipped`}
            </span>
          )}
        </div>

        {result?.skipped?.length > 0 ? (
          <QuotationImportSkippedList
            rows={result.skipped}
            title="Skipped / not imported rows"
            maxHeightClass="max-h-48"
          />
        ) : null}
      </div>
    </>
  );
}
