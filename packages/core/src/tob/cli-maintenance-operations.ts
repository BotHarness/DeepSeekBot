import { isDeepStrictEqual } from 'node:util';
import type { GitService, GitStatus } from '../memory/managed-git.js';
import type { ReleaseService, ReleaseUpdate } from '../release/service.js';
import { isReleaseVersion } from '../release/version.js';
import type { TelemetryService } from '../telemetry/service.js';
import type { PreparedTobOperation } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_MAINTENANCE_CAPABILITIES = [
  ['telemetry-status', 'Read telemetry preference and environment locks', false],
  ['telemetry-set', 'Change telemetry preference unless locked', true],
  ['git-status', 'Read Git availability and installation progress', false],
  ['git-install', 'Install the managed Git runtime when available', true],
  ['release-info', 'Read the running release and release notes', false],
  ['release-check', 'Check the existing release owner for updates', false],
  ['release-install', 'Install a reviewed available release with explicit confirmation', true],
  ['release-restart', 'Restart a reviewed pending release with explicit confirmation', true],
].map(([command, description, write]) => ({
  command: String(command),
  description: String(description),
  write: Boolean(write),
}));

function keys(args: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(args).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function same(actual: unknown, expected: unknown) {
  if (!isDeepStrictEqual(actual, expected)) throw new TobError('stale-setting');
}
function gitView(state: GitStatus) {
  const install =
    state.install.phase === 'failed'
      ? { phase: state.install.phase, reason: state.install.reason }
      : state.install;
  return state.available
    ? {
        available: true,
        version: state.version,
        source: state.source,
        installable: state.installable,
        install,
      }
    : { available: false, reason: state.reason, installable: state.installable, install };
}
function releaseView(state: ReleaseUpdate) {
  if (state.status === 'available') {
    const { releases: _notes, ...snapshot } = state;
    return snapshot;
  }
  return state;
}
export function createTobMaintenanceOperations(deps: {
  telemetry: TelemetryService;
  git: GitService;
  release: ReleaseService;
}) {
  let maintenanceInProgress = false;
  const exclusive = async <T>(run: () => Promise<T>): Promise<T> => {
    if (maintenanceInProgress) throw new TobError('operation-in-progress');
    maintenanceInProgress = true;
    try {
      return await run();
    } finally {
      maintenanceInProgress = false;
    }
  };
  return async (
    command: string,
    args: Record<string, unknown>,
  ): Promise<PreparedTobOperation | undefined> => {
    if (!TOB_MAINTENANCE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    if (command === 'telemetry-status') {
      keys(args, []);
      return {
        run: (guard) => {
          guard();
          return deps.telemetry.status();
        },
      };
    }
    if (command === 'telemetry-set') {
      keys(args, ['enabled']);
      if (typeof args.enabled !== 'boolean') throw new TobError('invalid-input');
      const enabled = args.enabled;
      const previousValue = deps.telemetry.status();
      if (previousValue.lockedBy) throw new TobError('telemetry-locked');
      return {
        proposal: Object.freeze({
          command,
          target: 'telemetry',
          previousValue,
          patch: { enabled },
        }),
        run(guard, beforeEffect) {
          guard();
          const current = deps.telemetry.status();
          if (current.lockedBy) throw new TobError('telemetry-locked');
          same(current, previousValue);
          beforeEffect?.();
          const result = deps.telemetry.setPreference(enabled);
          if (result.preference !== enabled || result.enabled !== enabled)
            throw new TobError('readback-mismatch');
          return result;
        },
      };
    }
    if (command === 'git-status') {
      keys(args, []);
      return {
        run: (guard) => {
          guard();
          return gitView(deps.git.status());
        },
      };
    }
    if (command === 'git-install') {
      keys(args, []);
      const previousValue = gitView(deps.git.status());
      if (!previousValue.available && !previousValue.installable)
        throw new TobError('maintenance-unavailable');
      if (!['idle', 'failed'].includes(previousValue.install.phase))
        throw new TobError('operation-in-progress');
      return {
        proposal: Object.freeze({
          command,
          target: 'managed-git',
          previousValue,
          patch: { install: true },
        }),
        run: (guard, beforeEffect) =>
          exclusive(async () => {
            guard();
            same(gitView(deps.git.status()), previousValue);
            beforeEffect?.();
            deps.git.install();
            await deps.git.settled();
            try {
              guard();
            } catch {
              throw new TobError('operation-outcome-uncertain');
            }
            return gitView(deps.git.status());
          }),
      };
    }
    if (command === 'release-info') {
      keys(args, ['since']);
      if (
        args.since !== undefined &&
        (typeof args.since !== 'string' || !isReleaseVersion(args.since))
      )
        throw new TobError('invalid-input');
      return {
        run(guard) {
          guard();
          const info = deps.release.info(args.since as string | undefined);
          return { version: info.version, releases: info.releases, identity: info.identity?.kind };
        },
      };
    }
    if (command === 'release-check') {
      keys(args, []);
      return {
        async run(guard) {
          guard();
          const result = await deps.release.update();
          guard();
          return result;
        },
      };
    }
    keys(args, command === 'release-install' ? ['version', 'confirm'] : ['confirm']);
    if (args.confirm !== true) throw new TobError('confirmation-required');
    if (
      command === 'release-install' &&
      (typeof args.version !== 'string' || !isReleaseVersion(args.version))
    )
      throw new TobError('invalid-input');
    const previousValue = releaseView(await deps.release.update());
    if (command === 'release-install') {
      const version = args.version as string;
      if (
        previousValue.status !== 'available' ||
        !previousValue.installable ||
        previousValue.latest !== version
      )
        throw new TobError('maintenance-unavailable');
      return {
        proposal: Object.freeze({
          command,
          target: 'deepseekbot-release',
          previousValue,
          patch: { version, confirm: true },
        }),
        run: (guard, beforeEffect) =>
          exclusive(async () => {
            same(releaseView(await deps.release.update()), previousValue);
            guard();
            const result = await deps.release.install(version, () => {
              guard();
              beforeEffect?.();
            });
            try {
              guard();
            } catch {
              throw new TobError('operation-outcome-uncertain');
            }
            if (result.status === 'installed' && result.installed !== version)
              throw new TobError('readback-mismatch');
            return result.status === 'failed'
              ? { status: result.status, reason: result.reason }
              : result;
          }),
      };
    }
    if (previousValue.status !== 'restart-required' || !previousValue.restartable)
      throw new TobError('restart-not-pending');
    return {
      proposal: Object.freeze({
        command,
        target: 'deepseekbot-release',
        previousValue,
        patch: { restart: true, installed: previousValue.installed, confirm: true },
      }),
      run: (guard, beforeEffect) =>
        exclusive(async () => {
          same(releaseView(await deps.release.update()), previousValue);
          guard();
          return deps.release.restart((version) => {
            same(version, previousValue.installed);
            guard();
            beforeEffect?.();
          });
        }),
    };
  };
}
