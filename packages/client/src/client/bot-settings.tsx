import { SettingsSearch, searchSettings } from './settings-search.js';
import { useMountedResource } from './mounted-resource.js';
import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';

import type {} from './bot-settings-slot.js';
import { SettingsDialog } from './ds/settings-dialog.js';
import type { BotHarnessTranslate } from './locale.js';

export const BOT_SETTINGS_SECTIONS = {
  general: 'general',
  appearance: 'appearance',
  notifications: 'notifications',
  shortcuts: 'shortcuts',
  models: 'models',
  messaging: 'messaging',
  autoApproval: 'auto-approval',
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
  readonly layoutAvailable?: boolean;
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
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<{ title: string; nonce: number } | undefined>();
  const locate = useMountedResource<HTMLDivElement>(
    (root) => {
      for (const item of root.querySelectorAll('[data-settings-highlight]'))
        item.removeAttribute('data-settings-highlight');
      if (!target) {
        root.parentElement?.scrollTo?.(0, 0);
        return;
      }
      let found = false;
      const find = () => {
        if (found) return;
        const node = [...root.querySelectorAll<HTMLElement>('[role="group"], section, h3')].find(
          (item) => {
            const label = item.getAttribute('aria-labelledby');
            return (
              (label
                ? document.getElementById(label)?.textContent
                : item.tagName === 'H3'
                  ? item.textContent
                  : ''
              )?.trim() === target.title
            );
          },
        );
        if (!node) return;
        found = true;
        node.scrollIntoView?.({ block: 'center' });
        node.setAttribute('data-settings-highlight', '');
        node.tabIndex = -1;
        node.focus({ preventScroll: true });
      };
      const observer = new MutationObserver(find);
      observer.observe(root, { childList: true, subtree: true });
      find();
      return () => observer.disconnect();
    },
    [state.sectionId, target],
  );
  if (!state.open) return null;
  const rows = [...registered].sort((a, b) => a.order - b.order);
  const active =
    rows.find((row) => row.id === state.sectionId) ??
    rows.find((row) => row.id === BOT_SETTINGS_DEFAULT_SECTION) ??
    rows[0];
  const close = (): void => {
    setQuery('');
    setTarget(undefined);
    botSettings.close();
  };
  return (
    <SettingsDialog
      title={t('settings.nav')}
      navTitle={t('settings.nav')}
      sections={rows}
      activeId={active?.id}
      navigationSearch={<SettingsSearch query={query} onChange={setQuery} t={t} />}
      navigationResults={
        query.trim() ? (
          <div className="bh-settings-search-results" aria-label={t('settings.results')}>
            {searchSettings(rows, query, t).length ? (
              searchSettings(rows, query, t).map((result) => (
                <button
                  type="button"
                  key={`${result.section}:${result.title}`}
                  onClick={() => {
                    botSettings.select(result.section);
                    setTarget(
                      result.target ? { title: result.target, nonce: Date.now() } : undefined,
                    );
                    setQuery('');
                  }}
                >
                  <span>{result.title}</span>
                  <small>{result.page}</small>
                </button>
              ))
            ) : (
              <p role="status">{t('settings.noResults')}</p>
            )}
          </div>
        ) : undefined
      }
      onSelect={(id) => {
        setTarget(undefined);
        setQuery('');
        botSettings.select(id);
      }}
      onClose={close}
      labels={{
        nav: t('botSettings.nav'),
        close: t('common.close'),
        picker: (section) => t('botSettings.picker', { section }),
      }}
    >
      <div ref={locate} data-settings-content={active?.id}>
        {active === undefined
          ? null
          : (renderSlot(SECTION_SLOT, { close }, { only: active.id }) as unknown as ReactNode)}
      </div>
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
  let layoutVersion = -1;
  let revision = -1;
  let rows: readonly BotSettingsSectionRow[] = [];
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(SECTION_SLOT);
      const nextRevision = ctx.locale.getSnapshot().revision;
      const nextLayoutVersion = ctx.slots.getVersion('botharness.settings.layout');
      if (
        nextVersion !== version ||
        nextRevision !== revision ||
        nextLayoutVersion !== layoutVersion
      ) {
        version = nextVersion;
        layoutVersion = nextLayoutVersion;
        revision = nextRevision;
        rows = ctx.slots.entries(SECTION_SLOT).map(({ options }) => ({
          id: options.id ?? '',
          layoutAvailable: ctx.slots.entries('botharness.settings.layout').length > 0,
          order: options.order ?? 0,
          label: typeof options.label === 'function' ? options.label() : (options.label ?? ''),
        }));
      }
      return rows;
    },
    subscribe: (listener) => {
      const offLedger = ctx.slots.subscribe(SECTION_SLOT, listener);
      const offLocale = ctx.locale.subscribe(listener);
      const offLayout = ctx.slots.subscribe('botharness.settings.layout', listener);
      return () => {
        offLedger();
        offLocale();
        offLayout();
      };
    },
  };
}
