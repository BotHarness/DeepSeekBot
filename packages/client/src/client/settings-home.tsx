import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { ShortcutTile } from './ds/shortcut-tile.js';
import { Note } from './ds/note.js';
import { accent, space } from './ds/tobs.stylex.js';
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
  unpin: { marginInlineEnd: space.x3 },
  pinned: { color: { default: accent.solid, ':hover': accent.solid } },
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
        <ShortcutTile
          key={row.id}
          data={{ 'data-settings-pin': row.id }}
          icon={row.icon}
          label={row.label}
          onOpen={() => {
            onOpen(row.id);
          }}
          action={
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
              <ChannelSidebarIcon name="star" size={14} strokeWidth={1.75} filled />
            </IconButton>
          }
        />
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
      <ChannelSidebarIcon name="star" size={14} strokeWidth={1.75} filled={on} />
    </IconButton>
  );
}
