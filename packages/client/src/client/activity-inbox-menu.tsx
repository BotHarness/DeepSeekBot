import { useState, useRef, type ReactElement } from 'react';
import {
  IconEllipsisOutlineRegular,
  IconSearchOutlineRegular,
  IconCloseFillRegular,
  Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { IconButton } from './ds/icon-button.js';
import type { BotHarnessTranslate } from './locale.js';
import { useActivityFeed, type ActivityQuery } from './activity-feed.js';
import { useMountedResource } from './mounted-resource.js';

const categories = [
  ['all', 'activityInbox.all'],
  ['action', 'activityInbox.needsYou'],
  ['replies', 'activityInbox.forYou'],
  ['unread', 'humanInbox.unread'],
  ['handled', 'humanInbox.handled'],
] as const;

export function ActivityInboxMenu({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const { bots, channels } = useClientState();
  const { feed, query: inbox } = useActivityFeed(actions);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const filter = async (patch: Partial<ActivityQuery>): Promise<void> => {
    feed.setQuery(patch);
  };
  const items: MenuEntry[] = [
    { type: 'label', id: 'category-label', text: t('activityInbox.category') },
    ...categories.map(([id, label]) => ({ id: 'category:' + id, label: t(label) })),
    { type: 'separator', id: 'sort-separator' },
    { type: 'label', id: 'sort-label', text: t('humanInbox.filter.sort') },
    { id: 'sort:default', label: t('activityInbox.defaultSort') },
    { id: 'sort:newest', label: t('humanInbox.filter.newest') },
    { id: 'sort:oldest', label: t('humanInbox.filter.oldest') },
    { type: 'separator', id: 'filter-separator' },
    ...(inbox.category === 'unread'
      ? []
      : [
          {
            id: 'bot',
            label: t('humanInbox.filter.bot'),
            submenu: [
              { id: 'bot:', label: t('humanInbox.filter.allBots') },
              ...[...bots]
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((bot) => ({ id: 'bot:' + bot.slug, label: bot.displayName })),
            ],
          },
        ]),
    {
      id: 'channel',
      label: t('humanInbox.filter.channel'),
      submenu: [
        { id: 'channel:', label: t('humanInbox.filter.allChannels') },
        ...channels
          .filter((channel) =>
            inbox.category === 'replies'
              ? channel.type === 'group'
              : channel.type === 'group' || channel.botSlug !== undefined,
          )
          .map((channel) => ({
            id: 'channel:' + channel.id,
            label:
              channel.type === 'dm'
                ? (bots.find((bot) => bot.slug === channel.botSlug)?.displayName ?? channel.name)
                : channel.name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      ],
    },
    ...(inbox.category === 'unread' || inbox.category === 'handled'
      ? []
      : [{ id: 'snoozed', label: t('humanInbox.snoozed') }]),
    { type: 'separator', id: 'clear-separator' },
    { id: 'clear', label: t('activityInbox.clearFilters') },
    ...(error ? [{ type: 'label' as const, id: 'error', text: t('humanInbox.failed') }] : []),
  ];
  const select = (id: string): void => {
    setOpen(false);
    setError(false);
    const category = categories.find(([value]) => id === 'category:' + value)?.[0];
    let operation: Promise<void> | undefined;
    if (category !== undefined)
      operation = filter({
        category,
        snoozed: category === 'handled' || category === 'unread' ? false : inbox.snoozed,
      });
    else if (id === 'sort:newest' || id === 'sort:oldest' || id === 'sort:default')
      operation = filter({
        sort: id === 'sort:newest' ? 'newest' : id === 'sort:oldest' ? 'oldest' : 'default',
      });
    else if (id.startsWith('bot:')) operation = filter({ botSlug: id.slice(4) || undefined });
    else if (id.startsWith('channel:')) operation = filter({ channelId: id.slice(8) || undefined });
    else if (id === 'snoozed') operation = filter({ snoozed: !inbox.snoozed });
    else if (id === 'clear')
      operation = filter({
        category: 'all',
        botSlug: undefined,
        channelId: undefined,
        snoozed: false,
        sort: 'default',
      });
    void operation?.catch(() => {
      setError(true);
      setOpen(true);
    });
  };
  return (
    <Menu
      open={open}
      portal
      dense
      align="end"
      items={items}
      selectedIds={[
        'category:' + inbox.category,
        'sort:' + inbox.sort,
        'bot:' + (inbox.botSlug ?? ''),
        'channel:' + (inbox.channelId ?? ''),
        ...(inbox.snoozed ? ['snoozed'] : []),
      ]}
      onSelect={select}
      onClose={() => setOpen(false)}
      anchor={
        <IconButton
          aria-label={t('activityInbox.settings')}
          aria-haspopup="menu"
          aria-expanded={open}
          data-active={
            inbox.category !== 'all' ||
            inbox.botSlug !== undefined ||
            inbox.channelId !== undefined ||
            inbox.snoozed ||
            inbox.sort !== 'default' ||
            undefined
          }
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <IconEllipsisOutlineRegular size={16} />
        </IconButton>
      }
    />
  );
}

export function ActivityInboxHeader({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const { feed, query } = useActivityFeed(actions);
  const [searchOpen, setSearchOpen] = useState(query.search !== '');
  const [text, setText] = useState(query.search);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mount = useMountedResource<HTMLDivElement>(() => () => clearTimeout(timer.current), []);
  const close = () => {
    clearTimeout(timer.current);
    setText('');
    feed.setQuery({ search: '' });
    setSearchOpen(false);
    trigger.current?.focus();
  };
  return (
    <div ref={mount} className="bh-header bh-activity-header-actions">
      <div className={`bh-search-slot${searchOpen ? ' bh-search-slot-open' : ''}`}>
        <div className={`bh-search${searchOpen ? ' bh-search-open' : ''}`}>
          <button
            ref={trigger}
            type="button"
            className="bh-search-btn"
            aria-label={t('activityInbox.search')}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen(true);
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <IconSearchOutlineRegular size={searchOpen ? 11 : 14} />
          </button>
          <input
            ref={input}
            type="text"
            className="bh-search-input"
            aria-label={t('activityInbox.search')}
            placeholder={t('activityInbox.search')}
            maxLength={200}
            tabIndex={searchOpen ? 0 : -1}
            value={text}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setText(value);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => feed.setQuery({ search: value.trim() }), 250);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          />
          {searchOpen ? (
            <button
              type="button"
              className="bh-clear-btn"
              aria-label={t('activityInbox.closeSearch')}
              onClick={close}
            >
              <IconCloseFillRegular />
            </button>
          ) : null}
        </div>
      </div>
      {!searchOpen ? <ActivityInboxMenu actions={actions} t={t} /> : null}
    </div>
  );
}
