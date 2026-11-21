import { declaration, fixture, origin, values } from './private-inputs-fixtures.js';
import { OWNER_HUMAN_CONTEXT, humanContext } from '../src/humans/context.js';
import { describe, expect, it, vi } from 'vitest';

describe('private input card in the Channel the task came from', () => {
  it('opens the card in the Group turn, accepts the Owner submission there and keeps values out of every Channel', async () => {
    let group = '';
    const f = await fixture(true, undefined, { askChannel: () => group });
    try {
      group = f.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada', 'bea'],
      }).id;
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
      const acting = humanContext('acting-owner');
      await f.owner.revoke(true, 'dm-ada', id, acting);
      expect(
        f.channels
          .readMessages('dm-ada')
          .find((message) => message.id.startsWith('private-revocation-'))?.author,
      ).toEqual({ kind: 'human', humanId: acting.humanId, displayName: 'Human' });
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

  it.each(['resolve', 'reject'])(
    'stops in-flight IM consumption (%s) and permits later unattended reuse independently of its old source',
    async (outcome) => {
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
            return new Promise((resolve, reject) =>
              signal.addEventListener(
                'abort',
                () =>
                  outcome === 'resolve' ? resolve('late result') : reject(new Error('aborted')),
                { once: true },
              ),
            );
          },
        );
        const rejected = expect(consume).rejects.toMatchObject({ code: 'private-source-revoked' });
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
    },
  );
});
