import { useState, type ReactElement } from 'react';
import {
  Button,
  Input,
  Menu,
  IconEllipsisOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ChannelSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';

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
    <Modal
      open
      title={t('humanNickname.title')}
      description={t('humanNickname.description', { channel: channel.name })}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={busy || channel.humanNickname == null}
            onClick={() => void save(null)}
          >
            {t('humanNickname.clear')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !valid}
            onClick={() => void save(draft.trim() || null)}
          >
            {t('humanName.save')}
          </Button>
        </>
      }
    >
      <div className="bh-group-setting bh-human-nickname-dialog">
        <label htmlFor="bh-human-channel-nickname">{t('humanNickname.title')}</label>
        <Input
          id="bh-human-channel-nickname"
          value={draft}
          maxLength={128}
          disabled={busy}
          placeholder={t('humanNickname.inherit')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && valid && !busy) {
              event.preventDefault();
              void save(draft.trim() || null);
            }
          }}
        />
        <p>{t('humanNickname.inherit')}</p>
        {error ? (
          <div className="bh-error" role="alert">
            {t('humanName.error')}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function HumanChannelNameMenu({
  channel,
  actions,
  t,
  onOpenSettings,
}: {
  channel: ChannelSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onOpenSettings?: (() => void) | undefined;
}): ReactElement | null {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const items = [
    ...(onOpenSettings === undefined ? [] : [{ id: 'settings', label: t('channelSettings.open') }]),
    ...(channel.humanNickname === undefined
      ? []
      : [{ id: 'nickname', label: t('humanNickname.title') }]),
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
          <button
            type="button"
            className="bh-channel-sidebar-entry-action"
            aria-label={t('humanNickname.menu')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <IconEllipsisOutlineRegular size={16} />
          </button>
        }
        items={items}
        onClose={() => setMenuOpen(false)}
        onSelect={(id) => {
          setMenuOpen(false);
          if (id === 'settings') onOpenSettings?.();
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
    </span>
  );
}
