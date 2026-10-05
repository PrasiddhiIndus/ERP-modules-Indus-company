import React, { useEffect, useMemo, useState } from 'react';
import {
  DenseTable,
  Drawer,
  InlineAlert,
  PageTaskHeader,
  StatusChip,
} from '../../adminOperations/components/AdminUi';
import { formatDateTimeAmPmDdMmYyyy } from '../../../utils/dateDisplay';
import { crmOutreachErrorMsg } from '../../../services/crmOutreachApi';
import { fetchInHouseCampaignRecipients } from '../../../services/crmInHouseMailApi';
import { useInHouseOutreach } from './InHouseOutreachContext';

function statusSeverity(status) {
  if (status === 'Delivered') return 'info';
  if (status === 'Sending' || status === 'Partial' || status === 'Queued') return 'warning';
  if (status === 'Failed') return 'critical';
  return 'neutral';
}

function RecipientsDrawer({ campaign, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!campaign) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setFilter('all');
    fetchInHouseCampaignRecipients(campaign.id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(crmOutreachErrorMsg(err, 'Could not load recipients.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <Drawer open={Boolean(campaign)} title={campaign?.name || 'Mail'} onClose={onClose} widthClass="max-w-xl">
      {campaign ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-secondary">
            {formatDateTimeAmPmDdMmYyyy(campaign.sentAt)} · {campaign.template}
            {campaign.groups.length ? ` · Groups: ${campaign.groups.join(', ')}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['all', 'Delivered', 'Failed', 'Skipped'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${
                  filter === s ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border'
                }`}
              >
                {s === 'all' ? `All (${rows.length})` : `${s} (${rows.filter((r) => r.status === s).length})`}
              </button>
            ))}
          </div>
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          {loading ? (
            <p className="text-xs text-ink-muted">Loading recipients…</p>
          ) : (
            <ul className="rounded-lg border border-border divide-y divide-gray-100 text-xs">
              {shown.length === 0 ? <li className="px-3 py-6 text-center text-ink-muted">No recipients</li> : null}
              {shown.map((r) => (
                <li key={r.id} className="px-3 py-2 flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink truncate">{r.name || r.email || '—'}</span>
                    <span className="block text-ink-muted truncate">{r.email || 'No email'}</span>
                    {r.error && r.status !== 'Delivered' ? (
                      <span className="block text-ink-secondary mt-0.5">{r.error}</span>
                    ) : null}
                  </span>
                  <StatusChip label={r.status} severity={statusSeverity(r.status)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

export default function InHouseMailHistory() {
  const { campaigns } = useInHouseOutreach();
  const [active, setActive] = useState(null);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Subject',
        render: (row) => <span className="font-semibold text-xs">{row.name}</span>,
      },
      { key: 'template', label: 'Template' },
      {
        key: 'audience',
        label: 'Recipients',
        render: (row) => (
          <span className="text-xs">
            {row.total}
            {row.groups.length ? <span className="text-ink-muted"> · {row.groups.join(', ')}</span> : null}
          </span>
        ),
      },
      {
        key: 'result',
        label: 'Delivered / Failed / Skipped',
        render: (row) => (
          <span className="text-xs font-mono">
            {row.delivered} / {row.failed} / {row.skipped}
          </span>
        ),
      },
      { key: 'sent', label: 'Sent', render: (row) => formatDateTimeAmPmDdMmYyyy(row.sentAt) },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <StatusChip label={row.status} severity={statusSeverity(row.status)} />,
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <PageTaskHeader title="Mail History" subtitle="In-House mails sent to employees — click a row for delivery details" />
      <DenseTable columns={columns} rows={campaigns} rowKey="id" showSerialNumber={false} onRowClick={setActive} />
      <RecipientsDrawer campaign={active} onClose={() => setActive(null)} />
    </div>
  );
}
