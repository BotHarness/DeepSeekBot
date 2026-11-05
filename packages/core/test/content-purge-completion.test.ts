import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { commitMessagingDefaults, messagingDefaults } from '../src/messaging/defaults.js';
import { openPurgeLedger } from '../src/purge/ledger.js';
import type { PurgeFact } from '../src/purge/contracts.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { mountContentPurge } from '../src/purge/owner.js';
import { requireSourceContent } from '../src/purge/fence.js';
import { createCore } from '../src/plugin.js';
import { createPersonaBotDeletions } from '../src/bots/deletion.js';

const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
});
function mount(
  home = createTempRoot('purge-completion-'),
  extra: Partial<Parameters<typeof mountContentPurge>[0]> = {},
) {
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(database);
  const attachments = createAttachmentStore({ rootDir: join(home, 'botharness', 'attachments') });
  const purge = mountContentPurge({ dshHome: home, database, attachments, ...extra });
  const port = attachOperationalModule(database, 'messaging');
  const channels = createSqliteChannelStore({
    database: port,
    attachments,
    rootDir: join(home, 'botharness', 'channels'),
    databaseOwnerReady: database.mode === 'ready',
  });
  return { home, database, attachments, purge, port, channels };
}
async function fileScene(extra: Partial<Parameters<typeof mountContentPurge>[0]> = {}) {
  const core = mount(undefined, extra);
  const file = await core.attachments.upload({
    name: 'synthetic.txt',
    data: (async function* () {
      yield Buffer.from('exclusive synthetic bytes');
    })(),
  });
  const channel = core.channels.createGroup({ name: 'File QA', members: [] });
  await core.channels.appendMessage(channel.id, {
    id: 'file-message',
    at: '2026-10-08T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'synthetic body',
    attachments: [file],
  });
  core.channels.deleteGroup(channel.id);
  const source = core.purge.sources(channel.id).sources[0]!;
  const path = core.attachments.fileTarget(file.fileId!).path;
  return { ...core, file, channel, source, path };
}

it('upgrades main generation 69 while preserving WeChat choices and replaying an accepted text checkpoint', async () => {
  const home = createTempRoot('purge-main-69-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 69),
    ),
  });
  owners.push(prior);
  const port = attachOperationalModule(prior, 'messaging');
  const channels = createSqliteChannelStore({
    database: port,
    rootDir: join(home, 'botharness', 'channels'),
  });
  const channel = channels.createGroup({ name: 'Prior main', members: [] });
  const at = '2026-10-08T00:00:00.000Z';
  await channels.appendMessage(channel.id, {
    id: 'prior-text',
    at,
    author: { kind: 'human' },
    body: 'synthetic prior body',
  });
  channels.deleteGroup(channel.id);
  const saved = port.transaction((db) => {
    const { revision, changedAt: _at, ...preferences } = messagingDefaults(db, 'weixin');
    return commitMessagingDefaults(db, {
      ...preferences,
      expectedRevision: revision,
      identityEnabled: false,
      typingEnabled: false,
    });
  });
  const fact: PurgeFact = {
    sourceEventId: port.read((db) =>
      String(
        db
          .prepare('SELECT source_event_id FROM source_events WHERE channel_id = ?')
          .get(channel.id)!.source_event_id,
      ),
    ),
    channelId: channel.id,
    messageId: 'prior-text',
    eventAt: at,
    author: { kind: 'human' },
    acceptedAt: at,
    actor: 'local-human',
    reason: 'human-request',
  };
  mountContentPurge({ dshHome: home, database: prior });
  prior.close();
  const ledger = openPurgeLedger(join(home, 'botharness', 'purge', 'ledger.db'), true);
  try {
    ledger.union({ format: 'botharness-purge', version: 1, facts: [fact] });
  } finally {
    ledger.close();
  }
  const current = mount(home);
  expect(current.database.mode).toBe('ready');
  expect(current.port.read((db) => messagingDefaults(db, 'weixin'))).toEqual(saved);
  expect(current.purge.sources(channel.id).sources[0]?.body).toBe('');
  expect(current.purge.checkpoint()).toEqual({
    format: 'botharness-purge',
    version: 1,
    facts: [fact],
  });
  expect(
    current.port.read((db) => db.prepare('SELECT * FROM messaging_managed_files').all()),
  ).toEqual([]);
});

it('removes exclusive actual files after acceptance and reapplies destination union to older SQLite and files', async () => {
  const core = await fileScene();
  const archive = join(core.home, 'older-files');
  core.database.close();
  const sqlite = join(core.home, 'older.db');
  copyFileSync(core.database.databasePath, sqlite);
  cpSync(join(core.home, 'botharness', 'attachments'), archive, { recursive: true });
  const current = mount(core.home);
  const preview = current.purge.preview(core.channel.id, [core.source.sourceEventId]);
  let published: ReturnType<typeof current.purge.redactions> = [];
  current.database.subscribe(({ topics }) => {
    if (topics.includes('content-purge')) published = current.purge.redactions();
  });
  expect(preview.files).toMatchObject([{ identity: core.file.fileId, disposition: 'remove' }]);
  current.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token);
  expect(published).toEqual([
    {
      sourceEventId: core.source.sourceEventId,
      channelId: core.channel.id,
      messageId: core.source.messageId,
      fileIds: [core.file.fileId],
    },
  ]);
  const checkpoint = current.purge.checkpoint();
  expect(checkpoint.version).toBe(2);
  expect(checkpoint.facts[0]?.managedFiles).toContain(core.file.fileId);
  expect(existsSync(core.path)).toBe(false);
  current.database.close();
  copyFileSync(sqlite, current.database.databasePath);
  cpSync(archive, join(core.home, 'botharness', 'attachments'), { recursive: true });
  expect(existsSync(core.path)).toBe(true);
  const restored = mount(core.home, {
    restoring: true,
    restoreCheckpoint: { format: 'botharness-purge', version: 1, facts: [] },
  });
  expect(restored.database.mode).toBe('ready');
  expect(restored.purge.sources(core.channel.id).sources[0]?.body).toBe('');
  expect(existsSync(core.path)).toBe(false);
  expect(restored.purge.checkpoint()).toEqual(checkpoint);
  const destination = createTempRoot('purge-fresh-destination-');
  mkdirSync(join(destination, 'botharness'), { recursive: true });
  copyFileSync(sqlite, join(destination, 'botharness', 'botharness.db'));
  cpSync(archive, join(destination, 'botharness', 'attachments'), { recursive: true });
  const fresh = mount(destination, { restoring: true, restoreCheckpoint: checkpoint });
  expect(fresh.database.mode).toBe('ready');
  expect(fresh.purge.sources(core.channel.id).sources[0]?.body).toBe('');
  expect(fresh.attachments.has(core.file)).toBe(false);
});

it('resumes interrupted cleanup before Messaging after a cold restart without changing Human-owned copies', async () => {
  const core = await fileScene({
    faultInjector: (stage) => {
      if (stage === 'during-file-cleanup') throw new Error('power loss');
    },
  });
  const copy = join(core.home, 'human-workspace.txt');
  writeFileSync(copy, 'Human-owned independent copy');
  const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  expect(() => core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token)).toThrow(
    'unavailable',
  );
  expect(core.database.mode).toBe('recovery');
  expect(existsSync(core.path)).toBe(true);
  core.database.close();
  const restarted = mount(core.home);
  expect(restarted.database.mode).toBe('ready');
  expect(existsSync(core.path)).toBe(false);
  expect(readFileSync(copy, 'utf8')).toBe('Human-owned independent copy');
});

it('cleans reachable legacy CAS and its real-file migration binding with current shared references', async () => {
  const core = mount();
  const bytes = Buffer.from('legacy synthetic bytes');
  const hex = createHash('sha256').update(bytes).digest('hex');
  const shard = join(core.attachments.rootDir, 'objects', hex.slice(0, 2));
  mkdirSync(shard, { recursive: true });
  const path = join(shard, hex);
  writeFileSync(path, bytes);
  const ref = { hash: 'sha256:' + hex, name: 'legacy.txt', mime: 'text/plain', size: bytes.length };
  const channel = core.channels.createGroup({ name: 'Legacy file QA', members: [] });
  for (const id of ['one', 'two'])
    await core.channels.appendMessage(channel.id, {
      id,
      at: '2026-10-08T00:00:00.000Z',
      author: { kind: 'human' },
      body: id,
      attachments: [],
    });
  core.port.transaction((db) =>
    db
      .prepare(
        "UPDATE source_events SET payload_json = json_set(payload_json, '$.attachments', json(?)) WHERE channel_id = ?",
      )
      .run(JSON.stringify([ref]), channel.id),
  );
  expect(await core.channels.migrateAttachments!()).toMatchObject({ converted: 2, failed: 0 });
  core.channels.deleteGroup(channel.id);
  const sources = core.purge.sources(channel.id).sources;
  const first = core.purge.preview(channel.id, [sources[0]!.sourceEventId]);
  expect(first.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ identity: ref.hash, disposition: 'shared' }),
      expect.objectContaining({ disposition: 'remove' }),
    ]),
  );
  core.purge.confirm(channel.id, first.sourceEventIds, first.token);
  expect(existsSync(path)).toBe(true);
  const last = core.purge.preview(channel.id, [sources[1]!.sourceEventId]);
  expect(last.files.every((file) => file.disposition === 'remove')).toBe(true);
  core.purge.confirm(channel.id, last.sourceEventIds, last.token);
  expect(existsSync(path)).toBe(false);
  expect(
    core.port.read((db) => db.prepare('SELECT * FROM attachment_file_bindings').all()),
  ).toEqual([]);
});

it('holds the purge barrier through asynchronous snapshot success and failure', async () => {
  const core = await fileScene();
  const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const exporting = core.purge.withCheckpoint(async (checkpoint) => {
    await gate;
    return checkpoint;
  });
  expect(() => core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token)).toThrow(
    'unavailable',
  );
  release();
  expect((await exporting).facts).toEqual([]);
  await expect(
    core.purge.withCheckpoint(async () => {
      throw new Error('snapshot failure');
    }),
  ).rejects.toThrow('snapshot failure');
  expect(core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token)).toEqual({
    accepted: 1,
  });
});

it('previews a live shared placement and invalidates consent when its references change', async () => {
  const core = await fileScene();
  const active = core.channels.createGroup({ name: 'Still active', members: [] });
  const share = () =>
    core.port.transaction((db) =>
      db
        .prepare(
          'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)',
        )
        .run(active.id, 1, core.source.sourceEventId, core.source.messageId),
    );
  share();
  const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  expect(preview.placements).toHaveLength(2);
  core.port.transaction((db) =>
    db.prepare('DELETE FROM channel_placements WHERE channel_id = ?').run(active.id),
  );
  expect(() => core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token)).toThrow(
    'Scope changed',
  );
  expect(core.purge.checkpoint().facts).toEqual([]);
  const fresh = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  core.purge.confirm(core.channel.id, fresh.sourceEventIds, fresh.token);
  expect(() => share()).toThrow();
  expect(() =>
    core.port.read((db) => requireSourceContent(db, core.source.sourceEventId)),
  ).toThrow();
});

it('uses each shared placement message identity for reads and post-commit purge selectors', async () => {
  const core = await fileScene();
  const active = core.channels.createGroup({ name: 'Shared identity', members: [] });
  core.port.transaction((db) =>
    db
      .prepare(
        'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, 1, ?, ?)',
      )
      .run(active.id, core.source.sourceEventId, 'shared-message'),
  );
  expect(core.channels.readMessages(active.id)[0]?.id).toBe('shared-message');
  expect(core.channels.queryMessages(active.id).messages[0]?.id).toBe('shared-message');
  expect(core.channels.observeOutput(active.id, 'shared-message')?.message.id).toBe(
    'shared-message',
  );
  await core.channels.appendMessage(active.id, {
    id: 'retained-reply',
    at: '2026-10-08T00:01:00.000Z',
    author: { kind: 'human' },
    body: 'retained reply',
    replyTo: 'shared-message',
  });
  const reply = () =>
    core.channels
      .queryMessages(active.id)
      .messages.find((message) => message.id === 'retained-reply');
  expect(reply()?.replyToPreview?.body).toBe('synthetic body');
  const preview = core.purge.preview(core.channel.id, [core.source.sourceEventId]);
  core.purge.confirm(core.channel.id, preview.sourceEventIds, preview.token);
  expect(
    core.channels.readMessages(active.id).find((message) => message.id === 'shared-message'),
  ).toMatchObject({
    id: 'shared-message',
    body: '',
  });
  expect(reply()?.body).toBe('retained reply');
  expect(reply()?.replyToPreview?.body).toBe('');
  expect(core.purge.redactions()).toContainEqual(
    expect.objectContaining({
      sourceEventId: core.source.sourceEventId,
      channelId: active.id,
      messageId: 'shared-message',
    }),
  );
});

it('reports a recorded Memory derivative through a deleted identity locator and retains its actual Git bytes', async () => {
  const home = createTempRoot('purge-memory-reference-');
  const core = createCore({ dshHome: home });
  try {
    expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const root = core.registry.memoryDirFor('ada')!;
    const channel = core.channels.createGroup({ name: 'Derived Memory QA', members: [] });
    await core.channels.appendMessage(channel.id, {
      id: 'remember-message',
      at: '2026-10-08T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'synthetic source body',
    });
    const port = attachOperationalModule(core.operationalDatabase, 'memory-test');
    const id = port.read((db) =>
      String(
        db
          .prepare('SELECT source_event_id FROM source_events WHERE message_id = ?')
          .get('remember-message')!.source_event_id,
      ),
    );
    port.transaction((db) =>
      db
        .prepare(
          "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, attempt_state) VALUES (?, 'ada', 'group-mention', 'running')",
        )
        .run(id),
    );
    core.ownership.claim({
      sessionId: 'memory-reference-turn',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: '2026-10-08T00:00:00.000Z',
    });
    core.memory.prepareTurn('ada', 'memory-reference-turn');
    const path = join(root, 'derived.md');
    writeFileSync(path, 'synthetic retained Memory derivative');
    execFileSync('git', ['add', '.'], { cwd: root, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'Synthetic derived memory'], {
      cwd: root,
      windowsHide: true,
    });
    const [commit] = core.memory.reconcileTurn({
      botSlug: 'ada',
      sessionId: 'memory-reference-turn',
      sourceEventId: id,
    });
    expect(commit).toBeDefined();
    core.channels.deleteGroup(channel.id);
    const deletion = createPersonaBotDeletions({
      database: core.operationalDatabase,
      registry: core.registry,
      dependencies: () => ({
        sessions: [],
        workspaces: [],
        grants: [],
        identities: [],
        channels: [],
      }),
      allWorkspacePaths: () => [],
      stop: async () => {},
    });
    const deleting = deletion.preview('ada');
    await deletion.confirm('ada', deleting.token, false);
    expect(core.registry.get('ada')).toBeUndefined();
    const preview = core.contentPurge.preview(channel.id, [id]);
    expect(preview.derivatives).toContainEqual({
      kind: 'memory',
      botSlug: 'ada',
      location: root,
      reference: commit!.sha,
      tracking: 'recorded',
    });
    core.contentPurge.confirm(channel.id, preview.sourceEventIds, preview.token);
    expect(readFileSync(path, 'utf8')).toBe('synthetic retained Memory derivative');
    expect(
      execFileSync('git', ['show', commit!.sha + ':derived.md'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      }),
    ).toBe('synthetic retained Memory derivative');
    expect(JSON.stringify(core.contentPurge.checkpoint())).not.toContain(root);
  } finally {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
});
