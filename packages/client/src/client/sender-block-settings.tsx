import { Button } from './ds/button.js';
import { type ReactElement } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PairingTable } from './pairing-table.js';
import type {
  ConversationSourceBlock,
  SenderAccessInput,
  SenderBlock,
} from './pairing-settings.js';
import type { BotHarnessTranslate } from './locale.js';

type BlockRow = {
  id: string;
  name: string;
  kind: 'person' | 'group' | 'dm';
  bindingId: string;
  blockedAt: string;
  unblock: SenderAccessInput;
};

export function SenderBlocksPanel({
  blocks,
  conversationBlocks,
  accountName,
  busy,
  change,
  t,
}: {
  blocks: SenderBlock[];
  conversationBlocks: ConversationSourceBlock[];
  accountName(bindingId: string): string;
  busy: boolean;
  change?: ((input: SenderAccessInput) => Promise<void>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const rows: BlockRow[] = [
    ...blocks.map((block): BlockRow => ({
      id: `sender:${block.bindingId}:${block.actorId}`,
      name: block.actorName ?? block.actorId,
      kind: 'person',
      bindingId: block.bindingId,
      blockedAt: block.blockedAt,
      unblock: {
        kind: 'unblock-sender',
        bindingId: block.bindingId,
        actorId: block.actorId,
        expectedRevision: block.revision,
      },
    })),
    ...conversationBlocks.map((block): BlockRow => ({
      id: `conversation:${block.bindingId}:${block.conversation.kind}:${block.conversation.id}`,
      name: block.name ?? block.conversation.id,
      kind: block.conversation.kind,
      bindingId: block.bindingId,
      blockedAt: block.blockedAt,
      unblock: {
        kind: 'unblock-conversation',
        bindingId: block.bindingId,
        conversation: block.conversation,
        expectedRevision: block.revision,
      },
    })),
  ].sort((a, b) => (Date.parse(b.blockedAt) || 0) - (Date.parse(a.blockedAt) || 0));
  const columns: ColumnDef<BlockRow>[] = [
    {
      id: 'name',
      accessorFn: (block) => block.name,
      header: t('pairing.blockedName'),
    },
    {
      id: 'kind',
      accessorFn: (block) =>
        t(
          block.kind === 'person'
            ? 'pairing.blockedPerson'
            : block.kind === 'group'
              ? 'pairing.blockedGroup'
              : 'pairing.blockedDm',
        ),
      header: t('pairing.blockedKind'),
    },
    {
      id: 'app',
      accessorFn: (block) => accountName(block.bindingId),
      header: t('pairing.app'),
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
            onClick={() => void change(row.original.unblock)}
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
