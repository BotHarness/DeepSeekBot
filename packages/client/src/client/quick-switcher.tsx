import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconSearchOutlineRegular,
  Input,
  ShortcutKeys,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { isBotDmChannel } from './channel-kind.js';
import { GroupChannelIcon } from './group-avatar-stack.js';
import { border, color, dialog, radius, size, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { useMountedResource } from './mounted-resource.js';
import { rankQuickSwitcher, type QuickSwitcherEntry } from './quick-switcher-rank.js';
import type { BotSummary } from './store.js';

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
  hint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
  },
});

export interface QuickSwitcherProps {
  entries: readonly QuickSwitcherEntry[];
  bots: ReadonlyMap<string, BotSummary>;
  activityOf: (bot: BotSummary) => PersonaBotActivityState;
  shortcutBindings: ShortcutBindings;
  t: BotHarnessTranslate;
  onOpen: (entry: QuickSwitcherEntry) => void;
  onClose: () => void;
}

export function QuickSwitcher({
  entries,
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
  const activeIndex = results.length === 0 ? -1 : Math.min(active, results.length - 1);
  const activeEntry = activeIndex < 0 ? undefined : results[activeIndex];
  const optionId = (index: number): string => `${listId}-option-${index}`;
  const scrollActive = useMountedResource<HTMLLIElement>(
    (node) => {
      node.scrollIntoView?.({ block: 'nearest' });
    },
    [activeIndex],
  );
  const move = (delta: number): void => {
    if (results.length === 0) return;
    setActive((activeIndex + delta + results.length) % results.length);
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
      if (activeEntry !== undefined) onOpen(activeEntry);
      return;
    }
    if (shortcutBindings.matches('quick-switcher', event)) {
      event.preventDefault();
      onClose();
    }
  };
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
        }}
        onKeyDown={onKeyDown}
      />
      {results.length === 0 ? null : <p {...stylex.props(styles.heading)}>{heading}</p>}
      <ul id={listId} role="listbox" aria-label={heading} {...stylex.props(styles.list)}>
        {results.map((entry, index) => (
          <li
            key={entry.channel.id}
            id={optionId(index)}
            ref={index === activeIndex ? scrollActive : undefined}
            role="option"
            aria-selected={index === activeIndex}
            data-channel-id={entry.channel.id}
            onMouseMove={() => {
              if (index !== activeIndex) setActive(index);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onOpen(entry)}
            {...stylex.props(styles.row, index === activeIndex && styles.active)}
          >
            {entry.bot === undefined ? (
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
            )}
            <span {...stylex.props(styles.copy)}>
              <span {...stylex.props(styles.name)}>{entry.name}</span>
              <span {...stylex.props(styles.meta)}>{subtitle(entry)}</span>
            </span>
          </li>
        ))}
      </ul>
      {results.length === 0 ? (
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
