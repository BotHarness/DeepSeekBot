import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { roots, modelOwners, setup } from './support/bridge-methods.js';

describe('composer recovery reference validation', () => {
  it('uses current Human-visible reply and attachment facts without accepting draft text', async () => {
    const { channels, attachments, methods } = setup();
    const channel = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const sent = await methods.channelSend({
      channelId: channel.id,
      body: 'reply target',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error('send failed');
    const ref = await attachments.upload({
      name: 'note.txt',
      data: (async function* () {
        yield new TextEncoder().encode('file');
      })(),
    });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        replyTo: sent.value.message.id,
        attachments: [ref],
      }),
    ).toMatchObject({
      ok: true,
      value: { reply: { id: sent.value.message.id }, attachments: [ref] },
    });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        replyTo: 'deleted',
        attachments: [
          {
            hash: 'sha256:' + '0'.repeat(64),
            name: 'gone.txt',
            mime: 'text/plain',
            size: 0,
          },
        ],
      }),
    ).toEqual({ ok: true, value: { attachments: [null] } });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        attachments: [],
        text: 'private unsent input',
      }).ok,
    ).toBe(false);
    expect(methods.composerValidate({ channelId: 'missing', attachments: [] }).ok).toBe(false);
  });

  it('returns each restored quote target, or null when it is gone or no longer holds the excerpt', async () => {
    const { channels, methods } = setup();
    const channel = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const sent = await methods.channelSend({ channelId: channel.id, body: 'ship on Friday' });
    if (!sent.ok) throw new Error('send failed');
    const id = sent.value.message.id;
    expect(
      methods.composerValidate({
        channelId: channel.id,
        attachments: [],
        quotes: [
          { messageId: id, text: 'on Friday' },
          { messageId: id, text: 'on Monday' },
          { messageId: 'deleted' },
        ],
      }),
    ).toMatchObject({ ok: true, value: { quotes: [{ id, body: 'ship on Friday' }, null, null] } });
    expect(
      methods.composerValidate({
        channelId: channel.id,
        attachments: [],
        quotes: Array.from({ length: 9 }, () => ({ messageId: id })),
      }).ok,
    ).toBe(false);
  });
});

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('admits blank attachment-only DMs and rejects forged refs', async () => {
    const admitted: string[] = [];
    const { channels, attachments, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage(_human, input) {
        admitted.push(input.body);
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('hello');
      })(),
      name: 'note.txt',
    });
    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: '   ',
      attachments: [ref],
    });
    expect(sent).toMatchObject({
      ok: true,
      value: { message: { attachments: [ref] } },
    });
    const empty = await methods.channelSend({
      channelId: 'dm-ada',
      body: '',
      attachments: [ref],
    });
    expect(empty.ok).toBe(true);
    expect(admitted).toEqual(['[Attachments: note.txt]', '[Attachments: note.txt]']);
    const bad = await methods.channelSend({
      channelId: 'dm-ada',
      body: '',
      attachments: [{ ...ref, name: 'forged.txt' }],
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(channels.readMessages('dm-ada')).toHaveLength(2);
  });

  it('deduplicates one Human client message id before a second runtime admission', async () => {
    let admissions = 0;
    const { channels, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage() {
        admissions += 1;
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'only once',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
    };
    const [first, duplicate] = await Promise.all([
      methods.channelSend(payload),
      methods.channelSend(payload),
    ]);
    expect(duplicate).toEqual(first);
    expect(channels.readMessages('dm-ada')).toHaveLength(1);
    expect(admissions).toBe(1);
    await expect(methods.channelSend({ ...payload, body: 'different' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('sends several whole or partial quotes and refuses quotes the Channel cannot back', async () => {
    const { methods, channels } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    const group = methods.channelCreate({ name: 'Team', members: [] });
    const groupId = group.ok ? group.value.channel.id : '';
    const first = await methods.channelSend({
      channelId: groupId,
      body: 'Ship the **export** fix on Friday.',
    });
    const second = await methods.channelSend({ channelId: groupId, body: 'Docs are ready.' });
    const firstId = first.ok ? first.value.message.id : '';
    const secondId = second.ok ? second.value.message.id : '';

    const accepted = await methods.channelSend({
      channelId: groupId,
      body: 'Both look right',
      quotes: [{ messageId: firstId, text: 'export fix on' }, { messageId: secondId }],
    });
    expect(accepted.ok && accepted.value.message.quotes).toMatchObject([
      {
        messageId: firstId,
        text: 'export fix on',
        preview: { author: { kind: 'human' }, body: 'Ship the **export** fix on Friday.' },
      },
      {
        messageId: secondId,
        preview: { author: { kind: 'human' }, body: 'Docs are ready.' },
      },
    ]);
    expect(accepted.ok && accepted.value.message.quotes?.[1]).not.toHaveProperty('text');
    const stored = channels
      .readMessages(groupId)
      .find((message) => accepted.ok && message.id === accepted.value.message.id);
    expect(stored?.quotes?.map((quote) => quote.messageId)).toEqual([firstId, secondId]);

    const revision = channels.revision(groupId);
    expect(
      await methods.channelSend({
        channelId: groupId,
        body: 'made up',
        quotes: [{ messageId: firstId, text: 'ship on Monday' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'quote-text-mismatch' } });
    expect(
      await methods.channelSend({
        channelId: 'dm-ada',
        body: 'cross',
        quotes: [{ messageId: firstId }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'quote-target-missing' } });
    expect(
      await methods.channelSend({
        channelId: groupId,
        body: 'too many',
        quotes: Array.from({ length: 9 }, (_, index) => ({ messageId: `m-${index}` })),
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(channels.revision(groupId)).toBe(revision);
  });

  it('records human messages locally and pages them newest-first', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'hello',
    });
    expect(first).toEqual({
      ok: true,
      value: {
        message: {
          id: expect.any(String),
          at: expect.any(String),
          author: { kind: 'human', humanId: OWNER_HUMAN_CONTEXT.humanId, displayName: 'Human' },
          body: 'hello',
        },
      },
    });
    const second = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'again',
    });
    expect(second.ok).toBe(true);
    const third = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'third',
    });
    expect(third.ok).toBe(true);

    const page = methods.channelMessages({ channelId: 'dm-ada' });
    expect(page.ok && page.value.messages.map((message) => message.body)).toEqual([
      'third',
      'again',
      'hello',
    ]);

    const oldest = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'oldest',
    });
    expect(oldest.ok).toBe(true);
    const cursor = third.ok ? third.value.message.id : '';
    const older = methods.channelMessages({
      channelId: 'dm-ada',
      before: cursor,
      limit: 2,
    });
    expect(older.ok && older.value.messages.map((message) => message.body)).toEqual([
      'again',
      'hello',
    ]);
  });

  it('sends a DM through the Bot runtime and exposes only Assignment read models', async () => {
    const handled: Array<{
      channelId: string;
      messageId: string;
      body: string;
    }> = [];
    let settled: Promise<void> = Promise.resolve();
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage(_human, input) {
        handled.push(input);
        settled = (async () => {
          const reply = {
            id: 'bot-reply-1',
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: '已经完成发布状态核对。',
          };
          await channels.appendMessage(OWNER_HUMAN_CONTEXT, input.channelId, reply);
        })();
        return { admitted: true as const, settled };
      },
      listAssignments: () => [
        {
          sessionId: 'assignment-1',
          title: '核对发布状态',
          description: '核对发布状态',
          activity: 'idle' as const,
          latestReport: {
            state: 'completed' as const,
            summary: '发布状态正常',
            at: '2026-09-19T00:00:01.000Z',
          },
          createdAt: '2026-09-19T00:00:00.000Z',
          updatedAt: '2026-09-19T00:00:01.000Z',
        },
      ],
      getAssignment: (_slug, sessionId) =>
        sessionId === 'assignment-1'
          ? {
              sessionId,
              botSlug: 'ada',
              sourceEventId: 'source-1',
              title: '核对发布状态',
              description: '核对发布状态',
              activity: 'idle' as const,
              latestReport: {
                state: 'completed' as const,
                summary: '发布状态正常',
                at: '2026-09-19T00:00:01.000Z',
              },
              createdAt: '2026-09-19T00:00:00.000Z',
              updatedAt: '2026-09-19T00:00:01.000Z',
            }
          : undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: '请核对发布状态',
    });

    expect(sent.ok).toBe(true);
    expect(handled).toEqual([
      {
        channelId: 'dm-ada',
        messageId: expect.any(String),
        body: '请核对发布状态',
      },
    ]);
    const pending = methods.channelMessages({ channelId: 'dm-ada' });
    expect(pending.ok && pending.value.messages.map((message) => message.body)).toContain(
      '请核对发布状态',
    );

    await settled;
    const messages = methods.channelMessages({ channelId: 'dm-ada' });
    expect(messages.ok && messages.value.messages.map((message) => message.body)).toEqual([
      '已经完成发布状态核对。',
      '请核对发布状态',
    ]);
    expect(methods.assignments({ slug: 'ada' })).toEqual({
      ok: true,
      value: {
        assignments: [
          expect.objectContaining({
            sessionId: 'assignment-1',
            description: '核对发布状态',
            activity: 'idle',
          }),
        ],
      },
    });
    expect(methods.assignment({ slug: 'ada', sessionId: 'assignment-1' })).toEqual({
      ok: true,
      value: {
        assignment: expect.objectContaining({
          sessionId: 'assignment-1',
          sourceEventId: 'source-1',
        }),
      },
    });
  });

  it('returns from a DM send before the admitted Orchestrator turns settle', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const settledTurns: Promise<void>[] = [];
    const admitted: string[] = [];
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage(_human, input) {
        admitted.push(input.body);
        const settled = (async () => {
          await gate;
          await channels.appendMessage(OWNER_HUMAN_CONTEXT, input.channelId, {
            id: `bot-reply-${admitted.length}`,
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: `reply-${input.body}`,
          });
        })();
        settledTurns.push(settled);
        return { admitted: true as const, settled };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'first',
    });
    const second = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'second',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(admitted).toEqual(['first', 'second']);
    const before = methods.channelMessages({ channelId: 'dm-ada' });
    expect(before.ok && before.value.messages.map((message) => message.body)).toEqual([
      'second',
      'first',
    ]);

    release();
    await Promise.all(settledTurns);
    const after = methods.channelMessages({ channelId: 'dm-ada' });
    expect(after.ok && after.value.messages.map((message) => message.body)).toEqual([
      'reply-second',
      'reply-first',
      'second',
      'first',
    ]);
  });

  it('rejects an archived PersonaBot before committing a Human DM', async () => {
    const { methods, registry, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({
        admitted: false as const,
        reason: 'archived-bot' as const,
      }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    registry.setPaused('ada', true);

    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'hello',
    });

    expect(sent).toEqual({
      ok: false,
      error: { code: 'bot-archived', message: 'PersonaBot is archived: ada' },
    });
    expect(channels.readMessages('dm-ada')).toEqual([]);
  });

  it('reports a post-commit admission refusal without mislabeling a durable message as failed', async () => {
    const { methods, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      async withdrawNetworkMembership() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({
        admitted: false as const,
        reason: 'runtime-closed' as const,
      }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: 'hello',
    });

    expect(sent).toMatchObject({
      ok: true,
      value: { message: { body: 'hello' } },
    });
    expect(channels.readMessages('dm-ada').map((message) => message.body)).toEqual(['hello']);
  });
});

it('resolves attachment identity within its current message and keeps resend idempotency after an external save', async () => {
  const { attachments, channels, methods } = setup();
  const channel = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Files', members: [] });
  const ref = await attachments.upload({
    data: (async function* () {
      yield Buffer.from('source');
    })(),
    name: 'notes.txt',
  });
  const intent = {
    channelId: channel.id,
    messageId: 'human-00000000-0000-4000-8000-000000000000',
    body: '',
    attachments: [ref],
  };
  const result = await methods.channelSend(intent);
  expect(result.ok).toBe(true);
  const target = methods.messageAttachmentTarget({
    channelId: channel.id,
    messageId: 'human-00000000-0000-4000-8000-000000000000',
    fileId: ref.fileId,
  });
  expect(target.ok).toBe(true);
  if (!target.ok) throw new Error('Expected owner target');
  writeFileSync(target.value.target.path, 'saved with different size');
  const retry = await methods.channelSend(intent);
  expect(retry.ok).toBe(true);
  expect(channels.revision(channel.id)).toBe(1);
  expect(
    methods.messageAttachmentTarget({
      channelId: channel.id,
      messageId: 'wrong',
      fileId: ref.fileId,
    }).ok,
  ).toBe(false);
  expect(
    methods.messageAttachmentTarget({
      channelId: channel.id,
      messageId: 'human-00000000-0000-4000-8000-000000000000',
      fileId: ref.hash,
    }).ok,
  ).toBe(false);
});
