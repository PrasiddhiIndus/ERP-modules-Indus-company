import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  Eye,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAuth } from '../../../../contexts/AuthContext';
import { QUOTATION_BASE } from '../quotationConstants';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';
import {
  MAKER_STATUSES,
  QUOTATION_TYPES,
  formatMoneyIn,
  normalizeType,
} from './quotationMakerModel';
import {
  duplicateMakerQuotation,
  fetchMakerList,
  logMakerAudit,
  updateMakerStatus,
} from './quotationMakerApi';
import './quotationMaker.css';

export default function QuotationMakerList() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const actorName = userProfile?.username || user?.email?.split('@')[0] || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMakerList();
      setRows(data);
    } catch (err) {
      setError(err?.message || 'Failed to load quotations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && (r.maker_status || '') !== statusFilter) return false;
      if (!q) return true;
      return (
        String(r.offer_no || '')
          .toLowerCase()
          .includes(q) ||
        String(r.client_name || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const open = (id, mode = 'edit') => {
    navigate(`${QUOTATION_BASE}/quotation-entry?id=${id}${mode === 'view' ? '&view=1' : ''}`);
  };

  const onDuplicate = async (id) => {
    if (!window.confirm('Duplicate this quotation? A new number will be assigned.')) return;
    setBusyId(id);
    try {
      const result = await duplicateMakerQuotation(id, { userId: user?.id, actorName });
      await load();
      if (result?.form?.id) open(result.form.id);
    } catch (err) {
      setError(err?.message || 'Could not duplicate.');
    } finally {
      setBusyId(null);
    }
  };

  const onStatus = async (id, status) => {
    setBusyId(id);
    try {
      await updateMakerStatus(id, status, { userId: user?.id, actorName });
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update status.');
    } finally {
      setBusyId(null);
    }
  };

  const onPrint = async (id) => {
    await logMakerAudit({
      quotationId: id,
      action: 'print',
      detail: { from: 'list' },
      actorId: user?.id,
      actorName,
    });
    open(id, 'view');
  };

  return (
    <div className="p-3 sm:p-4 w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 m-0">Quotation list</h2>
          <p className="text-sm text-slate-500 mt-1">
            Offers created with Quotation Maker. Open, duplicate, print, or update status.
          </p>
        </div>
        <button
          type="button"
          className="qm-btn main"
          onClick={() => navigate(`${QUOTATION_BASE}/quotation-entry`)}
        >
          + Make a quotation
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[180px]">
          <span className="text-xs font-semibold text-slate-500">Search</span>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Offer no or client"
            />
          </div>
        </label>
        <label className="w-44">
          <span className="text-xs font-semibold text-slate-500">Status</span>
          <select
            className="w-full mt-1 py-2.5 px-3 border border-slate-200 rounded-lg text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {MAKER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Quotation no.</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Client</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Type</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Grand total</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600">Status</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-slate-400 inline-block" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No Quotation Maker offers yet. Create one from Make a Quotation.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const type = normalizeType(r.quotation_type);
                  const total = r.grand_total ?? r.quoted_rate;
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{r.offer_no || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateDdMmYyyy(r.offer_date) || '—'}
                      </td>
                      <td className="px-3 py-2">{r.client_name || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {QUOTATION_TYPES[type]?.name || type}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        ₹ {formatMoneyIn(total)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="text-xs border border-slate-200 rounded-md px-2 py-1"
                          value={r.maker_status || 'draft'}
                          disabled={busyId === r.id}
                          onChange={(e) => void onStatus(r.id, e.target.value)}
                        >
                          {MAKER_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Open" onClick={() => open(r.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="View" onClick={() => open(r.id, 'view')}>
                            <Eye className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            title="Duplicate"
                            disabled={busyId === r.id}
                            onClick={() => void onDuplicate(r.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn title="Print" onClick={() => void onPrint(r.id)}>
                            <Printer className="h-3.5 w-3.5" />
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
          Showing {filtered.length} of {rows.length}
        </div>
      </div>
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
