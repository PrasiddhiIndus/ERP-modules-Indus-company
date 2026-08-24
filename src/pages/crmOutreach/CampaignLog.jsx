import React, { useMemo } from 'react';
import {
  DenseTable,
  PageTaskHeader,
  StatusChip,
} from '../adminOperations/components/AdminUi';
import { useCrmOutreach } from './contexts/CrmOutreachContext';

function campaignStatusSeverity(status) {
  if (status === 'Delivered') return 'info';
  if (status === 'Queued') return 'warning';
  return 'neutral';
}

export default function CampaignLog() {
  const { campaigns } = useCrmOutreach();

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Campaign',
        render: (row) => <span className="font-semibold text-xs">{row.name}</span>,
      },
      { key: 'template', label: 'Template' },
      {
        key: 'sender',
        label: 'Sender',
        render: (row) => <span className="font-mono text-xs">{row.sender}</span>,
      },
      { key: 'recipients', label: 'Recipients' },
      { key: 'sent', label: 'Sent' },
      {
        key: 'status',
        label: 'Status',
        render: (row) => (
          <StatusChip label={row.status} severity={campaignStatusSeverity(row.status)} />
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Campaign Log"
        subtitle="History of mails sent from Client Master"
      />

      <DenseTable
        columns={columns}
        rows={campaigns}
        rowKey="id"
        showSerialNumber={false}
      />
    </div>
  );
}
