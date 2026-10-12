import { useState, type ReactElement, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PairingTable } from './pairing-table.js';
import type { BotHarnessTranslate } from './locale.js';

export function notificationTimeColumn<Row extends { createdAt: string }>(
  t: BotHarnessTranslate,
): ColumnDef<Row> {
  return {
    id: 'time',
    accessorFn: (row) => Date.parse(row.createdAt),
    header: t('approvalIm.created'),
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const date = new Date(row.original.createdAt);
      return (
        <time
          className="bh-pairing-times bh-management-time"
          dateTime={row.original.createdAt}
          title={date.toLocaleString()}
        >
          <span>{date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}</span>{' '}
          <span>
            {date.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        </time>
      );
    },
  };
}

export function NotificationHistory<Row extends { id: string }>({
  data,
  columns,
  label,
  busy,
  details,
  t,
}: {
  data: Row[];
  columns: ColumnDef<Row>[];
  label: string;
  busy: boolean;
  details(row: Row): ReactNode;
  t: BotHarnessTranslate;
}): ReactElement {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = data.find((row) => row.id === selectedId) ?? data[0];
  return (
    <div className="bh-pairing-panel">
      <PairingTable
        data={data}
        columns={columns}
        selectedId={selected?.id}
        disabled={busy}
        select={(row) => setSelectedId(row.id)}
        label={label}
        empty={t('approvalIm.noDeliveries')}
        t={t}
      />
      {selected ? (
        <article
          className="bh-im-pairing-request bh-management-detail"
          aria-label={t('approvalIm.details')}
        >
          {details(selected)}
        </article>
      ) : null}
    </div>
  );
}
