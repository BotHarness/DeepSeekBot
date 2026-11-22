import { Button } from './ds/button.js';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { Note } from './ds/note.js';
import { CopyChip } from './ds/status-block.js';
import { layer, space, style } from './ds/tobs.stylex.js';

import type { PluginUpdate } from '../../../core/src/release/plugins.js';
import type { BridgeCall } from './bridge.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { PluginUpdatesController, type PluginRowState } from './plugin-updates.js';
import { UpdateRunPanel, useUpdateRuns } from './update-run-view.js';
import { updateRunActive, type UpdateRunsController } from './update-runs.js';
import {
  compatibilityText,
  DESKTOP_UPDATE_PROFILE,
  INSTALL_FAILURE_KEYS,
  RELEASE_UPDATE_PROFILE,
  runsInDesktop,
} from './release-notes-view.js';

const styles = stylex.create({
  diagnostic: {
    margin: 0,
    padding: space.x3,
    backgroundColor: layer.well,
    borderRadius: style.radiusContainer,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

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
      return t('plugins.status.available', {
        current: plugin.current,
        latest: plugin.latest,
      });
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
  const command = pluginUpdateCommand(
    name,
    version,
    runsInDesktop() ? DESKTOP_UPDATE_PROFILE : RELEASE_UPDATE_PROFILE,
  );
  return (
    <>
      <Note>{t('plugins.manual')}</Note>
      <CopyChip
        value={command}
        copyLabel={t('release.update.copy')}
        copiedLabel={t('release.update.copied')}
        marker="data-plugin-command"
        well
      />
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
  const { run } = useUpdateRuns(controller.runs);
  const shown = run?.kind === 'plugin' && run.name === plugin.name;
  const following = shown && updateRunActive(run);
  const installing = row.status === 'installing';
  const reloading = row.status === 'reloading';
  const available = plugin.status === 'available';
  return (
    <SettingsRow
      title={pluginTitle(plugin.name, t)}
      data={{
        'data-plugin-update': plugin.name,
        'data-plugin-status': plugin.status,
      }}
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
        available && installable && !following ? (
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
      <UpdateRunPanel
        controller={controller.runs}
        kind="plugin"
        name={plugin.name}
        title={pluginTitle(plugin.name, t)}
        t={t}
      />
      {row.status === 'failed' && !shown ? (
        <div data-plugin-install-error>
          <Note tone="danger">
            {t(
              row.reason === 'unknown-plugin'
                ? 'plugins.install.unknown'
                : INSTALL_FAILURE_KEYS[row.reason],
            )}
          </Note>
          {row.diagnostic === undefined ? null : (
            <pre {...stylex.props(styles.diagnostic)}>{row.diagnostic}</pre>
          )}
          {row.logPath === undefined ? null : (
            <Note>{t('release.install.log', { path: row.logPath })}</Note>
          )}
        </div>
      ) : null}
      {available && (!installable || row.status === 'failed') ? (
        <ManualCommand name={plugin.name} version={plugin.latest} t={t} />
      ) : null}
    </SettingsRow>
  );
}

export interface PluginsSectionProps {
  call: BridgeCall;
  t: BotHarnessTranslate;
  updateRuns?: UpdateRunsController;
}

export function PluginsSection(props: PluginsSectionProps): ReactElement {
  return (
    <SettingsRows>
      <PluginsSettings {...props} />
    </SettingsRows>
  );
}

export function PluginsSettings({
  call,
  updateRuns,
  title,
  t,
}: PluginsSectionProps & { readonly title?: string }): ReactElement {
  const controller = useMemo(
    () => new PluginUpdatesController(call, undefined, updateRuns),
    [call, updateRuns],
  );
  const snapshot = useSyncExternalStore(controller.source.subscribe, controller.source.getSnapshot);
  const runs = useUpdateRuns(controller.runs);
  const mount = useMountedResource<HTMLDivElement>(() => {
    void controller.load();
    void controller.runs.follow();
  }, [controller]);
  const busy =
    Object.values(snapshot.rows).some(
      (row) => row.status === 'installing' || row.status === 'reloading',
    ) || updateRunActive(runs.run);
  const staged = snapshot.plugins.some((plugin) => plugin.status === 'restart-required');
  const restarting = snapshot.restart === 'restarting';
  return (
    <SettingsSection title={title}>
      <SettingsRow
        rootRef={mount}
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
    </SettingsSection>
  );
}
