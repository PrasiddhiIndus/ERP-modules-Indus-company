import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FilePenLine,
  FilterX,
  History,
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
import {
  canTransitionStatus,
  fetchQuotations,
  fiscalYearFromDate,
  LAST_FOLLOWUP_OVERDUE_DAYS,
  lastFollowupOverdueDays,
  updateQuotationMasterDetails,
} from '../../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../../utils/dateDisplay';
import {
  OFFER_BUCKETS,
  OFFER_STATUS_OPTIONS,
  QUOTATION_BASE,
  formatDisplayDate,
  offerBucketOf,
  orderQuarterLabel,
  localTodayIso,
} from '../quotationConstants';
import { formatMoneyIn } from './quotationMakerModel';
import { Cell, DETAIL_FIELDS, EDITABLE_DETAIL_KEYS, GRID_COLUMNS, cellValue } from './quotationMasterColumns.jsx';
import QuotationMasterImportModal from './QuotationMasterImportModal';
import QuotationViewDrawer from './QuotationViewDrawer';
import QuotationDeletionRequests from './QuotationDeletionRequests';
import QuotationOrderLostRequests from './QuotationOrderLostRequests';
import QuotationOrderLostMyStatus from './QuotationOrderLostMyStatus';
import {
  deleteQuotationAsSuperAdmin,
  deletionErrorMessage,
  listPendingQuotationDeletionRequests,
  requestQuotationDeletion,
} from '../quotationDeletionApi';
import {
  ORDER_LOST_STATUS,
  listMyOrderLostRequests,
  listPendingOrderLostRequests,
  needsOrderLostApproval,
  orderLostErrorMessage,
  requestOrderLost,
} from '../quotationOrderLostApi';
import { Modal } from '../../../../components/erpUi';
import ProjectActivityLog from '../../activityLog/ProjectActivityLog';
import { ACTIVITY_ENTITY } from '../../activityLog/projectActivityLogApi';
import './quotationMaker.css';
import { confirmDialog } from "../../../../lib/dialog";

const PAGE_SIZES = [25, 50, 100];

/** Field names shown in the Activity Log (anything else is shown as Title Case). */
const HISTORY_FIELD_LABELS = {
  ...Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, f.label])),
  maker_status: 'Quotation (maker) status',
  grand_total: 'Grand total',
  revision_no: 'Revision no.',
};

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

const HOLD_STATUS = 'Client Has Hold Enquiry';
/** Shown once per browser session per day when follow-ups are overdue. */
const FOLLOWUP_POPUP_KEY = 'projects-quotation-followup-exceeded-shown';
/** Survives remounts (e.g. auth refresh) so Edit details is not lost mid-typing. */
const EDIT_DRAFT_KEY = 'projects-quotation-master-edit-draft';

function readEditDraft() {
  try {
    const raw = sessionStorage.getItem(EDIT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.quotationId || !parsed?.form || typeof parsed.form !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEditDraft(payload) {
  try {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

function clearEditDraft() {
  try {
    sessionStorage.removeItem(EDIT_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const EMPTY_FILTERS = {
  search: '',
  bucket: '',
  offerType: '',
  enquiryFrom: '',
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
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const canDeleteDirectly = isSuperAdminRole(userProfile);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [orderLostRequests, setOrderLostRequests] = useState([]);
  const [myOrderLostRequests, setMyOrderLostRequests] = useState([]);
  const [deleteAsk, setDeleteAsk] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyRow, setHistoryRow] = useState(null);
  const [tab, setTab] = useState('all'); // 'all' | 'overdue'
  const [today, setToday] = useState(() => localTodayIso());
  const [followupPopup, setFollowupPopup] = useState(false);

  // Overdue is worked out from today's date: refresh it so the tab stays right past midnight.
  useEffect(() => {
    const t = setInterval(() => setToday(localTodayIso()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

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

  /** Re-open Edit details after an unexpected remount (draft kept in sessionStorage). */
  useEffect(() => {
    if (loading || editing || !rows.length) return;
    const draft = readEditDraft();
    if (!draft?.quotationId) return;
    const row = rows.find((r) => r.id === draft.quotationId);
    if (row) setEditing(row);
  }, [loading, rows, editing]);

  /** Deep-link from quotation status notification → open View drawer. */
  useEffect(() => {
    const openId = location.state?.openQuotationId;
    if (!openId || loading) return;
    const exists = rows.some((r) => r.id === openId);
    if (exists || rows.length > 0) {
      if (exists) setViewingId(openId);
      navigate(`${QUOTATION_BASE}/quotation-list`, { replace: true, state: {} });
    }
  }, [location.state, loading, rows, navigate]);

  useEffect(() => {
    void loadDeletionRequests();
  }, [loadDeletionRequests]);

  const loadOrderLostRequests = useCallback(async () => {
    const [pending, mine] = await Promise.all([
      listPendingOrderLostRequests(),
      listMyOrderLostRequests(),
    ]);
    setOrderLostRequests(pending);
    setMyOrderLostRequests(mine);
  }, []);

  useEffect(() => {
    void loadOrderLostRequests();
  }, [loadOrderLostRequests]);

  const pendingOrderLostIds = useMemo(
    () =>
      new Set(
        [...orderLostRequests, ...myOrderLostRequests]
          .filter((r) => r.status === 'pending' || !r.status)
          .map((r) => r.quotation_id)
          .filter(Boolean)
      ),
    [orderLostRequests, myOrderLostRequests]
  );

  /** L1 / admin queue — the requester's own pending items are flagged on the row instead. */
  const actionableOrderLostRequests = useMemo(
    () => orderLostRequests.filter((r) => r.requested_by && r.requested_by !== user?.id),
    [orderLostRequests, user?.id]
  );

  const handleOrderLostDecided = async (message) => {
    setNotice(message);
    await Promise.all([load(), loadOrderLostRequests()]);
  };

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

  const merged = rows;

  /** Open offers more than LAST_FOLLOWUP_OVERDUE_DAYS days past their Last Follow-up Date. */
  const overdueDays = useMemo(() => {
    const map = new Map();
    for (const r of merged) {
      const d = lastFollowupOverdueDays(r, today);
      if (d) map.set(r.id, d);
    }
    return map;
  }, [merged, today]);

  useEffect(() => {
    // Never cover the Edit details window with the overdue follow-up popup.
    if (loading || editing || !overdueDays.size) return;
    try {
      if (sessionStorage.getItem(FOLLOWUP_POPUP_KEY) === today) return;
      sessionStorage.setItem(FOLLOWUP_POPUP_KEY, today);
    } catch {
      /* storage unavailable — still show once for this mount */
    }
    setFollowupPopup(true);
  }, [loading, editing, overdueDays.size, today]);

  const options = useMemo(() => {
    const types = new Set();
    const years = new Set();
    const enquiryFrom = new Set();
    for (const r of merged) {
      const t = cellValue(r, 'offer_type');
      if (t) types.add(t);
      const y = rowFiscalYear(r);
      if (y) years.add(y);
      const from = String(r.enquiry_received_from || '').trim();
      if (from) enquiryFrom.add(from);
    }
    const sorted = (s) => [...s].sort((a, b) => a.localeCompare(b));
    return {
      types: sorted(types),
      years: [...years].sort().reverse(),
      enquiryFrom: sorted(enquiryFrom),
    };
  }, [merged]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return merged.filter((r) => {
      if (tab === 'overdue' && !overdueDays.has(r.id)) return false;
      if (filters.bucket && offerBucketOf(r.offer_status) !== filters.bucket) return false;
      if (filters.offerType && cellValue(r, 'offer_type') !== filters.offerType) return false;
      if (filters.enquiryFrom && String(r.enquiry_received_from || '').trim() !== filters.enquiryFrom) return false;
      if (filters.quarter && !String(cellValue(r, 'quarter')).startsWith(`${filters.quarter} `)) return false;
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
  }, [merged, filters, tab, overdueDays]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = GRID_COLUMNS.find((c) => c.key === sort.key);
    if (!col) return filtered;
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
  }, [filters, pageSize, sort, tab]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const activeFilterCount = Object.entries(filters).filter(([, v]) => v).length;

  const toggleSort = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' }));

  const openMaker = (id) => navigate(`${QUOTATION_BASE}/quotation-entry?id=${id}`);

  const onSaveDetails = async (id, patch, previousStatus, statusReason = '') => {
    setSavingDetails(true);
    setError('');
    try {
      const reason = String(statusReason || '').trim();
      const wantsOrderLost = patch.offer_status === ORDER_LOST_STATUS && previousStatus !== ORDER_LOST_STATUS;
      if (wantsOrderLost && !reason) throw new Error('Enter the reason for Order Lost.');
      if (
        wantsOrderLost &&
        previousStatus &&
        !canTransitionStatus(previousStatus, ORDER_LOST_STATUS, userProfile)
      ) {
        throw new Error(`Cannot move from "${previousStatus}" to "${ORDER_LOST_STATUS}". Follow the offer workflow.`);
      }

      if (needsOrderLostApproval(previousStatus, patch.offer_status, userProfile)) {
        // The offer status stays as it is until L1 approves; follow-up date + remark save now.
        try {
          await requestOrderLost(id, reason);
        } catch (err) {
          throw new Error(orderLostErrorMessage(err, 'Could not send the Order Lost request. Please try again.'));
        }
        const saved = await updateQuotationMasterDetails(
          id,
          { ...patch, offer_status: previousStatus || patch.offer_status },
          { previousStatus, profile: userProfile }
        );
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...saved } : r)));
        clearEditDraft();
        setEditing(null);
        setNotice(
          `Order Lost for ${saved.offer_no || 'the quotation'} sent to your L1 manager for approval. The offer status stays "${
            previousStatus || '—'
          }" until it is approved.`
        );
        await loadOrderLostRequests();
        return;
      }

      // Lost (Super Admin) / Hold: applies directly; the reason goes into the remark (as the Board does).
      const saved = await updateQuotationMasterDetails(id, patch, {
        previousStatus,
        statusRemark: patch.offer_status !== previousStatus ? reason : '',
        profile: userProfile,
      });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...saved } : r)));
      clearEditDraft();
      setEditing(null);
      setNotice(`Saved details for ${saved.offer_no || 'quotation'}.`);
      if (wantsOrderLost) await loadOrderLostRequests();
    } catch (err) {
      const message = err?.message || 'Could not save quotation details.';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSavingDetails(false);
    }
  };

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
          <p className="text-xs text-slate-600 mt-1.5 m-0">
            Quoted value:{' '}
            <b className="text-slate-900 tabular-nums">₹ {formatMoneyIn(filteredValue)}</b>
          </p>
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
      <QuotationOrderLostRequests requests={actionableOrderLostRequests} onDecided={handleOrderLostDecided} />
      <QuotationOrderLostMyStatus requests={myOrderLostRequests} />

      {/* All / Overdue follow-up tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {[
          { id: 'all', label: 'All quotations', count: merged.length },
          { id: 'overdue', label: 'Overdue', count: overdueDays.size, alert: true },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium ${
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
            title={t.alert ? `Open offers more than ${LAST_FOLLOWUP_OVERDUE_DAYS} days after the Last Follow-up Date` : undefined}
          >
            {t.alert ? <Clock className="h-3.5 w-3.5" /> : null}
            {t.label}
            <span
              className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                t.alert && t.count ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>
      {tab === 'overdue' ? (
        <p className="m-0 text-xs text-slate-600">
          Open offers whose Last Follow-up Date is more than {LAST_FOLLOWUP_OVERDUE_DAYS} days ago (converted and lost
          offers are not included). Update the follow-up date with Edit details to clear one.
        </p>
      ) : null}

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
          <label className="w-[calc(50%-5px)] sm:w-[200px]">
            <span className={lbl}>Enquiry received from</span>
            <select className={ctl} value={filters.enquiryFrom} onChange={setFilter('enquiryFrom')}>
              <option value="">All</option>
              {options.enquiryFrom.map((v) => (
                <option key={v} value={v}>
                  {v}
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

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)] min-h-[240px]">
          <table
            className="qm-master-table w-max min-w-full text-[13px]"
            style={{ '--table-pad-y': '7px', '--table-pad-x': '10px' }}
          >
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="text-left whitespace-nowrap w-12">
                  SR No.
                </th>
                {GRID_COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap ${c.width || ''} ${
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
                <th className="qm-sticky-col sticky right-0 z-30 text-center whitespace-nowrap min-w-[168px] w-[168px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={GRID_COLUMNS.length + 2} className="py-16 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 inline-block" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={GRID_COLUMNS.length + 2} className="py-12 text-center text-slate-500">
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
                      <td className="w-12 text-slate-500 tabular-nums whitespace-nowrap">
                        {pageStart + i + 1}
                      </td>
                      {GRID_COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className={`${c.width || ''} ${
                            c.nowrap || c.type === 'date' || c.type === 'money' ? 'whitespace-nowrap' : ''
                          } ${c.type === 'money' ? 'text-right tabular-nums' : ''} ${
                            c.strong ? 'font-medium text-slate-900' : 'text-slate-700'
                          }`}
                        >
                          <div className="inline-flex flex-wrap items-center gap-1 max-w-full">
                            {c.key === 'client_name' ? (
                              <span className="break-words whitespace-normal" title={String(cellValue(r, c.key) ?? '')}>
                                <Cell column={c} value={cellValue(r, c.key)} />
                              </span>
                            ) : (
                              <Cell column={c} value={cellValue(r, c.key)} />
                            )}
                            {c.key === 'offer_status' && orderQuarterLabel(r) ? (
                              <span className="text-[11px] font-medium text-emerald-800 whitespace-nowrap" title="Financial quarter of the Order Status Date">
                                {orderQuarterLabel(r)}
                              </span>
                            ) : null}
                            {c.key === 'last_followup_date' && overdueDays.has(r.id) ? (
                              <span
                                className="inline-block rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 whitespace-nowrap"
                                title="Follow-up Date Exceeded"
                              >
                                {overdueDays.get(r.id)}d overdue
                              </span>
                            ) : null}
                            {c.key === 'offer_status' && pendingOrderLostIds.has(r.id) ? (
                              <span
                                className="inline-block rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 whitespace-nowrap"
                                title="Order Lost is waiting for L1 approval"
                              >
                                Lost: L1 pending
                              </span>
                            ) : null}
                          </div>
                        </td>
                      ))}
                      <td className="qm-sticky-col sticky right-0 z-10 min-w-[168px] w-[168px]">
                        <div className="flex items-center justify-center gap-1 flex-nowrap">
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
                          <IconBtn title="History / activity log" onClick={() => setHistoryRow(r)}>
                            <History className="h-3.5 w-3.5" />
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

        {/* Footer: result count + pagination (Quoted value is in the page header) */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
          <span>
            {sorted.length === 0
              ? '0 results'
              : `${pageStart + 1}–${Math.min(pageStart + pageSize, sorted.length)} of ${sorted.length}`}
            {sorted.length !== merged.length ? ` (filtered from ${merged.length})` : ''}
          </span>
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
          saving={savingDetails}
          onClose={() => {
            if (!savingDetails) setEditing(null);
          }}
          orderLostPending={pendingOrderLostIds.has(editing.id)}
          orderLostNeedsApproval={needsOrderLostApproval(editing.offer_status, ORDER_LOST_STATUS, userProfile)}
          onSave={(patch, reason) => onSaveDetails(editing.id, patch, editing.offer_status, reason)}
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

      <ProjectActivityLog
        open={Boolean(historyRow)}
        onClose={() => setHistoryRow(null)}
        entityType={ACTIVITY_ENTITY.QUOTATION}
        entityId={historyRow?.id}
        title={`History — ${historyRow?.offer_no || historyRow?.client_name || 'Quotation'}`}
        fieldLabels={HISTORY_FIELD_LABELS}
      />

      <QuotationMasterImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          // Refresh the grid; leave the modal open so skipped-row details stay visible.
          void load();
        }}
      />

      <Modal
        open={followupPopup}
        title="Follow-up Date Exceeded"
        onClose={() => setFollowupPopup(false)}
        widthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFollowupPopup(false)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => {
                setFollowupPopup(false);
                setTab('overdue');
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg bg-rose-600 text-[13px] font-semibold text-white hover:bg-rose-700"
            >
              <Clock className="h-4 w-4" /> Show overdue
            </button>
          </div>
        }
      >
        <p className="m-0 text-[13px] text-slate-700">
          <b>Follow-up Date Exceeded</b> for {overdueDays.size} open quotation{overdueDays.size === 1 ? '' : 's'}: more
          than {LAST_FOLLOWUP_OVERDUE_DAYS} days have passed since the Last Follow-up Date.
        </p>
      </Modal>

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

function EditDetailsModal({
  row,
  onClose,
  onSave,
  saving = false,
  orderLostPending = false,
  orderLostNeedsApproval = true,
}) {
  const baseline = useMemo(
    () => Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, toInputValue(f, row)])),
    [row]
  );
  const [form, setForm] = useState(() => {
    const draft = readEditDraft();
    if (draft?.quotationId === row.id && draft.form) {
      return { ...baseline, ...draft.form };
    }
    return baseline;
  });
  const [localError, setLocalError] = useState('');
  const [lostReason, setLostReason] = useState(() => {
    const draft = readEditDraft();
    return draft?.quotationId === row.id ? String(draft.lostReason || '') : '';
  });
  const choosingOrderLost = form.offer_status === ORDER_LOST_STATUS && row.offer_status !== ORDER_LOST_STATUS;
  const choosingHold = form.offer_status === HOLD_STATUS && row.offer_status !== HOLD_STATUS;
  const needsReason = choosingOrderLost || choosingHold;
  const editable = new Set(EDITABLE_DETAIL_KEYS);
  const statusChanged = form.offer_status !== (row.offer_status || '');
  const dirty =
    EDITABLE_DETAIL_KEYS.some((k) => String(form[k] ?? '') !== String(baseline[k] ?? '')) ||
    Boolean(String(lostReason || '').trim());
  /** Order Status Date / quarter as they will be after saving (date = today on a status change). */
  const previewRow = {
    ...row,
    offer_status: form.offer_status,
    order_converted_date: statusChanged ? localTodayIso() : row.order_converted_date,
  };
  const quarterPreview = orderQuarterLabel(previewRow);

  // Keep a browser draft so a remount (or accidental close) can restore what was typed.
  useEffect(() => {
    writeEditDraft({
      quotationId: row.id,
      form,
      lostReason,
      savedAt: Date.now(),
    });
  }, [row.id, form, lostReason]);

  const requestClose = useCallback(async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Discard changes?',
        message: 'You have unsaved offer details. Close without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    clearEditDraft();
    onClose();
  }, [saving, dirty, onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) void requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose, saving]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const statusOptions = OFFER_STATUS_OPTIONS.includes(form.offer_status)
    ? OFFER_STATUS_OPTIONS
    : [form.offer_status, ...OFFER_STATUS_OPTIONS].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setLocalError('');
    if (choosingOrderLost && orderLostPending) {
      setLocalError('An Order Lost request for this quotation is already waiting for L1 approval.');
      return;
    }
    if (needsReason && !lostReason.trim()) {
      setLocalError(choosingOrderLost ? 'Enter the reason for Order Lost.' : 'Enter the reason for putting the offer on Hold.');
      return;
    }
    const patch = {
      offer_status: form.offer_status,
      last_followup_date: form.last_followup_date,
      remark: form.remark ?? '',
    };
    try {
      await onSave(patch, needsReason ? lostReason.trim() : '');
    } catch (err) {
      setLocalError(err?.message || 'Could not save.');
    }
  };

  const input =
    'h-9 w-full px-2.5 border border-slate-200 rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-3 sm:p-4"
      // Backdrop does not close — keep the form open until Cancel / × / Escape (with confirm if dirty).
      role="presentation"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Edit details</h3>
            <p className="text-xs text-slate-500 truncate">
              {row.offer_no || 'Quotation'}
              {dirty ? <span className="ml-2 text-amber-700">· Unsaved changes</span> : null}
            </p>
          </div>
          <button type="button" onClick={() => void requestClose()} className="p-1.5 rounded-md hover:bg-slate-100" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {DETAIL_FIELDS.map((f) => {
            const full = f.key === 'scope' || f.key === 'remark';
            const locked = !editable.has(f.key);
            if (f.key === 'order_converted_date') {
              return (
                <label key={f.key}>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{f.label}</span>
                  <input
                    className={`${input} bg-slate-100 text-slate-600`}
                    readOnly
                    value={formatDisplayDate(previewRow.order_converted_date) || '—'}
                    title="Set automatically when the Offer Status changes"
                  />
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {statusChanged ? 'Will be set to today on save' : 'Updates automatically when the Offer Status changes'}
                    {quarterPreview ? ` · ${quarterPreview}` : ''}
                  </span>
                </label>
              );
            }
            return (
              <label key={f.key} className={full ? 'sm:col-span-2' : ''}>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {f.label}
                  {locked ? <span className="ml-1 normal-case font-normal text-slate-400">(read-only)</span> : null}
                </span>
                {f.type === 'status' ? (
                  <select className={input} value={form[f.key]} onChange={set(f.key)} disabled={saving}>
                    <option value="">—</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : full ? (
                  <textarea
                    className={`${input} h-auto py-2 ${locked ? 'bg-slate-100 text-slate-600' : ''}`}
                    rows={3}
                    value={form[f.key]}
                    onChange={set(f.key)}
                    disabled={saving}
                    readOnly={locked}
                  />
                ) : (
                  <input
                    className={`${input} ${locked ? 'bg-slate-100 text-slate-600' : ''}`}
                    readOnly={locked}
                    type={f.type === 'date' ? 'date' : f.type === 'money' ? 'number' : f.key === 'email_id' ? 'email' : 'text'}
                    step={f.type === 'money' ? '0.01' : undefined}
                    value={form[f.key]}
                    onChange={set(f.key)}
                    disabled={saving}
                  />
                )}
              </label>
            );
          })}
          {needsReason ? (
            <label className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-amber-900 mb-1">
                {choosingOrderLost ? 'Reason for Order Lost' : 'Reason for Hold'} <span className="text-rose-600">*</span>
              </span>
              <textarea
                className={`${input} h-auto py-2`}
                rows={3}
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g. price gap, competitor selected, client dropped the requirement…"
                disabled={saving || (choosingOrderLost && orderLostPending)}
              />
              <span className="mt-1 block text-[11px] text-amber-900">
                {choosingHold
                  ? 'Added to the remark when you save.'
                  : orderLostPending
                  ? 'An Order Lost request is already waiting for L1 approval.'
                  : orderLostNeedsApproval
                    ? `This goes to your L1 manager for approval. The offer status stays "${
                        row.offer_status || '—'
                      }" until it is approved; the follow-up date saves now.`
                    : 'Saved directly (Super Admin). The reason is added to the remark.'}
              </span>
            </label>
          ) : null}
        </div>
        {localError ? (
          <div className="mx-4 mb-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
            {localError}
          </div>
        ) : null}
        <div className="px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            Offer Status, Last Follow-up Date, and Remark can be changed on an existing quotation.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={saving}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 inline-flex items-center gap-1.5 px-4 rounded-lg bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving
                ? form.offer_status === ORDER_LOST_STATUS
                  ? 'Sending…'
                  : 'Saving…'
                : form.offer_status === ORDER_LOST_STATUS
                  ? 'Send for L1 Approval'
                  : 'Save'}
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
