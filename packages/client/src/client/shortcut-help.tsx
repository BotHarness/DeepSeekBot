import { Fragment, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';

export type ShortcutKey = string;

export interface ShortcutHelpEntry {
  readonly id: string;
  readonly keys: readonly (readonly ShortcutKey[])[];
  readonly label: BotHarnessKey;
  readonly note?: BotHarnessKey;
}

export interface ShortcutHelpGroup {
  readonly id: string;
  readonly title: BotHarnessKey;
  readonly entries: readonly ShortcutHelpEntry[];
}

export const SHORTCUT_HELP_GROUPS: readonly ShortcutHelpGroup[] = [
  {
    id: 'navigation',
    title: 'shortcuts.group.navigation',
    entries: [
      { id: 'bot-mode', keys: [['Alt', '`']], label: 'shortcuts.botMode' },
      {
        id: 'conversation-index',
        keys: [['Alt', '1 … 0']],
        label: 'shortcuts.conversationIndex',
      },
      { id: 'help', keys: [['?'], ['Mod', '/']], label: 'shortcuts.help' },
    ],
  },
  {
    id: 'composer',
    title: 'shortcuts.group.composer',
    entries: [
      { id: 'send', keys: [['Enter']], label: 'shortcuts.send' },
      { id: 'newline', keys: [['Shift', 'Enter']], label: 'shortcuts.newline' },
      {
        id: 'recall',
        keys: [['↑'], ['↓']],
        label: 'shortcuts.recall',
        note: 'shortcuts.recall.note',
      },
      { id: 'mention', keys: [['@']], label: 'shortcuts.mention' },
      { id: 'channel', keys: [['#']], label: 'shortcuts.channel' },
      { id: 'command', keys: [['/']], label: 'shortcuts.command' },
      {
        id: 'complete',
        keys: [['Tab'], ['Enter']],
        label: 'shortcuts.complete',
        note: 'shortcuts.complete.note',
      },
      { id: 'cancel', keys: [['Esc']], label: 'shortcuts.cancel' },
    ],
  },
];

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /mac|iphone|ipad|ipod/iu.test(platform ?? '');
}

export function shortcutKeyLabel(key: ShortcutKey, apple: boolean): string {
  if (key === 'Mod') return apple ? '⌘' : 'Ctrl';
  if (key === 'Alt' && apple) return '⌥';
  return key;
}

export class ShortcutHelp {
  #open = false;
  readonly #listeners = new Set<() => void>();

  readonly getSnapshot = (): boolean => this.#open;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly open = (): void => {
    this.#set(true);
  };

  readonly close = (): void => {
    this.#set(false);
  };

  readonly toggle = (): void => {
    this.#set(!this.#open);
  };

  #set(open: boolean): void {
    if (open === this.#open) return;
    this.#open = open;
    for (const listener of this.#listeners) listener();
  }
}

const styles = stylex.create({
  group: { display: 'flex', flexDirection: 'column', gap: space.x2, margin: 0 },
  heading: {
    margin: 0,
    paddingBottom: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  list: { display: 'flex', flexDirection: 'column', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x4,
    paddingBlock: space.x3,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: { default: color.divider, ':last-child': 'transparent' },
  },
  label: { display: 'flex', flexDirection: 'column', minWidth: 0, margin: 0, color: color.fg },
  note: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  keys: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.x2,
    flexShrink: 0,
    margin: 0,
    color: color.subtle,
    fontSize: text.metaSize,
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    paddingInline: space.x2,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.xs,
    backgroundColor: color.elevated,
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
});

export function ShortcutHelpList({
  t,
  apple = isApplePlatform(),
}: {
  t: BotHarnessTranslate;
  apple?: boolean;
}): ReactElement {
  return (
    <>
      {SHORTCUT_HELP_GROUPS.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`bh-shortcuts-${group.id}`}
          {...stylex.props(styles.group)}
        >
          <h3 id={`bh-shortcuts-${group.id}`} {...stylex.props(styles.heading)}>
            {t(group.title)}
          </h3>
          <dl {...stylex.props(styles.list)}>
            {group.entries.map((entry) => (
              <div key={entry.id} data-shortcut={entry.id} {...stylex.props(styles.row)}>
                <dt {...stylex.props(styles.label)}>
                  <span>{t(entry.label)}</span>
                  {entry.note === undefined ? null : (
                    <span {...stylex.props(styles.note)}>{t(entry.note)}</span>
                  )}
                </dt>
                <dd {...stylex.props(styles.keys)}>
                  {entry.keys.map((combo, index) => (
                    <Fragment key={combo.join('+')}>
                      {index > 0 ? <span>{t('shortcuts.or')}</span> : null}
                      {combo.map((key) => (
                        <kbd key={key} {...stylex.props(styles.kbd)}>
                          {shortcutKeyLabel(key, apple)}
                        </kbd>
                      ))}
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

export function ShortcutHelpView({
  shortcutHelp,
  t,
}: {
  shortcutHelp: ShortcutHelp;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const open = useSyncExternalStore(shortcutHelp.subscribe, shortcutHelp.getSnapshot, () => false);
  if (!open) return null;
  return (
    <PanelDialog
      title={t('shortcuts.title')}
      size="small"
      scroll
      closeLabel={t('common.close')}
      onClose={shortcutHelp.close}
      data={{ 'data-bh-shortcut-help': '' }}
    >
      <ShortcutHelpList t={t} />
    </PanelDialog>
  );
}
