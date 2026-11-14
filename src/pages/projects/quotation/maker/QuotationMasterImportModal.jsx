import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Modal } from '../../../../components/erpUi';
import { projectsTable } from '../../../../services/quotationApi';
import {
  downloadQuotationImportTemplate,
  parseQuotationImportRows,
  readQuotationExcelRows,
} from '../quotationExcelImport';

const BATCH_SIZE = 50;
const MAX_ROWS = 500;

export default function QuotationMasterImportModal({ open, onClose, onImported }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const reset = () => {
    setBusy(false);
    setError('');
    setResult(null);
    setPreview(null);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose?.();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setResult(null);
    setPreview(null);
    try {
      const excelRows = await readQuotationExcelRows(file);
      if (!excelRows.length) {
        setError('No data rows found in the file.');
        return;
      }
      if (excelRows.length > MAX_ROWS) {
        setError(`File has ${excelRows.length} rows — maximum is ${MAX_ROWS} per import.`);
        return;
      }
      const { payloads, skipped } = parseQuotationImportRows(excelRows);
      setPreview({
        fileName: file.name,
        totalRows: excelRows.length,
        payloads,
        skipped,
      });
    } catch (err) {
      setError(err?.message || 'Could not read file — use a valid .xlsx or .csv.');
    }
  };

  const handleImport = async () => {
    if (!preview?.payloads?.length) return;
    setBusy(true);
    setError('');
    try {
      const offerNos = [
        ...new Set(
          preview.payloads
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
      for (const item of preview.payloads) {
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
        const { error: insErr } = await projectsTable('quotations').insert(batch);
        if (insErr) {
          const msg = String(insErr.message || '');
          if (/quotations_offer_no_unique|duplicate key/i.test(msg)) {
            throw new Error(
              'Import stopped: an Offer No already exists in Quotation Master. Remove duplicates from the sheet (or delete the existing quotation) and try again.'
            );
          }
          throw insErr;
        }
        inserted += batch.length;
      }

      const skippedCount = preview.skipped.length + alreadySkipped.length;
      setResult({ ok: inserted, skipped: skippedCount, alreadyExists: alreadySkipped.length });
      setPreview(null);
      if (inserted > 0) onImported?.();
    } catch (err) {
      setError(err?.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Import quotations"
      onClose={handleClose}
      widthClass="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {preview?.payloads?.length ? (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={busy}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-emerald-600 text-[13px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? 'Importing…' : `Import ${preview.payloads.length} row(s)`}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-slate-600 m-0">
          Download the sample sheet, fill your quotation rows, then choose the file to import into Quotation Master.
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-700 m-0 mb-1.5">Sample sheet</p>
            <button
              type="button"
              onClick={() => downloadQuotationImportTemplate()}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Download sample Excel
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700 m-0 mb-1.5">Import file</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="block w-full text-[13px] text-slate-700 file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-[13px] file:font-semibold hover:file:bg-emerald-700"
              onChange={(e) => void handleFile(e)}
              disabled={busy}
            />
            <p className="text-[11px] text-slate-500 mt-1.5 m-0">Accepted: .xlsx, .xls, .csv · max {MAX_ROWS} rows</p>
          </div>
        </div>

        {preview ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">File</span>
              <span className="font-medium text-slate-900 truncate max-w-[260px]">{preview.fileName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Rows found</span>
              <span className="font-medium text-slate-900">{preview.totalRows}</span>
            </div>
            {Object.entries(
              preview.payloads.reduce((acc, p) => {
                const k = p.sheet || 'Sheet';
                acc[k] = (acc[k] || 0) + 1;
                return acc;
              }, {})
            ).map(([sheet, n]) => (
              <div key={sheet} className="flex justify-between gap-2 pl-3">
                <span className="text-slate-500">Sheet “{sheet}”</span>
                <span className="text-slate-900 tabular-nums">{n}</span>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Ready to import</span>
              <span className="font-semibold text-emerald-700">{preview.payloads.length}</span>
            </div>
            {preview.skipped.length > 0 ? (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Skipped</span>
                <span className="font-semibold text-amber-700">{preview.skipped.length}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{error}</div>
        ) : null}

        {result ? (
          <div
            className={`rounded-lg border px-3 py-2 text-[13px] ${
              result.ok > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {result.ok > 0 ? `${result.ok} quotation(s) imported` : 'No rows imported'}
            {result.skipped > 0 ? ` · ${result.skipped} skipped` : ''}
            {result.alreadyExists > 0 ? ` (${result.alreadyExists} Offer No already in Quotation Master)` : ''}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
