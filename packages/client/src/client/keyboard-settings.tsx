import { useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Shortcuts, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client';
import type { PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import { ShortcutHelpList } from './shortcut-help.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { useMountedResource } from './mounted-resource.js';

let workShortcutNotice = false;
const noticeListeners = new Set<() => void>();
const subscribeNotice = (listener: () => void) => {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
};
const noticeSnapshot = () => workShortcutNotice;
export function setWorkShortcutNotice(value: boolean): void {
  workShortcutNotice = value;
  noticeListeners.forEach((listener) => listener());
}

export function KeyboardSettings({
  t,
  useBotModePrefs,
  shortcutBindings,
  shortcuts,
}: PropsLocale<'botharness'> &
  InjectFace<
    BotModePrefsFace & { shortcutBindings: ShortcutBindings; shortcuts: Shortcuts }
  >): ReactElement {
  const migrationNotice = useSyncExternalStore(subscribeNotice, noticeSnapshot, noticeSnapshot);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<ShortcutCommandId>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const catalog = useSyncExternalStore(shortcuts.catalog.subscribe, shortcuts.catalog.getSnapshot);
  const sendKey = useBotModePrefs((value) => value.sendKey);
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!recording) return;
    let active = true;
    setReady(false);
    void shortcuts
      .recording(true)
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) {
          setError(t('settings.shortcuts.saveFailed'));
          setRecording(undefined);
        }
      });
    return () => {
      active = false;
      void shortcuts.recording(false).catch(() => {});
    };
  }, [recording, shortcuts]);
  const save = async (id: ShortcutCommandId, event?: KeyboardEvent<HTMLButtonElement>) => {
    if (busy || (event && !ready)) return;
    if (event?.nativeEvent.isComposing || (event && /^(Shift|Control|Alt|Meta)/u.test(event.code)))
      return;
    event?.preventDefault();
    event?.stopPropagation();
    if (event?.key === 'Escape') {
      setRecording(undefined);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const binding = event
        ? {
            code: event.code,
            modifiers: [
              event.ctrlKey ? 'control' : null,
              event.metaKey ? 'meta' : null,
              event.altKey ? 'alt' : null,
              event.shiftKey ? 'shift' : null,
            ].filter((value): value is 'control' | 'meta' | 'alt' | 'shift' => value !== null),
          }
        : undefined;
      if (binding) {
        const check = shortcuts.describeBinding(binding);
        if (check.issue || check.conflicts.some((owner) => owner !== id)) {
          setError(t('settings.shortcuts.conflict'));
          return;
        }
      }
      const result = await shortcuts.edit(
        binding ? { type: 'set', id, binding } : { type: 'reset', id },
        shortcuts.config.getSnapshot().revision,
      );
      if (result.status !== 'saved') {
        setError(
          t(
            result.status === 'conflict'
              ? 'settings.shortcuts.conflict'
              : 'settings.shortcuts.saveFailed',
          ),
        );
        return;
      }
      setRecording(undefined);
    } catch {
      setError(t('settings.shortcuts.saveFailed'));
    } finally {
      setBusy(false);
    }
  };
  const panels = catalog.filter(
    (row) =>
      row.id.startsWith('botharness.panel.') &&
      [row.label, ...row.keys]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div ref={mount} className="bh-keyboard-settings">
      {migrationNotice ? (
        <p role="status">
          {t('sessions.shortcut.migration')}{' '}
          <Button onClick={() => setWorkShortcutNotice(false)}>{t('common.close')}</Button>
        </p>
      ) : null}
      <Input
        className="bh-settings-search-input"
        type="search"
        aria-label={t('settings.shortcuts.search')}
        placeholder={t('settings.shortcuts.search')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setRecording(undefined);
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      {panels.length ? (
        <SettingsSection title={t('workspace.shortcutSearch')}>
          {panels.map((row) => (
            <SettingsRow
              key={row.id}
              title={row.label}
              control={
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    aria-label={t('shortcuts.change.label', { action: row.label })}
                    data-shortcut-recorder={recording === row.id ? '' : undefined}
                    onClick={() => {
                      setRecording(recording === row.id ? undefined : row.id);
                      setError('');
                    }}
                    onBlur={() => setRecording(undefined)}
                    onKeyDown={(event) => {
                      if (recording === row.id) {
                        event.preventDefault();
                        event.stopPropagation();
                        void save(row.id, event);
                      }
                    }}
                  >
                    {recording === row.id
                      ? t('shortcuts.recording')
                      : row.keys.join(' ') || t('settings.shortcuts.unbound')}
                  </Button>
                  {row.modified ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void save(row.id)}
                    >
                      {t('shortcuts.reset')}
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
        </SettingsSection>
      ) : null}
      <ShortcutHelpList
        nativeShortcuts={shortcuts}
        t={t}
        sendKey={sendKey}
        shortcutBindings={shortcutBindings}
        query={query}
      />
      <div className="bh-shortcuts-empty" role="status">
        {t('settings.noResults')}
      </div>
    </div>
  );
}
