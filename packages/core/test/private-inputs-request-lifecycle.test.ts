import { declaration, fixture, values } from './private-inputs-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it, vi } from 'vitest';
import { registerBridge } from '../src/bridge/rpc.js';
import type { BridgeMethods } from '../src/bridge/methods.js';

describe('private input native authority and reference contract', () => {
  it('refuses an empty all-optional private-input submission and lets the Owner retry', async () => {
    const f = await fixture();
    const optional = {
      ...declaration,
      fields: declaration.fields.map((field) => ({ ...field, required: false })),
    };
    const waiting = f.owner.ask(f.agent, optional, new AbortController().signal);
    try {
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      const card = { channelId: 'dm-ada', messageId };
      for (const empty of [{}, { api_key: '' }]) {
        expect(await f.owner.submission(true, { ...card, values: empty })).toEqual({
          accepted: false,
          reason: 'invalid-fields',
        });
        expect(f.owner.status(card.channelId, card.messageId)).toBe('pending');
        expect(await f.credentials.listRecords()).toEqual([]);
      }
      expect(await f.owner.submit(true, { ...card, values: { api_key: values.api_key } })).toBe(
        true,
      );
      expect(await waiting).toMatchObject({ status: 'configured' });
      expect((await f.owner.revoke(true, card.channelId, card.messageId)).accepted).toBe(true);
    } finally {
      await f.close();
      await waiting;
    }
  });

  it('refuses unsupported consumption before collecting values and rejects a stopped request', async () => {
    const unsupported = await fixture(false);
    await expect(
      unsupported.owner.ask(unsupported.agent, declaration, new AbortController().signal),
    ).rejects.toThrow(/unavailable/);
    expect(unsupported.channels.readMessages('dm-ada')).toHaveLength(0);
    await unsupported.close();
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    f.stop();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect((await wait).status).toBe('expired');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await f.close();
  });

  it('checks the actual Remote invocation peer rather than a Client-supplied Owner', async () => {
    const f = await fixture();
    const remote = registerBridge(f.ctx, () => ({}) as BridgeMethods, f.owner);
    expect(() => remote.privateInputStatus('dm-ada', 'missing')).toThrow(/authenticated Owner/);
    const forged = Object.create(remote) as typeof remote;
    Object.defineProperty(forged, 'ctx', {
      value: f.ctx.extend({ invocation: { peer: { principal: { kind: 'guest' } } } }),
    });
    expect(() => forged.privateInputStatus('dm-ada', 'missing')).toThrow(/authenticated Owner/);
    for (const method of [
      'privateAccountStatus',
      'privateInputReplace',
      'privateAccountRevoke',
    ] as const) {
      await expect(remote[method]('dm-ada', 'missing')).rejects.toThrow(/authenticated Owner/);
      await expect(forged[method]('dm-ada', 'missing')).rejects.toThrow(/authenticated Owner/);
    }
    await expect(remote.privateAccounts('ada')).rejects.toThrow(/authenticated Owner/);
    await expect(forged.privateAccounts('ada')).rejects.toThrow(/authenticated Owner/);
    await f.close();
  });

  it('settles concurrent cards independently and accepts only one of duplicate Owner submissions', async () => {
    const f = await fixture();
    try {
      const a = f.owner.ask(f.agent, declaration, new AbortController().signal);
      const b = f.owner.ask(
        f.bea,
        { ...declaration, account: 'other' },
        new AbortController().signal,
      );
      await vi.waitFor(() => expect(f.channels.readMessages('dm-bea')).toHaveLength(1));
      const aId = f.channels.readMessages('dm-ada')[0]!.id;
      const bId = f.channels.readMessages('dm-bea')[0]!.id;
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: bId, values })).toBe(
        false,
      );
      const accepted = await Promise.all([
        f.owner.submit(true, { channelId: 'dm-ada', messageId: aId, values }),
        f.owner.submit(true, { channelId: 'dm-ada', messageId: aId, values }),
      ]);
      expect(accepted.sort()).toEqual([false, true]);
      expect((await a).status).toBe('configured');
      expect(f.owner.activeMessageIds()).toEqual([bId]);
      expect(await f.owner.cancel(true, 'dm-bea', bId)).toBe(true);
      expect((await b).status).toBe('cancelled');
      expect(f.owner.activeMessageIds()).toEqual([]);
      expect(
        (await f.credentials.listRecords()).filter((entry) =>
          entry.key.startsWith('botharness-private/grant-'),
        ),
      ).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  it.each(['cancel', 'abort', 'stop'] as const)(
    'prevents a late grant when %s wins during credential write',
    async (action) => {
      const f = await fixture();
      const controller = new AbortController();
      const wait = f.owner.ask(f.agent, declaration, controller.signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      let release!: () => void;
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const modify = f.credentials.modifyRecord.bind(f.credentials);
      vi.spyOn(f.credentials, 'modifyRecord').mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return modify(...args);
      });
      const submit = f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
      await entry;
      const cancel = action === 'cancel' ? f.owner.cancel(true, 'dm-ada', messageId) : undefined;
      if (action === 'abort') controller.abort();
      if (action === 'stop') f.stop();
      release();
      expect(await submit).toBe(false);
      if (cancel !== undefined) expect(await cancel).toBe(true);
      const state = action === 'cancel' ? 'cancelled' : 'expired';
      expect((await wait).status).toBe(state);
      expect(f.owner.status('dm-ada', messageId)).toBe(state);
      expect(
        f.channels.readMessages('dm-ada').filter((m) => m.privateInputResolution),
      ).toHaveLength(1);
      expect(await f.credentials.listRecords()).toHaveLength(0);
      await f.close();
    },
  );

  it.each(['missing', 'assignment', 'other-bot'] as const)(
    'refuses late submission after ownership becomes %s while the Agent remains live',
    async (change) => {
      const f = await fixture();
      const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const id = f.channels.readMessages('dm-ada')[0]!.id;
      const original = f.ownership.resolve('ada-session')!;
      vi.spyOn(f.ownership, 'resolve').mockReturnValue(
        change === 'missing'
          ? undefined
          : {
              ...original,
              botSlug: change === 'other-bot' ? 'bea' : original.botSlug,
              rootRole: change === 'assignment' ? 'assignment' : original.rootRole,
            },
      );
      expect(f.owner.status('dm-ada', id)).toBe('expired');
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values })).toBe(
        false,
      );
      expect(await wait).toMatchObject({ status: 'expired', references: {} });
      expect(await f.credentials.listRecords()).toHaveLength(0);
      await f.close();
    },
  );

  it('expires a committed card at its Host deadline without an Owner poll', async () => {
    const f = await fixture(true, 200);
    try {
      const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const card = f.channels.readMessages('dm-ada')[0]!;
      expect(card.privateInputRequest?.expiresAt).toBeDefined();
      expect((await wait).status).toBe('expired');
      expect(f.owner.status('dm-ada', card.id)).toBe('expired');
      expect(
        f.channels
          .readMessages('dm-ada')
          .find((message) => message.privateInputResolution?.requestMessageId === card.id)?.author,
      ).toEqual({ kind: 'human', humanId: OWNER_HUMAN_CONTEXT.humanId, displayName: 'Human' });
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: card.id, values })).toBe(
        false,
      );
      expect(await f.credentials.listRecords()).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it('refuses a grant when cancellation wins at the queued Channel commit boundary', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const submission = f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
    await entry;
    const cancel = f.owner.cancel(true, 'dm-ada', messageId);
    release();
    expect(await submission).toBe(false);
    expect(await cancel).toBe(true);
    expect((await wait).status).toBe('cancelled');
    expect(
      (await f.credentials.listRecords()).filter((entry) =>
        entry.key.startsWith('botharness-private/grant-'),
      ),
    ).toHaveLength(0);
    expect(f.channels.readMessages('dm-ada').filter((m) => m.privateInputResolution)).toHaveLength(
      1,
    );
    await f.close();
  });

  it('drains request persistence on Host disposal before expiring the waiter', async () => {
    const f = await fixture();
    await f.owner.recover();
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await entry;
    let closed = false;
    const close = f.owner.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await close;
    expect((await wait).status).toBe('expired');
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(f.owner.status('dm-ada', messageId)).toBe('expired');
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await f.close();
  });

  it('drains startup reconciliation before disposal returns', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = f.channels.appendMessageOnce.bind(f.channels);
    vi.spyOn(f.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return append(...args);
    });
    const replacement = f.replacement();
    const recovery = replacement.recover();
    await entry;
    let closed = false;
    const close = replacement.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await Promise.all([close, recovery]);
    expect(closed).toBe(true);
    expect(f.channels.readMessages('dm-ada')).toHaveLength(2);
    await f.close();
    expect((await wait).status).toBe('expired');
  });
});

describe('private input failure reasons', () => {
  it('names why a submission was not received and logs the stage without values', async () => {
    let failWrites = false;
    let failReads = false;
    const f = await fixture(true, undefined, {
      credentials: () =>
        new Proxy(f.credentials, {
          get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver) as unknown;
            if (key === 'modifyRecord' && failWrites)
              return () => Promise.reject(new Error('disk full'));
            if (key === 'readRecord' && failReads) return () => Promise.reject(new Error('locked'));
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
    });
    try {
      const asked = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      expect(
        await f.owner.submission(true, {
          channelId: 'dm-ada',
          messageId,
          values: { api_key: 'only-one' },
        }),
      ).toEqual({ accepted: false, reason: 'invalid-fields' });
      failWrites = true;
      expect(await f.owner.submission(true, { channelId: 'dm-ada', messageId, values })).toEqual({
        accepted: false,
        reason: 'save-failed',
      });
      expect((await asked).status).toBe('expired');
      const log = (f.owner as unknown as { deps: { log: ReturnType<typeof vi.fn> } }).deps.log;
      expect(log).toHaveBeenCalledWith(
        'submit-refused',
        expect.objectContaining({ reason: 'invalid-fields', requestId: messageId }),
      );
      expect(log).toHaveBeenCalledWith(
        'submit-failed',
        expect.objectContaining({ reason: 'save-failed', errorName: 'Error' }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(values.api_key);

      failWrites = false;
      const second = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada').length).toBeGreaterThan(2));
      const next = f.channels.readMessages('dm-ada')[0]!.id;
      expect(next).not.toBe(messageId);
      expect(
        await f.owner.submission(true, { channelId: 'dm-ada', messageId: next, values }),
      ).toEqual({ accepted: true });
      const configured = await second;
      await expect(
        f.owner.consume(f.agent, declaration.account, configured.references, async () => {
          throw new TypeError('boom');
        }),
      ).rejects.toThrow('Protected credential consumer failed (TypeError)');
      failReads = true;
      await expect(
        f.owner.consume(f.agent, declaration.account, configured.references, async () => 'ok'),
      ).rejects.toThrow(/could not read the saved private information/);
      expect(log).toHaveBeenCalledWith(
        'consume-refused',
        expect.objectContaining({ reason: 'store-unreadable' }),
      );
      expect(log).toHaveBeenCalledWith(
        'consume-failed',
        expect.objectContaining({ reason: 'consumer-error', errorName: 'TypeError' }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(values.api_key);
    } finally {
      failReads = false;
      await f.close();
    }
  });
});
