import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';

import type {} from './bot-settings-slot.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import type { BotHarnessTranslate } from './locale.js';

export const BOT_SETTINGS_SECTIONS = {
  general: 'general',
  models: 'models',
  messaging: 'messaging',
  imApps: 'im-apps',
  companions: 'companions',
  devices: 'devices',
  dataPrivacy: 'data-privacy',
  advanced: 'advanced',
  about: 'about',
} as const;

export const BOT_SETTINGS_DEFAULT_SECTION = BOT_SETTINGS_SECTIONS.general;

const SECTION_SLOT = 'botharness.settings.section';

export interface BotSettingsSectionRow {
  readonly id: string;
  readonly order: number;
  readonly label: string;
}

export interface BotSettingsSnapshot {
  readonly open: boolean;
  readonly sectionId: string | undefined;
}

export interface BotSettingsSectionSource {
  getSnapshot(): readonly BotSettingsSectionRow[];
  subscribe(listener: () => void): () => void;
}

export class BotSettings {
  #snapshot: BotSettingsSnapshot = { open: false, sectionId: undefined };
  readonly #listeners = new Set<() => void>();

  readonly getSnapshot = (): BotSettingsSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly open = (sectionId?: string): void => {
    this.#set({ open: true, sectionId: sectionId ?? this.#snapshot.sectionId });
  };

  readonly select = (sectionId: string): void => {
    this.#set({ ...this.#snapshot, sectionId });
  };

  readonly close = (): void => {
    this.#set({ ...this.#snapshot, open: false });
  };

  #set(next: BotSettingsSnapshot): void {
    if (next.open === this.#snapshot.open && next.sectionId === this.#snapshot.sectionId) return;
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }
}

export type BotSettingsViewProps = PropsRenderSlots<'botharness.settings.section'> & {
  botSettings: BotSettings;
  sections: BotSettingsSectionSource;
  t: BotHarnessTranslate;
};

export function BotSettingsView({
  botSettings,
  sections,
  renderSlot,
  t,
}: BotSettingsViewProps): ReactElement | null {
  const state = useSyncExternalStore(botSettings.subscribe, botSettings.getSnapshot);
  const registered = useSyncExternalStore(sections.subscribe, sections.getSnapshot);
  if (!state.open) return null;
  const rows = [...registered].sort((a, b) => a.order - b.order);
  const active =
    rows.find((row) => row.id === state.sectionId) ??
    rows.find((row) => row.id === BOT_SETTINGS_DEFAULT_SECTION) ??
    rows[0];
  const close = (): void => {
    botSettings.close();
  };
  return (
    <SettingsDialog
      title={t('settings.nav')}
      navTitle={t('settings.nav')}
      sections={rows}
      activeId={active?.id}
      onSelect={botSettings.select}
      onClose={close}
      labels={{
        nav: t('botSettings.nav'),
        close: t('common.close'),
        picker: (section) => t('botSettings.picker', { section }),
      }}
    >
      {active === undefined
        ? null
        : (renderSlot(SECTION_SLOT, { close }, { only: active.id }) as unknown as ReactNode)}
    </SettingsDialog>
  );
}

interface SectionLedger {
  slots: {
    entries(key: string): readonly {
      options: { id?: string; order?: number; label?: string | (() => string) };
    }[];
    getVersion(key: string): number;
    subscribe(key: string, listener: () => void): () => void;
  };
  locale: {
    getSnapshot(): { revision: number };
    subscribe(listener: () => void): () => void;
  };
}

export function botSettingsSectionSource(ctx: SectionLedger): BotSettingsSectionSource {
  let version = -1;
  let revision = -1;
  let rows: readonly BotSettingsSectionRow[] = [];
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(SECTION_SLOT);
      const nextRevision = ctx.locale.getSnapshot().revision;
      if (nextVersion !== version || nextRevision !== revision) {
        version = nextVersion;
        revision = nextRevision;
        rows = ctx.slots.entries(SECTION_SLOT).map(({ options }) => ({
          id: options.id ?? '',
          order: options.order ?? 0,
          label: typeof options.label === 'function' ? options.label() : (options.label ?? ''),
        }));
      }
      return rows;
    },
    subscribe: (listener) => {
      const offLedger = ctx.slots.subscribe(SECTION_SLOT, listener);
      const offLocale = ctx.locale.subscribe(listener);
      return () => {
        offLedger();
        offLocale();
      };
    },
  };
}
