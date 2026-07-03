import React, { useRef, useState } from 'react';
import { Upload, Download, X, FileSpreadsheet } from 'lucide-react';
import { BULK_IMPORT_PREVIEW_ROWS } from '../../lib/userManagementBulkConstants';
import {
  downloadBulkImportTemplate,
  parseBulkImportFile,
  buildBulkErrorReportCsv,
  downloadTextFile,
  maskPassword,
} from '../../lib/userManagementBulkParse';
import { bulkCreateUsers } from '../../lib/userManagementBulkApi';
import { teamLabel, roleLabel } from './userManagementLabels';

export function UserManagementBulkImportModal({ supabase, departments = [], onClose, onComplete }) {
  const fileRef = useRef(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [rows, setRows] = useState([]);
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setResults(null);
    try {
      const parsed = await parseBulkImportFile(file, { departments });
      setParseErrors(parsed.errors);
      setRows(parsed.rows);
      setValid(parsed.valid);
    } catch (e) {
      setParseErrors([e?.message || 'Could not parse file']);
      setRows([]);
      setValid(false);
    }
  };

  const handleImport = async () => {
    if (!valid || !rows.length) return;
    setBusy(true);
    setError('');
    setImportProgress({ current: 0, total: rows.length });
    try {
      const outcome = await bulkCreateUsers(supabase, rows, {
        sequential: true,
        onProgress: (current, total) => setImportProgress({ current, total }),
      });
      if (!outcome.ok) {
        setError(outcome.message || 'Import failed.');
        return;
      }
      setResults(outcome.data);
      onComplete?.(outcome.data);
    } catch (e) {
      setError(e?.message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  const previewRows = rows.slice(0, BULK_IMPORT_PREVIEW_ROWS);
  const summary = results?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk import users</h2>
            <p className="text-sm text-gray-500">
              Excel (.xlsx) or CSV. Team must match an Employee Master department. Leave allowed_modules empty to create login only (no module access until assigned in Edit).
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadBulkImportTemplate}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download template
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              <Upload className="w-4 h-4" />
              Upload file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {parseErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-1">
              {parseErrors.map((msg) => (
                <p key={msg}>{msg}</p>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</div>
          )}

          {rows.length > 0 && !results && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Preview ({previewRows.length} of {rows.length} rows)
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left">Row</th>
                      <th className="px-2 py-2 text-left">Email</th>
                      <th className="px-2 py-2 text-left">Password</th>
                      <th className="px-2 py-2 text-left">Emp code</th>
                      <th className="px-2 py-2 text-left">Team</th>
                      <th className="px-2 py-2 text-left">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.row} className="border-t border-gray-100">
                        <td className="px-2 py-2">{r.row}</td>
                        <td className="px-2 py-2">{r.email}</td>
                        <td className="px-2 py-2 font-mono">{maskPassword(r.password)}</td>
                        <td className="px-2 py-2">{r.employee_code}</td>
                        <td className="px-2 py-2">{r.team ? teamLabel(r.team) : '—'}</td>
                        <td className="px-2 py-2">{roleLabel(r.role)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
                <p className="font-semibold">Import complete</p>
                <p>
                  Created: {summary?.created ?? 0} · Failed: {summary?.failed ?? 0} · Total: {summary?.total ?? 0}
                </p>
              </div>
              {(results.results || []).some((r) => !r.ok) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Failed rows</p>
                    <button
                      type="button"
                      className="text-sm text-indigo-600 hover:underline"
                      onClick={() =>
                        downloadTextFile(
                          'user-import-errors.csv',
                          buildBulkErrorReportCsv(results.results)
                        )
                      }
                    >
                      Download error report
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg text-xs">
                    {(results.results || [])
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <div key={`${r.row}-${r.email}`} className="px-3 py-2 border-b border-gray-100">
                          Row {r.row}: {r.email || '—'} — {r.error}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            disabled={busy}
          >
            {results ? 'Close' : 'Cancel'}
          </button>
          {!results && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!valid || busy || !rows.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
            >
              <FileSpreadsheet className="w-4 h-4" />
                      {busy
                        ? importProgress.total > 0
                          ? `Importing ${importProgress.current}/${importProgress.total}…`
                          : 'Importing…'
                        : `Import ${rows.length || 0} users`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
