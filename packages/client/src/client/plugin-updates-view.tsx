import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { PluginUpdate } from '../../../core/src/release/plugins.js';
import type { BridgeCall } from './bridge.js';
import { SettingsRow, SettingsRows } from './ds/settings-row.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { PluginUpdatesController, type PluginRowState } from './plugin-updates.js';
import {
  compatibilityText,
  DESKTOP_UPDATE_PROFILE,
  INSTALL_FAILURE_KEYS,
  RELEASE_UPDATE_PROFILE,
  runsInDesktop,
} from './release-notes-view.js';

const PLUGIN_NAMES: Readonly<Record<string, BotHarnessKey>> = {
  '@botharness/vrm-companion': 'plugins.name.vrmCompanion',
};

export function pluginUpdateCommand(name: string, version: string, profile: string): string {
  return `dsh plugin --profile ${profile} add ${name}@${version}`;
}

function pluginTitle(name: string, t: BotHarnessTranslate): string {
  const key = PLUGIN_NAMES[name];
  return key === undefined ? name : t(key);
}

function statusText(plugin: PluginUpdate, t: BotHarnessTranslate): string {
  switch (plugin.status) {
    case 'development':
      return t('plugins.status.development');
    case 'unavailable':
      return t('plugins.status.unavailable', { current: plugin.current });
    case 'current':
      return t('plugins.status.current', { current: plugin.current });
    case 'available':
      return t('plugins.status.available', { current: plugin.current, latest: plugin.latest });
    case 'blocked':
      return `${t('plugins.status.blocked', { current: plugin.current, latest: plugin.latest })} ${compatibilityText(plugin.compatibility, t)}`;
    case 'restart-required':
      return t('plugins.status.restart', { installed: plugin.installed });
  }
}

function ManualCommand({
  name,
  version,
  t,
}: {
  name: string;
  version: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const command = pluginUpdateCommand(
    name,
    version,
    runsInDesktop() ? DESKTOP_UPDATE_PROFILE : RELEASE_UPDATE_PROFILE,
  );
  return (
    <>
      <div className="bh-settings-row-desc">{t('plugins.manual')}</div>
      <div className="bh-release-command">
        <code>{command}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
            });
          }}
        >
          {t(copied ? 'release.update.copied' : 'release.update.copy')}
        </Button>
      </div>
    </>
  );
}

function PluginRow({
  plugin,
  row,
  installable,
  busy,
  controller,
  t,
}: {
  plugin: PluginUpdate;
  row: PluginRowState;
  installable: boolean;
  busy: boolean;
  controller: PluginUpdatesController;
  t: BotHarnessTranslate;
}): ReactElement {
  const installing = row.status === 'installing';
  const reloading = row.status === 'reloading';
  const available = plugin.status === 'available';
  return (
    <SettingsRow
      title={pluginTitle(plugin.name, t)}
      data={{ 'data-plugin-update': plugin.name, 'data-plugin-status': plugin.status }}
      description={
        <span role="status" aria-live="polite">
          {reloading
            ? t('plugins.install.reloading', { installed: row.version })
            : installing
              ? t('plugins.install.progress', { latest: row.version })
              : statusText(plugin, t)}
        </span>
      }
      control={
        available && installable ? (
          <Button
            size="sm"
            variant="primary"
            disabled={busy || installing || reloading}
            data-plugin-install={plugin.latest}
            onClick={() => {
              void controller.install(plugin.name, plugin.latest);
            }}
          >
            {t(installing || reloading ? 'release.install.running' : 'release.install.action')}
          </Button>
        ) : null
      }
    >
      {row.status === 'failed' ? (
        <div className="bh-release-install-error" role="alert" data-plugin-install-error>
          <div>
            {t(
              row.reason === 'unknown-plugin'
                ? 'plugins.install.unknown'
                : INSTALL_FAILURE_KEYS[row.reason],
            )}
          </div>
          {row.diagnostic === undefined ? null : (
            <pre className="bh-release-install-diagnostic">{row.diagnostic}</pre>
          )}
          {row.logPath === undefined ? null : (
            <div className="bh-settings-row-desc">
              {t('release.install.log', { path: row.logPath })}
            </div>
          )}
        </div>
      ) : null}
      {available && (!installable || row.status === 'failed') ? (
        <ManualCommand name={plugin.name} version={plugin.latest} t={t} />
      ) : null}
    </SettingsRow>
  );
}

export type PluginsSectionProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

export function PluginsSection({ call, t }: PluginsSectionProps): ReactElement {
  const controller = useMemo(() => new PluginUpdatesController(call), [call]);
  const snapshot = useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
  const mount = useMountedResource<HTMLDivElement>(() => {
    void controller.load();
  }, [controller]);
  const busy = Object.values(snapshot.rows).some(
    (row) => row.status === 'installing' || row.status === 'reloading',
  );
  const staged = snapshot.plugins.some((plugin) => plugin.status === 'restart-required');
  const restarting = snapshot.restart === 'restarting';
  return (
    <SettingsRows rootRef={mount}>
      <SettingsRow
        title={t('plugins.row.title')}
        description={
          <span role="status" aria-live="polite">
            {snapshot.status === 'loading'
              ? t('plugins.loading')
              : snapshot.status === 'error'
                ? t('plugins.error')
                : snapshot.plugins.length === 0
                  ? t('plugins.empty')
                  : snapshot.installable
                    ? t('plugins.description')
                    : t('plugins.notInstallable')}
          </span>
        }
        control={
          <Button
            size="sm"
            variant="outline"
            disabled={snapshot.checking || busy || restarting}
            data-plugin-check
            onClick={() => {
              void controller.load(true);
            }}
          >
            {t(snapshot.checking ? 'plugins.checking' : 'release.check')}
          </Button>
        }
      />
      {snapshot.plugins.map((plugin) => (
        <PluginRow
          key={plugin.name}
          plugin={plugin}
          row={snapshot.rows[plugin.name] ?? { status: 'idle' }}
          installable={snapshot.installable}
          busy={busy || restarting}
          controller={controller}
          t={t}
        />
      ))}
      {staged ? (
        <SettingsRow
          title={t('plugins.restart.title')}
          data={{ 'data-plugin-restart': snapshot.restart }}
          description={
            <span role="status" aria-live="polite">
              {t(
                restarting
                  ? 'release.restart.progress'
                  : snapshot.restart === 'failed'
                    ? 'plugins.restart.manual'
                    : snapshot.restartable
                      ? 'release.restart.hint'
                      : runsInDesktop()
                        ? 'release.restart.desktop'
                        : 'plugins.restart.manual',
              )}
            </span>
          }
          control={
            snapshot.restartable ? (
              <Button
                size="sm"
                variant="primary"
                disabled={restarting}
                data-plugin-restart-action
                onClick={() => {
                  void controller.restart();
                }}
              >
                {t(restarting ? 'release.restart.running' : 'release.restart.action')}
              </Button>
            ) : null
          }
        />
      ) : null}
    </SettingsRows>
  );
}
