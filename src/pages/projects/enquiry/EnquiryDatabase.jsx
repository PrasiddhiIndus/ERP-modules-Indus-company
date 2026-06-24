import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  flattenEnquiryRow,
  getEnquiryFieldValue,
  packEnquiryUpdate,
  projectsTable,
} from '../../../services/projectsApi';
import { formatDateDdMmYyyy, normalizeToIsoDate } from '../../../utils/dateDisplay';
import { formatDisplayDate } from './enquiryConstants';
import EnquiryImportPanel from './EnquiryImportPanel';
import { getRowStatusValue, getStatusBg, STATUS_LEGEND } from './enquiryStatusStyles';
import { useEnquiryFieldDefinitions } from './useEnquiryFieldDefinitions';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';
import EnquiryFieldInput from './EnquiryFieldInput';

const inputCls =
  'w-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function displayCellValue(field, row) {
  const v = getEnquiryFieldValue(row, field.field_key);
  if (field.field_type === 'date') return formatDisplayDate(v);
  return v == null || v === '' ? '—' : v;
}

function SortIndicator({ fieldKey, sortConfig }) {
  const active = sortConfig.key === fieldKey;
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
      <span style={{ color: active && sortConfig.dir === 'asc' ? '#34d399' : '#cbd5e1' }}>▲</span>
      <span style={{ color: active && sortConfig.dir === 'desc' ? '#fb7185' : '#cbd5e1' }}>▼</span>
    </span>
  );
}

export default function EnquiryDatabase() {
  const { fields, databaseFields, loading: fieldsLoading, error: fieldsError } = useEnquiryFieldDefinitions();
  const { valuesForKindKey, valuesForKindId } = useProjectsEnquiryDropdowns();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'serial_number', dir: 'desc' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const editableFields = useMemo(() => databaseFields.filter((f) => !f.read_only), [databaseFields]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await projectsTable('enquiries')
        .select('id, serial_number, data, created_at, updated_at')
        .order('serial_number', { ascending: false });
      if (e) throw e;
      setRows(data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load enquiries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    );
  };

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter((row) => {
        const flat = flattenEnquiryRow(row);
        return Object.values(flat).some((v) => v != null && String(v).toLowerCase().includes(q));
      });
    }

    if (statusFilter) {
      list = list.filter((row) =>
        String(getRowStatusValue(row)).toLowerCase() === statusFilter.toLowerCase()
      );
    }

    const dir = sortConfig.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let av, bv;
      if (sortConfig.key === 'serial_number') {
        av = a.serial_number ?? 0;
        bv = b.serial_number ?? 0;
        return (av - bv) * dir;
      }
      if (sortConfig.key === 'created_at') {
        av = a.created_at ?? '';
        bv = b.created_at ?? '';
      } else {
        const col = databaseFields.find((f) => f.field_key === sortConfig.key);
        const rawA = getEnquiryFieldValue(a, sortConfig.key);
        const rawB = getEnquiryFieldValue(b, sortConfig.key);
        if (col?.field_type === 'date') {
          av = normalizeToIsoDate(rawA) || '';
          bv = normalizeToIsoDate(rawB) || '';
        } else {
          av = String(rawA ?? '').toLowerCase();
          bv = String(rawB ?? '').toLowerCase();
        }
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [rows, search, statusFilter, sortConfig, databaseFields]);

  const startEdit = (row) => {
    const flat = flattenEnquiryRow(row);
    for (const f of databaseFields) {
      if (f.field_type === 'date' && flat[f.field_key]) {
        const iso = normalizeToIsoDate(flat[f.field_key]);
        if (iso) flat[f.field_key] = iso;
      }
    }
    setEditingId(row.id);
    setEditDraft(flat);
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };

  const saveEdit = async () => {
    if (!editDraft?.id) return;
    setSaving(true);
    try {
      const { data } = packEnquiryUpdate(editDraft, databaseFields);
      const { error: e } = await projectsTable('enquiries').update({ data }).eq('id', editDraft.id);
      if (e) throw e;
      await fetchRows();
      cancelEdit();
    } catch (err) {
      setError(err?.message || 'Could not update enquiry.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this enquiry record?')) return;
    try {
      const { error: e } = await projectsTable('enquiries').delete().eq('id', id);
      if (e) throw e;
      await fetchRows();
    } catch (err) {
      setError(err?.message || 'Could not delete enquiry.');
    }
  };

  const exportCsv = () => {
    const headers = databaseFields.map((f) => f.label);
    const lines = [headers.join(',')];
    for (const row of sortedFiltered) {
      const cells = databaseFields.map((col) => {
        let v = getEnquiryFieldValue(row, col.field_key);
        if (col.field_type === 'date') v = formatDisplayDate(v);
        const s = v == null ? '' : String(v).replace(/"/g, '""');
        return `"${s}"`;
      });
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects-enquiry-database-${formatDateDdMmYyyy(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableLoading = loading || fieldsLoading;

  return (
    <div className="p-4 sm:p-6">
      {(error || fieldsError) && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error || fieldsError}
        </div>
      )}

      <EnquiryImportPanel
        databaseFields={databaseFields}
        allFields={fields}
        onImported={fetchRows}
        onError={setError}
      />

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3 px-0.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">STATUS COLORS</span>
        {STATUS_LEGEND.map((item) => (
          <span key={item.status} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
            <span
              className="inline-block h-3.5 w-7 rounded-sm border border-black/10"
              style={{ background: item.bg }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* Filters + sort bar — same style as POEntry */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search enquiries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="shrink-0 w-44">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All statuses</option>
            {STATUS_LEGEND.map((s) => (
              <option key={s.status} value={s.status}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="shrink-0 w-44">
          <select
            value={sortConfig.key}
            onChange={(e) => setSortConfig((prev) => ({ ...prev, key: e.target.value }))}
            className={inputCls}
          >
            <option value="serial_number">Last created</option>
            <option value="created_at">Date added</option>
            <option value="enquiry_receipt_date">Receipt date</option>
            <option value="client_name">Client name</option>
            <option value="assigned_to_person">Assigned to</option>
            <option value="target_date">Target date</option>
            <option value="current_status">Status</option>
            <option value="priority">Priority</option>
          </select>
        </div>

        <div className="shrink-0 w-36">
          <select
            value={sortConfig.dir}
            onChange={(e) => setSortConfig((prev) => ({ ...prev, dir: e.target.value }))}
            className={inputCls}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={fetchRows}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!sortedFiltered.length || !databaseFields.length}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editingId && editDraft && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Editing serial #{editDraft.serial_number}</h3>
            <button type="button" onClick={cancelEdit} className="p-1 rounded hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto pr-1">
            {editableFields.map((field) => (
              <label key={field.id} className="text-xs">
                <span className="font-medium text-gray-600">{field.label}</span>
                <div className="mt-1">
                  <EnquiryFieldInput
                    field={field}
                    value={editDraft[field.field_key]}
                    onChange={(v) => setEditDraft((prev) => ({ ...prev, [field.field_key]: v }))}
                    valuesForKindKey={valuesForKindKey}
                    valuesForKindId={valuesForKindId}
                    className="w-full min-w-[8rem] px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white"
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm border border-gray-200 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table — same outer wrapper as POEntry */}
      <div className="rounded-xl border border-gray-300 overflow-hidden bg-[#f2f6ff]">
        <div className="p-2">
          <div className="bg-white rounded-lg overflow-hidden">
            {tableLoading ? (
              <div className="p-12 flex justify-center text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : !databaseFields.length ? (
              <div className="p-12 text-center text-gray-500 text-sm">No field definitions configured.</div>
            ) : sortedFiltered.length === 0 ? (
              <div className="p-12 text-center text-gray-500 text-sm">No enquiry records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-2.5 text-center font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap w-11">
                        S.No
                      </th>
                      {databaseFields.map((col) => (
                        <th
                          key={col.id}
                          className="px-2 py-2.5 text-center font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.field_key)}
                            className="inline-flex items-center font-bold text-black text-xs"
                          >
                            {col.label}
                            <SortIndicator fieldKey={col.field_key} sortConfig={sortConfig} />
                          </button>
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-center font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFiltered.map((row, idx) => {
                      const bg = getStatusBg(getRowStatusValue(row));
                      return (
                        <tr
                          key={row.id}
                          style={{ backgroundColor: bg }}
                          className="border-b border-black/5 transition-colors"
                        >
                          <td
                            className="px-2 py-2 text-center align-top text-gray-600 tabular-nums border-r border-black/5"
                            style={{ backgroundColor: 'inherit' }}
                          >
                            {idx + 1}
                          </td>
                          {databaseFields.map((col) => (
                            <td
                              key={col.id}
                              className="px-2 py-2 text-center align-top text-gray-800 border-r border-black/5 last:border-r-0"
                              style={{ backgroundColor: 'inherit' }}
                            >
                              {col.field_type === 'textarea' ? (
                                <span
                                  className="line-clamp-2 max-w-[200px] text-left block"
                                  title={String(getEnquiryFieldValue(row, col.field_key) || '')}
                                >
                                  {displayCellValue(col, row)}
                                </span>
                              ) : (
                                displayCellValue(col, row)
                              )}
                            </td>
                          ))}
                          <td
                            className="px-2 py-2 whitespace-nowrap text-center border-l border-black/5"
                            style={{ backgroundColor: 'inherit' }}
                          >
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="p-1.5 rounded text-blue-700 hover:bg-blue-100"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(row.id)}
                                className="p-1.5 rounded text-rose-700 hover:bg-rose-100"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">{sortedFiltered.length} record(s)</p>
    </div>
  );
}
