import { declaration, fixture, origin, values } from './private-inputs-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('private input native authority and reference contract', () => {
  it('aborts active private-input uses and ready replies before deleting the revoked grant', async () => {
    const source = origin();
    const replySignal = deferred<AbortSignal>();
    const f = await fixture(true, undefined, {
      origin: () => source.lease,
      notify: async () => {},
      replyAuthority: (_bot, _id, authority) => {
        replySignal.resolve(authority.signal);
        return () => {};
      },
    });
    const waiting = f.owner.ask(f.agent, declaration, new AbortController().signal);
    await vi.waitFor(() => expect(f.channels.readMessages('dm-ada')).toHaveLength(1));
    const messageId = f.channels.readMessages('dm-ada')[0]!.id;
    await f.owner.submit(true, { channelId: 'dm-ada', messageId, values });
    const { references } = await waiting;
    const reply = await replySignal.promise;
    const started = deferred<AbortSignal>();
    const use = f.owner.consume(
      f.agent,
      declaration.account,
      references,
      async (_values, signal) => {
        started.resolve(signal);
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      },
    );
    const active = await started.promise;
    const deletionStarted = deferred<void>();
    const allowDeletion = deferred<void>();
    const deleteRecord = f.credentials.deleteRecord.bind(f.credentials);
    const deletion = vi.spyOn(f.credentials, 'deleteRecord').mockImplementation(async (key) => {
      deletionStarted.resolve();
      await allowDeletion.promise;
      return deleteRecord(key);
    });
    const revocation = f.owner.revoke(true, 'dm-ada', messageId);
    try {
      await deletionStarted.promise;
      expect(active.aborted).toBe(true);
      expect(reply.aborted).toBe(true);
    } finally {
      allowDeletion.resolve();
      await Promise.all([revocation, use]);
      deletion.mockRestore();
      await f.close();
    }
  });

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
    expect(
      f.channels
        .readMessages('dm-ada')
        .find((message) => message.privateInputResolution?.requestMessageId === replacementId)
        ?.author,
    ).toEqual({ kind: 'human', humanId: OWNER_HUMAN_CONTEXT.humanId, displayName: 'Human' });
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
    const source = origin();
    const f = await fixture(true, undefined, {
      origin: () => source.lease,
      notify: async () => {},
    });
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
    const refused = expect(use).rejects.toMatchObject({ code: 'private-account-unavailable' });
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

  it('reports a consumer that completes despite an account stop as completed while its IM source remains current', async () => {
    const source = origin();
    const f = await fixture(true, undefined, {
      origin: () => source.lease,
      notify: async () => {},
    });
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
    ).rejects.toThrow(/live main conversation Session of a PersonaBot/);
    expect(consume).not.toHaveBeenCalled();
    expect(await f.owner.submit(true, { channelId: 'dm-ada', messageId, values })).toBe(false);
    expect(await f.owner.submission(true, { channelId: 'dm-ada', messageId, values })).toEqual({
      accepted: false,
      reason: 'not-pending',
    });
    expect(
      (await f.credentials.listRecords()).filter((entry) =>
        entry.key.startsWith('botharness-private/grant-'),
      ),
    ).toHaveLength(1);
    await f.close();
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
