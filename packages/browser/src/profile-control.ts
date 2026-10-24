import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { extensionOrigin } from './borrow.js';

export const PROFILE_PREFIX = '/botharness-browser/profile/';
export interface ProfileView {
  readonly paired: boolean;
  readonly connected: boolean;
  readonly tabs: number;
}
interface Binding {
  origin: string;
  hash: string;
}
interface Command {
  id: string;
  epoch: string;
  slug: string;
  method: string;
  args: Record<string, unknown>;
}
interface Pending {
  command: Command;
  delivered: boolean;
  resolve(value: unknown): void;
  reject(error: Error): void;
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
export function createProfileControl(options: {
  file: string;
  enabled(): boolean;
  allowed(slug: string): boolean;
  onChange(): void;
  note(message: string): void;
}) {
  let binding: Binding | undefined;
  let epoch = randomBytes(16).toString('hex');
  let pairing: { code: string; expires: number } | undefined;
  let heartbeat = 0;
  let clientId = '';
  let tabCount = 0;
  let pending: Pending | undefined;
  let wake: (() => void) | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let disposed = false;
  const paused = new Set<string>();
  const ready = readFile(options.file, 'utf8')
    .then((text) => {
      const value = JSON.parse(text) as Binding | null;
      if (value === null) return;
      if (!extensionOrigin(value.origin) || !/^[a-f0-9]{64}$/u.test(value.hash))
        throw new Error('Invalid Browser pairing');
      binding = value;
    })
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        options.note('initiator=profile-control phase=pairing-unavailable reason=store-invalid');
    });
  let bindingChanges: Promise<unknown> = ready;
  const mutate = <T>(action: () => Promise<T>): Promise<T> => {
    const next = bindingChanges.then(action, action);
    bindingChanges = next.catch(() => undefined);
    return next;
  };
  const changed = (reason: string): void => {
    epoch = randomBytes(16).toString('hex');
    heartbeat = 0;
    clientId = '';
    tabCount = 0;
    revision += 1;
    pending?.reject(new Error('Chrome Profile control changed; reconnect and observe again'));
    pending = undefined;
    wake?.();
    options.onChange();
    options.note(`initiator=profile-control phase=invalidated reason=${reason}`);
  };
  const persist = async (): Promise<void> => {
    await mkdir(dirname(options.file), { recursive: true, mode: 0o700 });
    const temp = `${options.file}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(binding ?? null), { mode: 0o600 });
    await rename(temp, options.file);
  };
  const authenticate = async (token: string, origin: string): Promise<void> => {
    await ready;
    if (
      disposed ||
      binding === undefined ||
      binding.origin !== origin ||
      binding.hash !== hash(token)
    )
      throw new Error('Chrome Profile pairing unavailable');
  };
  const connected = (): boolean => heartbeat > 0 && Date.now() - heartbeat < 45_000;
  const assert = (slug: string, method: string): void => {
    if (disposed || !options.enabled() || !options.allowed(slug))
      throw new Error('Chrome Profile control requires Browser Access and the Profile target');
    if (!connected()) throw new Error('Chrome Profile disconnected; open the paired extension');
    if (paused.has(slug) && method !== 'observe' && method !== 'invalidate')
      throw new Error('Browser Pause is active');
  };
  const service = {
    get revision() {
      return revision;
    },
    authorizationIdentity(): string {
      return binding === undefined ? 'unpaired' : hash(JSON.stringify(binding));
    },
    async pair(): Promise<{ code: string; expiresAt: number }> {
      await ready;
      if (disposed || !options.enabled()) throw new Error('Select Chrome Profile control first');
      pairing = { code: randomBytes(16).toString('hex'), expires: Date.now() + 300_000 };
      return { code: pairing.code, expiresAt: pairing.expires };
    },
    redeem(code: string, origin: string): Promise<{ token: string }> {
      return mutate(async () => {
        if (
          !extensionOrigin(origin) ||
          disposed ||
          !options.enabled() ||
          pairing?.code !== code ||
          pairing.expires < Date.now()
        )
          throw new Error('Pairing code expired or already used');
        pairing = undefined;
        const token = randomBytes(32).toString('hex');
        binding = { origin, hash: hash(token) };
        changed('Human-paired-profile');
        await persist();
        return { token };
      });
    },
    forget(): Promise<void> {
      return mutate(async () => {
        binding = undefined;
        pairing = undefined;
        changed('Human-forgot-profile');
        await persist();
      });
    },
    forgetToken(token: string, origin: string): Promise<void> {
      return mutate(async () => {
        await authenticate(token, origin);
        binding = undefined;
        pairing = undefined;
        changed('Human-forgot-profile');
        await persist();
      });
    },
    async poll(
      token: string,
      origin: string,
      count: number,
      connectionId: string,
      signal: AbortSignal,
    ): Promise<Command | { epoch: string }> {
      await authenticate(token, origin);
      if (!/^[a-f0-9-]{36}$/u.test(connectionId)) throw new Error('Invalid Profile connection');
      if ((clientId !== '' && clientId !== connectionId) || (!connected() && heartbeat !== 0))
        changed('extension-reconnected');
      clientId = connectionId;
      heartbeat = Date.now();
      tabCount = Number.isSafeInteger(count) ? Math.max(0, Math.min(count, 1000)) : 0;

      if (wake !== undefined) throw new Error('A Profile poll is already active');
      if (pending === undefined || pending.delivered) {
        await new Promise<void>((resolve) => {
          const end = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', end);
            if (wake === end) wake = undefined;
            resolve();
          };
          const timer = setTimeout(end, 20_000);
          wake = end;
          signal.addEventListener('abort', end, { once: true });
          if (signal.aborted) end();
        });
      }
      signal.throwIfAborted();
      await authenticate(token, origin);
      if (!options.enabled() || pending === undefined || pending.delivered) return { epoch };
      assert(pending.command.slug, pending.command.method);
      pending.delivered = true;
      return pending.command;
    },
    async result(token: string, origin: string, input: Record<string, unknown>): Promise<void> {
      await authenticate(token, origin);
      const current = pending;
      if (
        current === undefined ||
        current.command.id !== input.id ||
        current.command.epoch !== input.epoch ||
        !current.delivered
      )
        throw new Error('Profile command is no longer active');
      pending = undefined;
      if (typeof input.error === 'string') {
        const reasons = [
          'Stale or unavailable ref',
          'Element is covered',
          'Document changed',
          'Observe the selected tab first',
          'Input focus unavailable',
          'Page command failed',
          'Chrome command failed',
        ];
        const reason = reasons.includes(input.error)
          ? input.error.replaceAll(' ', '-')
          : 'extension-refused';
        options.note(
          `initiator=profile-control phase=command-refused operation=${current.command.method} reason=${reason}`,
        );
        current.reject(
          new Error('Chrome Profile operation refused; observe again or check the extension'),
        );
      } else current.resolve(input.value);
    },
    async command(
      slug: string,
      method: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
    ): Promise<unknown> {
      const expected = revision;
      const execute = async (): Promise<unknown> => {
        signal.throwIfAborted();
        if (expected !== revision) throw new Error('Chrome Profile control changed');
        assert(slug, method);
        const id = randomBytes(16).toString('hex');
        const result = await new Promise<unknown>((resolve, reject) => {
          const end = (): void => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
          };
          const abort = (): void => {
            changed('command-cancelled');
          };
          const timer = setTimeout(() => changed('command-timeout'), 12_000);
          pending = {
            command: { id, epoch, slug, method, args },
            delivered: false,
            resolve(value) {
              end();
              resolve(value);
            },
            reject(error) {
              end();
              reject(error);
            },
          };
          signal.addEventListener('abort', abort, { once: true });
          wake?.();
        });
        signal.throwIfAborted();
        if (expected !== revision) throw new Error('Chrome Profile control changed');
        assert(slug, method);
        return result;
      };
      const next = queue.then(execute, execute);
      queue = next.catch(() => undefined);
      return next;
    },
    async pause(slug: string, active: boolean): Promise<void> {
      if (active) paused.add(slug);
      await queue;
      await service.command(slug, 'invalidate', {}, new AbortController().signal);
      if (!active) paused.delete(slug);
    },
    returnBot(slug: string): void {
      if (!options.enabled()) return;
      paused.delete(slug);
      changed('Bot-access-or-assignment-changed');
    },
    clear(): void {
      paused.clear();
      changed('Host-or-target-changed');
    },
    async view(): Promise<ProfileView> {
      await ready;
      return {
        paired: binding !== undefined,
        connected: connected(),
        tabs: connected() ? tabCount : 0,
      };
    },
    dispose(): void {
      disposed = true;
      service.clear();
    },
  };
  return service;
}
export type ProfileControl = ReturnType<typeof createProfileControl>;
