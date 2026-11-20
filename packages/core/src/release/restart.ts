import { spawn as spawnProcess, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { errorMonitor, type EventEmitter } from 'node:events';

const RESTART_DELAY_MS = 300;
const RELAUNCH_FALLBACK_MS = 8_000;
const FORWARDED_SIGNALS = ['SIGTERM', 'SIGHUP'] as const;

export interface ReleaseRestarter {
  restart(): void;
}

export interface RestartHost {
  argv: readonly string[];
  execArgv: readonly string[];
  execPath: string;
  env: NodeJS.ProcessEnv;
  cwd(): string;
  exitCode?: number | string | null | undefined;
  once(event: 'beforeExit' | 'exit', listener: () => void): unknown;
  prependListener(event: NodeJS.Signals, listener: () => void): unknown;
}

export interface ProcessRestarterOptions {
  exit: (code: number) => void;
  host?: RestartHost;
  spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  setTimer?: (callback: () => void, ms: number) => { unref(): unknown };
  onFailure?: () => void;
}

export function relaunchArguments(argv: readonly string[]): string[] {
  const args = argv.slice(1);
  const surface = args[1];
  return surface === 'web' && !args.includes('--no-open') && !args.includes('--open')
    ? [...args, '--no-open']
    : args;
}

export function createProcessRestarter(options: ProcessRestarterOptions): ReleaseRestarter {
  const host = options.host ?? process;
  const spawn = options.spawn ?? spawnProcess;
  const setTimer = options.setTimer ?? setTimeout;
  let requested = false;

  return {
    restart() {
      if (requested) return;
      requested = true;
      const args = [...host.execArgv, ...relaunchArguments(host.argv)];
      let child: ChildProcess | undefined;
      const relaunch = (): void => {
        if (child !== undefined) return;
        try {
          child = spawn(host.execPath, args, {
            cwd: host.cwd(),
            env: host.env,
            stdio: 'inherit',
            windowsHide: true,
          });
        } catch (error) {
          options.onFailure?.();
          throw error;
        }
        const started = child;
        const errors: EventEmitter = started;
        errors.once(errorMonitor, () => options.onFailure?.());
        for (const signal of FORWARDED_SIGNALS) {
          host.prependListener(signal, () => {
            started.kill(signal);
          });
        }
        started.once('exit', (code) => {
          host.exitCode = code ?? 1;
        });
      };
      setTimer(() => {
        host.once('beforeExit', relaunch);
        host.once('exit', relaunch);
        setTimer(relaunch, RELAUNCH_FALLBACK_MS).unref();
        options.exit(0);
      }, RESTART_DELAY_MS);
    },
  };
}
