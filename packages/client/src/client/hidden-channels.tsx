import { useMemo, type ReactElement } from 'react';

import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';

import { PanelDialog } from './ds/panel-dialog.js';
import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { isBotDmChannel } from './channel-kind.js';
import { useDelayedSearch } from './delayed-search.js';
import { HashIcon } from './hash-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary } from './store.js';

export interface HiddenChannelItem {
  channel: ChannelSummary;
  bot?: BotSummary;
  activity?: PersonaBotActivityState;
}

export interface HiddenChannelsModalProps {
  items: readonly HiddenChannelItem[];
  t: BotHarnessTranslate;
  onRestore: (channelId: string) => void;
  onOpen: (channelId: string) => void;
  onClose: () => void;
}

export const HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS = 180;

export function hiddenChannelSequence(
  channels: readonly ChannelSummary[],
  hiddenIds: readonly string[],
): ChannelSummary[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const seen = new Set<string>();
  const ordered: ChannelSummary[] = [];
  for (const id of hiddenIds) {
    const channel = byId.get(id);
    if (channel === undefined || seen.has(id)) continue;
    ordered.push(channel);
    seen.add(id);
  }
  for (const channel of [...channels].reverse()) {
    if (!isBotDmChannel(channel) || seen.has(channel.id)) continue;
    ordered.push(channel);
    seen.add(channel.id);
  }
  return ordered;
}

export function HiddenChannelsModal({
  items,
  t,
  onRestore,
  onOpen,
  onClose,
}: HiddenChannelsModalProps): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(
    HIDDEN_CHANNEL_SEARCH_DEBOUNCE_MS,
    (value) => value,
  );
  const normalized = delayedQuery.trim().toLowerCase();
  const visible = useMemo(
    () =>
      [...items].reverse().filter(({ channel, bot }) => {
        if (normalized.length === 0) return true;
        return [channel.name, bot?.displayName, ...(bot?.roles ?? [])].some((value) =>
          (value ?? '').toLowerCase().includes(normalized),
        );
      }),
    [items, normalized],
  );

  return (
    <PanelDialog
      size="small"
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('hidden.modal.title')}
      description={t('hidden.modal.description')}
      actions={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <Input
        autoFocus
        className="bh-hidden-search"
        aria-label={t('hidden.search.placeholder')}
        placeholder={t('hidden.search.placeholder')}
        value={query}
        onChange={(event) => updateQuery(event.currentTarget.value)}
      />
      <div className="bh-hidden-list" role="list" ref={cancelOnUnmount}>
        {visible.map(({ channel, bot, activity }) => (
          <div key={channel.id} className="bh-hidden-row" role="listitem">
            {bot === undefined ? (
              <span className="bh-hidden-channel-icon" aria-hidden="true">
                <HashIcon size={18} />
              </span>
            ) : (
              <PersonaBotAvatar
                t={t}
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                appearance={bot.appearance}
                avatarSeed={bot.avatarSeed}
                state={activity}
                size={28}
              />
            )}
            <span className="bh-hidden-copy">
              <span className="bh-hidden-name">{bot?.displayName ?? channel.name}</span>
              <span className="bh-hidden-meta">
                {t(
                  isBotDmChannel(channel)
                    ? 'botDm.label'
                    : channel.type === 'dm'
                      ? 'hidden.dm'
                      : 'hidden.group',
                )}
                {bot !== undefined && bot.roles.length > 0 ? ` · ${bot.roles.join(' · ')}` : ''}
              </span>
            </span>
            {isBotDmChannel(channel) ? (
              <Button variant="outline" size="sm" onClick={() => onOpen(channel.id)}>
                {t('botDm.view')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onRestore(channel.id)}>
                {t('hidden.restore')}
              </Button>
            )}
          </div>
        ))}
        {visible.length === 0 ? (
          <div className="bh-hidden-empty" role="status">
            {items.length === 0 ? t('hidden.empty') : t('hidden.noMatches')}
          </div>
        ) : null}
      </div>
    </PanelDialog>
  );
}
