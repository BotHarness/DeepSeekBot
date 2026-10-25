import { describe, expect, it } from 'vitest';
import {
  createActivitySession,
  type NativeRequestActivity,
} from '../src/host/live-activity-session';
import { ActivityRequestFailed } from '../src/host/live-activity';
import type { SavedHost } from '../src/host/hosts';

function fixture() {
  const host: SavedHost = {
    hostId: 'host-a',
    hostName: 'Computer',
    deviceId: 'device-a',
    credential: 'secret',
    routes: ['https://example.invalid'],
  };
  const calls: { operation: string; body: unknown }[] = [];
  const writes: unknown[] = [];
  let current = host.hostId;
  let revision = 0;
  let alive = true;
  let listener: ((token: string) => void) | undefined;
  let ended = 0;
  let starts = 0;
  let prepare: (() => Promise<void>) | undefined;
  let stop: (() => Promise<void>) | undefined;
  let registerFailed = false;
  const native: NativeRequestActivity = {
    id: 'native-a',
    async token() {
      return 'a'.repeat(64);
    },
    onToken(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    async end() {
      ended += 1;
      alive = false;
    },
  };
  const owner = createActivitySession({
    native: {
      supported: () => true,
      async start() {
        starts += 1;
        return native;
      },
      async instances() {
        return alive ? [native] : [];
      },
    },
    remote: {
      async request(_host, operation, body) {
        calls.push({ operation, body });
        if (operation === 'prepare') await prepare?.();
        if (operation === 'stop') await stop?.();
        if (operation === 'register' && registerFailed)
          throw new ActivityRequestFailed('activity-registration-unavailable');
        return operation === 'prepare'
          ? {
              bundleIdentifier: 'app.deepseekbot.mobile',
              source: 'abcdef',
              progress: { state: 'working', terminal: false, updatedAt: '2026-10-26T00:00:00Z' },
            }
          : { registered: true, expiresAt: Date.now() + 60000 };
      },
    },
    storage: {
      async read() {
        return undefined;
      },
      async write(value) {
        writes.push(value);
      },
    },
    host: (id) => (id === host.hostId ? host : undefined),
    currentHostId: () => current,
    selectionRevision: () => revision,
    sourceAvailable: (id) => id === host.hostId,
    bundleIdentifier: 'app.deepseekbot.mobile',
    url: (id) => `deepseekbot://request-activity?id=${id}`,
    id: () => 'link-a',
    locale: () => 'en',
  });
  const target = { hostId: 'host-a', channelId: 'dm-ada', messageId: 'human-1', botSlug: 'ada' };
  return {
    owner,
    prepare: (work: () => Promise<void>) => {
      prepare = work;
    },
    stop: (work: () => Promise<void>) => {
      stop = work;
    },
    registerFailed: (value: boolean) => {
      registerFailed = value;
    },
    calls,
    writes,
    target,
    rotate: () => listener?.('b'.repeat(64)),
    dismiss: () => {
      alive = false;
    },
    switchHost: () => {
      current = 'host-b';
      revision++;
    },
    ended: () => ended,
    starts: () => starts,
  };
}

describe('single phone Live Activity owner', () => {
  it('keeps stop busy until the remote stop settles', async () => {
    const f = fixture();
    await f.owner.start(f.target);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.stop(async () => {
      entered();
      await gate;
    });
    const stopping = f.owner.stop();
    await started;
    expect(f.owner.getSnapshot().busy).toBe(true);
    release();
    await stopping;
    expect(f.owner.getSnapshot().busy).toBe(false);
  });
  it('prepares an admitted request before native start, rotates tokens, and never recreates a dismissed activity', async () => {
    const f = fixture();
    await f.owner.ready;
    await f.owner.start(f.target);
    expect(f.calls.map((call) => call.operation)).toEqual(['prepare', 'register']);
    expect(f.owner.getSnapshot()).toMatchObject({
      tracking: true,
      target: { messageId: 'human-1' },
    });
    f.rotate();
    await f.owner.settled();
    expect(f.calls.at(-1)).toMatchObject({
      operation: 'register',
      body: { token: 'b'.repeat(64) },
    });
    expect(JSON.stringify(f.writes)).not.toContain('bbbb');
    expect(JSON.stringify(f.writes)).not.toContain('secret');
    f.dismiss();
    await f.owner.sync();
    expect(f.calls.at(-1)).toMatchObject({ operation: 'stop' });
    expect(f.owner.getSnapshot().tracking).toBe(false);
    expect(f.starts()).toBe(1);
  });
  it('never starts before provider preparation or after a delayed source switch', async () => {
    const f = fixture();
    f.prepare(async () => {
      throw new ActivityRequestFailed('activity-provider-unconfigured');
    });
    await expect(f.owner.start(f.target)).rejects.toThrow('activity-provider-unconfigured');
    expect(f.starts()).toBe(0);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.prepare(async () => {
      entered();
      await gate;
    });
    const pending = f.owner.start(f.target);
    await started;
    f.switchHost();
    release();
    await expect(pending).rejects.toThrow('activity-source-changed');
    expect(f.starts()).toBe(0);
  });
  it('keeps the existing card on transient rotation failure and rebinds on foreground sync', async () => {
    const f = fixture();
    await f.owner.start(f.target);
    f.registerFailed(true);
    f.rotate();
    await f.owner.settled();
    expect(f.owner.getSnapshot().tracking).toBe(true);
    expect(f.ended()).toBe(0);
    f.registerFailed(false);
    await f.owner.sync();
    expect(f.calls.at(-1)?.operation).toBe('register');
    expect(f.starts()).toBe(1);
  });
  it('stops presentation on source switch and preserves the original request destination', async () => {
    const f = fixture();
    await f.owner.ready;
    await f.owner.start(f.target);
    f.switchHost();
    await f.owner.sync();
    expect(f.ended()).toBe(1);
    expect(f.owner.getSnapshot().tracking).toBe(false);
    expect(f.owner.target('link-a')).toMatchObject(f.target);
    expect(f.owner.target('unknown')).toBeUndefined();
    expect(f.calls.map((call) => call.operation)).toEqual(['prepare', 'register', 'stop']);
  });
});
