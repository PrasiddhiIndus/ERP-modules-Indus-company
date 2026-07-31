import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  canTransitionStatus,
  daysBetween,
  fetchQuotations,
  projectsTable,
} from '../../../services/quotationApi';
import { BOARD_COLUMNS, formatCurrency, formatDisplayDate } from './quotationConstants';
import StatusBadge from './StatusBadge';
import QuotationDetailDrawer from './QuotationDetailDrawer';
import { getStatusStyle } from './quotationStatusStyles';

export default function QuotationBoard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [confirmMove, setConfirmMove] = useState(null);
  const [moveRemark, setMoveRemark] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchQuotations();
      setRows((data || []).filter((r) => !r.superseded && r.offer_status !== 'Superseded'));
    } catch (err) {
      setError(err?.message || 'Failed to load board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const byColumn = useMemo(() => {
    const map = {};
    for (const col of BOARD_COLUMNS) map[col.id] = [];
    for (const row of rows) {
      const col = BOARD_COLUMNS.find((c) => c.statuses.includes(row.offer_status));
      if (col) map[col.id].push(row);
    }
    return map;
  }, [rows]);

  const onDropColumn = (col) => {
    if (!draggingId) return;
    const row = rows.find((r) => r.id === draggingId);
    if (!row) return;
    const targetStatus = col.statuses[0];
    if (row.offer_status === targetStatus || col.statuses.includes(row.offer_status)) {
      setDraggingId(null);
      return;
    }
    if (!canTransitionStatus(row.offer_status, targetStatus)) {
      setError(`Cannot move from "${row.offer_status}" to "${targetStatus}".`);
      setDraggingId(null);
      return;
    }
    if (targetStatus === 'Order Lost' || targetStatus === 'Client Has Hold Enquiry') {
      setConfirmMove({ row, targetStatus });
      setMoveRemark('');
      setDraggingId(null);
      return;
    }
    void applyStatus(row, targetStatus);
    setDraggingId(null);
  };

  const applyStatus = async (row, targetStatus, remark) => {
    try {
      const patch = {
        offer_status: targetStatus,
        status_changed_at: new Date().toISOString(),
      };
      if (remark) {
        patch.remark = [row.remark, `[Status → ${targetStatus}] ${remark}`].filter(Boolean).join('\n');
      }
      // Prefer Converted on Revised Value when revision_no > 0 and dropping on Converted
      if (targetStatus === 'Order Converted' && (row.revision_no || 0) > 0) {
        patch.offer_status = 'Order Converted on Revised Value';
      }
      const { error: e } = await projectsTable('quotations').update(patch).eq('id', row.id);
      if (e) throw e;
      await fetchRows();
    } catch (err) {
      setError(err?.message || 'Could not update status.');
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Quotation Board</h2>
          <p className="text-sm text-slate-500">Drag cards between columns to change status. Lost/Hold require a remark.</p>
        </div>
        <button
          type="button"
          onClick={fetchRows}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[420px]">
          {BOARD_COLUMNS.map((col) => {
            const style = getStatusStyle(col.statuses[0]);
            const cards = byColumn[col.id] || [];
            return (
              <div
                key={col.id}
                className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropColumn(col)}
              >
                <div
                  className="px-3 py-2.5 rounded-t-xl border-b border-slate-200 flex items-center justify-between"
                  style={{ background: style.bg }}
                >
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: style.text }}>
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 bg-white/70 px-1.5 py-0.5 rounded">
                    {cards.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[70vh]">
                  {cards.map((row) => {
                    const daysInStatus = daysBetween(row.status_changed_at?.slice?.(0, 10) || row.updated_at?.slice?.(0, 10) || row.offer_date);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        draggable
                        onDragStart={() => setDraggingId(row.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => setDetailId(row.id)}
                        className={`w-full text-left rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${
                          draggingId === row.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-500 truncate">{row.offer_no}</div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{row.client_name || '—'}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800">{formatCurrency(row.quoted_rate)}</span>
                          <StatusBadge status={row.offer_status} />
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                          <span>{row.offer_type || '—'}</span>
                          <span>{daysInStatus == null ? '—' : `${daysInStatus}d in status`}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">Next: {formatDisplayDate(row.next_followup_date)}</div>
                      </button>
                    );
                  })}
                  {cards.length === 0 && (
                    <div className="text-center text-xs text-slate-400 py-8 border border-dashed border-slate-200 rounded-lg">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Confirm status change</h3>
            <p className="text-sm text-slate-600">
              Move <strong>{confirmMove.row.offer_no}</strong> to <strong>{confirmMove.targetStatus}</strong>? Remark is
              required.
            </p>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={moveRemark}
              onChange={(e) => setMoveRemark(e.target.value)}
              placeholder="Reason…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-sm border rounded-lg" onClick={() => setConfirmMove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50"
                disabled={!moveRemark.trim()}
                onClick={async () => {
                  await applyStatus(confirmMove.row, confirmMove.targetStatus, moveRemark.trim());
                  setConfirmMove(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {detailId && (
        <QuotationDetailDrawer quotationId={detailId} onClose={() => setDetailId(null)} onChanged={fetchRows} />
      )}
    </div>
  );
}
