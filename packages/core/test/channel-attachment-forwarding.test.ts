import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelAttachmentRef } from '../src/attachments/ref.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64',
);
async function* chunks() {
  yield png;
}

type Fixture = {
  core: ReturnType<typeof createCore>;
  tools: readonly ToolDefinition[];
  dmId: string;
  groupId: string;
  image: ChannelAttachmentRef;
  legacy: ChannelAttachmentRef;
  currentLegacy: ChannelAttachmentRef;
};
async function call(
  tools: readonly ToolDefinition[],
  name: string,
  args: unknown,
  callId?: string,
) {
  return tools.find((tool) => tool.name === name)!.execute(args, { callId } as ToolRunContext);
}
async function send(f: Fixture, args: unknown, callId?: string) {
  const result = JSON.parse(String(await call(f.tools, 'channel_send', args, callId)));
  expect(Object.keys(result).sort()).toEqual([
    'channelId',
    'inboxResolution',
    'messageId',
    'status',
  ]);
  expect(result.status).toBe('committed');
  expect(result.inboxResolution).toMatchObject({ outcome: 'not-requested' });
  expect(f.core.channels.message(result.channelId, result.messageId)).toBeDefined();
  return result;
}
async function fixture(check: (f: Fixture) => Promise<void>, recipients = 0) {
  const failures: unknown[] = [];
  let checked = false;
  let image: ChannelAttachmentRef;
  let legacy: ChannelAttachmentRef;
  let currentLegacy: ChannelAttachmentRef;
  let dmId = '';
  let groupId = '';
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        if (checked) return;
        checked = true;
        try {
          await check({ core, tools, dmId, groupId, image, legacy, currentLegacy });
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-attachment-forward-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const members = ['ada'];
    const registry = createTestRegistry({
      rootDir: core.registry.rootDir,
      database: core.operationalDatabase,
    });
    for (let index = 0; index < recipients; index += 1) {
      const slug = 'peer-' + index;
      expect(registry.create({ slug, displayName: 'Peer ' + index }).ok).toBe(true);
      members.push(slug);
    }
    groupId = core.channels.createGroup({ name: 'Destination', members }).id;
    image = await core.attachments.upload({ data: chunks(), name: 'visual.png' });
    const hash = 'sha256:' + createHash('sha256').update(png).digest('hex');
    const objects = join(core.attachments.rootDir, 'objects', hash.slice(7, 9));
    mkdirSync(objects, { recursive: true });
    writeFileSync(join(objects, hash.slice(7)), png);
    legacy = { hash, name: 'legacy.png', mime: 'image/png', size: png.length };
    dmId = core.channels.getOrCreateDm('ada', 'Ada')!.id;
    const message = {
      id: 'source',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Inspect and forward',
      attachments: [image, legacy],
    };
    const { body, ...envelope } = message;
    const sourceEventId = randomUUID();
    const database = attachOperationalModule(core.operationalDatabase, 'attachment-forward-test');
    database.transaction((db) => {
      db.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'human-message', 'ada', ?, ?, ?, ?, ?)`).run(
        sourceEventId,
        dmId,
        message.id,
        body,
        message.at,
        JSON.stringify(envelope),
      );
      db.prepare(`INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id)
        VALUES (?, 1, ?, ?)`).run(dmId, sourceEventId, message.id);
    }, []);
    await core.channels.migrateAttachments!();
    currentLegacy = core.channels.message(dmId, 'source')!.attachments![1]!;
    expect(currentLegacy.fileId).toMatch(/^file:/);
    expect(
      database.read(
        (db) =>
          db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(sourceEventId)?.payload_json,
      ),
    ).toBe(JSON.stringify(envelope));
    core.runtime.admitDmMessage({
      channelId: dmId,
      messageId: 'source',
      body: 'Inspect and forward',
    });
    await core.runtime.whenIdle();
    expect(checked).toBe(true);
    expect(failures).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('trusted Orchestrator attachment forwarding', () => {
  it('forwards current four-field references from retained legacy history and old/compact reads with committed default/explicit targets', async () => {
    await fixture(async (f) => {
      const compact = JSON.parse(String(await call(f.tools, 'channel_read', {})));
      const references = compact.messages.find(
        (view: { message: { id: string } }) => view.message.id === 'source',
      ).message.attachments;
      expect(references).toEqual([f.image, f.currentLegacy]);
      expect(JSON.stringify(compact)).not.toContain(f.core.attachments.rootDir);
      const old = f.core.channels.message(f.dmId, 'source')!.attachments!;
      const defaultAck = await send(f, {
        body: '',
        attachments: [references[0]],
        reply_to: 'source',
      });
      expect(defaultAck.channelId).toBe(f.dmId);
      expect(f.core.channels.message(f.dmId, defaultAck.messageId)).toMatchObject({
        body: '',
        attachments: [f.image],
        replyTo: 'source',
      });
      for (const [index, ref] of old.entries()) {
        const args = { body: '', channel_id: f.groupId, attachments: [ref] };
        const ack = await send(f, args, 'forward-' + index);
        expect(ack.channelId).toBe(f.groupId);
        expect(f.core.channels.message(f.groupId, ack.messageId)?.attachments).toEqual([ref]);
        expect(await send(f, args, 'forward-' + index)).toEqual(ack);
        await expect(
          call(f.tools, 'channel_send', { ...args, body: 'different' }, 'forward-' + index),
        ).rejects.toThrow('different content');
      }
      expect(f.core.channels.readMessages(f.groupId)).toHaveLength(2);
      const ten = await send(f, {
        body: '',
        channel_id: f.groupId,
        attachments: Array(10).fill(f.image),
      });
      expect(f.core.channels.message(f.groupId, ten.messageId)?.attachments).toHaveLength(10);
    });
  });

  it('rejects fabricated, missing, foreign and malformed references without committing or acknowledging a message', async () => {
    await fixture(async (f) => {
      const foreign = await createAttachmentStore({ rootDir: createTempRoot() }).upload({
        data: chunks(),
        name: 'foreign.png',
      });
      const stale = await f.core.attachments.upload({ data: chunks(), name: 'removed.png' });
      rmSync(f.core.attachments.fileTarget(stale.fileId!).path);
      const invalid = [
        [f.legacy],
        [foreign],
        [stale],
        [{ ...f.image, fileId: 'file:' + randomUUID() }],
        [{ ...f.legacy, hash: 'sha256:' + '0'.repeat(64) }],
        [{ ...f.legacy, mime: 'text/plain' }],
        [{ ...f.image, hash: f.legacy.hash }],
        [{ name: 'missing.png', mime: 'image/png', size: 1 }],
        ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1].map((size) => [{ ...f.image, size }]),
        Array(11).fill(f.image),
      ];
      for (const attachments of invalid) {
        await expect(
          call(f.tools, 'channel_send', { body: '', channel_id: f.groupId, attachments }),
        ).rejects.toThrow();
        expect(f.core.channels.readMessages(f.groupId)).toEqual([]);
      }
      const unjoined = f.core.channels.createGroup({ name: 'Private', members: [] });
      await expect(
        call(f.tools, 'channel_send', {
          body: '',
          channel_id: unjoined.id,
          attachments: [f.image],
        }),
      ).rejects.toThrow('not a member');
      expect(f.core.channels.readMessages(unjoined.id)).toEqual([]);
    });
  });

  it('retains same-Channel replies and current mention eligibility at the 20-ID boundary', async () => {
    await fixture(async (f) => {
      await expect(
        call(f.tools, 'channel_send', {
          body: '',
          channel_id: f.groupId,
          attachments: [f.image],
          reply_to: 'source',
        }),
      ).rejects.toThrow();
      const parent = await send(f, { body: 'parent', channel_id: f.groupId });
      const ids = Array.from({ length: 20 }, (_, index) => 'peer-' + index);
      const ack = await send(f, {
        body: '',
        channel_id: f.groupId,
        attachments: [f.image],
        mention_bot_ids: ids,
        reply_to: parent.messageId,
      });
      expect(f.core.channels.message(f.groupId, ack.messageId)).toMatchObject({
        replyTo: parent.messageId,
      });
      expect(f.core.channels.message(f.groupId, ack.messageId)?.mentions).toHaveLength(20);
      f.core.registry.setPaused('peer-0', true);
      f.core.registry.create({ slug: 'outsider', displayName: 'Not joined' });
      const before = f.core.channels.readMessages(f.groupId).length;
      for (const mention_bot_ids of [
        [...ids, 'peer-20'],
        ['ada'],
        ['peer-0'],
        ['outsider'],
        ['missing'],
      ]) {
        await expect(
          call(f.tools, 'channel_send', {
            body: 'invalid',
            channel_id: f.groupId,
            mention_bot_ids,
          }),
        ).rejects.toThrow();
        expect(f.core.channels.readMessages(f.groupId)).toHaveLength(before);
      }
      await expect(
        call(f.tools, 'channel_send', { body: 'invalid', mention_bot_ids: ['peer-1'] }),
      ).rejects.toThrow('Group');
    }, 20);
  });

  it('does not return an acknowledgement when the authoritative append fails', async () => {
    await fixture(async (f) => {
      const append = vi
        .spyOn(f.core.channels, 'appendMessageOnce')
        .mockResolvedValueOnce({ status: 'missing' });
      await expect(
        call(f.tools, 'channel_send', { body: '', channel_id: f.groupId, attachments: [f.image] }),
      ).rejects.toThrow('disappeared');
      expect(f.core.channels.readMessages(f.groupId)).toEqual([]);
      append.mockRestore();
    });
  });
});
