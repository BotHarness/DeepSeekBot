import type { Coalesced } from '../../core/src/runtime/coalesce.js';
import { installSystemPackages } from '../../core/src/system/system-packages.js';
import type { ComputerConfig } from './computer-config.js';
import type { ComputerRuntimeRunner, ComputerStatus } from './provider.js';
import type { ComputerService } from './service.js';
import type { ComputerTarget } from './target.js';
import { missingDesktopPackages } from './tool/local-display.js';
import type { createComputerToolProvider } from './tool/provider.js';

interface DesktopInstallState {
  packageInstall:
    | {
        state: 'installing' | 'installed' | 'failed';
        packages: readonly string[];
        percent: number;
        text: string;
      }
    | undefined;
  recheckingDesktop: boolean;
}

export function createDesktopProvisioningState(): DesktopInstallState {
  return { packageInstall: undefined, recheckingDesktop: false };
}

interface DesktopProvisioningOptions {
  json(value: unknown, status?: number): Response;
  installState: DesktopInstallState;
  service: ComputerService;
  log(message: string): void;
  toolProvider: Pick<ReturnType<typeof createComputerToolProvider>, 'reconcileAll'>;
  target(): ComputerTarget;
  resolveExportDir(): string;
  config: Pick<ComputerConfig, 'resolution'>;
  statusChanged: Pick<Coalesced, 'schedule'>;
  runner: ComputerRuntimeRunner;
}

export function createDesktopProvisioningHandlers({
  json,
  installState,
  service,
  log,
  toolProvider,
  target,
  resolveExportDir,
  config,
  statusChanged,
  runner,
}: DesktopProvisioningOptions) {
  return {
    status: async (): Promise<Response> => {
      const probe = await service
        .probe()
        .catch((error: unknown) => ({ available: false, detail: String(error) }));
      const status: ComputerStatus = await service
        .status()
        .catch((error: unknown) => ({ state: 'failed' as const, detail: String(error) }));
      if (
        status.missing !== undefined &&
        installState.packageInstall?.state !== 'installing' &&
        !installState.recheckingDesktop
      ) {
        const still = await missingDesktopPackages();
        if (!still.includes('xvfb') && !still.includes('openbox')) {
          installState.recheckingDesktop = true;
          log('desktop packages present; checking Local Computer again');
          void service
            .start()
            .then(() => toolProvider.reconcileAll())
            .catch(() => undefined)
            .finally(() => {
              installState.recheckingDesktop = false;
            });
        }
      }
      return json({
        target: target(),
        provider: service.providerName ?? null,
        probe,
        status,
        exportDir: target() === 'container' ? resolveExportDir() : '',
        ...(installState.packageInstall === undefined
          ? {}
          : { install: installState.packageInstall }),
        ...(target() === 'container' ? { resolution: config.resolution } : {}),
      });
    },
    install: async (request: Request): Promise<Response> => {
      const body = await request
        .json()
        .then((value) => value as { authorize?: unknown })
        .catch(() => ({}) as { authorize?: unknown });
      if (body.authorize !== true)
        return json(
          { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
          400,
        );
      if (installState.packageInstall?.state === 'installing')
        return json({ ok: false, code: 'install-running', error: 'an install is running' }, 409);
      const missing = target() === 'local' ? (await service.status()).missing : undefined;
      if (missing === undefined || missing.packages.length === 0)
        return json({ ok: false, code: 'nothing-missing', error: 'nothing to install' }, 409);
      if (missing.install === 'none')
        return json(
          {
            ok: false,
            code: 'needs-administrator',
            error: `Run this on the Host: ${missing.command}`,
          },
          403,
        );
      const started = Date.now();
      installState.packageInstall = {
        state: 'installing',
        packages: missing.packages,
        percent: 0,
        text: '',
      };
      statusChanged.schedule();
      log(
        `install-packages start packages=${missing.packages.join(',')} access=${missing.install}`,
      );
      void installSystemPackages({
        packages: missing.packages,
        access: missing.install,
        runner,
        onProgress: (progress) => {
          installState.packageInstall = {
            state: 'installing',
            packages: missing.packages,
            percent: progress.percent,
            text: progress.text,
          };
          statusChanged.schedule();
        },
      })
        .then(async () => {
          installState.packageInstall = {
            state: 'installed',
            packages: missing.packages,
            percent: 100,
            text: '',
          };
          statusChanged.schedule();
          log(`install-packages done durationMs=${String(Date.now() - started)}`);
          await service.start();
          await toolProvider.reconcileAll();
        })
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          if (installState.packageInstall?.state === 'installing')
            installState.packageInstall = {
              state: 'failed',
              packages: missing.packages,
              percent: installState.packageInstall.percent,
              text: detail,
            };
          statusChanged.schedule();
          log(`install-packages refused detail=${detail}`);
        });
      return json({ ok: true, started: true });
    },
  };
}
