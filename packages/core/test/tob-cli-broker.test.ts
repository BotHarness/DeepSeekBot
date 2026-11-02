import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startTobCliBroker,
  type TobCliBroker,
  type TobCliBrokerOptions,
  type TobCliProposal,
} from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';

const brokers: TobCliBroker[] = [];
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});
async function fixture(overrides: Partial<TobCliBrokerOptions> = {}) {
  const controller = new AbortController();
  let current = { scope: 'global' as const, value: 8, revision: 2 };
  const authorize = vi.fn(() => {});
  const approve = vi.fn(async (_proposal: TobCliProposal, _signal: AbortSignal) => {});
  const writeSetting = vi.fn(async (value: number, expected: number, check: () => void) => {
    check();
    if (expected !== current.revision) throw new TobError('stale-setting');
    current = { scope: 'global', value, revision: current.revision + 1 };
    return current;
  });
  const broker = await startTobCliBroker({
    signal: controller.signal,
    authorize,
    approve,
    readSetting: () => current,
    writeSetting,
    ...overrides,
  });
  brokers.push(broker);
  const invoke = async (command: string, args: object = {}, token = broker.token) => {
    const response = await fetch(broker.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ command, args }),
    });
    return { status: response.status, ...((await response.json()) as object) };
  };
  return {
    broker,
    controller,
    authorize,
    approve,
    writeSetting,
    invoke,
    current: () => current,
    change: () => {
      current = { ...current, revision: current.revision + 1 };
    },
  };
}
const update = () => ({
  ns: 'botharness-client',
  patch: { assignmentConcurrencyLimit: 3 },
  expectedRevision: 2,
  previousValue: { assignmentConcurrencyLimit: 8 },
});

describe('Tob scoped CLI broker', () => {
  it.each([
    'operation-key-conflict',
    'stale-channel',
    'channel-operation-unavailable',
    'protected-bot',
  ])('returns the Channel refusal %s without exposing owner diagnostics', async (code) => {
    const f = await fixture({
      prepareOperation: () => {
        throw new TobError(code);
      },
    });
    expect(await f.invoke('group-invite', {})).toMatchObject({
      ok: false,
      error: { code, message: code },
    });
    expect(f.approve).not.toHaveBeenCalled();
  });

  it.each(['create', 'bot-avatar-set', 'bot-banner-set', 'bot-appearance-set'])(
    'accepts a bounded large %s envelope and still delegates validation and approval',
    async (command) => {
      const run = vi.fn(() => ({ accepted: true }));
      const prepareOperation = vi.fn(() => ({
        proposal: { command, target: 'owned', previousValue: null, patch: { image: 'reviewed' } },
        run,
      }));
      const f = await fixture({ prepareOperation });
      expect(await f.invoke(command, { image: 'x'.repeat(32 * 1024) })).toMatchObject({
        ok: true,
        value: { accepted: true },
      });
      expect(prepareOperation).toHaveBeenCalledOnce();
      expect(f.approve).toHaveBeenCalledOnce();
      expect(run).toHaveBeenCalledOnce();
      expect(await f.invoke(command, { image: 'x'.repeat(3 * 1024 * 1024) })).toMatchObject({
        status: 413,
        error: { code: 'request-too-large' },
      });
      expect(prepareOperation).toHaveBeenCalledOnce();
    },
  );
  it('accepts the maximum Group avatar envelope while retaining a 256KiB transport limit', async () => {
    const command = 'group-avatar-set';
    const run = vi.fn(() => ({ accepted: true }));
    const prepareOperation = vi.fn(() => ({
      proposal: { command, target: 'group-1', previousValue: null, patch: { avatar: 'reviewed' } },
      run,
    }));
    const f = await fixture({ prepareOperation });
    const args = {
      channelId: 'group-1',
      expectedChannel: 'a'.repeat(64),
      avatar: 'data:image/png;base64,' + Buffer.alloc(98_304).toString('base64'),
    };
    expect(await f.invoke(command, args, 'wrong-token')).toMatchObject({
      status: 401,
      error: { code: 'unauthorized' },
    });
    expect(prepareOperation).not.toHaveBeenCalled();
    expect(await f.invoke(command, args)).toMatchObject({ ok: true, value: { accepted: true } });
    expect(prepareOperation).toHaveBeenCalledWith(command, args);
    expect(f.approve).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
    expect(await f.invoke(command, { ...args, avatar: 'x'.repeat(256 * 1024) })).toMatchObject({
      status: 413,
      error: { code: 'request-too-large' },
    });
    expect(prepareOperation).toHaveBeenCalledOnce();
    prepareOperation.mockImplementationOnce(() => {
      throw new TobError('invalid-input');
    });
    expect(await f.invoke(command, args)).toMatchObject({ error: { code: 'invalid-input' } });
    expect(f.approve).toHaveBeenCalledOnce();
  });

  it.each([
    ['group-member-remove', 'not-group-member'],
    ['group-wake-policies', 'channel-access-denied'],
  ])(
    'preserves the %s authority refusal %s without exposing diagnostics',
    async (command, code) => {
      const f = await fixture({
        prepareOperation: () => {
          throw new TobError(code);
        },
      });
      expect(await f.invoke(command, { channelId: 'group-1' })).toMatchObject({
        ok: false,
        error: { code, message: code },
      });
      expect(f.approve).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['group-invite-cancel', 'unknown-invitation'],
    ['group-invite-cancel', 'invitation-not-pending'],
    ['group-join-decide', 'unknown-join-request'],
    ['group-join-decide', 'join-request-not-pending'],
    ['group-join-decide', 'stale-profile'],
    ['group-join-decide', 'archived-bot'],
    ['group-join-decide', 'protected-bot'],
    ['group-join-decide', 'channel-access-denied'],
  ])('preserves %s refusal %s before and after review', async (command, code) => {
    const before = await fixture({
      prepareOperation: () => {
        throw new TobError(code);
      },
    });
    expect(await before.invoke(command, {})).toMatchObject({
      ok: false,
      error: { code, message: code },
    });
    expect(before.approve).not.toHaveBeenCalled();
    const after = await fixture({
      prepareOperation: () => ({
        proposal: { command, target: 'group-1', previousValue: null, patch: {} },
        run: () => {
          throw new TobError(code);
        },
      }),
    });
    expect(await after.invoke(command, {})).toMatchObject({
      ok: false,
      error: { code, message: code },
    });
    expect(after.approve).toHaveBeenCalledOnce();
  });

  it('keeps other commands at 16KiB of received bytes including whitespace', async () => {
    const prepareOperation = vi.fn(() => ({ run: () => ({ accepted: true }) }));
    const f = await fixture({ prepareOperation });
    expect(await f.invoke('settings', { ns: 'x'.repeat(16 * 1024) })).toMatchObject({
      status: 413,
      error: { code: 'request-too-large' },
    });
    const response = await fetch(f.broker.endpoint + '/invoke', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + f.broker.token, 'content-type': 'application/json' },
      body: ' '.repeat(16 * 1024) + JSON.stringify({ command: 'settings', args: {} }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: 'request-too-large' } });
    expect(prepareOperation).not.toHaveBeenCalled();
  });
  it('large image requests cannot bypass authentication or operation validation', async () => {
    const prepareOperation = vi.fn(() => {
      throw new TobError('invalid-input');
    });
    const f = await fixture({ prepareOperation });
    const args = { image: 'x'.repeat(32 * 1024) };
    expect(await f.invoke('create', args, 'wrong-token')).toMatchObject({
      status: 401,
      error: { code: 'unauthorized' },
    });
    expect(prepareOperation).not.toHaveBeenCalled();
    expect(await f.invoke('create', args)).toMatchObject({ error: { code: 'invalid-input' } });
    expect(prepareOperation).toHaveBeenCalledOnce();
    expect(f.approve).not.toHaveBeenCalled();
  });
  it('marks side effects only when a prepared operation reaches its owning mutation', async () => {
    const beforeWrite = vi.fn();
    let stale = true;
    const f = await fixture({
      beforeWrite,
      prepareOperation: async () => ({
        proposal: {
          command: 'telemetry-set',
          target: 'telemetry',
          previousValue: true,
          patch: false,
        },
        run: (guard, beforeEffect) => {
          guard();
          if (stale) throw new TobError('stale-setting');
          beforeEffect?.();
          return { enabled: false };
        },
      }),
    });
    expect(await f.invoke('telemetry-set', { enabled: false })).toMatchObject({
      error: { code: 'stale-setting' },
    });
    expect(beforeWrite).not.toHaveBeenCalled();
    stale = false;
    expect(await f.invoke('telemetry-set', { enabled: false })).toMatchObject({
      ok: true,
      value: { enabled: false },
    });
    expect(beforeWrite).toHaveBeenCalledOnce();
  });
  it('discovers the bounded CLI contract and reads only the permitted field', async () => {
    const f = await fixture();
    expect(await f.invoke('capabilities')).toMatchObject({
      ok: true,
      value: { commands: ['capabilities', 'settings', 'settings-set'], ns: 'botharness-client' },
    });
    expect(await f.invoke('settings', { ns: 'botharness-client' })).toEqual({
      status: 200,
      ok: true,
      value: {
        scope: 'global',
        ns: 'botharness-client',
        revision: 2,
        value: { assignmentConcurrencyLimit: 8 },
      },
    });
  });
  it('keeps a refusing transport for ineligible Shell calls without granting management authority', async () => {
    const authorize = vi.fn(() => {
      throw new TobError('human-dm-required');
    });
    const f = await fixture({ authorize });
    expect(authorize).not.toHaveBeenCalled();
    expect(await f.invoke('capabilities')).toMatchObject({ error: { code: 'human-dm-required' } });
    expect(await f.invoke('settings', { ns: 'botharness-client' })).toMatchObject({
      error: { code: 'human-dm-required' },
    });
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'human-dm-required' },
    });
    expect(f.approve).not.toHaveBeenCalled();
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('approves an immutable parsed proposal and rechecks authority at the actual write', async () => {
    const f = await fixture();
    expect(await f.invoke('settings-set', update())).toMatchObject({
      ok: true,
      value: { revision: 3, value: { assignmentConcurrencyLimit: 3 } },
    });
    expect(f.approve).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(f.approve.mock.calls[0]![0])).toBe(true);
    expect(Object.isFrozen(f.approve.mock.calls[0]![0].patch)).toBe(true);
    expect(f.authorize.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(f.writeSetting).toHaveBeenCalledTimes(1);
  });
  it('denied approvals never write, and arbitrary errors do not escape', async () => {
    const f = await fixture({
      approve: async () => {
        throw new Error('private token or stack');
      },
    });
    expect(await f.invoke('settings-set', update())).toEqual({
      status: 400,
      ok: false,
      error: { code: 'approval-denied', message: 'approval-denied' },
    });
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('rejects stale old values and revisions before presenting approval', async () => {
    const f = await fixture();
    expect(await f.invoke('settings-set', { ...update(), expectedRevision: 1 })).toMatchObject({
      error: { code: 'stale-setting' },
    });
    expect(
      await f.invoke('settings-set', {
        ...update(),
        previousValue: { assignmentConcurrencyLimit: 7 },
      }),
    ).toMatchObject({ error: { code: 'stale-setting' } });
    expect(f.approve).not.toHaveBeenCalled();
  });
  it('refuses a concurrent setting change while approval is pending', async () => {
    const f = await fixture();
    f.approve.mockImplementation(async () => {
      f.change();
    });
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'stale-setting' },
    });
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('revoked Human DM source authority cannot survive approval', async () => {
    const f = await fixture();
    f.approve.mockImplementation(async () => {
      f.authorize.mockImplementation(() => {
        throw new TobError('human-dm-required');
      });
    });
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'human-dm-required' },
    });
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('requires the capability and rejects unrelated commands, scopes, fields and identity overrides', async () => {
    const f = await fixture();
    expect(await f.invoke('settings', { ns: 'botharness-client' }, 'wrong')).toMatchObject({
      status: 401,
      error: { code: 'unauthorized' },
    });
    expect(await f.invoke('settings', { ns: 'credentials' })).toMatchObject({
      error: { code: 'unsupported-command' },
    });
    expect(await f.invoke('delete', {})).toMatchObject({ error: { code: 'unsupported-command' } });
    expect(
      await f.invoke('settings', { ns: 'botharness-client', sessionId: 'forged' }),
    ).toMatchObject({ error: { code: 'invalid-request' } });
    expect(
      await f.invoke('settings-set', {
        ...update(),
        patch: { assignmentConcurrencyLimit: 3, approval: false },
      }),
    ).toMatchObject({ error: { code: 'invalid-request' } });
    for (const value of [0, 33, 1.5, '3']) {
      expect(
        await f.invoke('settings-set', {
          ...update(),
          patch: { assignmentConcurrencyLimit: value },
        }),
      ).toMatchObject({ error: { code: 'invalid-setting' } });
    }
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('sanitizes unexpected owner failures', async () => {
    const f = await fixture({
      readSetting: () => {
        throw new Error('Bearer secret; /private/owner');
      },
    });
    expect(await f.invoke('settings', { ns: 'botharness-client' })).toMatchObject({
      error: { code: 'operation-failed', message: 'operation-failed' },
    });
  });
  it('bounds body size and rejects malformed requests', async () => {
    const f = await fixture();
    const headers = {
      authorization: 'Bearer ' + f.broker.token,
      'content-type': 'application/json',
    };
    const malformed = await fetch(f.broker.endpoint + '/invoke', {
      method: 'POST',
      headers,
      body: '{',
    });
    expect(await malformed.json()).toMatchObject({ error: { code: 'invalid-request' } });
    const large = await fetch(f.broker.endpoint + '/invoke', {
      method: 'POST',
      headers,
      body: JSON.stringify({ huge: 'x'.repeat(3 * 1024 * 1024) }),
    });
    expect(large.status).toBe(413);
  });
  it('rejects another mutation while one operation awaits approval', async () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await fixture({
      approve: async () => {
        entered();
        await wait;
      },
    });
    const first = f.invoke('settings-set', update());
    await ready;
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'operation-in-progress' },
    });
    release();
    expect(await first).toMatchObject({ ok: true });
    expect(f.writeSetting).toHaveBeenCalledTimes(1);
  });
  it('rechecks authority inside the native write callback and preserves coded approval failures', async () => {
    const f = await fixture();
    f.writeSetting.mockImplementation(async (_value, _revision, check) => {
      f.authorize.mockImplementation(() => {
        throw new TobError('agent-context-expired');
      });
      check();
      return f.current();
    });
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'agent-context-expired' },
    });
    expect(f.current().value).toBe(8);
    const cancelled = await fixture({
      approve: async () => {
        throw new TobError('approval-cancelled');
      },
    });
    expect(await cancelled.invoke('settings-set', update())).toMatchObject({
      error: { code: 'approval-cancelled' },
    });
  });
  it('keeps approval guards local to each mutation and rechecks them before write', async () => {
    let allowed = true;
    const f = await fixture({
      approve: async () => () => {
        if (!allowed) throw new TobError('approval-authority-changed');
      },
    });
    f.writeSetting.mockImplementation(async (_value, _revision, check) => {
      allowed = false;
      check();
      return f.current();
    });
    expect(await f.invoke('settings-set', update())).toMatchObject({
      error: { code: 'approval-authority-changed' },
    });
    expect(await f.invoke('settings', { ns: 'botharness-client' })).toMatchObject({ ok: true });
    expect(f.current().value).toBe(8);
  });
  it('emits bounded diagnostics without tokens or raw exception details', async () => {
    const log = vi.fn();
    const f = await fixture({ log });
    await f.invoke('settings-set', update());
    await f.invoke('settings', { ns: 'botharness-client' }, 'bad-secret');
    await f.broker.close();
    expect(log.mock.calls.map(([phase]) => phase)).toEqual([
      'started',
      'approved',
      'completed',
      'refused',
      'closed',
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(f.broker.token);
    expect(JSON.stringify(log.mock.calls)).not.toContain('bad-secret');
  });
  it('close revokes pending requests and is idempotent', async () => {
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let approvalSignal: AbortSignal | undefined;
    const f = await fixture({
      approve: async (_input, signal) => {
        approvalSignal = signal;
        entered();
        await new Promise(() => {});
      },
    });
    const pending = f.invoke('settings-set', update()).catch(() => undefined);
    await ready;
    await f.broker.close();
    await pending;
    expect(approvalSignal?.aborted).toBe(true);
    expect(f.writeSetting).not.toHaveBeenCalled();
    await expect(f.invoke('settings')).rejects.toThrow();
    await f.broker.close();
  });
  it('an aborted caller terminates pending approval without mutation', async () => {
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let approvalSignal: AbortSignal | undefined;
    const f = await fixture({
      approve: async (_input, signal) => {
        approvalSignal = signal;
        entered();
        await new Promise(() => {});
      },
    });
    const pending = f.invoke('settings-set', update()).catch(() => undefined);
    await ready;
    f.controller.abort();
    await pending;
    expect(approvalSignal?.aborted).toBe(true);
    expect(f.writeSetting).not.toHaveBeenCalled();
  });
  it('request cancellation aborts approval and does not close another request', async () => {
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let approvalSignal: AbortSignal | undefined;
    const f = await fixture({
      approve: async (_input, signal) => {
        approvalSignal = signal;
        entered();
        await new Promise(() => {});
      },
    });
    const cancellation = new AbortController();
    const pending = fetch(f.broker.endpoint + '/invoke', {
      method: 'POST',
      signal: cancellation.signal,
      headers: { authorization: 'Bearer ' + f.broker.token, 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'settings-set', args: update() }),
    }).catch(() => undefined);
    await ready;
    cancellation.abort();
    await pending;
    await vi.waitFor(() => expect(approvalSignal?.aborted).toBe(true));
    expect(f.writeSetting).not.toHaveBeenCalled();
    expect(await f.invoke('settings', { ns: 'botharness-client' })).toMatchObject({ ok: true });
  });
});
