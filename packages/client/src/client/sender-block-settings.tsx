import { Button } from './ds/button.js';
import { type ReactElement } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PairingTable } from './pairing-table.js';
import type { SenderAccessInput, SenderBlock } from './pairing-settings.js';
import type { BotHarnessTranslate } from './locale.js';

type BlockRow = SenderBlock & { id: string };

export function SenderBlocksPanel({
  blocks,
  accountName,
  busy,
  change,
  t,
}: {
  blocks: SenderBlock[];
  accountName(bindingId: string): string;
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const rows: BlockRow[] = blocks.map((block) => ({
    ...block,
    id: `${block.bindingId}:${block.actorId}`,
  }));
  const columns: ColumnDef<BlockRow>[] = [
    {
      id: 'name',
      accessorFn: (block) => block.actorName ?? block.actorId,
      header: t('pairing.actor'),
    },
    {
      id: 'app',
      accessorFn: (block) => accountName(block.bindingId),
      header: t('pairing.account'),
    },
    {
      id: 'time',
      accessorFn: (block) => Date.parse(block.blockedAt) || 0,
      header: t('pairing.blockedAt'),
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <time dateTime={row.original.blockedAt}>
          {new Date(row.original.blockedAt).toLocaleString()}
        </time>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) =>
        change ? (
          <Button
            size="sm"
            variant="toolbar"
            disabled={busy}
            onClick={() =>
              void change({
                kind: 'unblock-sender',
                bindingId: row.original.bindingId,
                actorId: row.original.actorId,
                expectedRevision: row.original.revision,
              })
            }
          >
            {t('pairing.unblock')}
          </Button>
        ) : null,
    },
  ];
  return (
    <PairingTable
      key="blocked"
      data={rows}
      columns={columns}
      label={t('pairing.blocked')}
      empty={t('pairing.noBlocked')}
      t={t}
    />
  );
}

export function BlockSenderButton({
  bindingId,
  actorId,
  actorName,
  block,
  busy,
  change,
  t,
}: {
  bindingId: string;
  actorId: string;
  actorName?: string | undefined;
  block?: SenderBlock | undefined;
  busy: boolean;
  change(input: SenderAccessInput): Promise<void>;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Button
      size="sm"
      variant="toolbar"
      disabled={busy}
      onClick={() =>
        void change(
          block
            ? { kind: 'unblock-sender', bindingId, actorId, expectedRevision: block.revision }
            : {
                kind: 'block-sender',
                bindingId,
                actorId,
                ...(actorName ? { actorName: actorName.slice(0, 200) } : {}),
              },
        )
      }
    >
      {t(block ? 'pairing.unblock' : 'pairing.block')}
    </Button>
  );
}
