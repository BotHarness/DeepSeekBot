import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { BrowserObservation } from './runtime/browser.js';

export interface DailyView {
  readonly state: 'connecting' | 'confirm' | 'controlled' | 'error';
  readonly error?: string;
  readonly title: string;
  readonly url: string;
}
interface Connection {
  readonly process: ChildProcess;
  readonly started: number;
  view: DailyView;
  readonly pending: Map<number, { resolve(value: unknown): void; reject(reason: Error): void }>;
}
export interface DailyControl {
  readonly revision: number;
  view(slug: string): DailyView | undefined;
  connect(slug: string): void;
  grant(slug: string): Promise<void>;
  pause(slug: string, active: boolean): Promise<void>;
  observe(slug: string, signal: AbortSignal): Promise<BrowserObservation>;
  act(
    slug: string,
    action: 'type' | 'click',
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<{ url: string }>;
  returnBot(slug: string): void;
  clear(): void;
}
export function createDailyControl(options: {
  enabled(): boolean;
  bot(slug: string): { displayName: string; browserAccess: boolean } | undefined;
  path: string;
  onChange(slug: string): void;
  note(message: string): void;
  spawn?: () => ChildProcess;
}): DailyControl {
  const connections = new Map<string, Connection>();
  const errors = new Map<string, string>();
  let revision = 0;
  let sequence = 0;
  const assertBot = (slug: string): void => {
    if (!options.enabled() || options.bot(slug)?.browserAccess !== true)
      throw new Error('Daily Browser control requires Browser Access and the control target');
  };
  const returned = (
    slug: string,
    expected?: Connection,
    reason = 'human-or-host-revocation',
  ): void => {
    const connection = connections.get(slug);
    if (connection === undefined || (expected !== undefined && expected !== connection)) return;
    connections.delete(slug);
    revision += 1;
    for (const request of connection.pending.values())
      request.reject(new Error('Daily Browser authority was revoked; connect and authorize again'));
    connection.pending.clear();
    connection.process.kill();
    options.onChange(slug);
    options.note(
      `initiator=daily-control phase=returned slug=${slug} durationMs=${Date.now() - connection.started} reason=${reason}`,
    );
  };
  const request = (
    slug: string,
    command: string,
    args: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<unknown> => {
    assertBot(slug);
    signal?.throwIfAborted();
    const connection = connections.get(slug);
    if (connection === undefined)
      throw new Error('Connect and authorize one Daily Browser document in the Browser entry');
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        returned(slug, connection, 'call-cancelled');
        connection.pending.delete(id);
        reject(new Error('Daily Browser call was cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer =
        command === 'connect'
          ? undefined
          : setTimeout(() => returned(slug, connection, 'request-timeout'), 15_000);
      const finish = (): void => {
        signal?.removeEventListener('abort', onAbort);
        if (timer !== undefined) clearTimeout(timer);
      };
      connection.pending.set(id, {
        resolve: (value) => {
          finish();
          resolve(value);
        },
        reject: (error) => {
          finish();
          reject(error);
        },
      });
      connection.process.send?.({ id, command, args }, (error) => {
        if (error !== null) returned(slug, connection);
      });
    });
  };
  return {
    get revision() {
      return revision;
    },
    view: (slug) =>
      connections.get(slug)?.view ??
      (errors.has(slug)
        ? { state: 'error', title: '', url: '', error: errors.get(slug)! }
        : undefined),
    connect(slug) {
      assertBot(slug);
      errors.delete(slug);
      if (connections.has(slug))
        throw new Error('Return the existing Daily Browser connection first');
      const systemEnvironment = new Set([
        'PATH',
        'HOME',
        'USER',
        'LOGNAME',
        'TMPDIR',
        'TEMP',
        'TMP',
        'SystemRoot',
        'SYSTEMROOT',
        'WINDIR',
        'LOCALAPPDATA',
        'APPDATA',
        'ProgramFiles',
        'ProgramFiles(x86)',
        'DISPLAY',
        'WAYLAND_DISPLAY',
        'XDG_RUNTIME_DIR',
        'XDG_CONFIG_HOME',
        'LANG',
      ]);
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => systemEnvironment.has(key)),
      );
      const child =
        options.spawn?.() ??
        fork(fileURLToPath(new URL('./daily-worker.mjs', import.meta.url)), [], {
          windowsHide: true,
          env,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          execArgv: [],
        });
      const connection: Connection = {
        process: child,
        started: Date.now(),
        view: { state: 'connecting', title: '', url: '' },
        pending: new Map(),
      };
      connections.set(slug, connection);
      revision += 1;
      options.onChange(slug);
      const failed = (): void => {
        if (connections.get(slug) !== connection) return;
        returned(slug, connection, 'connector-exited');
        errors.set(slug, 'Playwright extension connector stopped; connect and authorize again');
      };
      child.on('exit', failed);
      child.on('error', failed);
      child.on(
        'message',
        (message: { event?: string; id?: number; value?: unknown; error?: string }) => {
          if (message.event === 'revoked') {
            returned(slug, connection, 'document-revoked');
            return;
          }
          if (typeof message.id !== 'number') return;
          const pending = connection.pending.get(message.id);
          connection.pending.delete(message.id);
          if (message.error !== undefined) pending?.reject(new Error(message.error));
          else pending?.resolve(message.value);
        },
      );
      options.note(
        `initiator=daily-control phase=connecting slug=${slug} durationMs=0 command=daily-worker`,
      );
      void request(slug, 'connect', {
        path: options.path,
        name: options.bot(slug)?.displayName ?? slug,
      })
        .then((value) => {
          if (connections.get(slug) !== connection) return;
          const page = value as { url: string; title: string };
          connection.view = { ...page, state: 'confirm' };
          options.note(
            `initiator=daily-control phase=selected slug=${slug} durationMs=${Date.now() - connection.started}`,
          );
        })
        .catch((error: unknown) => {
          if (connections.get(slug) !== connection) return;
          returned(slug, connection);
          errors.set(
            slug,
            error instanceof Error ? error.message : 'Playwright extension connection failed',
          );
          options.note(
            `initiator=daily-control phase=connection-failed slug=${slug} durationMs=${Date.now() - connection.started} reason=extension-connection-failed`,
          );
        });
    },
    async grant(slug) {
      const connection = connections.get(slug);
      if (connection?.view.state !== 'confirm')
        throw new Error('Select one page in the Playwright extension first');
      await request(slug, 'grant');
      if (connections.get(slug) !== connection) throw new Error('Daily Browser document changed');
      connection.view = { ...connection.view, state: 'controlled' };
      revision += 1;
      options.onChange(slug);
      options.note(
        `initiator=human phase=control-granted slug=${slug} durationMs=${Date.now() - connection.started}`,
      );
    },
    async pause(slug, active) {
      await request(slug, 'pause', { active });
    },
    async observe(slug, signal) {
      return (await request(slug, 'observe', {}, signal)) as BrowserObservation;
    },
    async act(slug, action, args, signal) {
      return (await request(slug, action, args, signal)) as { url: string };
    },
    returnBot(slug) {
      errors.delete(slug);
      returned(slug);
    },
    clear() {
      errors.clear();
      for (const slug of [...connections.keys()]) returned(slug);
    },
  };
}
