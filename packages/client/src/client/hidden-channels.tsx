import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { useMemo, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { dimension } from './ds/dimensions.stylex.js';
import { hooked } from './ds/hooked.js';
import { ink, layer, size, space, style, type } from './ds/tobs.stylex.js';

import { PanelDialog } from './ds/panel-dialog.js';
import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { isBotDmChannel } from './channel-kind.js';
import { useDelayedSearch } from './delayed-search.js';
import { HashIcon } from './hash-icon.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary } from './store.js';

const styles = stylex.create({
  search: { boxSizing: 'border-box', width: '100%' },
  list: {
    display: 'grid',
    gap: space.x2,
    maxHeight: `min(${dimension.hiddenChannelListMaxHeight}, 55vh)`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: style.rowList,
    paddingBlock: space.x1,
    paddingInline: space.x2,
    borderRadius: style.radiusSmall,
    backgroundColor: layer.well,
  },
  icon: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: size.control,
    height: size.control,
    color: ink.secondary,
  },
  copy: { display: 'grid', flexGrow: 1, minWidth: 0 },
  truncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  name: { fontSize: type.bodySize, lineHeight: type.bodyLine },
  meta: { color: ink.secondary, fontSize: type.captionSize, lineHeight: type.captionLine },
  empty: { padding: space.x5, textAlign: 'center', color: ink.secondary },
});

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

export function deletedBotDmIds(
  channels: readonly ChannelSummary[],
  bots: readonly BotSummary[],
): string[] {
  const deleted = new Set(bots.filter((bot) => bot.deleted === true).map((bot) => bot.slug));
  return channels
    .filter(
      (channel) =>
        channel.type === 'dm' && channel.botSlug !== undefined && deleted.has(channel.botSlug),
    )
    .map((channel) => channel.id);
}

export function hiddenChannelSequence(
  channels: readonly ChannelSummary[],
  hiddenIds: readonly string[],
  bots: readonly BotSummary[] = [],
): ChannelSummary[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const deletedDms = new Set(deletedBotDmIds(channels, bots));
  const seen = new Set<string>();
  const ordered: ChannelSummary[] = [];
  for (const id of hiddenIds) {
    const channel = byId.get(id);
    if (channel === undefined || seen.has(id)) continue;
    ordered.push(channel);
    seen.add(id);
  }
  for (const channel of [...channels].reverse()) {
    if ((!isBotDmChannel(channel) && !deletedDms.has(channel.id)) || seen.has(channel.id)) continue;
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
        className={hooked('bh-hidden-search', styles.search).className}
        aria-label={t('hidden.search.placeholder')}
        placeholder={t('hidden.search.placeholder')}
        value={query}
        onChange={(event) => updateQuery(event.currentTarget.value)}
      />
      <div {...hooked('bh-hidden-list', styles.list)} role="list" ref={cancelOnUnmount}>
        {visible.map(({ channel, bot, activity }) => {
          const readOnly = isBotDmChannel(channel) || bot?.deleted === true;
          return (
            <div key={channel.id} {...hooked('bh-hidden-row', styles.row)} role="listitem">
              {bot === undefined ? (
                <span {...stylex.props(styles.icon)} aria-hidden="true">
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
              <span {...stylex.props(styles.copy)}>
                <span {...hooked('bh-hidden-name', styles.name, styles.truncate)}>
                  {bot?.displayName ?? channel.name}
                </span>
                <span {...stylex.props(styles.meta, styles.truncate)}>
                  {t(
                    isBotDmChannel(channel)
                      ? 'botDm.label'
                      : bot?.deleted === true
                        ? 'deletion.deleted'
                        : channel.type === 'dm'
                          ? 'hidden.dm'
                          : 'hidden.group',
                  )}
                  {bot !== undefined && bot.roles.length > 0 ? ` · ${bot.roles.join(' · ')}` : ''}
                </span>
              </span>
              {readOnly ? (
                <Button variant="outline" size="sm" onClick={() => onOpen(channel.id)}>
                  {t('botDm.view')}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onRestore(channel.id)}>
                  {t('hidden.restore')}
                </Button>
              )}
            </div>
          );
        })}
        {visible.length === 0 ? (
          <div {...hooked('bh-hidden-empty', styles.empty)} role="status">
            {items.length === 0 ? t('hidden.empty') : t('hidden.noMatches')}
          </div>
        ) : null}
      </div>
    </PanelDialog>
  );
}
