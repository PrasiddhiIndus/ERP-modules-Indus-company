import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, X } from 'lucide-react';
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  KpiTile,
  DenseTable,
  Modal,
  CollapsibleHelp,
  TinyInput,
} from '../adminOperations/components/AdminUi';
import FormDateInput from '../../components/FormDateInput';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import {
  CYCLE_STATUS,
  TRACKER_VERTICAL_CHIPS,
  monthKeysBetween,
  periodMonthKey,
  toIsoDateOnly,
  verticalLabel,
} from '../../utils/billingCycleTracker';
import {
  fetchBillingCycleTracker,
  markBillingCyclePeriodManual,
} from '../../services/billingCycleTrackerApi';

function formatMonthHeader(ym) {
  const [y, m] = String(ym).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}

function defaultPeriodRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toIsoDateOnly(from), to: toIsoDateOnly(to) };
}

const MONTH_COL_WIDTH = 'w-[4.75rem] min-w-[4.75rem] max-w-[4.75rem]';

function StatusCellIcon({ status, title, variant = 'status' }) {
  const common =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px]';
  if (variant === 'empty') {
    return (
      <span
        className={`${common} bg-slate-200`}
        title={title || 'No cycle for this month'}
        aria-hidden
      />
    );
  }
  if (status === CYCLE_STATUS.RAISED_ON_TIME) {
    return (
      <span className={`${common} bg-teal-700 text-white`} title={title || 'Raised on time'}>
        <Check className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  }
  if (status === CYCLE_STATUS.RAISED_LATE) {
    return (
      <span className={`${common} bg-amber-600 text-white`} title={title || 'Raised late'}>
        <AlertTriangle className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  }
  if (status === CYCLE_STATUS.NOT_RAISED) {
    return (
      <span className={`${common} bg-red-800 text-white`} title={title || 'Not raised'}>
        <X className="h-4 w-4" strokeWidth={2.75} />
      </span>
    );
  }
  if (status === CYCLE_STATUS.CYCLE_IN_PROGRESS) {
    return (
      <span
        className={`${common} bg-slate-200`}
        title={title || 'Cycle in progress'}
        aria-hidden
      />
    );
  }
  return <StatusCellIcon variant="empty" title={title} />;
}

function cellTitle(period) {
  if (!period) return '';
  const bits = [];
  if (period.taxInvoiceNumber) bits.push(period.taxInvoiceNumber);
  if (period.raisedDate) bits.push(`Raised ${formatDateDdMmYyyy(period.raisedDate)}`);
  if (period.linkedFromInvoice) bits.push('Matched from created invoice');
  if (period.manuallyRaised && period.manualRaisedDate) {
    bits.push(`Manual ${formatDateDdMmYyyy(period.manualRaisedDate)}`);
  }
  if (period.autoConfirmedAt && period.manuallyRaised && period.taxInvoiceNumber) {
    bits.push(`Auto-confirmed ${period.taxInvoiceNumber}`);
  }
  if (period.dueDate) bits.push(`Due ${formatDateDdMmYyyy(period.dueDate)}`);
  return bits.join(' · ');
}

function StatusLegend() {
  const items = [
    { status: CYCLE_STATUS.RAISED_ON_TIME, label: 'Raised on time' },
    { status: CYCLE_STATUS.RAISED_LATE, label: 'Raised late' },
    { status: CYCLE_STATUS.NOT_RAISED, label: 'Not raised' },
    { status: CYCLE_STATUS.CYCLE_IN_PROGRESS, label: 'In progress' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-secondary">
      {items.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <StatusCellIcon status={item.status} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function BillingTracker() {
  const initialRange = useMemo(() => defaultPeriodRange(), []);
  const [vertical, setVertical] = useState('all');
  const [statusFilter, setStatusFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [periodFrom, setPeriodFrom] = useState(initialRange.from);
  const [periodTo, setPeriodTo] = useState(initialRange.to);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualTarget, setManualTarget] = useState(null);
  const [manualDate, setManualDate] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBillingCycleTracker({
        vertical,
        status: null,
        search,
        from: periodFrom || null,
        to: periodTo || null,
      });
      setRows(data);
    } catch (err) {
      console.error('Billing tracker load failed', err);
      setError(err?.message || 'Could not load billing tracker');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vertical, search, periodFrom, periodTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthKeys = useMemo(
    () => monthKeysBetween(periodFrom, periodTo),
    [periodFrom, periodTo]
  );

  const siteGroups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.siteId}::${r.vertical}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          siteId: r.siteId,
          vertical: r.vertical,
          clientLegalName: r.clientLegalName,
          locationName: r.locationName,
          refCode: r.refCode || r.ocNumber || r.poWoNumber || r.siteId,
          months: {},
        });
      }
      const g = map.get(key);
      const mk = periodMonthKey(r.periodStart);
      if (!mk) continue;
      const prev = g.months[mk];
      if (!prev) {
        g.months[mk] = r;
      } else {
        // Prefer raised (invoice-backed) over open/missed when both exist
        const rank = {
          [CYCLE_STATUS.RAISED_ON_TIME]: 4,
          [CYCLE_STATUS.RAISED_LATE]: 3,
          [CYCLE_STATUS.NOT_RAISED]: 2,
          [CYCLE_STATUS.CYCLE_IN_PROGRESS]: 1,
        };
        if ((rank[r.derivedStatus] || 0) > (rank[prev.derivedStatus] || 0)) {
          g.months[mk] = r;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.clientLegalName || a.siteId).localeCompare(String(b.clientLegalName || b.siteId))
    );
  }, [rows]);

  const filteredGroups = useMemo(() => {
    if (!statusFilter) return siteGroups;
    return siteGroups.filter((g) =>
      Object.values(g.months).some((p) => p.derivedStatus === statusFilter)
    );
  }, [siteGroups, statusFilter]);

  const stats = useMemo(() => {
    const sites = new Set(siteGroups.map((g) => g.key));
    let missed = 0;
    let late = 0;
    let onTrack = 0;
    for (const g of siteGroups) {
      const statuses = Object.values(g.months).map((p) => p.derivedStatus);
      if (statuses.includes(CYCLE_STATUS.NOT_RAISED)) missed += 1;
      else if (statuses.includes(CYCLE_STATUS.RAISED_LATE)) late += 1;
      else if (
        statuses.length &&
        statuses.every(
          (s) => s === CYCLE_STATUS.RAISED_ON_TIME || s === CYCLE_STATUS.CYCLE_IN_PROGRESS
        )
      ) {
        onTrack += 1;
      }
    }
    return {
      missed,
      late,
      onTrack,
      sitesTracked: sites.size,
    };
  }, [siteGroups]);

  const openManual = (period) => {
    if (!period || period.invoiceId) return;
    setManualTarget(period);
    setManualDate(toIsoDateOnly(new Date()));
    setManualReason('');
  };

  const submitManual = async () => {
    if (!manualTarget?.periodId || !manualDate || !String(manualReason || '').trim()) return;
    setManualSaving(true);
    try {
      await markBillingCyclePeriodManual(manualTarget.periodId, manualDate, manualReason.trim());
      setManualTarget(null);
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not save manual mark');
    } finally {
      setManualSaving(false);
    }
  };

  const showVerticalCol = vertical === 'all';

  const frozenWidths = useMemo(() => {
    // S.No is prepended by DenseTable; these are the data frozen columns
    if (showVerticalCol) return [200, 148, 88];
    return [220, 160];
  }, [showVerticalCol]);

  const columns = useMemo(() => {
    const cols = [
      {
        key: 'client',
        label: 'Client / Site',
        widthClassName: 'min-w-[12.5rem] max-w-[14rem]',
        render: (row) => (
          <div className="min-w-0 max-w-[14rem] pr-1">
            <p className="font-medium text-ink truncate leading-snug">
              {row.clientLegalName || row.siteId || '—'}
            </p>
            <p className="type-meta text-ink-muted truncate leading-snug mt-0.5">
              {[row.locationName, row.siteId].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'ref',
        label: 'Ref',
        widthClassName: 'min-w-[9rem] max-w-[11rem]',
        render: (row) => (
          <span className="font-mono text-[11px] text-ink-secondary break-all leading-snug block max-w-[11rem]">
            {row.refCode || '—'}
          </span>
        ),
      },
    ];
    if (showVerticalCol) {
      cols.push({
        key: 'vertical',
        label: 'Vertical',
        widthClassName: 'min-w-[5.5rem] max-w-[6rem]',
        render: (row) => (
          <span className="text-[11px] text-ink-secondary whitespace-nowrap">
            {verticalLabel(row.vertical)}
          </span>
        ),
      });
    }
    for (const mk of monthKeys) {
      cols.push({
        key: `m-${mk}`,
        label: formatMonthHeader(mk),
        headerClassName: `!text-center ${MONTH_COL_WIDTH}`,
        cellClassName: `!text-center align-middle ${MONTH_COL_WIDTH}`,
        widthClassName: MONTH_COL_WIDTH,
        render: (row) => {
          const period = row.months[mk];
          if (!period) {
            return (
              <div className={`mx-auto flex ${MONTH_COL_WIDTH} items-center justify-center`}>
                <StatusCellIcon variant="empty" />
              </div>
            );
          }
          const isManualOnly = period.manuallyRaised && !period.invoiceId;
          const dual =
            period.manuallyRaised && period.invoiceId
              ? `Manually marked ${formatDateDdMmYyyy(period.manualRaisedDate)}${
                  period.manualRaisedReason ? ` (${period.manualRaisedReason})` : ''
                }; auto-confirmed via ${period.taxInvoiceNumber || 'invoice'} on ${formatDateDdMmYyyy(
                  period.raisedDate || period.invoiceIssueDate
                )}`
              : cellTitle(period);
          return (
            <div className={`mx-auto flex ${MONTH_COL_WIDTH} flex-col items-center justify-center gap-0.5`}>
              <button
                type="button"
                className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-md p-0.5 ${
                  isManualOnly ? 'ring-1 ring-violet-300' : ''
                } ${period.invoiceId ? 'cursor-default' : 'hover:bg-slate-50'}`}
                title={dual}
                onClick={() => openManual(period)}
              >
                <StatusCellIcon status={period.derivedStatus} title={dual} />
                {isManualOnly ? (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-violet-700 leading-none">
                    Manual
                  </span>
                ) : null}
              </button>
            </div>
          );
        },
      });
    }
    return cols;
  }, [monthKeys, showVerticalCol]);

  const toggleStatus = (key) => {
    setStatusFilter((prev) => (prev === key ? null : key));
  };

  return (
    <div className="px-4 sm:px-6 py-4 space-y-4">
      <PageTaskHeader
        title="Billing Tracker"
        subtitle="Recurring cycles across verticals. Months with a created tax invoice show as raised."
      />
      <CollapsibleHelp label="how status works">
        <ul className="list-disc pl-4 space-y-1">
          <li>Teal check — tax invoice raised on or before due date</li>
          <li>Amber ! — tax invoice raised after due date</li>
          <li>Red X — due date passed, no qualifying tax invoice for that month</li>
          <li>Light grey — cycle still open or no data for that month</li>
          <li>Hover a cell for invoice details when raised</li>
          <li>Click an open cell to mark legacy/paper invoices manually</li>
        </ul>
      </CollapsibleHelp>

      <FilterBar>
        <div className="flex flex-col gap-1.5 min-w-[12rem]">
          <span className="type-mono-caption text-ink-muted">Vertical</span>
          <div className="flex flex-wrap gap-1.5">
            {TRACKER_VERTICAL_CHIPS.map((chip) => {
              const active = vertical === chip.code;
              return (
                <button
                  key={chip.code}
                  type="button"
                  onClick={() => setVertical(chip.code)}
                  className={`h-8 px-2.5 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-ink-secondary border-border hover:border-accent-border'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-[10rem] flex-1">
          <span className="type-mono-caption text-ink-muted">Search</span>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, OC, site, invoice…"
              className="pl-7 w-full min-w-[12rem]"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="type-mono-caption text-ink-muted">Period from</span>
          <FormDateInput value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="h-8" compact />
        </div>
        <div className="flex flex-col gap-1">
          <span className="type-mono-caption text-ink-muted">Period to</span>
          <FormDateInput value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="h-8" compact />
        </div>
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Missed last cycle"
          value={stats.missed}
          sub="Not raised after due"
          tone={statusFilter === CYCLE_STATUS.NOT_RAISED ? 'border-rose-400' : 'border-rose-200'}
          onClick={() => toggleStatus(CYCLE_STATUS.NOT_RAISED)}
        />
        <KpiTile
          label="Raised late"
          value={stats.late}
          sub="After due date"
          tone={statusFilter === CYCLE_STATUS.RAISED_LATE ? 'border-amber-400' : 'border-amber-200'}
          onClick={() => toggleStatus(CYCLE_STATUS.RAISED_LATE)}
        />
        <KpiTile
          label="On track"
          value={stats.onTrack}
          sub="On time or in progress"
          tone={statusFilter === CYCLE_STATUS.RAISED_ON_TIME ? 'border-emerald-400' : 'border-emerald-200'}
          onClick={() => toggleStatus(CYCLE_STATUS.RAISED_ON_TIME)}
        />
        <KpiTile
          label="Sites tracked"
          value={stats.sitesTracked}
          sub={statusFilter ? 'Click a card again to clear filter' : 'Active recurring sites in range'}
          tone="border-border"
          onClick={() => setStatusFilter(null)}
        />
      </div>

      <SectionCard
        title="Cycle grid"
        right={
          <div className="flex flex-wrap items-center gap-3">
            <StatusLegend />
            <button
              type="button"
              onClick={() => void load()}
              className="h-8 px-3 rounded-md border border-border text-xs font-medium text-ink-secondary hover:bg-surface-sunken"
            >
              Refresh
            </button>
          </div>
        }
      >
        {error ? (
          <p className="text-sm text-rose-700 mb-3">{error}</p>
        ) : null}
        {loading ? (
          <p className="type-meta text-ink-muted py-8 text-center">Loading tracker…</p>
        ) : (
          <DenseTable
            columns={columns}
            rows={filteredGroups}
            rowKey={(r) => r.key}
            showSerialNumber
            stickyHeader
            density="comfortable"
            frozenColumnCount={showVerticalCol ? 3 : 2}
            frozenColumnWidths={frozenWidths}
            scrollMaxHeight="calc(100dvh - 20rem)"
          />
        )}
        {!loading && filteredGroups.length === 0 ? (
          <p className="type-meta text-ink-muted py-6 text-center">
            No recurring sites in this filter. Only monthly/quarterly cycles appear here.
          </p>
        ) : null}
      </SectionCard>

      <Modal
        open={!!manualTarget}
        title="Mark as raised (manual)"
        onClose={() => setManualTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-8 px-3 rounded-md border border-border text-xs font-medium"
              onClick={() => setManualTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={manualSaving || !manualDate || !String(manualReason || '').trim()}
              className="h-8 px-3 rounded-md bg-violet-700 text-white text-xs font-semibold disabled:opacity-50"
              onClick={() => void submitManual()}
            >
              {manualSaving ? 'Saving…' : 'Save manual mark'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-secondary text-xs">
            For legacy or paper invoices only. Created tax invoices for the same month are matched
            automatically and show as raised without this step.
          </p>
          <p className="type-meta">
            {manualTarget?.clientLegalName || manualTarget?.siteId} ·{' '}
            {manualTarget
              ? `${formatDateDdMmYyyy(manualTarget.periodStart)} – ${formatDateDdMmYyyy(manualTarget.periodEnd)}`
              : ''}
          </p>
          <div className="flex flex-col gap-1">
            <span className="type-mono-caption">Raised date</span>
            <FormDateInput value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="h-8" compact />
          </div>
          <div className="flex flex-col gap-1">
            <span className="type-mono-caption">Reason</span>
            <textarea
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
              placeholder="e.g. Paper invoice filed before system go-live"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
