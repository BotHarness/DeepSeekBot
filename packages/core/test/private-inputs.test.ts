import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { createChannelStore } from '../src/channels/store.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { registerBridge } from '../src/bridge/rpc.js';
import type { BridgeMethods } from '../src/bridge/methods.js';

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const declaration = {
  account: 'synthetic',
  purpose: 'Check the controlled service',
  fields: [
    { id: 'api_key', label: 'API key', required: true },
    { id: 'api_secret', label: 'API secret', required: true },
    { id: 'private_url', label: 'Private URL', required: false },
  ],
};
const values = {
  api_key: 'SYNTHETIC KEY + / canary',
  api_secret: '  SYNTHETIC secret\nkeep whitespace  ',
  private_url: 'http://127.0.0.1/private?canary=synthetic',
};

async function fixture(
  qualified = true,
  requestTimeoutMs?: number,
  extra: Partial<ConstructorParameters<typeof PrivateInputs>[0]> = {},
) {
  const root = createTempRoot('bh-private-input-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  disposers.push(() => fiber.dispose());
  await fiber.await();
  const credentials = ctx.credentials;
  const registry = createTestRegistry({ rootDir: root });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  registry.create({ slug: 'bea', displayName: 'Bea' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  channels.getOrCreateDm('ada', 'Ada');
  channels.getOrCreateDm('bea', 'Bea');
  const ownership = createTestOwnership({
    'ada-session': { botSlug: 'ada', rootRole: 'orchestrator' },
    'bea-session': { botSlug: 'bea', rootRole: 'orchestrator' },
  });
  const agent = { session: { id: 'ada-session' } } as Agent;
  const bea = { session: { id: 'bea-session' } } as Agent;
  let live = true;
  let interactive = true;
  const deps = {
    channels,
    ownership,
    registry,
    credentials: () => credentials,
    isLive: (candidate: Agent) => live && (candidate === agent || candidate === bea),
    canRequest: () => interactive,
    qualified: async () => qualified,
    log: vi.fn(),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    ...extra,
  };
  const owner = new PrivateInputs(deps);
  return {
    owner,
    agent,
    bea,
    channels,
    credentials,
    ownership,
    ctx,
    replacement: () => new PrivateInputs(deps),
    unattended: () => {
      interactive = false;
    },
    close: async () => {
      await owner.close();
      registryDatabase(root).close();
    },
    stop: () => {
      live = false;
    },
  };
}

describe('private input card in the Channel the task came from', () => {
  it('opens the card in the Group turn, accepts the Owner submission there and keeps values out of every Channel', async () => {
    let group = '';
    const f = await fixture(true, undefined, { askChannel: () => group });
    try {
      group = f.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] }).id;
      const result = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() =>
        expect(f.channels.readMessages(group).some((message) => message.privateInputRequest)).toBe(
          true,
        ),
      );
      const id = f.channels.readMessages(group).find((message) => message.privateInputRequest)!.id;
      expect(f.channels.readMessages('dm-ada').some((message) => message.privateInputRequest)).toBe(
        false,
      );
      expect(f.owner.status(group, id)).toBe('pending');
      expect(f.owner.status('dm-ada', id)).not.toBe('pending');
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values })).toBe(
        false,
      );
      expect(await f.owner.submit(false, { channelId: group, messageId: id, values })).toBe(false);
      expect(await f.owner.submit(true, { channelId: group, messageId: id, values })).toBe(true);
      const configured = await result;
      expect(configured.status).toBe('configured');
      expect(
        await f.owner.consume(f.agent, declaration.account, configured.references, async () => ({
          httpStatus: 200,
        })),
      ).toEqual({ httpStatus: 200 });
      await expect(
        f.owner.consume(f.bea, declaration.account, configured.references, async () => ({
          httpStatus: 200,
        })),
      ).rejects.toThrow();
      const published = JSON.stringify([
        f.channels.readMessages(group),
        f.channels.readMessages('dm-ada'),
      ]);
      expect(published).not.toContain(values.api_key);
      expect(published).not.toContain('SYNTHETIC secret');
    } finally {
      await f.close();
    }
  });
});

describe('IM private input origin leases', () => {
  function origin() {
    const controller = new AbortController();
    let current = true;
    let applies = true;
    return {
      lease: {
        sourceEventId: 'im-source',
        signal: controller.signal,
        current: () => current && !controller.signal.aborted,
        applies: () => applies,
      },
      revoke: () => {
        current = false;
        controller.abort();
      },
      nextTurn: () => {
        applies = false;
      },
    };
  }

  it('opens only an Owner Web card, notifies the captured source, and revokes result delivery with the account', async () => {
    const source = origin();
    const notify = vi.fn(async () => {});
    const disposeReply = vi.fn();
    let delivery: import('../src/credentials/im-origin.js').PrivateReplyAuthority | undefined;
    const f = await fixture(true, undefined, {
      origin: () => source.lease,
      notify,
      replyAuthority: (_bot, id, authority) => {
        expect(id).toBe('im-source');
        delivery = authority;
        return disposeReply;
      },
    });
    try {
      const result = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
      const id = f.channels.readMessages('dm-ada')[0]!.id;
      expect(notify).toHaveBeenCalledWith('ada', source.lease, 'dm-ada', id);
      expect(delivery?.current()).toBe(false);
      expect(await f.owner.submit(false, { channelId: 'dm-ada', messageId: id, values })).toBe(
        false,
      );
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values })).toBe(true);
      const configured = await result;
      expect(configured.status).toBe('configured');
      expect(delivery?.current()).toBe(true);
      expect(
        await f.owner.consume(f.agent, declaration.account, configured.references, async () => ({
          httpStatus: 200,
        })),
      ).toEqual({ httpStatus: 200 });
      expect(JSON.stringify(notify.mock.calls)).not.toContain(values.api_key);
      expect(JSON.stringify(f.channels.readMessages('dm-ada'))).not.toContain(values.api_secret);
      await f.owner.revoke(true, 'dm-ada', id);
      expect(delivery?.signal.aborted).toBe(true);
      expect(delivery?.current()).toBe(false);
      expect(disposeReply).not.toHaveBeenCalled();
      source.nextTurn();
      await vi.waitFor(() => expect(disposeReply).toHaveBeenCalled(), { timeout: 2000 });
    } finally {
      await f.close();
    }
  });

  it('expires an IM card on Binding loss and refuses even authenticated late submission', async () => {
    const source = origin();
    const f = await fixture(true, undefined, {
      origin: () => source.lease,
      notify: async () => {},
    });
    try {
      const result = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const id = f.channels.readMessages('dm-ada')[0]!.id;
      source.revoke();
      expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values })).toBe(
        false,
      );
      expect(await result).toMatchObject({ status: 'expired', references: {} });
      expect(
        (await f.credentials.listRecords()).some((record) => record.key.includes('/grant-')),
      ).toBe(false);
    } finally {
      await f.close();
    }
  });

  it('guards IM result delivery when consuming saved references without asking again', async () => {
    const source = origin();
    let imTurn = false;
    let delivery: import('../src/credentials/im-origin.js').PrivateReplyAuthority | undefined;
    const f = await fixture(true, undefined, {
      origin: () => (imTurn ? source.lease : undefined),
      notify: async () => {},
      replyAuthority: (_bot, _id, authority) => {
        delivery = authority;
        return () => {};
      },
    });
    try {
      const requested = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      await f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
      const configured = await requested;
      imTurn = true;
      expect(
        await f.owner.consume(f.agent, declaration.account, configured.references, async () => 200),
      ).toBe(200);
      expect(delivery?.current()).toBe(true);
      await f.owner.revoke(true, 'dm-ada', messageId);
      expect(delivery?.signal.aborted).toBe(true);
      expect(delivery?.current()).toBe(false);
    } finally {
      await f.close();
    }
  });

  it('refuses consumption when distinct IM sources selected the same account in one turn', async () => {
    const sourceA = origin();
    const sourceB = origin();
    sourceA.lease.sourceEventId = 'source-a';
    sourceB.lease.sourceEventId = 'source-b';
    let imTurn = false;
    const f = await fixture(true, undefined, {
      origin: (_agent, id) =>
        imTurn ? (id === 'source-a' ? sourceA.lease : sourceB.lease) : undefined,
      notify: async () => {},
    });
    try {
      const requested = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const messageId = f.channels.readMessages('dm-ada')[0]!.id;
      await f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
      const configured = await requested;
      imTurn = true;
      await f.owner.ask(f.agent, declaration, new AbortController().signal, 'source-a');
      await f.owner.ask(f.agent, declaration, new AbortController().signal, 'source-b');
      sourceA.revoke();
      const run = vi.fn(async () => 200);
      await expect(
        f.owner.consume(f.agent, declaration.account, configured.references, run),
      ).rejects.toThrow('source is ambiguous');
      expect(run).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });

  it('stops in-flight IM consumption and permits later unattended reuse independently of its old source', async () => {
    const source = origin();
    const f = await fixture(true, undefined, {
      origin: () => (source.lease.applies() ? source.lease : undefined),
      notify: async () => {},
    });
    try {
      const result = f.owner.ask(f.agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
      const id = f.channels.readMessages('dm-ada')[0]!.id;
      await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values });
      const configured = await result;
      let active: AbortSignal | undefined;
      const consume = f.owner.consume(
        f.agent,
        declaration.account,
        configured.references,
        async (_values, signal) => {
          active = signal;
          return new Promise((resolve) =>
            signal.addEventListener('abort', () => resolve('late result'), { once: true }),
          );
        },
      );
      const rejected = expect(consume).rejects.toThrow(/failed or was cancelled/);
      await vi.waitFor(() => expect(active).toBeDefined());
      source.revoke();
      await rejected;
      expect(active?.aborted).toBe(true);
      source.nextTurn();
      f.unattended();
      const reused = await f.owner.ask(f.agent, declaration, new AbortController().signal);
      expect(reused.references).toEqual(configured.references);
      expect(
        await f.owner.consume(f.agent, declaration.account, reused.references, async () => 200),
      ).toBe(200);
    } finally {
      await f.close();
    }
  });
});

describe('private input native authority and reference contract', () => {
  it('refuses missing private configuration without creating an unattended input card', async () => {
    const f = await fixture();
    f.unattended();
    await expect(f.owner.ask(f.agent, declaration, new AbortController().signal)).rejects.toThrow(
      'Owner action in an interactive conversation',
    );
    expect(f.channels.readMessages('dm-ada')).toEqual([]);
    expect(await f.credentials.listRecords()).toEqual([]);
    await f.close();
  });

  it('reuses durable current references unattended after restart and refuses revoked configuration', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
    const configured = await wait;
    await f.owner.close();
    f.unattended();
    const restarted = f.replacement();
    expect(await restarted.ask(f.agent, declaration, new AbortController().signal)).toEqual(
      configured,
    );
    await expect(
      restarted.ask(
        f.agent,
        {
          ...declaration,
          fields: [...declaration.fields, { id: 'password', label: 'Password', required: true }],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Owner action');
    const consume = vi.fn(async (resolved) => ({
      statusCode: resolved.api_key === values.api_key ? 200 : 401,
    }));
    expect(
      await restarted.consume(f.agent, declaration.account, configured.references, consume),
    ).toEqual({ statusCode: 200 });
    await restarted.revoke(true, 'dm-ada', messageId);
    await expect(restarted.ask(f.agent, declaration, new AbortController().signal)).rejects.toThrow(
      'Owner action',
    );
    await expect(
      restarted.consume(f.agent, declaration.account, configured.references, consume),
    ).rejects.toThrow();
    expect(consume).toHaveBeenCalledTimes(1);
    expect(
      f.channels.readMessages('dm-ada').filter((message) => message.privateInputRequest),
    ).toHaveLength(1);
    await restarted.close();
    await f.close();
  });

  it('replaces an account through private Chat input and durably revokes both old and current references', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
    const original = await wait;
    expect(await f.owner.replace(false, 'dm-ada', messageId)).toBeUndefined();
    const replacementId = await f.owner.replace(true, 'dm-ada', messageId);
    expect(replacementId).toBeDefined();
    const replacementValues = { ...values, api_key: 'SYNTHETIC replacement key' };
    expect(
      await f.owner.submit(true, {
        channelId: 'dm-ada',
        messageId: replacementId,
        values: replacementValues,
      }),
    ).toBe(true);
    const current = await f.owner.accountStatus(true, 'dm-ada', replacementId!);
    expect(current.status).toBe('configured');
    const reuse = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await expect(
      Promise.race([
        reuse,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 100)),
      ]),
    ).resolves.toEqual({
      status: 'configured',
      account: declaration.account,
      references: current.references,
    });
    const run = vi.fn(async () => 'HTTP 200');
    await expect(
      f.owner.consume(f.agent, declaration.account, original.references, run),
    ).rejects.toThrow(/unavailable/);
    expect(run).not.toHaveBeenCalled();
    expect(
      await f.owner.consume(
        f.agent,
        declaration.account,
        current.references,
        async (resolved) => resolved.api_key,
      ),
    ).toBe(replacementValues.api_key);
    expect((await f.owner.revoke(true, 'dm-ada', replacementId!)).accepted).toBe(true);
    await expect(
      f.owner.consume(f.agent, declaration.account, current.references, run),
    ).rejects.toThrow(/unavailable/);
    const restarted = f.replacement();
    await expect(
      restarted.consume(f.agent, declaration.account, current.references, run),
    ).rejects.toThrow(/unavailable/);
    expect(JSON.stringify(f.channels.readMessages('dm-ada'))).not.toContain(
      replacementValues.api_key,
    );
    await restarted.close();
    await f.close();
  });

  it('lists only one Bot’s private accounts without values and erases a revoked account at once', async () => {
    const f = await fixture();
    expect(await f.owner.accounts(true, 'ada')).toEqual([]);
    const configure = async (agent: Agent, channelId: string) => {
      const cards = () =>
        f.channels.readMessages(channelId).filter((message) => message.privateInputRequest);
      const before = new Set(cards().map((message) => message.id));
      const wait = f.owner.ask(agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(cards().length).toBe(before.size + 1));
      const messageId = cards().find((message) => !before.has(message.id))!.id;
      expect(await f.owner.submit(true, { channelId, messageId, values: { ...values } })).toBe(
        true,
      );
      return { messageId, result: await wait };
    };
    const ada = await configure(f.agent, 'dm-ada');
    await configure(f.bea, 'dm-bea');
    expect(await f.owner.accounts(false, 'ada')).toBeUndefined();
    const listed = await f.owner.accounts(true, 'ada');
    expect(listed).toEqual([
      {
        account: 'synthetic',
        purpose: declaration.purpose,
        fields: declaration.fields,
        status: 'configured',
        configuredAt: expect.any(String),
        channelId: 'dm-ada',
        messageId: ada.messageId,
      },
    ]);
    const serialized = JSON.stringify(listed);
    for (const value of Object.values(values)) expect(serialized).not.toContain(value);
    expect(serialized).not.toContain(Object.values(ada.result.references)[0]!.split(':')[1]);

    const replacementId = await f.owner.replace(true, 'dm-ada', ada.messageId);
    expect(await f.owner.accounts(true, 'ada')).toMatchObject([
      { status: 'replacing', messageId: ada.messageId, replacementMessageId: replacementId },
    ]);
    expect(await f.owner.cancel(true, 'dm-ada', replacementId!)).toBe(true);
    expect((await f.owner.accounts(true, 'ada'))?.[0]?.status).toBe('configured');

    const grants = async () =>
      (await f.credentials.listRecords()).filter((entry) =>
        /^botharness-private\/grant-/.test(entry.key),
      );
    expect(await grants()).toHaveLength(2);
    expect((await f.owner.revoke(true, 'dm-ada', ada.messageId)).accepted).toBe(true);
    expect(await f.owner.accounts(true, 'ada')).toEqual([]);
    expect(await grants()).toHaveLength(1);
    expect((await f.owner.accounts(true, 'bea'))?.map((row) => row.account)).toEqual(['synthetic']);

    const again = await configure(f.agent, 'dm-ada');
    expect(await f.owner.accounts(true, 'ada')).toMatchObject([
      { account: 'synthetic', status: 'configured', messageId: again.messageId },
    ]);
    await f.close();
  });

  it('erases every private account of a deleted Bot and cancels its open requests', async () => {
    const f = await fixture();
    const configure = async (agent: Agent, channelId: string) => {
      const before = f.channels.readMessages(channelId).length;
      const wait = f.owner.ask(agent, declaration, new AbortController().signal);
      await vi.waitFor(() => expect(f.channels.readMessages(channelId).length).toBe(before + 1));
      const messageId = f.channels.readMessages(channelId)[0]!.id;
      await f.owner.submit(true, { channelId, messageId, values: { ...values } });
      return wait;
    };
    await configure(f.agent, 'dm-ada');
    await configure(f.bea, 'dm-bea');
    const open = f.owner.ask(
      f.agent,
      { ...declaration, account: 'second' },
      new AbortController().signal,
    );
    await vi.waitFor(() =>
      expect(
        f.channels
          .readMessages('dm-ada')
          .filter((message) => message.privateInputRequest?.account === 'second'),
      ).toHaveLength(1),
    );
    const owners = async () => {
      const slugs: string[] = [];
      for (const entry of await f.credentials.listRecords()) {
        if (!entry.key.startsWith('botharness-private/')) continue;
        const record = await f.credentials.readRecord(entry.key);
        const payload = record?.kind === 'grant' ? (record.payload as { botSlug?: string }) : {};
        if (payload.botSlug !== undefined) slugs.push(payload.botSlug);
      }
      return slugs.sort();
    };
    expect(await owners()).toEqual(['ada', 'ada', 'bea', 'bea']);

    expect(await f.owner.eraseBot('ada')).toBe(1);
    expect((await open).status).toBe('cancelled');
    expect(await f.owner.accounts(true, 'ada')).toEqual([]);
    expect(await owners()).toEqual(['bea', 'bea']);
    expect((await f.owner.accounts(true, 'bea'))?.map((row) => row.status)).toEqual(['configured']);
    expect(await f.owner.eraseBot('ada')).toBe(0);
    await f.close();
  });

  it('revocation stops an active consumer and invalidates a pending replacement without affecting another Bot', async () => {
    const f = await fixture();
    const a = f.owner.ask(f.agent, declaration, new AbortController().signal);
    const b = f.owner.ask(f.bea, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-bea')).toHaveLength(1));
    const aId = f.channels.readMessages('dm-ada')[0]!.id;
    const bId = f.channels.readMessages('dm-bea')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId: aId, values });
    await f.owner.submit(true, { channelId: 'dm-bea', messageId: bId, values });
    const original = await a;
    const other = await b;
    const replacementId = await f.owner.replace(true, 'dm-ada', aId);
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const use = f.owner.consume(
      f.agent,
      declaration.account,
      original.references,
      async (_values, signal) => {
        started();
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }),
        );
      },
    );
    const refused = expect(use).rejects.toThrow(/cancelled/);
    await entered;
    expect(await f.owner.revoke(true, 'dm-ada', aId)).toEqual({
      accepted: true,
      stopped: 1,
      completed: 0,
      uncertain: 0,
    });
    await refused;
    expect(
      await f.owner.submit(true, { channelId: 'dm-ada', messageId: replacementId, values }),
    ).toBe(false);
    expect(
      await f.owner.consume(
        f.bea,
        declaration.account,
        other.references,
        async () => 'other Bot still works',
      ),
    ).toBe('other Bot still works');
    await f.close();
  });

  it('reports a consumer that completes despite a stop signal as completed, not stopped', async () => {
    const f = await fixture();
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const id = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values });
    const configured = await waiting;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const use = f.owner.consume(
      f.agent,
      declaration.account,
      configured.references,
      async (_values, signal) => {
        entered();
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        return 'already applied';
      },
    );
    await started;
    expect(await f.owner.revoke(true, 'dm-ada', id)).toEqual({
      accepted: true,
      stopped: 0,
      completed: 1,
      uncertain: 0,
    });
    expect(await use).toBe('already applied');
    await f.close();
  });

  it('reports uncertainty after a bounded stop attempt while still denying every new use', async () => {
    const f = await fixture();
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const id = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values });
    const configured = await waiting;
    let finish!: () => void;
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const running = f.owner.consume(
      f.agent,
      declaration.account,
      configured.references,
      async () => {
        enter();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return 'completed later';
      },
    );
    await entered;
    expect(await f.owner.revoke(true, 'dm-ada', id)).toEqual({
      accepted: true,
      stopped: 0,
      completed: 0,
      uncertain: 1,
    });
    const run = vi.fn(async () => 'never');
    await expect(
      f.owner.consume(f.agent, declaration.account, configured.references, run),
    ).rejects.toThrow(/unavailable/);
    expect(run).not.toHaveBeenCalled();
    finish();
    expect(await running).toBe('completed later');
    await f.close();
  });

  it('acknowledges committed revocation and attempts a stop even if the credential provider response fails afterwards', async () => {
    const f = await fixture();
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const id = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values });
    const configured = await waiting;
    const modify = f.credentials.modifyRecord.bind(f.credentials);
    vi.spyOn(f.credentials, 'modifyRecord').mockImplementation(async (key, change) => {
      const result = await modify(key, change);
      if (key.startsWith('botharness-private/account-')) throw new Error(values.api_secret);
      return result;
    });
    expect(await f.owner.revoke(true, 'dm-ada', id)).toEqual({
      accepted: true,
      stopped: 0,
      completed: 0,
      uncertain: 0,
    });
    expect(await f.owner.accountStatus(true, 'dm-ada', id)).toEqual({
      status: 'revoked',
      references: {},
    });
    const run = vi.fn(async () => 'never');
    await expect(
      f.owner.consume(f.agent, declaration.account, configured.references, run),
    ).rejects.toThrow(/unavailable/);
    expect(run).not.toHaveBeenCalled();
    await f.close();
  });

  it('never publishes configured references after an account activation failure', async () => {
    const f = await fixture();
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const id = f.channels.readMessages('dm-ada')[0]!.id;
    const modify = f.credentials.modifyRecord.bind(f.credentials);
    const failure = vi
      .spyOn(f.credentials, 'modifyRecord')
      .mockImplementation(async (key, change) => {
        if (key.startsWith('botharness-private/account-')) throw new Error(values.api_secret);
        return modify(key, change);
      });
    const deletion = vi
      .spyOn(f.credentials, 'deleteRecord')
      .mockRejectedValue(new Error(values.api_key));
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values })).toBe(false);
    expect(await waiting).toMatchObject({ status: 'expired', references: {} });
    const resolution = f.channels.message(
      'dm-ada',
      'private-resolution-' + id,
    )!.privateInputResolution!;
    expect(resolution).toMatchObject({ state: 'expired', references: {} });
    const run = vi.fn(async () => 'never');
    await expect(
      f.owner.consume(f.agent, declaration.account, resolution.references, run),
    ).rejects.toThrow(/invalid/);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(await f.owner.accountStatus(true, 'dm-ada', id))).not.toContain(
      values.api_secret,
    );
    failure.mockRestore();
    deletion.mockRestore();
    const restarted = f.replacement();
    await restarted.recover();
    await expect(
      restarted.consume(f.agent, declaration.account, resolution.references, run),
    ).rejects.toThrow(/invalid/);
    await restarted.close();
    await f.close();
  });

  it('waits for startup recovery before Owner replacement can begin', async () => {
    const f = await fixture();
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const id = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId: id, values });
    await waiting;
    await f.owner.close();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = f.credentials.listRecords.bind(f.credentials);
    const blocked = vi.spyOn(f.credentials, 'listRecords').mockImplementation(async () => {
      await gate;
      return list();
    });
    const restarted = f.replacement();
    const recovery = restarted.recover();
    const replacing = restarted.replace(true, 'dm-ada', id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(f.channels.readMessages('dm-ada').filter((m) => m.privateInputRequest)).toHaveLength(1);
    release();
    await recovery;
    blocked.mockRestore();
    expect(await replacing).toBeDefined();
    await restarted.close();
    await f.close();
  });

  it('saves all confidential fields atomically, returns references only, and refuses cross-Bot/account or fabricated actor use', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(await f.owner.submit(false, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await f.owner.submit(true, { channelId: 'dm-bea', messageId, values })).toBe(false);
    expect(
      await f.owner.submit(true, { channelId: 'dm-ada', messageId, values, actor: 'Owner' }),
    ).toBe(false);
    expect(
      await f.owner.submit(true, {
        channelId: 'dm-ada',
        messageId,
        values: { ...values, injected: 'unexpected' },
      }),
    ).toBe(false);
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(true);
    const result = await wait;
    expect(result.status).toBe('configured');
    const visible = JSON.stringify({ result, messages: f.channels.readMessages('dm-ada') });
    for (const value of Object.values(values)) expect(visible).not.toContain(value);
    expect(
      await f.owner.consume(f.agent, 'synthetic', result.references, async (resolved) => ({
        ...resolved,
      })),
    ).toEqual(values);
    const consume = vi.fn(async () => 'never');
    await expect(f.owner.consume(f.bea, 'synthetic', result.references, consume)).rejects.toThrow(
      /grant is unavailable/,
    );
    await expect(
      f.owner.consume(f.agent, 'other-account', result.references, consume),
    ).rejects.toThrow(/grant is unavailable/);
    await expect(
      f.owner.consume(
        { session: { id: 'ada-session' } } as Agent,
        'synthetic',
        result.references,
        consume,
      ),
    ).rejects.toThrow(/unavailable/);
    expect(consume).not.toHaveBeenCalled();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(
      (await f.credentials.listRecords()).filter((entry) =>
        entry.key.startsWith('botharness-private/grant-'),
      ),
    ).toHaveLength(1);
    await f.close();
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
    const remote = registerBridge(f.ctx, {} as BridgeMethods, f.owner);
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

  it('never uses an orphan grant after a partial write failure and removes it during recovery', async () => {
    const f = await fixture();
    const wait = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    const modify = f.credentials.modifyRecord.bind(f.credentials);
    vi.spyOn(f.credentials, 'modifyRecord').mockImplementationOnce(async (...args) => {
      await modify(...args);
      throw new Error(values.api_secret);
    });
    const deletion = vi
      .spyOn(f.credentials, 'deleteRecord')
      .mockRejectedValue(new Error(values.api_key));
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await wait).toMatchObject({ status: 'expired', references: {} });
    const records = await f.credentials.listRecords();
    expect(records).toHaveLength(1);
    const grantId = records[0]!.key.split('grant-')[1]!;
    const references = Object.fromEntries(
      Object.keys(values).map((field) => [field, `private:${grantId}:${field}`]),
    );
    const run = vi.fn(async () => true);
    await expect(f.owner.consume(f.agent, 'synthetic', references, run)).rejects.toThrow(
      /grant is unavailable/,
    );
    expect(run).not.toHaveBeenCalled();
    const visible = JSON.stringify(f.channels.readMessages('dm-ada'));
    for (const value of Object.values(values)) expect(visible).not.toContain(value);
    deletion.mockRestore();
    const replacement = f.replacement();
    await replacement.recover();
    expect(await f.credentials.listRecords()).toHaveLength(0);
    await replacement.close();
    await f.close();
  });

  it('reconciles lost live cards durably and retains configured references on replacement', async () => {
    const f = await fixture();
    const first = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const configuredId = f.channels.readMessages('dm-ada')[0]!.id;
    expect(
      await f.owner.submit(true, { channelId: 'dm-ada', messageId: configuredId, values }),
    ).toBe(true);
    const configured = await first;
    const lost = f.owner.ask(f.bea, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-bea')).toHaveLength(1));
    const lostId = f.channels.readMessages('dm-bea')[0]!.id;
    const replacement = f.replacement();
    try {
      await replacement.recover();
      expect(replacement.status('dm-bea', lostId)).toBe('expired');
      expect(
        f.channels.message('dm-bea', 'private-resolution-' + lostId)?.privateInputResolution?.state,
      ).toBe('expired');
      expect(
        await replacement.submit(true, { channelId: 'dm-bea', messageId: lostId, values }),
      ).toBe(false);
      expect(
        await replacement.consume(
          f.agent,
          'synthetic',
          configured.references,
          async (resolved) => ({ ...resolved }),
        ),
      ).toEqual(values);
      expect(
        (await f.credentials.listRecords()).filter((entry) =>
          entry.key.startsWith('botharness-private/grant-'),
        ),
      ).toHaveLength(1);
    } finally {
      await replacement.close();
      await f.close();
      await lost;
    }
  });
});
