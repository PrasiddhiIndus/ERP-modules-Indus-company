import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, LayoutDashboard, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  flattenEnquiryRow,
  getEnquiryFieldValue,
  packEnquiryUpdate,
  projectsErrorMsg,
  projectsTable,
} from '../../../services/projectsApi';
import { formatDateDdMmYyyy, normalizeToIsoDate } from '../../../utils/dateDisplay';
import EnquiryExportModal from './EnquiryExportModal';
import {
  DAYS_LEFT_COLUMN_WIDTH,
  displayTableCellValue,
  exportEnquiryDatabaseCsv,
  getEnquiryTableWidth,
  getTableColumnLayout,
  isCompactTableColumn,
  isTableColumnLeftAligned,
} from './enquiryDatabaseExport';
import EnquiryImportPanel from './EnquiryImportPanel';
import { getRowStatusValue, getStatusBg, getStatusRank, STATUS_LEGEND } from './enquiryStatusStyles';
import { useEnquiryFieldDefinitions } from './useEnquiryFieldDefinitions';
import { useProjectsEnquiryDropdowns } from './useProjectsEnquiryDropdowns';
import EnquiryFieldInput from './EnquiryFieldInput';
import EnquiryEntry from './EnquiryEntry';
import EnquiryDeletionRequests from './EnquiryDeletionRequests';
import { deletionErrorMessage, listPendingDeletionRequests, requestEnquiryDeletion } from './enquiryDeletionApi';
import { isEnquiryApprover } from './enquiryRoles';
import { useAuth } from '../../../contexts/AuthContext';
import { Modal } from '../../adminOperations/components/AdminUi';
import {
  daysLeftBadge,
  orderAssignmentFields,
  TARGET_BASIS_KEY,
  withAutoTargetDate,
  getDaysLeft,
  isClosedStatus,
  isCompletedStatus,
  startOfToday,
  todayIso,
} from './enquiryDeadlines';

const DAYS_LEFT_KEY = '__days_left';

const inputCls =
  'w-full min-h-[42px] py-2.5 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function SortIndicator({ fieldKey, sortConfig }) {
  const active = sortConfig.key === fieldKey;
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
      <span style={{ color: active && sortConfig.dir === 'asc' ? 'var(--success)' : 'var(--border-strong)' }}>▲</span>
      <span style={{ color: active && sortConfig.dir === 'desc' ? 'var(--critical)' : 'var(--border-strong)' }}>▼</span>
    </span>
  );
}

export default function EnquiryDatabase() {
  const location = useLocation();
  const navigate = useNavigate();
  const dashboardView = location.state?.dashboardView || null;
  const dashboardIds = useMemo(
    () => (Array.isArray(dashboardView?.ids) ? new Set(dashboardView.ids) : null),
    [dashboardView]
  );
  const clearDashboardView = () => navigate(location.pathname, { replace: true, state: null });
  const [addOpen, setAddOpen] = useState(Boolean(location.state?.openAddEnquiry));
  const [savedNotice, setSavedNotice] = useState('');
  const { userProfile } = useAuth();
  const canDeleteDirectly = isEnquiryApprover(userProfile);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deleteAsk, setDeleteAsk] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
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
  const [exportOpen, setExportOpen] = useState(false);

  const editableFields = useMemo(
    () => orderAssignmentFields(databaseFields.filter((f) => !f.read_only)),
    [databaseFields]
  );
  const hasTargetColumn = useMemo(
    () => databaseFields.some((f) => f.field_key === 'target_date'),
    [databaseFields]
  );

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
      setError(projectsErrorMsg(err, 'Load enquiries'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeletionRequests = useCallback(async () => {
    setDeletionRequests(await listPendingDeletionRequests());
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { fetchDeletionRequests(); }, [fetchDeletionRequests]);

  const pendingDeletionIds = useMemo(
    () => new Set(deletionRequests.map((r) => r.enquiry_id).filter(Boolean)),
    [deletionRequests]
  );
  const serialById = useMemo(() => new Map(rows.map((r) => [r.id, r.serial_number])), [rows]);

  useEffect(() => {
    if (location.state?.openAddEnquiry) setAddOpen(true);
  }, [location.state]);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    if (location.state?.openAddEnquiry) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const handleEnquirySaved = useCallback(
    (saved) => {
      closeAdd();
      setSavedNotice(saved?.serial_number ? `Enquiry #${saved.serial_number} saved.` : 'Enquiry saved.');
      fetchRows();
    },
    [closeAdd, fetchRows]
  );

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

    if (dashboardIds) {
      list = list.filter((row) => dashboardIds.has(row.id));
    }

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
    const rankOf = (row) => getStatusRank(getRowStatusValue(row));
    if (sortConfig.key === 'current_status') {
      // First click (desc) keeps Not Started on top; the other direction puts Completed first.
      return [...list].sort((a, b) => (rankOf(a) - rankOf(b)) * -dir || (b.serial_number ?? 0) - (a.serial_number ?? 0));
    }
    const compare = (a, b) => {
      let av, bv;
      if (sortConfig.key === 'serial_number') {
        av = a.serial_number ?? 0;
        bv = b.serial_number ?? 0;
        return (av - bv) * dir;
      }
      if (sortConfig.key === DAYS_LEFT_KEY) {
        const today = startOfToday();
        const da = isClosedStatus(getRowStatusValue(a)) ? null : getDaysLeft(a, today);
        const db = isClosedStatus(getRowStatusValue(b)) ? null : getDaysLeft(b, today);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return (da - db) * dir;
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
    };
    return [...list].sort((a, b) => rankOf(a) - rankOf(b) || compare(a, b));
  }, [rows, search, statusFilter, sortConfig, databaseFields, dashboardIds]);

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
      const lockedAssignedOn = getEnquiryFieldValue(rows.find((r) => r.id === editDraft.id), TARGET_BASIS_KEY);
      if (lockedAssignedOn) data[TARGET_BASIS_KEY] = lockedAssignedOn;
      if (isCompletedStatus(data.current_status) && !data.completed_on) {
        const original = rows.find((r) => r.id === editDraft.id);
        const wasCompleted = isCompletedStatus(getRowStatusValue(original));
        data.completed_on = (wasCompleted && original?.data?.completed_on) || todayIso();
      }
      const { error: e } = await projectsTable('enquiries').update({ data }).eq('id', editDraft.id);
      if (e) throw e;
      await fetchRows();
      cancelEdit();
    } catch (err) {
      setError(projectsErrorMsg(err, 'Update enquiry'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row) => {
    if (!canDeleteDirectly) {
      setDeleteReason('');
      setDeleteAsk(row);
      return;
    }
    if (!window.confirm('Delete this enquiry record?')) return;
    try {
      const { error: e } = await projectsTable('enquiries').delete().eq('id', row.id);
      if (e) throw e;
      await Promise.all([fetchRows(), fetchDeletionRequests()]);
    } catch (err) {
      setError(projectsErrorMsg(err, 'Delete enquiry'));
    }
  };

  const submitDeletionRequest = async () => {
    if (!deleteAsk) return;
    setDeleteBusy(true);
    try {
      await requestEnquiryDeletion(deleteAsk.id, deleteReason.trim());
      setSavedNotice(`Deletion of enquiry #${deleteAsk.serial_number} sent to your manager for approval.`);
      setDeleteAsk(null);
      await fetchDeletionRequests();
    } catch (err) {
      setError(deletionErrorMessage(err, 'Could not send the deletion request. Please try again.'));
      setDeleteAsk(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeletionDecided = async (message) => {
    setSavedNotice(message);
    await Promise.all([fetchRows(), fetchDeletionRequests()]);
  };

  const handleExport = (selectedKeys) => {
    exportEnquiryDatabaseCsv(
      sortedFiltered,
      databaseFields,
      selectedKeys,
      `projects-enquiry-database-${formatDateDdMmYyyy(new Date()).replace(/\//g, '-')}.csv`
    );
  };

  const tableLoading = loading || fieldsLoading;
  const today = startOfToday();
  const savedAssignedOn = editingId
    ? getEnquiryFieldValue(rows.find((r) => r.id === editingId), TARGET_BASIS_KEY)
    : '';

  if (addOpen) {
    return (
      <div className="p-4 sm:p-6">
        <EnquiryEntry onSaved={handleEnquirySaved} onClose={closeAdd} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {(error || fieldsError) && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error || fieldsError}
        </div>
      )}

      {canDeleteDirectly && (
        <EnquiryDeletionRequests
          requests={deletionRequests}
          serialById={serialById}
          onDecided={handleDeletionDecided}
        />
      )}

      <Modal
        open={Boolean(deleteAsk)}
        title={`Request deletion of enquiry #${deleteAsk?.serial_number ?? ''}`}
        onClose={() => !deleteBusy && setDeleteAsk(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => setDeleteAsk(null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteBusy}
              onClick={submitDeletionRequest}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send for approval
            </button>
          </div>
        }
      >
        <p className="mb-3 text-gray-700">
          Your manager must approve before this enquiry is deleted. It stays in the list until then.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Reason (optional)</span>
          <textarea
            rows={3}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className={inputCls}
            placeholder="e.g. Duplicate entry"
          />
        </label>
      </Modal>

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
            <option value="">All status</option>
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
            <option value={DAYS_LEFT_KEY}>Days left</option>
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
            onClick={() => { setSavedNotice(''); setAddOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Enquiry
          </button>
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
            onClick={() => setExportOpen(true)}
            disabled={!sortedFiltered.length || !databaseFields.length}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedNotice}</span>
          <button
            type="button"
            onClick={() => setSavedNotice('')}
            className="ml-auto p-1 rounded hover:bg-emerald-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {dashboardView && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>
            Showing <strong>{dashboardView.label}</strong> enquiries from the dashboard
            {dashboardIds ? ` (${dashboardIds.size})` : ''}
          </span>
          <button
            type="button"
            onClick={clearDashboardView}
            className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 hover:bg-blue-100"
          >
            <X className="h-3 w-3" />
            Show all enquiries
          </button>
        </div>
      )}

      <EnquiryExportModal
        open={exportOpen}
        databaseFields={databaseFields}
        onClose={() => setExportOpen(false)}
        onExport={handleExport}
      />

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
            {editableFields.map((field) => {
              const locked = field.field_key === TARGET_BASIS_KEY && Boolean(savedAssignedOn);
              return (
                <label key={field.id} className="text-xs">
                  <span className="font-medium text-gray-600">{field.label}</span>
                  <div className="mt-1">
                    <EnquiryFieldInput
                      field={locked ? { ...field, read_only: true } : field}
                      value={editDraft[field.field_key]}
                      onChange={(v) =>
                        setEditDraft((prev) => {
                          const next = { ...prev, [field.field_key]: v };
                          return field.field_key === TARGET_BASIS_KEY ? withAutoTargetDate(next) : next;
                        })
                      }
                      valuesForKindKey={valuesForKindKey}
                      valuesForKindId={valuesForKindId}
                      className={`w-full min-w-[8rem] px-2 py-1.5 text-xs border border-gray-200 rounded-md ${
                        locked ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'bg-white'
                      }`}
                    />
                  </div>
                  {locked && <p className="mt-0.5 text-[10px] text-gray-500">Locked after it was saved</p>}
                </label>
              );
            })}
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
      <div className="rounded-xl border border-gray-300 overflow-hidden bg-info-soft">
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
              <div className="overflow-auto max-h-[75vh]">
                <table
                  className="text-xs border-collapse"
                  style={{ tableLayout: 'fixed', width: getEnquiryTableWidth(databaseFields, { withDaysLeft: hasTargetColumn }) }}
                >
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {databaseFields.map((col) => {
                        const layout = getTableColumnLayout(col);
                        const leftHeader = isTableColumnLeftAligned(col) && !layout.compact && !layout.wrapContent;
                        return (
                          <React.Fragment key={col.id}>
                            <th
                              style={layout.style}
                              className={`font-bold text-black border-b border-r border-gray-200 bg-info-soft ${layout.headerClass} ${
                                leftHeader ? 'text-left' : 'text-center'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(col.field_key)}
                                className={`w-full font-bold text-black text-[11px] leading-[1.2] flex items-center gap-1 whitespace-normal break-words ${
                                  leftHeader ? 'justify-start text-left' : 'justify-center text-center'
                                }`}
                              >
                                <span>{col.label}</span>
                                <SortIndicator fieldKey={col.field_key} sortConfig={sortConfig} />
                              </button>
                            </th>
                            {col.field_key === 'target_date' && (
                              <th
                                style={{ width: DAYS_LEFT_COLUMN_WIDTH, minWidth: DAYS_LEFT_COLUMN_WIDTH }}
                                className="font-bold text-black border-b border-r border-gray-200 bg-info-soft whitespace-normal leading-[1.15] text-center px-2 py-2.5 align-middle"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleSort(DAYS_LEFT_KEY)}
                                  className="w-full font-bold text-black text-[11px] leading-[1.2] flex items-center justify-center gap-1"
                                  title="Days from today to the target date"
                                >
                                  <span>Days Left</span>
                                  <SortIndicator fieldKey={DAYS_LEFT_KEY} sortConfig={sortConfig} />
                                </button>
                              </th>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <th
                        style={{ width: 68, minWidth: 68, maxWidth: 68 }}
                        className="font-bold text-black border-b border-gray-200 bg-info-soft whitespace-normal leading-[1.15] break-words text-center px-1 py-2 align-middle"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFiltered.map((row) => {
                      const bg = getStatusBg(getRowStatusValue(row));
                      const daysLeft = daysLeftBadge(row, today);
                      return (
                        <tr
                          key={row.id}
                          style={{ backgroundColor: bg }}
                          className="border-b border-black/5 transition-colors"
                        >
                          {databaseFields.map((col) => {
                            const left = isTableColumnLeftAligned(col);
                            const layout = getTableColumnLayout(col);
                            const value = displayTableCellValue(col, row);
                            const compact = isCompactTableColumn(col);
                            const wrapContent = layout.wrapContent;
                            return (
                              <React.Fragment key={col.id}>
                              <td
                                style={{ ...layout.style, backgroundColor: bg }}
                                className={`py-2 align-top text-gray-800 border-r border-black/5 ${layout.cellClass} ${
                                  (left && !compact) || wrapContent ? 'text-left' : 'text-center'
                                }`}
                              >
                                {col.field_type === 'textarea' ? (
                                  <span
                                    className="line-clamp-3 block whitespace-normal break-words"
                                    title={String(getEnquiryFieldValue(row, col.field_key) || '')}
                                  >
                                    {value}
                                  </span>
                                ) : wrapContent ? (
                                  <span className="block break-all whitespace-normal">{value}</span>
                                ) : (
                                  <span
                                    className={`block ${
                                      compact || col.field_type === 'date' || col.field_key === 'serial_number'
                                        ? 'truncate whitespace-nowrap'
                                        : 'whitespace-normal break-words'
                                    }`}
                                    title={String(getEnquiryFieldValue(row, col.field_key) || '')}
                                  >
                                    {value}
                                  </span>
                                )}
                              </td>
                              {col.field_key === 'target_date' && (
                                <td
                                  style={{ width: DAYS_LEFT_COLUMN_WIDTH, backgroundColor: bg }}
                                  className="py-2 px-2 align-top text-center border-r border-black/5"
                                >
                                  <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${daysLeft.className}`}
                                    title={daysLeft.title}
                                  >
                                    {daysLeft.label}
                                  </span>
                                </td>
                              )}
                              </React.Fragment>
                            );
                          })}
                          <td
                            className="py-2 whitespace-nowrap text-center border-l border-black/5 px-1"
                            style={{ backgroundColor: bg, width: 68 }}
                          >
                            <div className="inline-flex gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEdit(row)}
                                className="p-1 rounded text-blue-700 hover:bg-blue-100"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRow(row)}
                                disabled={!canDeleteDirectly && pendingDeletionIds.has(row.id)}
                                className="p-1 rounded text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                title={
                                  pendingDeletionIds.has(row.id)
                                    ? 'Deletion waiting for manager approval'
                                    : canDeleteDirectly
                                      ? 'Delete'
                                      : 'Request deletion (needs manager approval)'
                                }
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
