import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Button,
  Menu,
  IconTrashOutlineRegular,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { FormDialog } from './ds/form-dialog.js';
import { TextField } from './ds/field.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import { toggleHiddenDmAction } from './dm-actions.js';
import {
  CHANNEL_NICKNAME_ITEM,
  CHANNEL_SETTINGS_ITEM,
  channelNicknameItem,
  channelSettingsItem,
  dmActionKindOf,
  dmActionsItem,
  useHiddenDmActions,
} from './channel-options.js';

export function NicknameDialog({
  channel,
  actions,
  t,
  onClose,
}: {
  channel: ChannelSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(channel.humanNickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const save = async (nickname: string | null): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (await actions.setHumanNickname(channel.id, nickname)) onClose();
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  const valid = draft.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(draft);
  return (
    <FormDialog
      title={t('humanNickname.title')}
      description={t('humanNickname.description', { channel: channel.name })}
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('humanName.save')}
      submitDisabled={!valid}
      busy={busy}
      error={error ? t('humanName.error') : undefined}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => void save(draft.trim() || null)}
      secondary={
        <Button
          type="button"
          variant="ghost"
          disabled={busy || channel.humanNickname == null}
          onClick={() => void save(null)}
        >
          {t('humanNickname.clear')}
        </Button>
      }
    >
      <TextField
        label={t('humanNickname.title')}
        hint={t('humanNickname.inherit')}
        data-human-nickname=""
        value={draft}
        maxLength={128}
        disabled={busy}
        placeholder={t('humanNickname.inherit')}
        onChange={setDraft}
        initialFocus
      />
    </FormDialog>
  );
}

export interface ChannelMenuTrigger {
  readonly open: boolean;
  readonly attention: boolean;
  toggle(): void;
}

export function ChannelHeaderMenu({
  channel,
  actions,
  t,
  anchor,
  primaryAction,
  onOpenSettings,
  deleteBotSlug,
  settingsAttention = false,
}: {
  channel: ChannelSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  anchor: (trigger: ChannelMenuTrigger) => ReactNode;
  primaryAction?: { label: string; icon: ReactNode; run(): void } | undefined;
  onOpenSettings?: (() => void) | undefined;
  deleteBotSlug?: string | undefined;
  settingsAttention?: boolean;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dmBotSlug = channel.type === 'dm' ? channel.botSlug : undefined;
  const hidden = useHiddenDmActions(dmBotSlug);
  const attention = settingsAttention && onOpenSettings !== undefined;
  const optionItems: MenuEntry[] = [
    ...(onOpenSettings === undefined ? [] : [channelSettingsItem(t, attention)]),
    ...(channel.humanNickname === undefined ? [] : [channelNicknameItem(t)]),
    ...(dmBotSlug === undefined ? [] : [dmActionsItem(t, hidden)]),
  ];
  const items: MenuEntry[] = [
    ...(primaryAction === undefined
      ? []
      : [{ id: 'primary', label: primaryAction.label, icon: primaryAction.icon }]),
    ...(primaryAction === undefined || optionItems.length === 0
      ? []
      : [{ type: 'separator' as const, id: 'primary-separator' }]),
    ...optionItems,
    ...(deleteBotSlug === undefined
      ? []
      : [
          { type: 'separator' as const, id: 'delete-separator' },
          {
            id: 'delete',
            label: t('deletion.title'),
            icon: <IconTrashOutlineRegular size={16} />,
            danger: true,
          },
        ]),
  ];
  return (
    <>
      <Menu
        open={menuOpen}
        portal
        dense
        anchor={anchor({ open: menuOpen, attention, toggle: () => setMenuOpen((open) => !open) })}
        items={items}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          const kind = dmActionKindOf(id);
          if (kind !== undefined) {
            if (dmBotSlug !== undefined) toggleHiddenDmAction(dmBotSlug, kind);
            return;
          }
          setMenuOpen(false);
          if (id === 'primary') primaryAction?.run();
          else if (id === CHANNEL_SETTINGS_ITEM) onOpenSettings?.();
          else if (id === CHANNEL_NICKNAME_ITEM) setDialogOpen(true);
          else if (id === 'delete') setDeleting(true);
        }}
      />
      {dialogOpen ? (
        <NicknameDialog
          channel={channel}
          actions={actions}
          t={t}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
      {deleting && deleteBotSlug !== undefined ? (
        <PersonaBotDeletionView
          key={deleteBotSlug}
          slug={deleteBotSlug}
          actions={actions}
          t={t}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </>
  );
}
