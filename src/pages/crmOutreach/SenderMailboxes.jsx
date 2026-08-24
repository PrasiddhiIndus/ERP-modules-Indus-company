import React, { useMemo } from 'react';
import { Edit2, Plus } from 'lucide-react';
import {
  DenseTable,
  PageTaskHeader,
  StatusChip,
} from '../adminOperations/components/AdminUi';
import { useCrmOutreach } from './contexts/CrmOutreachContext';

function senderStatusSeverity(status) {
  if (status === 'Verified') return 'info';
  if (status === 'Pending Verification') return 'warning';
  return 'critical';
}

export default function SenderMailboxes() {
  const { senders, openSenderEditor } = useCrmOutreach();

  const columns = useMemo(
    () => [
      {
        key: 'mail',
        label: 'Mail ID',
        render: (row) => <span className="font-mono text-xs">{row.mail}</span>,
      },
      { key: 'name', label: 'Display Name' },
      { key: 'used', label: 'Used For' },
      {
        key: 'status',
        label: 'Status',
        render: (row) => (
          <StatusChip label={row.status} severity={senderStatusSeverity(row.status)} />
        ),
      },
      {
        key: 'actions',
        label: '',
        widthClassName: 'w-16',
        render: (row) => (
          <button
            type="button"
            title="Edit mailbox"
            onClick={(e) => {
              e.stopPropagation();
              openSenderEditor(row.id);
            }}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border bg-white text-ink-muted hover:border-accent hover:text-accent"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        ),
      },
    ],
    [openSenderEditor]
  );

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Sender Mailboxes"
        subtitle='Mail IDs configured as valid "From" addresses. Add, edit, or retire any address — every "From" field in this module updates instantly.'
      >
        <button
          type="button"
          onClick={() => openSenderEditor(null)}
          className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Mailbox
        </button>
      </PageTaskHeader>

      <DenseTable
        columns={columns}
        rows={senders}
        rowKey="id"
        showSerialNumber={false}
      />
    </div>
  );
}
