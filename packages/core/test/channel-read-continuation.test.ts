import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createChannelStore } from '../src/channels/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { readChannelMessagePage } from '../src/channels/read-continuation.js';
import { ReadContinuationError } from '../src/channels/read-cursor.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { ChannelStore } from '../src/channels/store-types.js';
import { createTempRoot } from './helpers.js';
import { modelOwners, roots, setup } from './support/bridge-methods.js';

afterEach(() => {
  for (const owner of modelOwners.splice(0)) owner.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function seed(channels: ChannelStore, channelId: string, ids: readonly string[]) {
  for (const id of ids)
    await channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
      id,
      at: '2026-11-01T00:00:00.000Z',
      author: { kind: 'human' },
      body: `body ${id}`,
    });
}

function ok<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ReadContinuationError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('channelMessages continuation on the Host method', () => {
  it('returns provenance and keeps older pages stable while new messages arrive', async () => {
    const { channels, methods } = setup();
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await seed(channels, dm.id, ['m1', 'm2', 'm3', 'm4', 'm5']);
    const first = ok(methods.channelMessages({ channelId: dm.id, limit: 2 }));
    expect(first.messages.map((message) => message.id)).toEqual(['m5', 'm4']);
    expect(first).toMatchObject({
      revision: 5,
      complete: false,
      provenance: {
        source: 'channel',
        channelId: dm.id,
        type: 'dm',
        incarnation: dm.createdAt,
        members: ['ada'],
        revision: 5,
        contentIsData: true,
      },
    });
    await seed(channels, dm.id, ['m6']);
    const second = ok(
      methods.channelMessages({
        channelId: dm.id,
        limit: 2,
        cursor: first.nextCursor,
      }),
    );
    expect(second.messages.map((message) => message.id)).toEqual(['m3', 'm2']);
    expect(second).toMatchObject({
      revision: 6,
      provenance: { revision: 5 },
      complete: false,
    });
    const last = ok(
      methods.channelMessages({
        channelId: dm.id,
        limit: 2,
        cursor: second.nextCursor,
      }),
    );
    expect(last.messages.map((message) => message.id)).toEqual(['m1']);
    expect(last.complete).toBe(true);
    expect(last.nextCursor).toBeUndefined();
  });

  it('refuses a cursor from another Channel, a recreated Channel, or a rewritten history', async () => {
    const { channels, methods, root } = setup();
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Team',
      members: ['ada'],
    });
    await seed(channels, dm.id, ['m1', 'm2', 'm3', 'm4']);
    await seed(channels, group.id, ['g1', 'g2', 'g3', 'g4']);
    const cursor = ok(methods.channelMessages({ channelId: dm.id, limit: 2 })).nextCursor;
    expect(methods.channelMessages({ channelId: group.id, cursor })).toMatchObject({
      ok: false,
      error: { code: 'changed-read-target' },
    });
    expect(methods.channelMessages({ channelId: dm.id, cursor, before: 'm2' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });

    const file = join(root, 'channels', dm.id, 'messages.ndjson');
    const lines = readFileSync(file, 'utf8').split('\n');
    writeFileSync(file, lines.slice(1).join('\n'));
    expect(methods.channelMessages({ channelId: dm.id, cursor })).toMatchObject({
      ok: false,
      error: { code: 'stale-read-revision' },
    });

    rmSync(join(root, 'channels', dm.id), { recursive: true });
    const recreated = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    expect(recreated.createdAt).not.toBe(dm.createdAt);
    await seed(channels, dm.id, ['m1', 'm2', 'm3', 'm4']);
    expect(methods.channelMessages({ channelId: dm.id, cursor })).toMatchObject({
      ok: false,
      error: { code: 'changed-read-target' },
    });
  });

  it('refuses malformed and altered cursors', async () => {
    const { channels, methods } = setup();
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await seed(channels, dm.id, ['m1', 'm2', 'm3']);
    const cursor = ok(methods.channelMessages({ channelId: dm.id, limit: 1 })).nextCursor!;
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const forged = Buffer.from(
      JSON.stringify({ ...decoded, f: { ...decoded.f, p: decoded.f.p - 1 } }),
    ).toString('base64url');
    for (const bad of [forged, cursor.slice(0, -2), 'not a cursor', 42, '', 'x'.repeat(4096)])
      expect(methods.channelMessages({ channelId: dm.id, cursor: bad })).toMatchObject({
        ok: false,
        error: { code: 'invalid-read-cursor' },
      });
  });

  it('caps the serialized page and continues from the last message it returned', async () => {
    const { channels } = setup();
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    await seed(channels, dm.id, ['m1', 'm2', 'm3']);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const result = readChannelMessagePage(channels, dm.id, {
        limit: 3,
        maxBytes: 1,
        ...(cursor === undefined ? {} : { cursor }),
      })!;
      expect(result.messages).toHaveLength(1);
      seen.push(result.messages[0]!.id);
      cursor = result.nextCursor;
      expect(result.complete).toBe(cursor === undefined);
    }
    expect(seen).toEqual(['m3', 'm2', 'm1']);
    expect(cursor).toBeUndefined();
  });

  it('keeps the whole serialized page, envelope and cursor included, within the byte cap', async () => {
    const { channels } = setup();
    const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    for (const id of ['m1', 'm2', 'm3', 'm4'])
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id,
        at: '2026-11-01T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'x'.repeat(3_800),
      });
    const maxBytes = 8 * 1024;
    const page = readChannelMessagePage(channels, dm.id, { limit: 4, maxBytes })!;
    expect(page.messages.length).toBeGreaterThan(0);
    expect(page.nextCursor).toBeDefined();
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThanOrEqual(maxBytes);
  });
});

describe('channel continuation on the operational store', () => {
  it('treats a content purge accepted after the first page as stale history', async () => {
    const home = createTempRoot('read-continuation-');
    const database = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const port = attachOperationalModule(database, 'messaging');
      const channels = createSqliteChannelStore({
        database: port,
        rootDir: join(home, 'botharness', 'channels'),
        databaseOwnerReady: database.mode === 'ready',
      });
      const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Purge QA',
        members: [],
      });
      await seed(channels, group.id, ['m1', 'm2', 'm3', 'm4']);
      const first = readChannelMessagePage(channels, group.id, { limit: 2 })!;
      expect(first.messages.map((message) => message.id)).toEqual(['m4', 'm3']);
      await seed(channels, group.id, ['m5']);
      expect(
        readChannelMessagePage(channels, group.id, {
          limit: 1,
          cursor: first.nextCursor,
        })!.messages[0]?.id,
      ).toBe('m2');
      port.transaction((db) => {
        const row = db
          .prepare(
            'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
          )
          .get(group.id, 'm1') as { source_event_id: string };
        db.prepare('INSERT INTO messaging_purge_facts VALUES (?, ?, ?, ?, ?)').run(
          row.source_event_id,
          group.id,
          'm1',
          '2026-11-02T00:00:00.000Z',
          '{}',
        );
      });
      expect(
        refusal(() =>
          readChannelMessagePage(channels, group.id, {
            cursor: first.nextCursor,
          }),
        ),
      ).toBe('stale-read-revision');
      expect(readChannelMessagePage(channels, group.id, {})!.complete).toBe(true);
    } finally {
      database.close();
    }
  });

  it('positions match on the file store', async () => {
    const root = createTempRoot('read-continuation-fs-');
    const channels = createChannelStore({ rootDir: root });
    const group = channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Files',
      members: [],
    });
    await seed(channels, group.id, ['a', 'b']);
    expect(channels.messagePosition(group.id, 'b')).toBe(2);
    expect(channels.messagePosition(group.id, 'missing')).toBeUndefined();
    expect(channels.historyEpoch(group.id)).toBe(0);
  });
});
