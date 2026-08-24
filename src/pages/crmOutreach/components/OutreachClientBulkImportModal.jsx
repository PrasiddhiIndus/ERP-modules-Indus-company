import React, { useCallback, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '../../adminOperations/components/AdminUi';
import { toast } from '../../../lib/toast';
import {
  buildOutreachImportErrorReportCsv,
  downloadOutreachClientBulkTemplate,
  downloadTextFile,
  outreachImportRecordToPayload,
  parseOutreachClientBulkFile,
} from '../../../lib/crmOutreachClientBulkImport';
import { crmOutreachErrorMsg, importOutreachClients } from '../../../services/crmOutreachApi';
import { CRM_OUTREACH_BULK_PREVIEW_ROWS } from '../data/outreachConstants';

export default function OutreachClientBulkImportModal({ open, onClose, onComplete }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [records, setRecords] = useState([]);
  const [rawRowCount, setRawRowCount] = useState(0);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const resetState = useCallback(() => {
    setParseErrors([]);
    setRecords([]);
    setRawRowCount(0);
    setValid(false);
    setError('');
    setResults(null);
    setDragOver(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    resetState();
    onClose?.();
  }, [busy, onClose, resetState]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setResults(null);
    try {
      const parsed = await parseOutreachClientBulkFile(file);
      setParseErrors(parsed.errors);
      setRecords(parsed.records);
      setRawRowCount(parsed.rawRowCount);
      setValid(parsed.valid);
    } catch (e) {
      setParseErrors([e?.message || 'Could not parse file']);
      setRecords([]);
      setRawRowCount(0);
      setValid(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!valid || !records.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const payloads = records.map(outreachImportRecordToPayload);
      const outcome = await importOutreachClients(payloads);
      setResults(outcome);
      onComplete?.(outcome);
      if (outcome.summary.failed === 0) {
        toast.success(
          `Import complete — ${outcome.summary.added} added, ${outcome.summary.updated} updated.`
        );
      } else {
        toast.warning(
          `Import finished with errors — ${outcome.summary.added} added, ${outcome.summary.updated} updated, ${outcome.summary.failed} failed.`
        );
      }
    } catch (e) {
      setError(crmOutreachErrorMsg(e, 'Import failed.'));
    } finally {
      setBusy(false);
    }
  }, [busy, onComplete, records, valid]);

  const previewRows = records.slice(0, CRM_OUTREACH_BULK_PREVIEW_ROWS);
  const summary = results?.summary;

  return (
    <Modal
      open={open}
      title="Import outreach clients"
      onClose={handleClose}
      widthClass="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            {results
              ? `Added ${summary?.added ?? 0} · Updated ${summary?.updated ?? 0} · Failed ${summary?.failed ?? 0}`
              : valid
                ? `${records.length} site(s) ready from ${rawRowCount} row(s)`
                : 'Upload a filled sample template to preview'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="h-8 px-3 rounded border border-gray-300 bg-white text-xs disabled:opacity-60"
            >
              {results ? 'Close' : 'Cancel'}
            </button>
            {!results ? (
              <button
                type="button"
                onClick={handleImport}
                disabled={!valid || busy || !records.length}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {busy ? 'Importing…' : `Import ${records.length || 0} site(s)`}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <p className="text-gray-600">
          Use the sample template column headers exactly as provided. Rows with the same Client/Site Name are merged into one record (multi-contact rows supported).
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadOutreachClientBulkTemplate}
            disabled={busy}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Download sample template
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-900 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            Choose file
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

        {!results ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragOver ? 'border-accent bg-accent/5' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-700 font-medium">Drag & drop .xlsx or .csv here</p>
            <p className="text-[11px] text-gray-500 mt-1">Or use Choose file above</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>
        ) : null}

        {parseErrors.length > 0 && !results ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800 space-y-1 max-h-40 overflow-y-auto">
            {parseErrors.map((msg) => (
              <p key={msg}>{msg}</p>
            ))}
          </div>
        ) : null}

        {previewRows.length > 0 && !results ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700">
              Preview ({previewRows.length} of {records.length} merged site(s) from {rawRowCount} row(s))
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-white border-b border-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left">Client/Site</th>
                    <th className="px-2 py-2 text-left">Location</th>
                    <th className="px-2 py-2 text-left">State</th>
                    <th className="px-2 py-2 text-left">Primary</th>
                    <th className="px-2 py-2 text-left">Secondary</th>
                    <th className="px-2 py-2 text-left">Manpower</th>
                    <th className="px-2 py-2 text-left">Site Status</th>
                    <th className="px-2 py-2 text-left">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.clientName} className="border-t border-gray-100">
                      <td className="px-2 py-2 font-medium">{row.clientName}</td>
                      <td className="px-2 py-2">{row.location || '—'}</td>
                      <td className="px-2 py-2">{row.state || '—'}</td>
                      <td className="px-2 py-2">{row.adminFireSup || row.mailId || '—'}</td>
                      <td className="px-2 py-2">{row.secondaryContactName || '—'}</td>
                      <td className="px-2 py-2">{row.manpowerRequired ?? '—'}</td>
                      <td className="px-2 py-2">{row.siteStatus || '—'}</td>
                      <td className="px-2 py-2 font-mono text-[10px]">{row.sourceRows.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {results ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              <p className="font-semibold">Import complete</p>
              <p>
                Added: {summary?.added ?? 0} · Updated: {summary?.updated ?? 0} · Failed: {summary?.failed ?? 0}
              </p>
            </div>
            {(results.results || []).some((r) => !r.ok) ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-700">Failed sites</p>
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() =>
                      downloadTextFile(
                        'crm-outreach-import-errors.csv',
                        buildOutreachImportErrorReportCsv(results.results)
                      )
                    }
                  >
                    Download error report
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {(results.results || [])
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <div key={`${r.clientName}-${r.sourceRows?.join('-')}`} className="px-3 py-2 border-b border-gray-100">
                        {r.clientName} (rows { (r.sourceRows || []).join(', ') || '—' }) — {r.error}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
