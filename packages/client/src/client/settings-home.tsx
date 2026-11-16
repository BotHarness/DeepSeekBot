import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Note } from './ds/note.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export const SETTINGS_HOME = 'home';

export interface SettingsPins {
  getSnapshot(): readonly string[];
  subscribe(listener: () => void): () => void;
  set(pins: readonly string[]): void;
}

export interface SettingsHomeRow {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
}

const PIN_ALIASES: Readonly<Record<string, string>> = {
  'environment-models': 'models',
  'environment-approvals': 'auto-approval',
  'environment-prompts': 'prompts',
  'environment-voice': 'voice',
};

export function settingsPinId(sectionId: string): string {
  return PIN_ALIASES[sectionId] ?? sectionId;
}

export function pinnedRows<Row extends { readonly id: string }>(
  pins: readonly string[],
  rows: readonly Row[],
): Row[] {
  return pins.flatMap((pin) => {
    const row = rows.find((candidate) => settingsPinId(candidate.id) === pin);
    return row === undefined ? [] : [row];
  });
}

export function useSettingsPins(pins: SettingsPins): readonly string[] {
  return useSyncExternalStore(pins.subscribe, pins.getSnapshot, pins.getSnapshot);
}

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
    gap: space.x4,
  },
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: { default: color.surface, ':hover': color.hover },
  },
  open: {
    display: 'flex',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
    padding: space.x5,
    paddingInlineEnd: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: color.muted,
  },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  unpin: { marginInlineEnd: space.x3 },
  pinned: { color: { default: color.accent, ':hover': color.accent } },
});

export function SettingsHome({
  rows,
  pins,
  onOpen,
  t,
}: {
  rows: readonly SettingsHomeRow[];
  pins: SettingsPins;
  onOpen: (id: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const pinned = useSettingsPins(pins);
  const cards = pinnedRows(pinned, rows);
  if (cards.length === 0) return <Note>{t('settings.home.empty')}</Note>;
  return (
    <div data-settings-home="" {...stylex.props(styles.grid)}>
      {cards.map((row) => (
        <div key={row.id} data-settings-pin={row.id} {...stylex.props(styles.card)}>
          <button
            type="button"
            onClick={() => {
              onOpen(row.id);
            }}
            {...stylex.props(styles.open)}
          >
            <span aria-hidden="true" {...stylex.props(styles.icon)}>
              {row.icon}
            </span>
            <span {...stylex.props(styles.label)}>{row.label}</span>
          </button>
          <IconButton
            size="inline"
            tone="subtle"
            aria-label={t('settings.unpinNamed', { section: row.label })}
            title={t('settings.unpin')}
            onClick={() => {
              const id = settingsPinId(row.id);
              pins.set(pinned.filter((pin) => pin !== id));
            }}
            xstyle={styles.unpin}
          >
            <ChannelSidebarIcon name="star" size={14} filled />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function PinToggle({
  sectionId,
  pins,
  t,
}: {
  sectionId: string;
  pins: SettingsPins;
  t: BotHarnessTranslate;
}): ReactElement {
  const pinned = useSettingsPins(pins);
  const id = settingsPinId(sectionId);
  const on = pinned.includes(id);
  const label = t(on ? 'settings.unpin' : 'settings.pin');
  return (
    <IconButton
      aria-label={label}
      aria-pressed={on}
      title={label}
      data-settings-pin-toggle=""
      onClick={() => {
        pins.set(on ? pinned.filter((pin) => pin !== id) : [...pinned, id]);
      }}
      xstyle={on ? styles.pinned : undefined}
    >
      <ChannelSidebarIcon name="star" size={14} filled={on} />
    </IconButton>
  );
}
