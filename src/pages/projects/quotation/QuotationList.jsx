import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  Loader2,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  FilePlus,
  FolderInput,
} from 'lucide-react';
import { DateInput } from '../../../components/DateInput';
import {
  createQuotationRevision,
  daysBetween,
  fetchQuotations,
  isFollowupOverdue,
  projectsTable,
  TERMINAL_CONVERTED,
} from '../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import {
  formatCurrency,
  formatDisplayDate,
  LIST_COLUMNS,
  qInput,
  qSelect,
  todayIsoDate,
} from './quotationConstants';
import StatusBadge from './StatusBadge';
import QuotationDetailDrawer from './QuotationDetailDrawer';
import FollowupModal from './FollowupModal';
import ConvertToProjectModal from './ConvertToProjectModal';
import { useQuotationDropdowns } from './useQuotationDropdowns';
import { useAuth } from '../../../contexts/AuthContext';
import QuotationImportPanel from './QuotationImportPanel';

export default function QuotationList() {
  const { user } = useAuth();
  const { valuesForKindKey } = useQuotationDropdowns();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [detailMode, setDetailMode] = useState('view');
  const [followupRow, setFollowupRow] = useState(null);
  const [convertRow, setConvertRow] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchQuotations();
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load quotations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const statuses = valuesForKindKey('offer_status');
  const types = valuesForKindKey('offer_type');
  const owners = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      if (r.owner_name) set.add(r.owner_name);
      if (r.enquiry_received_from) set.add(r.enquiry_received_from);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayIsoDate();
    let list = rows.filter((r) => !r.superseded || statusFilter === 'Superseded');

    if (q) {
      list = list.filter(
        (r) =>
          String(r.offer_no || '').toLowerCase().includes(q) ||
          String(r.client_name || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((r) => r.offer_status === statusFilter);
    if (typeFilter) list = list.filter((r) => r.offer_type === typeFilter);
    if (ownerFilter) {
      list = list.filter(
        (r) => r.owner_name === ownerFilter || r.enquiry_received_from === ownerFilter
      );
    }
    if (dateFrom) {
      list = list.filter((r) => {
        const d = normalizeToIsoDate(r.offer_date);
        return d && d >= dateFrom;
      });
    }
    if (dateTo) {
      list = list.filter((r) => {
        const d = normalizeToIsoDate(r.offer_date);
        return d && d <= dateTo;
      });
    }
    if (overdueOnly) list = list.filter((r) => isFollowupOverdue(r, today));

    return [...list].sort((a, b) => {
      const ao = isFollowupOverdue(a, today) ? 0 : 1;
      const bo = isFollowupOverdue(b, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const an = normalizeToIsoDate(a.next_followup_date) || '9999-99-99';
      const bn = normalizeToIsoDate(b.next_followup_date) || '9999-99-99';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }, [rows, search, statusFilter, typeFilter, ownerFilter, dateFrom, dateTo, overdueOnly]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  };

  const exportCsv = () => {
    const headers = LIST_COLUMNS.map((c) => c.label);
    const lines = [headers.join(',')];
    for (const row of filtered) {
      const cells = LIST_COLUMNS.map((col) => {
        let v;
        if (col.key === 'days_since_followup') {
          v = daysBetween(row.last_followup_date ?? row.offer_date);
        } else if (col.type === 'date') v = formatDisplayDate(row[col.key]);
        else if (col.type === 'currency') v = row[col.key] ?? '';
        else v = row[col.key] ?? '';
        return `"${String(v ?? '').replace(/"/g, '""')}"`;
      });
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotation-list-${todayIsoDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bulkUpdateStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    if (!window.confirm(`Update ${selectedIds.size} quotation(s) to "${bulkStatus}"?`)) return;
    try {
      const ids = [...selectedIds];
      const { error: e } = await projectsTable('quotations')
        .update({ offer_status: bulkStatus, status_changed_at: new Date().toISOString() })
        .in('id', ids);
      if (e) throw e;
      setSelectedIds(new Set());
      setBulkStatus('');
      await fetchRows();
    } catch (err) {
      setError(err?.message || 'Bulk update failed.');
    }
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      const { error: e } = await projectsTable('quotations').delete().eq('id', id);
      if (e) throw e;
      await fetchRows();
    } catch (err) {
      setError(err?.message || 'Delete failed.');
    }
  };

  const markRevised = async (row) => {
    if (!window.confirm('Create revised offer (clone line items) and supersede this one?')) return;
    setBusyId(row.id);
    try {
      const inserted = await createQuotationRevision(row, { userId: user?.id });
      await fetchRows();
      setDetailId(inserted.id);
      setDetailMode('edit');
    } catch (err) {
      setError(err?.message || 'Could not create revision.');
    } finally {
      setBusyId(null);
    }
  };

  const today = todayIsoDate();

  return (
    <div className="p-4 sm:p-6">
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[180px]">
            <span className="text-xs font-semibold text-slate-500">Search Offer No / Client</span>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                className={`${qInput} pl-9`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
              />
            </div>
          </label>
          <label className="w-44">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <select className={`${qSelect} mt-1`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="w-36">
            <span className="text-xs font-semibold text-slate-500">Offer Type</span>
            <select className={`${qSelect} mt-1`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="w-44">
            <span className="text-xs font-semibold text-slate-500">Owner / Source</span>
            <select className={`${qSelect} mt-1`} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="">All</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="w-36">
            <span className="text-xs font-semibold text-slate-500">From</span>
            <DateInput className={`${qInput} mt-1`} value={dateFrom} onChange={setDateFrom} />
          </label>
          <label className="w-36">
            <span className="text-xs font-semibold text-slate-500">To</span>
            <DateInput className={`${qInput} mt-1`} value={dateTo} onChange={setDateTo} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue follow-ups
          </label>
          <button
            type="button"
            onClick={fetchRows}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-600">{selectedIds.size} selected</span>
            <select className={`${qSelect} w-56`} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="">Bulk status…</option>
              {statuses.filter((s) => s !== 'Superseded').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={bulkUpdateStatus}
              disabled={!bulkStatus}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <QuotationImportPanel
        onImported={fetchRows}
        onError={(msg) => msg && setError(msg)}
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Sl. No</th>
                <th className="px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                {LIST_COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={LIST_COLUMNS.length + 3} className="py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-slate-400 inline-block" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={LIST_COLUMNS.length + 3} className="py-12 text-center text-slate-500">
                    No quotations found.
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const overdue = isFollowupOverdue(row, today);
                  const daysSince = daysBetween(row.last_followup_date ?? row.offer_date);
                  return (
                    <tr key={row.id} className={`border-t border-slate-100 hover:bg-slate-50/80 ${overdue ? 'bg-rose-50/40' : ''}`}>
                      <td className="px-3 py-2 text-xs text-slate-500 text-center whitespace-nowrap">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{row.offer_no}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDisplayDate(row.offer_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.client_name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.location || '—'}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate" title={row.subject || row.scope || ''}>
                        {row.subject || row.scope || '—'}
                      </td>
                      <td className="px-3 py-2">{row.offer_type || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.quoted_rate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <StatusBadge status={row.offer_status} />
                          {overdue && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-600 text-white">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.owner_name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.enquiry_received_from || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDisplayDate(row.last_followup_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDisplayDate(row.next_followup_date)}</td>
                      <td className="px-3 py-2 text-center">{daysSince == null ? '—' : daysSince}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="View" onClick={() => { setDetailId(row.id); setDetailMode('view'); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="Edit" onClick={() => { setDetailId(row.id); setDetailMode('edit'); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="Follow-up" onClick={() => setFollowupRow(row)}>
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="Mark Revised" disabled={busyId === row.id} onClick={() => markRevised(row)}>
                            <FilePlus className="h-3.5 w-3.5" />
                          </IconBtn>
                          {TERMINAL_CONVERTED.has(row.offer_status) && !row.linked_project_id && (
                            <IconBtn title="Convert to Project" onClick={() => setConvertRow(row)}>
                              <FolderInput className="h-3.5 w-3.5" />
                            </IconBtn>
                          )}
                          <IconBtn title="Delete" onClick={() => deleteRow(row.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
          Showing {filtered.length} of {rows.length} quotations · sorted by next follow-up (overdue first)
        </div>
      </div>

      {detailId && (
        <QuotationDetailDrawer
          quotationId={detailId}
          initialMode={detailMode}
          onClose={() => setDetailId(null)}
          onChanged={fetchRows}
        />
      )}
      {followupRow && (
        <FollowupModal quotation={followupRow} onClose={() => setFollowupRow(null)} onSaved={fetchRows} />
      )}
      {convertRow && (
        <ConvertToProjectModal quotation={convertRow} onClose={() => setConvertRow(null)} onConverted={fetchRows} />
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded-md border border-slate-200 hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
