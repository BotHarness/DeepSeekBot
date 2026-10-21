import { useRef, useState, type ReactElement } from 'react';
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import { useClientStore } from './use-client-store.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { ChannelSummary } from './store.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { Note } from './ds/note.js';
import { DM_ACTION_KINDS, toggleHiddenDmAction } from './dm-actions.js';
import { useHiddenDmActions } from './channel-options.js';

export function ChannelNicknameEntry(props: ChannelSidebarEntryProps): ReactElement | null {
  const channel = useClientStore((state) => state.conversation.channel);
  const botName = useClientStore(
    (state) => state.bots.find((bot) => bot.slug === channel?.botSlug)?.displayName,
  );
  if (channel?.id !== props.channelId || channel.humanNickname === undefined) return null;
  const name = channel.type === 'dm' ? (botName ?? channel.name) : channel.name;
  return <ChannelNicknameSetting key={channel.id} {...props} channel={{ ...channel, name }} />;
}

export function ChannelNicknameSetting({
  channel,
  actions,
  t,
}: {
  actions: Pick<ChannelSidebarEntryProps['actions'], 'setHumanNickname'>;
  t: ChannelSidebarEntryProps['t'];
  channel: ChannelSummary;
}): ReactElement {
  const [draft, setDraft] = useState(channel.humanNickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const accepted = useRef(channel.humanNickname ?? '');
  const valid = draft.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(draft);
  const save = async (name: string): Promise<void> => {
    if (pending.current || name === accepted.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      if (await actions.setHumanNickname(channel.id, name || null)) {
        accepted.current = name;
        setDraft(name);
        setSaved(true);
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const commit = (): void => {
    if (valid) void save(draft.trim());
  };
  return (
    <SettingsSection>
      <SettingsRow
        title={<label htmlFor="bh-channel-human-nickname">{t('humanNickname.title')}</label>}
        description={t('humanNickname.description', { channel: channel.name })}
        control={
          <>
            <Input
              id="bh-channel-human-nickname"
              data-human-nickname=""
              value={draft}
              maxLength={128}
              disabled={busy}
              aria-invalid={!valid || error || undefined}
              placeholder={t('humanNickname.inherit')}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                commit();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || accepted.current === ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void save('')}
            >
              {t('humanNickname.clear')}
            </Button>
          </>
        }
      >
        {error || !valid ? (
          <Note tone="danger">{t('humanName.error')}</Note>
        ) : saved ? (
          <Note tone="success">{t('humanName.saved')}</Note>
        ) : null}
      </SettingsRow>
    </SettingsSection>
  );
}

export function ChannelTraceEntry({ botSlug, t }: ChannelSidebarEntryProps): ReactElement | null {
  const hidden = useHiddenDmActions(botSlug);
  if (botSlug === undefined) return null;
  return (
    <SettingsSection>
      {DM_ACTION_KINDS.map((kind) => (
        <SettingsRow
          key={kind}
          title={t(`dmTrace.kind.${kind}`)}
          control={
            <Switch
              label={t(`dmTrace.kind.${kind}`)}
              checked={!hidden.includes(kind)}
              onChange={() => toggleHiddenDmAction(botSlug, kind)}
            />
          }
        />
      ))}
    </SettingsSection>
  );
}
