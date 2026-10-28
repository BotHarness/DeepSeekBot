import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { mountContentPurge } from '../src/purge/owner.js';
import { openPurgeLedger } from '../src/purge/ledger.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import type { PurgeCheckpoint } from '../src/purge/contracts.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  while (owners.length) owners.pop()!.close();
});
function mount(home: string, options: Partial<Parameters<typeof mountContentPurge>[0]> = {}) {
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const purge = mountContentPurge({ dshHome: home, database, ...options });
  const port = attachOperationalModule(database, 'messaging');
  const attachments = createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') });
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: database.mode === 'ready',
    attachments,
  });
  return { database, purge, channels, port, attachments };
}
async function ended(
  home = createTempRoot('purge-test-'),
  options: Partial<Parameters<typeof mountContentPurge>[0]> = {},
) {
  const core = mount(home, options);
  const channel = core.channels.createGroup({ name: 'Disposable purge QA', members: [] });
  await core.channels.appendMessage(channel.id, {
    id: 'qa-message',
    at: '2026-10-08T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'synthetic-secret-body',
    attachments: [],
  });
  core.channels.deleteGroup(channel.id);
  const source = core.purge.sources(channel.id).sources[0]!;
  return { ...core, home, channel, source };
}
function accept(core: Awaited<ReturnType<typeof ended>>) {
  const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  return core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token);
}

describe('owning Content Purge tracer', () => {
  it('ends participation, retains history, and a cancelled preview writes nothing', async () => {
    const core = await ended();
    expect(core.channels.get(core.channel.id)).toBeUndefined();
    expect(core.purge.history()).toHaveLength(1);
    const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
    expect(preview.placements).toMatchObject([{ channelId: core.channel.id }]);
    expect(core.purge.checkpoint().facts).toEqual([]);
    expect(core.purge.sources(core.channel.id).sources[0]?.body).toBe('synthetic-secret-body');
    expect(
      await core.channels.appendMessageOnce(core.channel.id, {
        id: 'late',
        at: '2026-10-08T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'late',
      }),
    ).toEqual({ status: 'missing' });
    const replacement = core.channels.createGroup({ name: core.channel.name, members: [] });
    expect(replacement.id).not.toBe(core.channel.id);
    expect(core.purge.history()).toMatchObject([{ id: core.channel.id }]);
    expect(core.channels.readMessages(replacement.id)).toEqual([]);
  });
  it('retains audit and causal tombstones across cold restart, without bodies in its real checkpoint', async () => {
    const core = await ended();
    expect(accept(core)).toEqual({ accepted: 1 });
    const checkpoint = core.purge.checkpoint();
    expect(checkpoint.facts).toHaveLength(1);
    expect(JSON.stringify(checkpoint)).not.toContain('synthetic-secret-body');
    core.database.close();
    expect(
      readFileSync(join(core.home, 'botharness', 'botharness.db')).includes(
        Buffer.from('synthetic-secret-body'),
      ),
    ).toBe(false);
    const restarted = mount(core.home);
    expect(restarted.purge.sources(core.channel.id).sources[0]).toMatchObject({
      body: '',
      purgedAt: expect.any(String),
    });
    expect(restarted.purge.checkpoint()).toEqual(checkpoint);
  });
  it('rejects expired, forged and changed-reference previews without accepting facts', async () => {
    let time = Date.parse('2026-10-08T00:00:00.000Z');
    const core = await ended(undefined, { now: () => new Date(time) });
    const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
    expect(() =>
      core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token + 'bad'),
    ).toThrow();
    time += 300_001;
    expect(() =>
      core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token),
    ).toThrow('expired');
    const fresh = core.purge.preview(core.channel.id, preview.sourceEventIds);
    core.port.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_records SET record_json = json_set(record_json, '$.name', 'Changed') WHERE channel_id = ?",
        )
        .run(core.channel.id),
    );
    expect(() => core.purge.confirm(core.channel.id, fresh.sourceEventIds, fresh.token)).toThrow(
      'Scope changed',
    );
    expect(core.purge.checkpoint().facts).toEqual([]);
  });
  it.each(['after-acceptance', 'during-application'] as const)(
    'fails closed on %s and recovers before Messaging after restart',
    async (stage) => {
      const core = await ended(undefined, {
        faultInjector: (current) => {
          if (current === stage) throw new Error('synthetic interruption');
        },
      });
      expect(() => accept(core)).toThrow('unavailable');
      expect(core.database.mode).toBe('recovery');
      expect(() => core.channels.list()).toThrow();
      core.database.close();
      const restarted = mount(core.home);
      expect(restarted.database.mode).toBe('ready');
      expect(restarted.purge.sources(core.channel.id).sources[0]?.body).toBe('');
      expect(restarted.purge.checkpoint().facts).toHaveLength(1);
    },
  );
  it('applies destination and package union to an older SQLite snapshot before opening Messaging', async () => {
    const core = await ended();
    const snapshot = join(core.home, 'old.db');
    core.database.close();
    copyFileSync(join(core.home, 'botharness', 'botharness.db'), snapshot);
    const current = mount(core.home);
    const preview = current.purge.preview(core.channel.id, [core.source.sourceEventId]);
    current.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token);
    const destination = current.purge.checkpoint();
    current.database.close();
    copyFileSync(snapshot, join(core.home, 'botharness', 'botharness.db'));
    const packageCheckpoint: PurgeCheckpoint = {
      format: 'botharness-purge',
      version: 1,
      facts: [
        {
          sourceEventId: 'package-only',
          eventAt: '2026-10-08T00:00:00.000Z',
          author: { kind: 'human' },
          channelId: 'group-package',
          messageId: 'message-package',
          actor: 'local-human',
          reason: 'human-request',
          acceptedAt: '2026-10-08T00:00:00.000Z',
        },
      ],
    };
    const restored = mount(core.home, { restoring: true, restoreCheckpoint: packageCheckpoint });
    expect(restored.database.mode).toBe('ready');
    expect(restored.purge.sources(core.channel.id).sources[0]?.body).toBe('');
    expect(restored.purge.checkpoint().facts).toEqual(
      expect.arrayContaining([...destination.facts, ...packageCheckpoint.facts]),
    );
  });
  it.each([
    undefined,
    {},
    { format: 'botharness-purge', version: 99, facts: [] },
    { format: 'botharness-purge', version: 1, facts: [{ body: 'forbidden' }] },
  ])('rejects missing/corrupt/unsupported package checkpoint %#', (restoreCheckpoint) => {
    const core = mount(createTempRoot('purge-restore-'), { restoring: true, restoreCheckpoint });
    expect(core.database.mode).toBe('recovery');
    expect(() => core.channels.list()).toThrow();
  });
  it.each(['missing', 'corrupt'] as const)(
    'never mounts Messaging with a %s required ledger',
    async (fault) => {
      const core = await ended();
      accept(core);
      core.database.close();
      const path = join(core.home, 'botharness', 'purge', 'ledger.db');
      if (fault === 'missing') rmSync(path);
      else writeFileSync(path, 'synthetic corrupt ledger');
      const restarted = mount(core.home);
      expect(restarted.database.mode).toBe('recovery');
      expect(() => restarted.channels.list()).toThrow();
    },
  );
  it('fences duplicate identities, stale updates, admissions and content-dependent effects at the persistence boundary', async () => {
    const core = await ended();
    accept(core);
    expect(() =>
      core.port.transaction((db) =>
        db
          .prepare('UPDATE source_events SET body = ? WHERE source_event_id = ?')
          .run('resurrect', core.source.sourceEventId),
      ),
    ).toThrow();
    expect(() =>
      core.port.transaction((db) =>
        db
          .prepare(
            "INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json) VALUES ('duplicate', 'human-message', '', ?, ?, 'resurrect', '2026-10-08T00:00:00Z', '{}')",
          )
          .run(core.channel.id, core.source.messageId),
      ),
    ).toThrow();
    expect(() =>
      core.port.transaction((db) =>
        db
          .prepare(
            "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, 'qa', 'group-ordinary')",
          )
          .run(core.source.sourceEventId),
      ),
    ).toThrow();
    expect(core.purge.sources(core.channel.id).sources[0]?.body).toBe('');
  });
  it('previews all shared placements and refuses a newly live placement or managed file before acceptance', async () => {
    const core = await ended();
    const second = core.channels.createGroup({ name: 'Shared disposable Group', members: [] });
    core.channels.deleteGroup(second.id);
    core.port.transaction((db) =>
      db
        .prepare(
          'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, 1, ?, ?)',
        )
        .run(second.id, core.source.sourceEventId, core.source.messageId),
    );
    const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
    expect(preview.placements).toHaveLength(2);
    core.port.transaction((db) =>
      db
        .prepare(
          "UPDATE source_events SET payload_json = json_set(payload_json, '$.attachments', json('[{}]')) WHERE source_event_id = ?",
        )
        .run(core.source.sourceEventId),
    );
    expect(() =>
      core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token),
    ).toThrow('outside current Human read access');
    expect(core.purge.checkpoint().facts).toHaveLength(0);
  });
  it('validates a full union before writing and never replaces destination facts', () => {
    const home = createTempRoot('purge-ledger-');
    const ledger = openPurgeLedger(join(home, 'purge', 'ledger.db'), false);
    try {
      const fact = {
        sourceEventId: 'qa',
        channelId: 'group-qa',
        messageId: 'qa-message',
        eventAt: '2026-10-08T00:00:00.000Z',
        author: { kind: 'human' },
        actor: 'local-human',
        reason: 'human-request',
        acceptedAt: '2026-10-08T00:00:00.000Z',
      } as const;
      ledger.union({ format: 'botharness-purge', version: 1, facts: [fact] });
      ledger.union({ format: 'botharness-purge', version: 1, facts: [] });
      expect(ledger.checkpoint().facts).toEqual([fact]);
      expect(() =>
        ledger.union({
          format: 'botharness-purge',
          version: 1,
          facts: [{ ...fact, messageId: 'collision' }],
        }),
      ).toThrow('Conflicting');
      expect(ledger.checkpoint().facts).toEqual([fact]);
    } finally {
      ledger.close();
    }
    expect(
      readFileSync(join(home, 'purge', 'ledger.db')).includes(Buffer.from('synthetic-secret-body')),
    ).toBe(false);
  });
  it('refuses a missing established ledger even when an older operational snapshot has no requirement marker', () => {
    const home = createTempRoot('purge-pre-ledger-snapshot-');
    const path = join(home, 'purge', 'ledger.db');
    openPurgeLedger(path, false).close();
    rmSync(path);
    expect(() => openPurgeLedger(path, false)).toThrow('missing');
  });
  it('purges one shared managed-file occurrence and retains current bytes across restart', async () => {
    const home = createTempRoot('purge-files-');
    const core = mount(home);
    const file = await core.attachments.upload({
      name: 'synthetic.txt',
      data: (async function* () {
        yield Buffer.from('synthetic managed bytes');
      })(),
    });
    const channel = core.channels.createGroup({ name: 'Shared managed file QA', members: [] });
    for (const id of ['file-message-a', 'file-message-b'])
      await core.channels.appendMessage(channel.id, {
        id,
        at: '2026-10-08T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'synthetic file reference',
        attachments: [file],
      });
    core.channels.deleteGroup(channel.id);
    const page = core.purge.sources(channel.id);
    expect(page.sources.every((source) => !source.refusal)).toBe(true);
    const preview = core.purge.preview(channel.id, [page.sources[0]!.sourceEventId]);
    expect(preview.files).toMatchObject([{ identity: file.fileId, disposition: 'shared' }]);
    core.purge.confirm(channel.id, preview.sourceEventIds, preview.token);
    expect(core.purge.checkpoint().facts).toHaveLength(1);
    core.database.close();
    const restarted = mount(home);
    expect(restarted.attachments.has(file)).toBe(true);
    expect(readFileSync(restarted.attachments.fileTarget(file.fileId!).path, 'utf8')).toBe(
      'synthetic managed bytes',
    );
  });
  it('exports a real checkpoint under its synchronous barrier and refuses reentrant acceptance', async () => {
    const core = await ended();
    const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
    const checkpoint = core.purge.withCheckpoint((current) => {
      expect(() =>
        core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token),
      ).toThrow('unavailable');
      return JSON.parse(JSON.stringify(current));
    });
    expect(checkpoint.facts).toEqual([]);
    expect(accept(core)).toEqual({ accepted: 1 });
    expect(core.purge.withCheckpoint((current) => current).facts).toHaveLength(1);
  });
  it('redacts restored Outbox content without inventing outcomes for settled or interrupted attempts', async () => {
    const core = await ended();
    core.port.transaction((db) => {
      db.prepare(
        "INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at) VALUES ('binding-qa', 'qa', 'qa', 'qa', 'qa', 'qa', '2026-10-08T00:00:00Z')",
      ).run();
      db.prepare(
        "INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES ('grant-qa', 'binding-qa', 'qa', 1, '2026-10-08T00:00:00Z', '{}')",
      ).run();
      for (const state of ['pending', 'in-flight', 'delivered']) {
        db.prepare(
          'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          state,
          'qa',
          'grant-qa',
          state,
          state,
          '2026-10-08T00:00:00Z',
          JSON.stringify({
            sourceEventId: core.source.sourceEventId,
            state,
            text: 'synthetic outgoing content',
            reason: 'provider-accepted',
          }),
        );
        db.prepare(
          'INSERT INTO messaging_outbox_attempts (intent_id, started_at, state, reason) VALUES (?, ?, ?, ?)',
        ).run(state, '2026-10-08T00:00:00Z', state, 'provider-accepted');
      }
    });
    expect(core.purge.preview(core.channel.id, [core.source.sourceEventId]).effects).toHaveLength(
      3,
    );
    core.database.close();
    const restored = mount(core.home, {
      restoring: true,
      restoreCheckpoint: {
        format: 'botharness-purge',
        version: 1,
        facts: [
          {
            sourceEventId: core.source.sourceEventId,
            channelId: core.channel.id,
            messageId: core.source.messageId,
            eventAt: '2026-10-08T00:00:00.000Z',
            author: { kind: 'human' },
            acceptedAt: '2026-10-08T00:10:00.000Z',
            actor: 'local-human',
            reason: 'human-request',
          },
        ],
      },
    });
    expect(restored.database.mode).toBe('ready');
    const rows = restored.port.read((db) =>
      db.prepare('SELECT id, state, body FROM messaging_outbox ORDER BY id').all(),
    );
    expect(rows.map((row) => [row.id, row.state, JSON.parse(String(row.body)).reason])).toEqual([
      ['delivered', 'delivered', 'provider-accepted'],
      ['in-flight', 'unknown-outcome', 'content-purged'],
      ['pending', 'cancelled', 'content-purged'],
    ]);
    expect(rows.every((row) => JSON.parse(String(row.body)).text === '')).toBe(true);
    expect(
      restored.port.read(
        (db) =>
          db
            .prepare("SELECT state FROM messaging_outbox_attempts WHERE intent_id = 'in-flight'")
            .get()?.state,
      ),
    ).toBe('unknown-outcome');
  });
});
