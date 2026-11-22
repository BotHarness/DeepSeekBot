import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import {
  createLoadingReleaseService,
  installedRelease,
  type ReleaseInstaller,
} from '../../release/service.js';
import { loadedReleaseComponents } from '../../release/component.js';
import { createProcessRestarter, type ReleaseRestarter } from '../../release/restart.js';
import { createPluginUpdateService } from '../../release/plugins.js';
import { createUpdateRuns } from '../../release/update-runs.js';
import { createUpdateLifecycle } from '../../diagnostics/update-lifecycle.js';
import type { createCore } from '../../plugin.js';

export function resolveProfile(
  ctx: Context,
  installedPackage: ReturnType<typeof installedRelease>,
) {
  const profile = ctx.get('profileContext') as { installAnchor: string; dir: string } | undefined;
  const releaseAnchors =
    profile === undefined ? [] : [profile.installAnchor, join(profile.dir, 'package.json')];
  installedPackage.identity(releaseAnchors);
  return { profile, releaseAnchors };
}

export function apply({
  moduleUrl,
  dshHome,
  profile,
  diagnosticEvents,
  runningRelease,
}: {
  moduleUrl: string;
  dshHome: string;
  profile: ReturnType<typeof resolveProfile>['profile'];
  diagnosticEvents: DiagnosticEvents;
  runningRelease: { version: string };
}) {
  const release = installedRelease(moduleUrl);
  const updateLifecycle = createUpdateLifecycle({
    dir: join(
      dshHome,
      'botharness',
      'diagnostics',
      createHash('sha256')
        .update(profile?.dir ?? dshHome)
        .digest('hex')
        .slice(0, 24),
    ),
    events: diagnosticEvents,
    runningVersion: runningRelease.version,
  });
  return { release, updateLifecycle };
}

export function mountInstaller(
  ctx: Context,
  updateLifecycle: ReturnType<typeof createUpdateLifecycle>,
  {
    installer,
    events,
    appExit,
  }: {
    installer(ctx: Context): ReleaseInstaller;
    events: { on(event: string, listener: (value: unknown) => void): () => void };
    appExit(ctx: Context): (code: number) => void;
  },
) {
  const releaseInstaller: { current: ReleaseInstaller | undefined } = {
    current: undefined,
  };
  ctx.inject(['pluginManager'], (managerCtx) => {
    managerCtx.effect(() => {
      releaseInstaller.current = installer(managerCtx);
      return () => {
        releaseInstaller.current = undefined;
      };
    }, 'botharness: release installer');
  });
  const updateRuns = createUpdateRuns({
    canceller: () => releaseInstaller.current,
    observe: (summary) => updateLifecycle.observe(summary),
  });
  events.on('plugin-manager/install-log', (chunk) => updateRuns.log(chunk));
  events.on('plugin-manager/install-state', (progress) => updateRuns.state(progress));
  const releaseRestarter: { current: ReleaseRestarter | undefined } = {
    current: undefined,
  };
  ctx.inject(['appExit'], (exitCtx) => {
    exitCtx.effect(() => {
      releaseRestarter.current = createProcessRestarter({
        exit: appExit(exitCtx),
        onFailure: () => updateLifecycle.restartFailed(),
      });
      return () => {
        releaseRestarter.current = undefined;
      };
    }, 'botharness: release restarter');
  });
  return { releaseInstaller, updateRuns, releaseRestarter };
}

export function mountServices(
  ctx: Context,
  {
    runningRelease,
    profile,
    installedPackage,
    releaseAnchors,
    releaseInstaller,
    releaseRestarter,
    updateRuns,
    updateLifecycle,
  }: ReturnType<typeof resolveProfile> &
    ReturnType<typeof mountInstaller> & {
      runningRelease: {
        version: string;
        ledgers: ReturnType<ReturnType<typeof installedRelease>['ledgers']>;
      };
      installedPackage: ReturnType<typeof installedRelease>;
      updateLifecycle: ReturnType<typeof createUpdateLifecycle>;
    },
) {
  const releaseService = createLoadingReleaseService({
    version: () => runningRelease.version,
    ...(profile === undefined
      ? {}
      : {
          profileId: createHash('sha256').update(profile.dir).digest('hex').slice(0, 24),
        }),
    identity: () =>
      installedPackage.identity(releaseAnchors, loadedReleaseComponents(ctx.registry.values())),
    ledgers: () => runningRelease.ledgers,
    installer: () => releaseInstaller.current,
    restarter: () => releaseRestarter.current,
    runs: updateRuns,
    diagnostics: updateLifecycle,
    warn: (message) => ctx.logger.warn(message),
  });
  const pluginUpdates = createPluginUpdateService({
    installer: () => releaseInstaller.current,
    restarter: () => releaseRestarter.current,
    runs: updateRuns,
  });
  return { releaseService, pluginUpdates };
}
