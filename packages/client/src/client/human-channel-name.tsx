import { useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Button,
  Menu,
  IconEllipsisOutlineRegular,
  IconSettingsOutlineRegular,
  IconTrashOutlineRegular,
  IconUserOutlineRegular,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { FormDialog } from './ds/form-dialog.js';
import { TextField } from './ds/field.js';
import { PersonaBotDeletionView } from './personabot-deletion.js';
import {
  DM_ACTION_KINDS,
  hiddenDmActionsSnapshot,
  subscribeHiddenDmActions,
  toggleHiddenDmAction,
} from './dm-actions.js';
import { IconButton } from './ds/icon-button.js';

function NicknameDialog({
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

export function HumanChannelNameMenu({
  channel,
  actions,
  t,
  onOpenSettings,
  deleteBotSlug,
  settingsAttention = false,
}: {
  channel: ChannelSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onOpenSettings?: (() => void) | undefined;
  deleteBotSlug?: string | undefined;
  settingsAttention?: boolean;
}): ReactElement | null {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dmBotSlug = channel.type === 'dm' ? channel.botSlug : undefined;
  const hidden = useSyncExternalStore(
    subscribeHiddenDmActions,
    () => hiddenDmActionsSnapshot(dmBotSlug),
    () => hiddenDmActionsSnapshot(dmBotSlug),
  );
  const channelItems = [
    ...(onOpenSettings === undefined
      ? []
      : [
          {
            id: 'settings',
            icon: <IconSettingsOutlineRegular size={16} />,
            label: settingsAttention ? (
              <span className="bh-channel-settings-attention-label">
                {t('channelSettings.open')}
                <span
                  className="bh-channel-settings-attention-dot"
                  role="img"
                  aria-label={t('channelSettings.needsAttention')}
                />
              </span>
            ) : (
              t('channelSettings.open')
            ),
          },
        ]),
    ...(channel.humanNickname === undefined
      ? []
      : [
          {
            id: 'nickname',
            label: t('humanNickname.title'),
            icon: <IconUserOutlineRegular size={16} />,
          },
        ]),
  ];
  const items: MenuEntry[] = [
    ...channelItems,
    ...(dmBotSlug === undefined
      ? []
      : [
          ...(channelItems.length === 0
            ? []
            : [{ type: 'separator' as const, id: 'dm-separator' }]),
          { type: 'label' as const, id: 'dm-label', text: t('dmTrace.menu') },
          ...DM_ACTION_KINDS.map((kind) => ({
            id: `dm:${kind}`,
            label: t(`dmTrace.kind.${kind}`),
          })),
        ]),
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
  if (items.length === 0) return null;
  return (
    <span className="bh-channel-options">
      <Menu
        open={menuOpen}
        portal
        dense
        align="end"
        anchor={
          <IconButton
            size="row"
            tone="subtle"
            aria-label={
              settingsAttention && onOpenSettings !== undefined
                ? `${t('humanNickname.menu')} · ${t('channelSettings.needsAttention')}`
                : t('humanNickname.menu')
            }
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconEllipsisOutlineRegular size={16} />
            {settingsAttention && onOpenSettings !== undefined ? (
              <span className="bh-channel-settings-attention-dot bh-channel-options-dot" />
            ) : null}
          </IconButton>
        }
        items={items}
        selectedIds={DM_ACTION_KINDS.filter((kind) => !hidden.includes(kind)).map(
          (kind) => `dm:${kind}`,
        )}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          const kind = DM_ACTION_KINDS.find((k) => id === `dm:${k}`);
          if (kind !== undefined) {
            if (dmBotSlug !== undefined) toggleHiddenDmAction(dmBotSlug, kind);
            return;
          }
          setMenuOpen(false);
          if (id === 'settings') onOpenSettings?.();
          else if (id === 'delete') setDeleting(true);
          else setDialogOpen(true);
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
    </span>
  );
}
