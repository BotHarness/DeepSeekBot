import {
  Fragment,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconEditOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotModeSendKey } from '../bot-mode-settings.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { isApplePlatform, KeyCombo, shortcutKeyLabel, type ShortcutKey } from './ds/kbd.js';
import { IconButton } from './ds/icon-button.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import {
  bindingFromEvent,
  bindingKeys,
  DEFAULT_SHORTCUT_BINDINGS,
  isModifierOnly,
  type ShortcutActionId,
  type ShortcutBindingProblem,
  type ShortcutBindings,
} from './shortcut-bindings.js';

export interface ShortcutHelpEntry {
  readonly id: string;
  readonly keys?: readonly (readonly ShortcutKey[])[];
  readonly action?: ShortcutActionId;
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
      { id: 'bot-mode', action: 'bot-mode', label: 'shortcuts.botMode' },
      {
        id: 'conversation-index',
        keys: [['Alt', '1 … 0']],
        label: 'shortcuts.conversationIndex',
      },
      { id: 'quick-switcher', action: 'quick-switcher', label: 'shortcuts.quickSwitcher' },
      { id: 'conversation-prev', action: 'conversation-prev', label: 'shortcuts.conversationPrev' },
      { id: 'conversation-next', action: 'conversation-next', label: 'shortcuts.conversationNext' },
      {
        id: 'unread-prev',
        action: 'unread-prev',
        label: 'shortcuts.unreadPrev',
        note: 'shortcuts.unreadStep.note',
      },
      {
        id: 'unread-next',
        action: 'unread-next',
        label: 'shortcuts.unreadNext',
        note: 'shortcuts.unreadStep.note',
      },
      { id: 'search', keys: [['Mod', 'F']], label: 'shortcuts.search' },
      { id: 'help', keys: [['?']], action: 'help', label: 'shortcuts.help' },
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

const SEND_KEY_COMBOS: Readonly<
  Record<BotModeSendKey, { send: readonly ShortcutKey[]; newline: readonly ShortcutKey[] }>
> = {
  enter: { send: ['Enter'], newline: ['Shift', 'Enter'] },
  'mod-enter': { send: ['Mod', 'Enter'], newline: ['Enter'] },
};

export function shortcutEntryKeys(
  entry: ShortcutHelpEntry,
  sendKey: BotModeSendKey,
  bindings?: ShortcutBindings,
): readonly (readonly ShortcutKey[])[] {
  if (entry.id === 'send') return [SEND_KEY_COMBOS[sendKey].send];
  if (entry.id === 'newline') return [SEND_KEY_COMBOS[sendKey].newline];
  const fixed = entry.keys ?? [];
  if (entry.action === undefined) return fixed;
  const binding = bindings?.binding(entry.action) ?? DEFAULT_SHORTCUT_BINDINGS[entry.action];
  return [...fixed, bindingKeys(binding)];
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
  locked: {
    opacity: 0.4,
    cursor: 'not-allowed',
    backgroundColor: { default: 'transparent', ':hover': 'transparent' },
    color: { default: color.subtle, ':hover': color.subtle },
  },
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
  problem: { color: color.danger, fontSize: text.metaSize, lineHeight: text.metaLine },
  saved: { color: color.success, fontSize: text.metaSize, lineHeight: text.metaLine },
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
});

function problemText(
  problem: ShortcutBindingProblem,
  t: BotHarnessTranslate,
  apple: boolean,
): string {
  if (problem.kind === 'conflict') {
    const owner = SHORTCUT_HELP_GROUPS.flatMap((group) => group.entries).find(
      (entry) => entry.action === problem.action,
    );
    return t('shortcuts.problem.conflict', { action: owner === undefined ? '' : t(owner.label) });
  }
  if (problem.kind === 'reserved') return t('shortcuts.problem.reserved');
  return t('shortcuts.problem.needs-modifier', {
    mod: shortcutKeyLabel('Mod', apple),
    alt: shortcutKeyLabel('Alt', apple),
  });
}

function lockedReason(entry: ShortcutHelpEntry): BotHarnessKey {
  return entry.id === 'send' || entry.id === 'newline'
    ? 'shortcuts.locked.sendKey'
    : 'shortcuts.locked';
}

type RowStatus =
  | { readonly id: string; readonly kind: 'problem'; readonly text: string }
  | { readonly id: string; readonly kind: 'saved' };

const staticBindings = { subscribe: () => () => {}, getSnapshot: () => undefined };

export function ShortcutHelpList({
  t,
  apple = isApplePlatform(),
  sendKey = 'enter',
  shortcutBindings,
}: {
  t: BotHarnessTranslate;
  apple?: boolean;
  sendKey?: BotModeSendKey;
  shortcutBindings?: ShortcutBindings | undefined;
}): ReactElement {
  const source = shortcutBindings ?? staticBindings;
  useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const [recording, setRecording] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<RowStatus | undefined>(undefined);
  const record = (
    event: KeyboardEvent<HTMLButtonElement>,
    entry: ShortcutHelpEntry,
    action: ShortcutActionId,
  ): void => {
    if (shortcutBindings === undefined || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (isModifierOnly(event)) return;
    if (
      event.key === 'Escape' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      setRecording(undefined);
      return;
    }
    const binding = bindingFromEvent(event, apple);
    const problem =
      binding === undefined
        ? ({ kind: 'needs-modifier' } as const)
        : shortcutBindings.set(action, binding);
    setStatus(
      problem === undefined
        ? { id: entry.id, kind: 'saved' }
        : { id: entry.id, kind: 'problem', text: problemText(problem, t, apple) },
    );
    if (problem === undefined) setRecording(undefined);
  };
  const reset = (entry: ShortcutHelpEntry, action: ShortcutActionId): void => {
    if (shortcutBindings === undefined) return;
    const problem = shortcutBindings.reset(action);
    setRecording(undefined);
    setStatus(
      problem === undefined
        ? { id: entry.id, kind: 'saved' }
        : { id: entry.id, kind: 'problem', text: problemText(problem, t, apple) },
    );
  };
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
            {group.entries.map((entry) => {
              const action = shortcutBindings === undefined ? undefined : entry.action;
              const rowStatus = status?.id === entry.id ? status : undefined;
              return (
                <div key={entry.id} data-shortcut={entry.id} {...stylex.props(styles.row)}>
                  <dt {...stylex.props(styles.label)}>
                    <span>{t(entry.label)}</span>
                    {entry.note === undefined ? null : (
                      <span {...stylex.props(styles.note)}>{t(entry.note)}</span>
                    )}
                    {rowStatus === undefined ? null : rowStatus.kind === 'problem' ? (
                      <span role="alert" {...stylex.props(styles.problem)}>
                        {rowStatus.text}
                      </span>
                    ) : (
                      <span role="status" {...stylex.props(styles.saved)}>
                        {t('shortcuts.saved')}
                      </span>
                    )}
                  </dt>
                  <dd {...stylex.props(styles.keys)}>
                    {recording === entry.id
                      ? null
                      : shortcutEntryKeys(entry, sendKey, shortcutBindings).map((combo, index) => (
                          <Fragment key={combo.join('+')}>
                            {index > 0 ? <span>{t('shortcuts.or')}</span> : null}
                            <KeyCombo keys={combo} apple={apple} />
                          </Fragment>
                        ))}
                    {shortcutBindings === undefined ? null : action === undefined ? (
                      <Tooltip label={t(lockedReason(entry))} side="top" align="end" portal>
                        <IconButton
                          size="inline"
                          tone="subtle"
                          aria-label={t('shortcuts.change.label', { action: t(entry.label) })}
                          aria-disabled
                          data-shortcut-locked=""
                          xstyle={styles.locked}
                          onClick={(event) => event.preventDefault()}
                        >
                          <IconEditOutlineRegular size={14} />
                        </IconButton>
                      </Tooltip>
                    ) : recording === entry.id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        autoFocus
                        data-shortcut-recorder=""
                        onKeyDown={(event) => record(event, entry, action)}
                        onBlur={() => setRecording(undefined)}
                        onClick={() => setRecording(undefined)}
                      >
                        {t('shortcuts.recording')}
                      </Button>
                    ) : (
                      <>
                        {shortcutBindings.isCustom(action) ? (
                          <Button size="sm" variant="ghost" onClick={() => reset(entry, action)}>
                            {t('shortcuts.reset')}
                          </Button>
                        ) : null}
                        <Tooltip label={t('shortcuts.change')} side="top" align="end" portal>
                          <IconButton
                            size="inline"
                            aria-label={t('shortcuts.change.label', { action: t(entry.label) })}
                            onClick={() => {
                              setStatus(undefined);
                              setRecording(entry.id);
                            }}
                          >
                            <IconEditOutlineRegular size={14} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </>
  );
}

export function ShortcutHelpView({
  shortcutHelp,
  shortcutBindings,
  t,
  useBotModePrefs,
}: {
  shortcutHelp: ShortcutHelp;
  shortcutBindings?: ShortcutBindings | undefined;
  t: BotHarnessTranslate;
  useBotModePrefs?: <T>(selector: (value: BotModePrefsSnapshot) => T) => T;
}): ReactElement | null {
  const open = useSyncExternalStore(shortcutHelp.subscribe, shortcutHelp.getSnapshot, () => false);
  const sendKey = useBotModePrefs?.((value) => value.sendKey) ?? 'enter';
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
      <ShortcutHelpList t={t} sendKey={sendKey} shortcutBindings={shortcutBindings} />
    </PanelDialog>
  );
}
