import { defaultStorage } from './roster-config.js';
import type { Shortcuts, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { WORKSPACE_CHANNELS, WORKSPACE_HOME } from './workspace-context.js';

const DEFAULT_KEYS: Readonly<Record<string, string>> = {
  [WORKSPACE_HOME]: 'KeyH',
  [WORKSPACE_CHANNELS]: 'Digit1',
  [CHANNEL_BODY_PANEL]: 'Digit2',
  'activity-center': 'Digit3',
  'generated-files': 'Digit4',
  'memory-files': 'Digit6',
  sessions: 'Digit7',
  'bot-inbox': 'Digit8',
  schedules: 'Digit9',
  'botharness-computer': 'Digit0',
  'botharness-browser': 'KeyB',
  'memory-evolution': 'KeyE',
};

export const workspaceShortcutId = (id: string): ShortcutCommandId =>
  `botharness.panel.p${Array.from(id, (char) => char.codePointAt(0)!.toString(16)).join('-')}` as ShortcutCommandId;

export function registerWorkspaceShortcuts(
  shortcuts: Pick<Shortcuts, 'register'>,
  registry: DockPanelRegistry,
  active: () => boolean,
  t: BotHarnessTranslate,
): () => void {
  const registered = new Map<string, () => void>();
  const sync = () => {
    const labels = new Map(
      registry
        .panels()
        .filter((panel) => panel.id !== 'members')
        .map((panel) => [panel.id, panel.title]),
    );
    labels.set(WORKSPACE_CHANNELS, t('workspace.channels'));
    labels.set(CHANNEL_BODY_PANEL, t('workspace.messages'));
    for (const [id, dispose] of registered)
      if (!labels.has(id)) {
        dispose();
        registered.delete(id);
      }
    for (const [id, title] of labels) {
      if (registered.has(id)) continue;
      const code = DEFAULT_KEYS[id];
      const binding = code ? { code, modifiers: ['primary', 'alt', 'shift'] as const } : undefined;
      registered.set(
        id,
        shortcuts.register({
          id: workspaceShortcutId(id),
          label: () =>
            t('workspace.shortcut', {
              panel:
                id === WORKSPACE_CHANNELS
                  ? t('workspace.channels')
                  : id === CHANNEL_BODY_PANEL
                    ? t('workspace.messages')
                    : (registry.panels().find((panel) => panel.id === id)?.title ?? title),
            }),
          aliases: ['Bot mode', 'panel', id],
          defaults: binding
            ? {
                'desktop:macos': binding,
                'desktop:windows': binding,
                'desktop:linux': id === WORKSPACE_HOME ? { ...binding, code: 'KeyO' } : binding,
                'web:macos': binding,
                'web:windows': binding,
              }
            : {},
          regions: ['page', 'editable'],
          modals: [],
          resolve: (context) =>
            active() && registry.available() && registry.canOpen?.(id) !== false && !context.modal
              ? { status: 'handled', run: () => registry.toggle(id) }
              : { status: 'pass' },
        }),
      );
    }
  };
  sync();
  const unsubscribe = registry.subscribe(sync);
  return () => {
    unsubscribe();
    for (const dispose of registered.values()) dispose();
  };
}

export function migrateWorkShortcut(
  shortcuts: Pick<
    Shortcuts,
    'runtime' | 'platform' | 'config' | 'catalog' | 'describeBinding' | 'edit'
  >,
  notice: () => void,
): () => void {
  const old = workspaceShortcutId('group-work');
  const next = workspaceShortcutId('sessions');
  let busy = false;
  let disposed = false;
  let notified = false;
  let attempted = '';
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const sync = async () => {
    if (busy || disposed) return;
    const state = shortcuts.config.getSnapshot();
    if (state.status !== 'ready' || !shortcuts.catalog.getSnapshot().some((row) => row.id === next))
      return;
    const profile = state.document.profiles[`${shortcuts.runtime}:${shortcuts.platform}`] ?? {};
    if (!Object.hasOwn(profile, old)) return;
    const fingerprint = JSON.stringify([profile[old], profile[next]]);
    const migrationKey = `botharness/work-shortcut-migration.v1:${shortcuts.runtime}:${shortcuts.platform}`;
    try {
      if (defaultStorage()?.getItem(migrationKey) === JSON.stringify(profile[old])) return;
    } catch {}
    if (attempted === fingerprint) return;
    busy = true;
    attempted = fingerprint;
    const warn = () => {
      if (!disposed && !notified) {
        notified = true;
        const key = `botharness/work-shortcut-notice.v1:${shortcuts.runtime}:${shortcuts.platform}`;
        try {
          const storage = defaultStorage();
          if (storage?.getItem(key) === fingerprint) return;
          storage?.setItem(key, fingerprint);
        } catch {}
        notice();
      }
    };
    try {
      if (!Object.hasOwn(profile, next) && profile[old] !== null) {
        const binding = profile[old]!;
        const check = shortcuts.describeBinding(binding);
        if (check.issue || check.conflicts.some((id) => id !== old && id !== next)) {
          warn();
          return;
        }
        const saved = await shortcuts.edit({ type: 'set', id: next, binding }, state.revision);
        if (saved.status !== 'saved') {
          attempted = '';
          if ((saved.status === 'not-ready' || saved.status === 'stale') && retries < 3) {
            retryTimer = setTimeout(
              () => {
                retryTimer = undefined;
                void sync();
              },
              100 * 3 ** retries++,
            );
          } else warn();
          return;
        }
      } else if (
        Object.hasOwn(profile, next) &&
        JSON.stringify(profile[next]) !== JSON.stringify(profile[old])
      ) {
        warn();
      }
      try {
        defaultStorage()?.setItem(migrationKey, JSON.stringify(profile[old]));
      } catch {}
    } catch {
      attempted = '';
      warn();
    } finally {
      busy = false;
    }
  };
  const changed = () => {
    queueMicrotask(() => {
      void sync();
    });
  };
  const unsubConfig = shortcuts.config.subscribe(changed);
  const unsubCatalog = shortcuts.catalog.subscribe(changed);
  changed();
  return () => {
    disposed = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    unsubConfig();
    unsubCatalog();
  };
}
