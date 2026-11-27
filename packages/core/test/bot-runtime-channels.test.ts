import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createChannelStore, MAX_MESSAGE_PAGE } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createBotRuntime } from '../src/core.js';
import { deferred } from './deferred.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { admit } from './support/bot-runtime.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

it('reports unavailable External Messaging when replying to a retained Bridge source', async () => {
  const home = createTempRoot('botharness-unavailable-bridge-reply-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const destination = deferred<unknown>();
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    now: FIXED_NOW,
    agents: {
      async runOrchestrator(run) {
        try {
          destination.resolve(run.replyDestination?.('retained-bridge'));
        } catch (error) {
          destination.resolve(error);
        }
      },
      async runAssignment() {},
      requestAssignment: () => ({ delivery: 'steer' }),
      async close() {},
    },
  });
  try {
    attachOperationalModule(owner, 'retained-bridge-test').transaction((db) =>
      db
        .prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at)
        VALUES ('retained-bridge', 'bridge-message', 'ada', 'Earlier message', ?)`)
        .run(FIXED_NOW().toISOString()),
    );
    await admit(runtime, { channelId: dm.id, messageId: 'reply-request', body: 'Reply' });
    expect(await destination.promise).toMatchObject({
      code: 'unavailable-destination',
      message: 'External messaging is unavailable.',
    });
  } finally {
    await runtime.close();
    owner.close();
  }
});

it('reads only a joined Channel image by durable message and attachment reference', async () => {
  const home = createTempRoot('botharness-bot-runtime-image-read-');
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const image = await attachments.upload({
    data: (async function* () {
      yield bytes;
    })(),
    name: 'visual.png',
  });
  const channels = createChannelStore({
    rootDir: join(home, 'channels'),
    attachments,
    now: FIXED_NOW,
  });
  const joined = channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Joined', members: ['ada'] });
  const privateChannel = channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Private',
    members: [],
  });
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, joined.id, {
    id: 'image-message',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: 'What is in this image?',
    attachments: [image],
  });
  for (let index = 0; index < 201; index += 1) {
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, joined.id, {
      id: `newer-${index}`,
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: `Newer message ${index}`,
    });
  }
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, privateChannel.id, {
    id: 'private-image',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: '',
    attachments: [image],
  });
  await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
    id: 'trigger-image-read',
    at: FIXED_NOW().toISOString(),
    author: { kind: 'human' },
    body: 'Inspect the group image',
  });
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let inspected = false;
  const runtime = createBotRuntime({
    database: owner,
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    attachments,
    agents: {
      runOrchestrator: async (run) => {
        const access = run.channels.readAttachment;
        expect(access).toBeDefined();
        const result = await access!({
          channelId: joined.id,
          messageId: 'image-message',
          attachmentId: image.fileId!,
          maxBytes: 1024,
        });
        expect(result.ref).toEqual(image);
        expect(result.data).toEqual(bytes);
        const path = attachments.fileTarget(image.fileId!).path;
        const edited = Uint8Array.from([...bytes, 4, 5]);
        writeFileSync(path, edited);
        const current = await access!({
          channelId: joined.id,
          messageId: 'image-message',
          attachmentId: image.fileId!,
          maxBytes: 1024,
        });
        expect(current.data).toEqual(edited);
        expect(current.ref.size).toBe(edited.length);
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            maxBytes: bytes.length,
          }),
        ).rejects.toThrow('read limit');
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            hash: 'sha256:' + 'a'.repeat(64),
            maxBytes: 1024,
          }),
        ).rejects.toThrow('Exactly one');
        writeFileSync(path, 'now plain text');
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'image-message',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow('supported Channel image');
        await expect(
          access!({
            channelId: privateChannel.id,
            messageId: 'private-image',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow(/not a member/);
        await expect(
          access!({
            channelId: joined.id,
            messageId: 'missing',
            attachmentId: image.fileId!,
            maxBytes: 1024,
          }),
        ).rejects.toThrow(/not found/);
        inspected = true;
      },
      runAssignment: async () => undefined,
      requestAssignment: () => ({
        delivery: 'followup' as const,
        accepted: Promise.resolve(),
        done: Promise.resolve(),
      }),
      close: async () => undefined,
    },
    now: FIXED_NOW,
    createEventId: () => 'source-image-read',
    createSessionId: () => 'orchestrator-ada',
  });
  await admit(runtime, {
    channelId: dm.id,
    messageId: 'trigger-image-read',
    body: 'Inspect the group image',
  });
  expect(inspected).toBe(true);
  await runtime.close();
  owner.close();
});

describe('Bot runtime tracer bullet', () => {
  it('sends a staged attachment through the trusted Orchestrator Channel access', async () => {
    const home = createTempRoot('botharness-bot-runtime-attachment-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('bot artifact');
      })(),
      name: 'result.txt',
    });
    const channels = createChannelStore({
      rootDir: join(home, 'channels'),
      attachments,
      now: FIXED_NOW,
    });
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
      id: 'human-attachment-request',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'Send the artifact',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          await run.channels.send({ body: '', attachments: [ref] });
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createEventId: () => 'source-attachment',
      createMessageId: () => 'bot-attachment',
      createSessionId: () => 'orchestrator-ada',
    });
    await admit(runtime, {
      channelId: dm.id,
      messageId: 'human-attachment-request',
      body: 'Send the artifact',
    });
    expect(channels.readMessages(dm.id)[0]).toMatchObject({
      id: 'bot-attachment',
      author: { kind: 'bot', slug: 'ada' },
      attachments: [ref],
    });
    await runtime.close();
    owner.close();
  });

  it('finds the newest joined search matches beyond the first ascending store page', async () => {
    const home = createTempRoot('botharness-joined-search-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const [firstGroup, laterGroup] = ['History A', 'History B']
      .map((name) => channels.createGroup(OWNER_HUMAN_CONTEXT, { name, members: ['ada'] }))
      .sort((left, right) => left.id.localeCompare(right.id));
    for (let index = 0; index <= MAX_MESSAGE_PAGE; index++) {
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, laterGroup!.id, {
        id: `match-${index}`,
        at: new Date(FIXED_NOW().getTime() + index * 1000).toISOString(),
        author: { kind: 'human' },
        body: 'needle',
      });
    }
    for (const index of [1, 2]) {
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, firstGroup!.id, {
        id: `prior-${index}`,
        at: new Date(FIXED_NOW().getTime() + MAX_MESSAGE_PAGE * 1000 - index).toISOString(),
        author: { kind: 'human' },
        body: 'needle',
      });
    }
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const trigger = {
      id: 'trigger',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' as const },
      body: 'Search history',
    };
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, trigger);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const matches: string[] = [];
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async ({ channels }) => {
          const query = { scope: 'joined', text: 'needle', ascending: true, limit: 1 } as const;
          const first = channels.query(query);
          if (first.nextCursor === undefined) throw new Error('Expected a joined continuation');
          const second = channels.query({ ...query, cursor: first.nextCursor });
          matches.push(...[...first.messages, ...second.messages].map(({ message }) => message.id));
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
    });
    try {
      await admit(runtime, { channelId: dm.id, messageId: trigger.id, body: trigger.body });
      expect(matches).toEqual([`match-${MAX_MESSAGE_PAGE}`, 'prior-1']);
    } finally {
      await runtime.close();
      owner.close();
    }
  });

  it('rejects Channel read, search, and send outside the trusted PersonaBot membership', async () => {
    const home = createTempRoot('botharness-bot-runtime-membership-');
    const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    expect(registry.create({ slug: 'bob', displayName: 'Bob' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const adaDm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    const bobDm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob');
    expect(adaDm).toBeDefined();
    expect(bobDm).toBeDefined();
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, adaDm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '尝试越权',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      grants: createTestWorkspaceGrants(owner, home),
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          expect(() => run.channels.read({ channelId: bobDm!.id })).toThrow(/not a member/);
          expect(() => run.channels.query({ channelId: bobDm!.id, text: '越权' })).toThrow(
            /not a member/,
          );
          await run.channels.send({ channelId: bobDm!.id, body: '冒充 Bob' });
        },
        runAssignment: async () => undefined,
        requestAssignment: () => ({
          delivery: 'followup' as const,
          accepted: Promise.resolve(),
          done: Promise.resolve(),
        }),
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    await expect(
      admit(runtime, {
        channelId: adaDm!.id,
        messageId: 'human-1',
        body: '尝试越权',
      }),
    ).rejects.toThrow(/not a member/);
    expect(channels.readMessages(bobDm!.id)).toEqual([]);

    await runtime.close();
    owner.close();
  });
});
