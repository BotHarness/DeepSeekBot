import type { ComputerProvider, ComputerRuntimeRunner, ComputerStatus } from '../provider.js';
import {
  aptInstallCommand,
  systemInstallAccess,
  type SystemInstallAccess,
} from '../../../core/src/system/system-packages.js';
import type { CuaDriver } from '../tool/driver.js';
import { LocalDesktopMissingError } from '../tool/local-display.js';
import {
  LOCAL_DRIVER_QUIET_ENV,
  localDriverBuild,
  localDriverDirectory,
  localDriverExecutable,
  unsupportedLocalHost,
} from '../tool/local-driver.js';

export interface LocalPermissions {
  readonly accessibility: boolean;
  readonly screenRecording: boolean;
}

export function localPermissions(result: unknown): LocalPermissions {
  const payload = (result as { structuredContent?: Record<string, unknown> })?.structuredContent;
  return {
    accessibility: payload?.accessibility === true,
    screenRecording: payload?.screen_recording === true,
  };
}

export interface LocalReadiness {
  readonly ready: boolean;
  readonly detail: string;
  readonly refusal?: string;
}

export function localPermissionArgs(platform: string): Record<string, unknown> {
  return platform === 'darwin' ? { prompt: false } : {};
}

export function localReadiness(platform: string, result: unknown): LocalReadiness {
  const payload =
    (result as { structuredContent?: Record<string, unknown> })?.structuredContent ?? {};
  if (platform === 'darwin') {
    const permissions = localPermissions(result);
    return {
      ready: permissions.accessibility && permissions.screenRecording,
      detail: `accessibility=${String(permissions.accessibility)} screenRecording=${String(permissions.screenRecording)}`,
      refusal:
        'Allow Accessibility and Screen Recording for the app running DSH in macOS System Settings → Privacy & Security, fully restart that app and DSH, then check again.',
    };
  }
  if (platform === 'linux') {
    const x11 = payload['x11'] === true;
    const wayland = payload['wayland'] === true;
    return {
      ready: x11 || wayland,
      detail: `x11=${String(x11)} wayland=${String(wayland)} atspi=${String(payload['atspi'] === true)}`,
      refusal:
        'The Local Computer driver cannot reach a desktop display. Check that DISPLAY points to a running X server for the user running DSH, then check again.',
    };
  }
  return {
    ready: true,
    detail: `elevated=${String(payload['elevated'] === true)} integrity=${String(payload['integrity_level'] ?? 'unknown')}`,
  };
}

export function createLocalComputerProvider(options: {
  driver: CuaDriver;
  runner: ComputerRuntimeRunner;
  dir?: string | undefined;
  platform?: string | undefined;
  arch?: string | undefined;
  installAccess?: (() => Promise<SystemInstallAccess>) | undefined;
  onEvent?: ((detail: string) => void) | undefined;
}): ComputerProvider {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const build = localDriverBuild(platform, arch);
  let state: ComputerStatus = { state: 'stopped' };
  let starting: Promise<void> | undefined;
  let controller: AbortController | undefined;
  const supported = (): boolean => build !== undefined;
  return {
    name: 'local',
    probe: async () => ({
      available: supported(),
      ...(supported()
        ? {}
        : {
            detail: unsupportedLocalHost(platform, arch),
          }),
    }),
    status: async () => state,
    async start() {
      starting ??= (async () => {
        const started = Date.now();
        controller = new AbortController();
        const signal = controller.signal;
        state = { state: 'stopped', phase: 'starting' };
        try {
          await options.driver.ensure(signal, (progress) => {
            if (!signal.aborted) state = { state: 'stopped', phase: 'starting', progress };
          });
          if (signal.aborted) throw new Error('Local Computer setup cancelled');
          const path = localDriverExecutable(options.dir ?? localDriverDirectory(build), build);
          const doctor = await options.runner.run([path, 'doctor', '--json'], {
            env: LOCAL_DRIVER_QUIET_ENV,
          });
          if (doctor.code !== 0 || (JSON.parse(doctor.stdout) as { ok?: boolean }).ok !== true)
            throw new Error(
              'Local Computer driver doctor failed. Check the installation and retry.',
            );
          const readiness = localReadiness(
            platform,
            await options.driver.call('check_permissions', localPermissionArgs(platform), signal),
          );
          options.onEvent?.(
            `phase=permissions platform=${platform} ${readiness.detail} durationMs=${String(Date.now() - started)}`,
          );
          if (!readiness.ready) throw new Error(readiness.refusal);
          if (signal.aborted) throw new Error('Local Computer setup cancelled');
          state = { state: 'running', phase: 'running' };
        } catch (error) {
          const missing =
            error instanceof LocalDesktopMissingError
              ? {
                  packages: error.packages,
                  command: aptInstallCommand(error.packages),
                  install: await (options.installAccess?.() ?? systemInstallAccess(options.runner)),
                }
              : undefined;
          state = {
            state: 'failed',
            phase: 'failed',
            detail: error instanceof Error ? error.message : String(error),
            ...(missing === undefined ? {} : { missing }),
          };
          options.onEvent?.(`phase=refused detail=${state.detail ?? 'failed'}`);
          await options.driver.close();
          throw error;
        }
      })();
      try {
        await starting;
      } finally {
        starting = undefined;
      }
    },
    async stop() {
      controller?.abort();
      await starting?.catch(() => undefined);
      await options.driver.close();
      state = { state: 'stopped' };
    },
    upstream: () => undefined,
  };
}
