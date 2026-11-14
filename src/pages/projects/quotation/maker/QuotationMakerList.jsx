import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePenLine,
  FilterX,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import { normalizeAppRole, ROLES } from '../../../../config/roles';
import { fetchQuotations, fiscalYearFromDate } from '../../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../../utils/dateDisplay';
import {
  OFFER_BUCKETS,
  OFFER_STATUS_OPTIONS,
  QUOTATION_BASE,
  offerBucketOf,
} from '../quotationConstants';
import { formatMoneyIn } from './quotationMakerModel';
import { Cell, DETAIL_FIELDS, MASTER_COLUMNS, cellValue } from './quotationMasterColumns.jsx';
import QuotationMasterImportModal from './QuotationMasterImportModal';
import QuotationViewDrawer from './QuotationViewDrawer';
import QuotationDeletionRequests from './QuotationDeletionRequests';
import {
  deleteQuotationAsSuperAdmin,
  deletionErrorMessage,
  listPendingQuotationDeletionRequests,
  requestQuotationDeletion,
} from '../quotationDeletionApi';
import { Modal } from '../../../../components/erpUi';
import './quotationMaker.css';
import { confirmDialog } from "../../../../lib/dialog";

const PAGE_SIZES = [25, 50, 100];

function sortValue(row, col) {
  const v = cellValue(row, col.key);
  if (v == null || v === '') return null;
  if (col.type === 'money') return Number(v) || 0;
  if (col.type === 'date') return normalizeToIsoDate(v) || '';
  return String(v).toLowerCase();
}

function rowFiscalYear(r) {
  const iso = normalizeToIsoDate(r.offer_date) || normalizeToIsoDate(r.created_at);
  return iso ? fiscalYearFromDate(iso) : '';
}

const EMPTY_FILTERS = {
  search: '',
  bucket: '',
  offerType: '',
  quarter: '',
  fy: '',
  dateFrom: '',
  dateTo: '',
};

function isSuperAdminRole(profile) {
  const role = normalizeAppRole(profile?.role);
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

export default function QuotationMakerList() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const canDeleteDirectly = isSuperAdminRole(userProfile);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  // Front-end only for now: edits from "Edit details" are kept on screen, not saved.
  const [localEdits, setLocalEdits] = useState({});
  const [editing, setEditing] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deleteAsk, setDeleteAsk] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchQuotations('*');
      setRows((data || []).filter((r) => !r.superseded));
    } catch (err) {
      setError(err?.message || 'Failed to load quotations.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeletionRequests = useCallback(async () => {
    setDeletionRequests(await listPendingQuotationDeletionRequests());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDeletionRequests();
  }, [loadDeletionRequests]);

  const pendingDeletionIds = useMemo(
    () => new Set(deletionRequests.map((r) => r.quotation_id).filter(Boolean)),
    [deletionRequests]
  );

  /** L1 / admin actionable queue — hide the requester's own pending items from the decide banner. */
  const actionableDeletionRequests = useMemo(
    () => deletionRequests.filter((r) => r.requested_by && r.requested_by !== user?.id),
    [deletionRequests, user?.id]
  );

  const askDelete = async (row) => {
    if (canDeleteDirectly) {
      const label = row.offer_no || row.client_name || 'this quotation';
      if (!(await confirmDialog({ title: "Delete quotation", message: `Delete ${label} permanently? Related quotation details are removed too.`, confirmLabel: "Delete", tone: "danger" }))) return;
      void (async () => {
        setError('');
        try {
          await deleteQuotationAsSuperAdmin(row.id);
          setNotice(`${label} deleted.`);
          await Promise.all([load(), loadDeletionRequests()]);
        } catch (err) {
          setError(deletionErrorMessage(err, 'Could not delete the quotation. Please try again.'));
        }
      })();
      return;
    }
    setDeleteReason('');
    setDeleteAsk(row);
  };

  const submitDeletionRequest = async () => {
    if (!deleteAsk) return;
    setDeleteBusy(true);
    setError('');
    try {
      await requestQuotationDeletion(deleteAsk.id, deleteReason.trim());
      setNotice(
        `Deletion of ${deleteAsk.offer_no || deleteAsk.client_name || 'quotation'} sent for L1 approval.`
      );
      setDeleteAsk(null);
      await loadDeletionRequests();
    } catch (err) {
      setError(deletionErrorMessage(err, 'Could not send the deletion request. Please try again.'));
      setDeleteAsk(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeletionDecided = async (message) => {
    setNotice(message);
    await Promise.all([load(), loadDeletionRequests()]);
  };

  const merged = useMemo(
    () => rows.map((r) => (localEdits[r.id] ? { ...r, ...localEdits[r.id] } : r)),
    [rows, localEdits]
  );

  const options = useMemo(() => {
    const types = new Set();
    const years = new Set();
    for (const r of merged) {
      const t = cellValue(r, 'offer_type');
      if (t) types.add(t);
      const y = rowFiscalYear(r);
      if (y) years.add(y);
    }
    const sorted = (s) => [...s].sort((a, b) => a.localeCompare(b));
    return { types: sorted(types), years: [...years].sort().reverse() };
  }, [merged]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return merged.filter((r) => {
      if (filters.bucket && offerBucketOf(r.offer_status) !== filters.bucket) return false;
      if (filters.offerType && cellValue(r, 'offer_type') !== filters.offerType) return false;
      if (filters.quarter && cellValue(r, 'quarter') !== filters.quarter) return false;
      if (filters.fy && rowFiscalYear(r) !== filters.fy) return false;
      if (filters.dateFrom || filters.dateTo) {
        const d = normalizeToIsoDate(r.offer_date);
        if (!d) return false;
        if (filters.dateFrom && d < filters.dateFrom) return false;
        if (filters.dateTo && d > filters.dateTo) return false;
      }
      if (!q) return true;
      return [
        'offer_no',
        'client_name',
        'location',
        'contact_person',
        'contact_no',
        'email_id',
        'enquiry_received_from',
        'scope',
        'subject',
        'remark',
      ].some((k) => String(r[k] || '').toLowerCase().includes(q));
    });
  }, [merged, filters]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = MASTER_COLUMNS.find((c) => c.key === sort.key);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, col);
      const vb = sortValue(b, col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // blanks always last
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [filtered, sort]);

  const bucketCounts = useMemo(() => {
    const counts = Object.fromEntries(OFFER_BUCKETS.map((b) => [b.id, 0]));
    for (const r of merged) {
      const id = offerBucketOf(r.offer_status);
      if (id) counts[id] += 1;
    }
    return counts;
  }, [merged]);

  const filteredValue = useMemo(
    () => filtered.reduce((s, r) => s + (Number(cellValue(r, 'quoted_rate')) || 0), 0),
    [filtered]
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize, sort]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const activeFilterCount = Object.entries(filters).filter(([, v]) => v).length;

  const toggleSort = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }));

  const openMaker = (id) => navigate(`${QUOTATION_BASE}/quotation-entry?id=${id}`);

  const onSaveDetails = (id, patch) => {
    setLocalEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
    setEditing(null);
  };

  const editedCount = Object.keys(localEdits).length;
  const viewingRow = viewingId ? merged.find((r) => r.id === viewingId) : null;
  const ctl =
    'h-9 w-full px-2.5 border border-slate-200 rounded-lg text-[13px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400';
  const lbl = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1 whitespace-nowrap truncate';

  return (
    <div className="p-3 sm:p-4 w-full space-y-3">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 m-0 leading-tight">Quotation Master</h2>
          <p className="text-xs text-slate-500 mt-0.5">Offer database — client, status and follow-up details for every quotation.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-[13px] font-medium text-emerald-800 hover:bg-emerald-100"
          >
            <Upload className="h-4 w-4" /> Import
          </button>
          <button
            type="button"
            onClick={() => navigate(`${QUOTATION_BASE}/quotation-entry`)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Make a quotation
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex items-start justify-between gap-2">
          <span>{notice}</span>
          <button type="button" className="text-emerald-700 hover:text-emerald-900" onClick={() => setNotice('')} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <QuotationDeletionRequests requests={actionableDeletionRequests} onDecided={handleDeletionDecided} />

      {/* Status quick filters (scrolls sideways on phones) */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        <StatusChip
          label="All offers"
          count={merged.length}
          active={!filters.bucket}
          onClick={() => setFilters((f) => ({ ...f, bucket: '' }))}
        />
        {OFFER_BUCKETS.map((b) => (
          <StatusChip
            key={b.id}
            label={b.label}
            count={bucketCounts[b.id]}
            color={b.color}
            active={filters.bucket === b.id}
            onClick={() => setFilters((f) => ({ ...f, bucket: f.bucket === b.id ? '' : b.id }))}
          />
        ))}
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2">
          <label className="flex-1 basis-full sm:basis-[260px] min-w-0">
            <span className={lbl}>Search</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                className={`${ctl} pl-8`}
                value={filters.search}
                onChange={setFilter('search')}
                placeholder="Offer no, client, contact, e-mail, scope…"
              />
            </div>
          </label>
          <label className="w-[calc(50%-5px)] sm:w-[190px]">
            <span className={lbl}>Offer status</span>
            <select className={ctl} value={filters.bucket} onChange={setFilter('bucket')}>
              <option value="">All</option>
              {OFFER_BUCKETS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="w-[calc(50%-5px)] sm:w-[120px]">
            <span className={lbl}>Offer type</span>
            <select className={ctl} value={filters.offerType} onChange={setFilter('offerType')}>
              <option value="">All</option>
              {options.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="w-[calc(25%-8px)] sm:w-[96px]">
            <span className={lbl}>FY</span>
            <select className={ctl} value={filters.fy} onChange={setFilter('fy')}>
              <option value="">All</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="w-[calc(25%-8px)] sm:w-[96px]">
            <span className={lbl}>Quarter</span>
            <select className={ctl} value={filters.quarter} onChange={setFilter('quarter')}>
              <option value="">All</option>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          <label className="w-[calc(50%-5px)] sm:w-[150px]">
            <span className={lbl}>Offer date from</span>
            <input type="date" className={ctl} value={filters.dateFrom} onChange={setFilter('dateFrom')} />
          </label>
          <label className="w-[calc(50%-5px)] sm:w-[150px]">
            <span className={lbl}>Offer date to</span>
            <input type="date" className={ctl} value={filters.dateTo} onChange={setFilter('dateTo')} />
          </label>
          <div className="w-full sm:w-auto">
            <button
              type="button"
              disabled={activeFilterCount === 0}
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FilterX className="h-4 w-4" /> Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      {editedCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {editedCount} row{editedCount === 1 ? '' : 's'} edited on this screen only — saving to the database is not
          connected yet, so these changes are lost on refresh.
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)] min-h-[240px]">
          <table
            className="qm-master-table min-w-full text-[13px]"
            style={{ '--table-pad-y': '7px', '--table-pad-x': '10px' }}
          >
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="text-left whitespace-nowrap">
                  SR No
                </th>
                {MASTER_COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap ${
                        c.type === 'money' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${active ? 'text-blue-700' : ''}`}
                        title={`Sort by ${c.label}`}
                      >
                        {c.label}
                        <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
                      </button>
                    </th>
                  );
                })}
                <th className="qm-sticky-col sticky right-0 z-30 text-center whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={MASTER_COLUMNS.length + 2} className="py-16 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 inline-block" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={MASTER_COLUMNS.length + 2} className="py-12 text-center text-slate-500">
                    {merged.length === 0
                      ? 'No quotations yet. Create one from Make a Quotation.'
                      : 'No quotations match these filters.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const fromMaker = Boolean(r.quotation_type);
                  return (
                    <tr key={r.id}>
                      <td className="!min-w-0 w-12 text-slate-500 tabular-nums">
                        {pageStart + i + 1}
                      </td>
                      {MASTER_COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className={`${c.width || ''} ${
                            c.nowrap || c.type === 'date' || c.type === 'money' || c.type === 'status' ? 'whitespace-nowrap' : ''
                          } ${c.type === 'money' ? 'text-right tabular-nums' : ''} ${
                            c.strong ? 'font-medium text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          <Cell column={c} value={cellValue(r, c.key)} />
                        </td>
                      ))}
                      <td className="qm-sticky-col sticky right-0 z-10">
                        <div className="flex items-center justify-center gap-1">
                          <IconBtn title="View" onClick={() => setViewingId(r.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            title={fromMaker ? 'Edit quotation (Make a Quotation)' : 'Not created in Make a Quotation'}
                            disabled={!fromMaker}
                            onClick={() => openMaker(r.id)}
                          >
                            <FilePenLine className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="Edit details" onClick={() => setEditing(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            title={
                              canDeleteDirectly
                                ? 'Delete quotation'
                                : pendingDeletionIds.has(r.id)
                                  ? 'Deletion waiting for L1 approval'
                                  : 'Request deletion (needs L1 approval)'
                            }
                            disabled={!canDeleteDirectly && pendingDeletionIds.has(r.id)}
                            onClick={() => askDelete(r)}
                          >
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

        {/* Footer: totals + pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {sorted.length === 0
                ? '0 results'
                : `${pageStart + 1}–${Math.min(pageStart + pageSize, sorted.length)} of ${sorted.length}`}
              {sorted.length !== merged.length ? ` (filtered from ${merged.length})` : ''}
            </span>
            <span>
              Quoted value: <b className="text-slate-900 tabular-nums">₹ {formatMoneyIn(filteredValue)}</b>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              Rows
              <select
                className="h-7 px-1.5 border border-slate-200 rounded-md bg-white text-xs"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <IconBtn title="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </IconBtn>
            <span className="tabular-nums">
              {safePage} / {pageCount}
            </span>
            <IconBtn title="Next page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </div>
      </div>

      {editing ? (
        <EditDetailsModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => onSaveDetails(editing.id, patch)}
        />
      ) : null}

      {viewingRow ? (
        <QuotationViewDrawer
          row={viewingRow}
          onClose={() => setViewingId(null)}
          onEditQuotation={viewingRow.quotation_type ? () => openMaker(viewingRow.id) : null}
          onEditDetails={() => {
            setEditing(viewingRow);
          }}
        />
      ) : null}

      <QuotationMasterImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          void load();
        }}
      />

      <Modal
        open={Boolean(deleteAsk)}
        title="Request quotation deletion"
        onClose={() => {
          if (!deleteBusy) setDeleteAsk(null);
        }}
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => setDeleteAsk(null)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => void submitDeletionRequest()}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-rose-600 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Send for L1 approval
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-[13px]">
          <p className="m-0 text-slate-600">
            Deleting{' '}
            <span className="font-semibold text-slate-900">
              {deleteAsk?.offer_no || deleteAsk?.client_name || 'this quotation'}
            </span>{' '}
            needs your L1 manager’s approval. The quotation stays until they approve.
          </p>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Reason (optional)
            </span>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-200"
              rows={3}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Why should this quotation be deleted?"
              disabled={deleteBusy}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function StatusChip({ label, count, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {label}
      <span
        className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
          active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function toInputValue(field, row) {
  const v = cellValue(row, field.key);
  if (v == null) return '';
  if (field.type === 'date') return normalizeToIsoDate(v) || '';
  return String(v);
}

function EditDetailsModal({ row, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, toInputValue(f, row)]))
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const statusOptions = OFFER_STATUS_OPTIONS.includes(form.offer_status)
    ? OFFER_STATUS_OPTIONS
    : [form.offer_status, ...OFFER_STATUS_OPTIONS].filter(Boolean);

  const submit = (e) => {
    e.preventDefault();
    const patch = { ...form };
    patch.quoted_rate = form.quoted_rate === '' ? null : Number(form.quoted_rate);
    onSave(patch);
  };

  const input =
    'h-9 w-full px-2.5 border border-slate-200 rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-3 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Edit details</h3>
            <p className="text-xs text-slate-500 truncate">{row.offer_no || 'Quotation'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {DETAIL_FIELDS.map((f) => {
            const full = f.key === 'scope' || f.key === 'remark';
            return (
              <label key={f.key} className={full ? 'sm:col-span-2' : ''}>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{f.label}</span>
                {f.type === 'status' ? (
                  <select className={input} value={form[f.key]} onChange={set(f.key)}>
                    <option value="">—</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : full ? (
                  <textarea
                    className={`${input} h-auto py-2`}
                    rows={3}
                    value={form[f.key]}
                    onChange={set(f.key)}
                  />
                ) : (
                  <input
                    className={input}
                    type={f.type === 'date' ? 'date' : f.type === 'money' ? 'number' : f.key === 'email_id' ? 'email' : 'text'}
                    step={f.type === 'money' ? '0.01' : undefined}
                    value={form[f.key]}
                    onChange={set(f.key)}
                  />
                )}
              </label>
            );
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Changes show in the table only — not saved to the database yet.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700">
              Apply
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
