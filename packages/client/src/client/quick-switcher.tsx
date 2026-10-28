import {
  Fragment,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconSearchOutlineRegular,
  IconSettingsOutlineRegular,
  Input,
  ShortcutKeys,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import type { MessageSearchHit, MessageSearchPage } from './bridge.js';
import { isBotDmChannel } from './channel-kind.js';
import { searchSnippet } from './conversation-search.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { useMountedResource } from './mounted-resource.js';
import { rankQuickSwitcher, type QuickSwitcherEntry } from './quick-switcher-rank.js';
import type { SettingsSearchResult } from './settings-search.js';
import type { BotSummary, ChannelMessage } from './store.js';

const styles = stylex.create({
  dialog: {
    width: dialog.small,
    maxWidth: '100%',
    gap: 0,
    paddingBlock: space.x4,
  },
  search: {
    display: 'flex',
    marginInline: space.x4,
    marginBottom: space.x3,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    maxHeight: dialog.bodyMax,
    marginBlock: 0,
    paddingInline: space.x3,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    listStyle: 'none',
  },
  heading: {
    margin: 0,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.nav,
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderRadius: radius.sm,
    color: color.fg,
    cursor: 'pointer',
  },
  active: {
    backgroundColor: color.hover,
  },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: size.icon,
    height: size.icon,
    overflow: 'hidden',
    borderRadius: radius.sm,
    color: color.muted,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  meta: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  empty: {
    margin: 0,
    paddingBlock: space.x6,
    paddingInline: space.x4,
    color: color.subtle,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x4,
    marginTop: space.x3,
    paddingTop: space.x3,
    paddingInline: space.x4,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  groupHeading: {
    paddingInline: space.x1,
    listStyle: 'none',
  },
  settingIcon: {
    boxSizing: 'border-box',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
  },
  hint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
  },
  time: {
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    whiteSpace: 'nowrap',
  },
  mark: {
    backgroundColor: 'transparent',
    color: color.fg,
    fontWeight: text.strong,
  },
  more: {
    color: color.accentText,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  skeleton: {
    paddingInline: space.x1,
    listStyle: 'none',
  },
});

const MESSAGE_SEARCH_DEBOUNCE_MS = 150;

export const QUICK_SWITCHER_SETTINGS_LIMIT = 12;

export interface QuickSwitcherSettings {
  search(query: string): readonly SettingsSearchResult[];
  open(result: SettingsSearchResult): void;
}

export interface QuickSwitcherMessages {
  search(text: string, cursor?: string): Promise<MessageSearchPage>;
  open(hit: MessageSearchHit): void;
}

type QuickSwitcherItem =
  | { readonly kind: 'channel'; readonly entry: QuickSwitcherEntry }
  | { readonly kind: 'message'; readonly hit: MessageSearchHit }
  | { readonly kind: 'more' }
  | { readonly kind: 'setting'; readonly result: SettingsSearchResult };

interface MessageResults {
  readonly query: string;
  readonly hits: readonly MessageSearchHit[];
  readonly nextCursor?: string | undefined;
  readonly loading: boolean;
}

const NO_MESSAGES: MessageResults = { query: '', hits: [], loading: false };

export interface QuickSwitcherProps {
  entries: readonly QuickSwitcherEntry[];
  settings?: QuickSwitcherSettings | undefined;
  messages?: QuickSwitcherMessages | undefined;
  bots: ReadonlyMap<string, BotSummary>;
  activityOf: (bot: BotSummary) => PersonaBotActivityState;
  shortcutBindings: ShortcutBindings;
  t: BotHarnessTranslate;
  onOpen: (entry: QuickSwitcherEntry) => void;
  onClose: () => void;
}

export function QuickSwitcher({
  entries,
  settings,
  messages,
  bots,
  activityOf,
  shortcutBindings,
  t,
  onOpen,
  onClose,
}: QuickSwitcherProps): ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => rankQuickSwitcher(entries, query), [entries, query]);
  const settingResults = useMemo(
    () =>
      settings === undefined || query.trim().length === 0
        ? []
        : settings.search(query).slice(0, QUICK_SWITCHER_SETTINGS_LIMIT),
    [settings, query],
  );
  const [found, setFound] = useState<MessageResults>(NO_MESSAGES);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchMessages = async (text: string, cursor?: string): Promise<void> => {
    if (messages === undefined) return;
    const current = ++sequence.current;
    setFound((previous) => ({
      ...(cursor === undefined ? { ...NO_MESSAGES, query: text } : previous),
      loading: true,
    }));
    try {
      const page = await messages.search(text, cursor);
      if (current !== sequence.current) return;
      setFound((previous) => ({
        query: text,
        hits: cursor === undefined ? page.hits : [...previous.hits, ...page.hits],
        nextCursor: page.nextCursor,
        loading: false,
      }));
    } catch {
      if (current === sequence.current)
        setFound((previous) =>
          cursor === undefined
            ? { query: text, hits: [], loading: false }
            : { ...previous, loading: false },
        );
    }
  };
  const scheduleMessages = (text: string): void => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    sequence.current += 1;
    const trimmed = text.trim();
    if (messages === undefined) return;
    if (trimmed.length === 0) {
      setFound(NO_MESSAGES);
      return;
    }
    setFound({ ...NO_MESSAGES, query: trimmed, loading: true });
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void searchMessages(trimmed);
    }, MESSAGE_SEARCH_DEBOUNCE_MS);
  };
  const stopMessages = useMountedResource<HTMLSpanElement>(
    () => () => {
      sequence.current += 1;
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );
  const entryByChannel = useMemo(
    () => new Map(entries.map((entry) => [entry.channel.id, entry])),
    [entries],
  );
  const items: QuickSwitcherItem[] = [
    ...results.map((entry) => ({ kind: 'channel' as const, entry })),
    ...found.hits.map((hit) => ({ kind: 'message' as const, hit })),
    ...(found.nextCursor === undefined ? [] : [{ kind: 'more' as const }]),
    ...settingResults.map((result) => ({ kind: 'setting' as const, result })),
  ];
  const firstSetting = items.length - settingResults.length;
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  const activeItem = activeIndex < 0 ? undefined : items[activeIndex];
  const openItem = (item: QuickSwitcherItem): void => {
    if (item.kind === 'channel') onOpen(item.entry);
    else if (item.kind === 'message') messages?.open(item.hit);
    else if (item.kind === 'more') {
      if (!found.loading) void searchMessages(found.query, found.nextCursor);
    } else settings?.open(item.result);
  };
  const authorOf = (message: ChannelMessage): string => {
    switch (message.author.kind) {
      case 'human':
        return t('main.author.human');
      case 'system':
        return t('main.author.system');
      case 'bot':
        return bots.get(message.author.slug)?.displayName ?? message.author.slug;
      case 'bridged':
        return message.author.source;
    }
  };
  const channelIcon = (entry: QuickSwitcherEntry): ReactElement =>
    entry.bot === undefined ? (
      <GroupChannelIcon
        channel={entry.channel}
        bots={bots}
        className={stylex.props(styles.icon).className ?? ''}
        groupClassName="bh-group-channel-icon"
        size={28}
        hashSize={18}
        t={t}
      />
    ) : (
      <PersonaBotAvatar
        t={t}
        personaBotId={entry.bot.slug}
        name={entry.bot.displayName}
        src={entry.bot.avatar}
        appearance={entry.bot.appearance}
        avatarSeed={entry.bot.avatarSeed}
        state={activityOf(entry.bot)}
        activity={entry.bot.activity}
        attention={entry.bot.attention}
        size={28}
      />
    );
  const optionId = (index: number): string => `${listId}-option-${index}`;
  const scrollActive = useMountedResource<HTMLLIElement>(
    (node) => {
      node.scrollIntoView?.({ block: 'nearest' });
    },
    [activeIndex],
  );
  const move = (delta: number): void => {
    if (items.length === 0) return;
    setActive((activeIndex + delta + items.length) % items.length);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeItem !== undefined) openItem(activeItem);
      return;
    }
    if (shortcutBindings.matches('quick-switcher', event)) {
      event.preventDefault();
      onClose();
    }
  };
  const messageSkeleton =
    found.loading && found.hits.length === 0 ? (
      <>
        <li role="presentation" {...stylex.props(styles.heading, styles.groupHeading)}>
          {t('quickSwitcher.messages')}
        </li>
        <li role="presentation" {...stylex.props(styles.skeleton)}>
          <LoadingSkeleton kind="roster" label={t('quickSwitcher.messagesLoading')} />
        </li>
      </>
    ) : null;
  const empty = query.trim().length === 0;
  const heading = empty ? t('quickSwitcher.recent') : t('quickSwitcher.results');
  const subtitle = (entry: QuickSwitcherEntry): string => {
    const kind =
      entry.bot !== undefined
        ? t('quickSwitcher.kind.bot')
        : isBotDmChannel(entry.channel)
          ? t('botDm.label')
          : t('quickSwitcher.kind.group');
    const roles = entry.bot !== undefined && entry.bot.roles.length > 0 ? entry.bot.roles : [];
    return [kind, ...roles, ...(entry.hidden ? [t('quickSwitcher.hidden')] : [])].join(' · ');
  };

  return (
    <Modal
      open
      headless
      title={t('quickSwitcher.title')}
      onClose={onClose}
      className={stylex.props(styles.dialog).className ?? ''}
    >
      <Input
        data-modal-autofocus=""
        className={stylex.props(styles.search).className ?? ''}
        icon={<IconSearchOutlineRegular size={16} />}
        role="combobox"
        aria-label={t('quickSwitcher.placeholder')}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex < 0 ? undefined : optionId(activeIndex)}
        placeholder={t('quickSwitcher.placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActive(0);
          scheduleMessages(event.currentTarget.value);
        }}
        onKeyDown={onKeyDown}
      />
      {results.length === 0 ? null : <p {...stylex.props(styles.heading)}>{heading}</p>}
      <ul id={listId} role="listbox" aria-label={heading} {...stylex.props(styles.list)}>
        {items.map((item, index) => {
          const rowProps = {
            id: optionId(index),
            ref: index === activeIndex ? scrollActive : undefined,
            role: 'option',
            'aria-selected': index === activeIndex,
            onMouseMove: () => {
              if (index !== activeIndex) setActive(index);
            },
            onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
            onClick: () => openItem(item),
            ...stylex.props(styles.row, index === activeIndex && styles.active),
          };
          const messagesHeading =
            index === results.length ? (
              <li role="presentation" {...stylex.props(styles.heading, styles.groupHeading)}>
                {t('quickSwitcher.messages')}
              </li>
            ) : null;
          if (item.kind === 'message') {
            const { hit } = item;
            const entry = entryByChannel.get(hit.channelId);
            const snippet = searchSnippet(hit.snippet, found.query);
            return (
              <Fragment key={`message:${hit.channelId}:${hit.message.id}`}>
                {messagesHeading}
                <li {...rowProps} data-message-id={hit.message.id} data-channel-id={hit.channelId}>
                  {entry === undefined ? (
                    <span {...stylex.props(styles.icon)} />
                  ) : (
                    channelIcon(entry)
                  )}
                  <span {...stylex.props(styles.copy)}>
                    <span {...stylex.props(styles.name)}>{entry?.name ?? hit.channelId}</span>
                    <span {...stylex.props(styles.meta)}>
                      {authorOf(hit.message)}: {snippet.before}
                      {snippet.match === '' ? null : (
                        <mark {...stylex.props(styles.mark)}>{snippet.match}</mark>
                      )}
                      {snippet.after}
                    </span>
                  </span>
                  <time dateTime={hit.message.at} {...stylex.props(styles.time)}>
                    {formatRelativeTime(Date.parse(hit.message.at), Date.now(), t)}
                  </time>
                </li>
              </Fragment>
            );
          }
          if (item.kind === 'more') {
            return (
              <li key="more" {...rowProps} data-message-search-more="">
                <span {...stylex.props(styles.icon)} />
                <span {...stylex.props(styles.copy, styles.more)}>
                  {found.loading ? t('quickSwitcher.messagesLoading') : t('search.more')}
                </span>
              </li>
            );
          }
          if (item.kind === 'setting') {
            const { result } = item;
            return (
              <Fragment key={`setting:${result.section}:${result.title}`}>
                {index === firstSetting ? messageSkeleton : null}
                {index === firstSetting ? (
                  <li role="presentation" {...stylex.props(styles.heading, styles.groupHeading)}>
                    {t('quickSwitcher.settings')}
                  </li>
                ) : null}
                <li {...rowProps} data-settings-section={result.section}>
                  <span {...stylex.props(styles.icon, styles.settingIcon)}>
                    <IconSettingsOutlineRegular size={16} />
                  </span>
                  <span {...stylex.props(styles.copy)}>
                    <span {...stylex.props(styles.name)}>{result.title}</span>
                    <span {...stylex.props(styles.meta)}>
                      {result.title === result.page
                        ? t('settings.nav')
                        : `${t('settings.nav')} · ${result.page}`}
                    </span>
                  </span>
                </li>
              </Fragment>
            );
          }
          const { entry } = item;
          return (
            <li key={entry.channel.id} {...rowProps} data-channel-id={entry.channel.id}>
              {channelIcon(entry)}
              <span {...stylex.props(styles.copy)}>
                <span {...stylex.props(styles.name)}>{entry.name}</span>
                <span {...stylex.props(styles.meta)}>{subtitle(entry)}</span>
              </span>
            </li>
          );
        })}
        {settingResults.length === 0 ? messageSkeleton : null}
      </ul>
      <span ref={stopMessages} hidden />
      {items.length === 0 && !found.loading ? (
        <p role="status" {...stylex.props(styles.empty)}>
          {empty ? t('quickSwitcher.empty') : t('quickSwitcher.noMatches')}
        </p>
      ) : null}
      <div {...stylex.props(styles.footer)} aria-hidden="true">
        <span {...stylex.props(styles.hint)}>
          <ShortcutKeys keys={['↑', '↓']} />
          {t('quickSwitcher.hint.move')}
        </span>
        <span {...stylex.props(styles.hint)}>
          <ShortcutKeys keys={['Enter']} />
          {t('quickSwitcher.hint.open')}
        </span>
        <span {...stylex.props(styles.hint)}>
          <ShortcutKeys keys={['Esc']} />
          {t('quickSwitcher.hint.close')}
        </span>
        <span {...stylex.props(styles.hint)}>
          <ShortcutKeys keys={[shortcutBindings.text('quick-switcher')]} />
          {t('quickSwitcher.hint.toggle')}
        </span>
      </div>
    </Modal>
  );
}
