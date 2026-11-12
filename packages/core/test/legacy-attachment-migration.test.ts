import { createTestRegistry } from './registry-fixture.js';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createAttachmentHttp } from '../src/attachments/http.js';
import { createMessageAttachmentFiles } from '../src/attachments/message-files.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { boundModelPage, readModelContent } from '../src/runtime/channel-model-read.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import type { DiagnosticEventFields, DiagnosticEvents } from '../src/diagnostics/diagnostic-log.js';
import {
  createDiagnosticLogHttp,
  createDiagnosticLogWriter,
  diagnosticEventRow,
  DIAGNOSTIC_LOGS_EXPORT_PATH,
} from '../src/diagnostics/diagnostic-log.js';
import { openLogDatabase } from '../src/logs/log-db.js';
import { buildBugReport } from '../src/diagnostics/bug-report.js';
import { readZip } from '../src/bots/zip-archive.js';
import { Context } from '@deepseek-ai/cordis';
import { mountDiagnosticLog } from '../src/diagnostics/diagnostic-log.js';
import type { AttachmentMigrationResult } from '../src/attachments/legacy-migration.js';

function diagnostics() {
  const rows: Array<{ phase: string; fields: DiagnosticEventFields }> = [];
  const events: DiagnosticEvents = {
    record(source, phase, fields) {
      expect(source).toBe('attachment-migration');
      rows.push({ phase, fields });
    },
  };
  return { rows, events };
}

function fixture(members: string[] = []) {
  const home = createTempRoot();
  const files = createAttachmentStore({ rootDir: join(home, 'attachments') });
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'messaging');
  const logs: string[] = [];
  const channels = createSqliteChannelStore({
    database,
    rootDir: join(home, 'channels'),
    attachments: files,
    warn: (message) => logs.push(message),
  });
  const channel = channels.createGroup({ name: 'Legacy files', members });
  const body = 'Original legacy transferred bytes';
  const hash = 'sha256:' + createHash('sha256').update(body).digest('hex');
  const path = join(files.rootDir, 'objects', hash.slice(7, 9), hash.slice(7));
  mkdirSync(join(files.rootDir, 'objects', hash.slice(7, 9)), { recursive: true });
  writeFileSync(path, body);
  const ref = { hash, name: '报告 notes.txt', mime: 'text/plain', size: Buffer.byteLength(body) };
  const seed = (id: string, refs = [ref]) => {
    const sourceEventId = randomUUID();
    const message = {
      id,
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'retained message text',
      attachments: refs,
    };
    const { body: text, ...envelope } = message;
    database.transaction((db) => {
      db.prepare(
        `INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json) VALUES (?, 'human-message', '', ?, ?, ?, ?, ?)`,
      ).run(sourceEventId, channel.id, id, text, message.at, JSON.stringify(envelope));
      const revision = Number(
        db
          .prepare(
            'SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM channel_placements WHERE channel_id = ?',
          )
          .get(channel.id)!.next,
      );
      db.prepare(
        'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)',
      ).run(channel.id, revision, sourceEventId, id);
    }, []);
    return sourceEventId;
  };
  const facts = () =>
    database.read((db) =>
      JSON.parse(
        JSON.stringify({
          events: db.prepare('SELECT * FROM source_events ORDER BY source_event_id').all(),
          admissions: db
            .prepare('SELECT * FROM inbox_admissions ORDER BY source_event_id, bot_slug')
            .all(),
          placements: db
            .prepare('SELECT * FROM channel_placements ORDER BY channel_id, revision')
            .all(),
        }),
      ),
    );
  const get = (identity: string, messageId: string, channelId = channel.id) =>
    createAttachmentHttp(
      files,
      channels,
    )(
      new Request(
        'http://local/api/botharness/attachment?' +
          new URLSearchParams({
            ...(identity.startsWith('file:') ? { fileId: identity } : { hash: identity }),
            channelId,
            messageId,
          }),
      ),
    );
  return {
    home,
    files,
    owner,
    database,
    channels,
    channel,
    body,
    hash,
    path,
    ref,
    seed,
    facts,
    get,
    logs,
  };
}

describe('retained legacy attachment migration', () => {
  it('retains a bounded partial failure and a separately correlated safe retry without private data', async () => {
    const f = fixture();
    f.seed('first');
    f.seed('second');
    const d = diagnostics();
    const upload = f.files.upload.bind(f.files);
    const hook = vi
      .spyOn(f.files, 'upload')
      .mockImplementationOnce(async () => {
        throw new Error(`secret-token ${f.home} /private/报告 notes.txt retained message text`, {
          cause: Object.assign(new Error('private underlying filename.txt'), { code: 'ENOSPC' }),
        });
      })
      .mockImplementation(upload);
    expect(await f.channels.migrateAttachments!(undefined, d.events)).toEqual({
      converted: 1,
      failed: 1,
      resumed: 0,
    });
    expect(d.rows[0]?.phase).toBe('started');
    expect(d.rows.at(-1)).toMatchObject({
      phase: 'failed',
      fields: { converted: 1, failed: 1, processed: 2, total: 2, remaining: 0, omittedCauses: 0 },
    });
    expect(d.rows.find((row) => row.phase === 'failure-cause')).toMatchObject({
      fields: { stage: 'upload', causeCodes: 'unclassified-error > ENOSPC' },
    });
    expect(new Set(d.rows.map((row) => row.fields.attemptId)).size).toBe(1);
    const encoded = JSON.stringify(d.rows);
    for (const privateValue of [
      f.home,
      f.ref.name,
      f.hash,
      'secret-token',
      'filename.txt',
      'retained message text',
    ])
      expect(encoded).not.toContain(privateValue);
    expect(d.rows.at(-1)?.fields.durationMs).toEqual(expect.any(Number));
    hook.mockRestore();
    const retry = diagnostics();
    expect(await f.channels.migrateAttachments!(undefined, retry.events)).toEqual({
      converted: 1,
      failed: 0,
      resumed: 1,
    });
    expect(retry.rows.at(-1)).toMatchObject({
      phase: 'completed',
      fields: { processed: 2, remaining: 0 },
    });
    expect(retry.rows[0]?.fields.attemptId).not.toBe(d.rows[0]?.fields.attemptId);
    expect(await (await f.get(f.hash, 'first')).text()).toBe(f.body);
  });

  it('records shutdown cancellation separately and resumes the same pending identity', async () => {
    const f = fixture();
    f.seed('cancelled');
    const d = diagnostics();
    const controller = new AbortController();
    const upload = f.files.upload.bind(f.files);
    const hook = vi.spyOn(f.files, 'upload').mockImplementation(async (input) => {
      const target = await upload(input);
      controller.abort(new Error('private shutdown details'));
      return target;
    });
    expect(await f.channels.migrateAttachments!(controller.signal, d.events)).toEqual({
      converted: 0,
      failed: 0,
      resumed: 0,
    });
    const pending = f.database.read((db) =>
      db.prepare('SELECT file_id FROM attachment_file_bindings').get(),
    )!;
    expect(d.rows.at(-1)).toMatchObject({
      phase: 'cancelled',
      fields: { reason: 'caller-aborted', processed: 0, remaining: 1 },
    });
    expect(d.rows.some((row) => row.phase === 'failure-cause')).toBe(false);
    expect(JSON.stringify(d.rows)).not.toContain('private shutdown details');
    hook.mockRestore();
    expect(await f.channels.migrateAttachments!(undefined, d.events)).toEqual({
      converted: 1,
      failed: 0,
      resumed: 1,
    });
    expect(f.channels.message(f.channel.id, 'cancelled')?.attachments?.[0]?.fileId).toBe(
      pending.file_id,
    );
  });

  it('bounds evidence for many failures and ignores a broken diagnostic sink', async () => {
    const f = fixture();
    for (let index = 0; index < 20; index++) f.seed(`many-${index}`);
    rmSync(f.path);
    const d = diagnostics();
    expect(await f.channels.migrateAttachments!(undefined, d.events)).toEqual({
      converted: 0,
      failed: 20,
      resumed: 0,
    });
    expect(d.rows.filter((row) => row.phase === 'failure-cause')).toHaveLength(8);
    expect(d.rows.length).toBeLessThanOrEqual(28);
    expect(d.rows.at(-1)).toMatchObject({
      phase: 'failed',
      fields: { omittedCauses: 12, failed: 20 },
    });
    writeFileSync(f.path, f.body);
    expect(
      await f.channels.migrateAttachments!(undefined, {
        record() {
          throw new Error('diagnostics unavailable');
        },
      }),
    ).toEqual({ converted: 20, failed: 0, resumed: 20 });
  });

  it('reports bounded progress while scanning already-ready bindings without rewriting them', async () => {
    const f = fixture();
    f.seed('ready-first');
    f.seed('ready-second');
    await f.channels.migrateAttachments!();
    const facts = f.facts();
    const d = diagnostics();
    expect(await f.channels.migrateAttachments!(undefined, d.events)).toEqual({
      converted: 0,
      failed: 0,
      resumed: 0,
    });
    expect(
      d.rows.filter((row) => row.phase === 'progress').map((row) => row.fields.processed),
    ).toEqual([0, 1, 2]);
    expect(f.facts()).toEqual(facts);
  });

  it('keeps an already-aborted attempt terminal without claiming work was processed', async () => {
    const f = fixture();
    f.seed('already-aborted');
    const controller = new AbortController();
    controller.abort();
    const d = diagnostics();
    expect(await f.channels.migrateAttachments!(controller.signal, d.events)).toEqual({
      converted: 0,
      failed: 0,
      resumed: 0,
    });
    expect(d.rows.map((row) => row.phase)).toEqual(['started', 'cancelled']);
    expect(d.rows.at(-1)?.fields.processed).toBe(0);
  });

  it('persists cancellation before the real Host Fiber closes its diagnostic writer', async () => {
    const f = fixture();
    f.seed('shutdown');
    let signalEntered = () => {};
    let releaseUpload = () => {};
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const upload = f.files.upload.bind(f.files);
    const hook = vi.spyOn(f.files, 'upload').mockImplementation(async (input) => {
      signalEntered();
      await release;
      return upload(input);
    });
    const ctx = new Context();
    let operation: Promise<AttachmentMigrationResult> | undefined;
    const fiber = ctx.plugin((child) => {
      const events = mountDiagnosticLog(child, {
        dshHome: f.home,
        homes: [],
        environment: () => ({
          version: 'test',
          platform: process.platform,
          arch: process.arch,
          node: process.version,
        }),
      });
      child.effect(() => {
        const controller = new AbortController();
        operation = f.channels.migrateAttachments!(controller.signal, events);
        return () => controller.abort();
      });
    });
    await entered;
    await fiber.dispose();
    const logs = openLogDatabase({ dir: join(f.home, 'botharness') });
    try {
      const rows = logs.range(0, 100);
      expect(rows.filter((row) => row.kind === 'cancelled')).toHaveLength(1);
      releaseUpload();
      expect(await operation).toEqual({ converted: 0, failed: 0, resumed: 0 });
      expect(logs.range(0, 100).filter((row) => row.kind === 'cancelled')).toHaveLength(1);
    } finally {
      releaseUpload();
      await operation;
      logs.close();
      hook.mockRestore();
    }
  });

  it('retains a fatal snapshot failure without changing its rejection', async () => {
    const f = fixture();
    f.seed('closed-owner');
    f.owner.close();
    const d = diagnostics();
    await expect(f.channels.migrateAttachments!(undefined, d.events)).rejects.toThrow();
    expect(d.rows.at(-1)).toMatchObject({
      phase: 'failed',
      fields: { stage: 'read-retained', processed: 0 },
    });
    expect(d.rows.find((row) => row.phase === 'failure-cause')).toBeDefined();
    expect(d.rows.at(-1)?.fields.total).toBeUndefined();
  });

  it('exports actual migration failure evidence through diagnostic logs and offline problem reports', async () => {
    const f = fixture();
    f.seed('export-failure');
    rmSync(f.path);
    const logs = openLogDatabase({ dir: join(f.home, 'logs') });
    try {
      await f.channels.migrateAttachments!(undefined, {
        record(source, phase, fields) {
          const row = diagnosticEventRow(source, phase, fields);
          if (row !== undefined) logs.write(row);
        },
      });
      const environment = {
        version: 'test',
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      };
      const http = createDiagnosticLogHttp({
        database: () => logs,
        writer: () => createDiagnosticLogWriter(logs),
        environment,
        homes: [],
      });
      const response = await http(
        new Request(`http://local${DIAGNOSTIC_LOGS_EXPORT_PATH}?hours=1`),
      );
      expect(response.status).toBe(200);
      const report = buildBugReport(
        {
          title: 'Migration failure',
          description: 'Diagnostic regression',
          hours: 1,
          attachments: [],
        },
        { database: logs, environment, homes: [], exportedBy: 'cli-offline' },
      );
      for (const archive of [Buffer.from(await response.arrayBuffer()), report.archive]) {
        const text = readZip(archive, { maxEntries: 16, maxTotalBytes: 1 << 20 })
          .map((file) => Buffer.from(file.data).toString())
          .join('\n');
        expect(text).toContain('attachment-migration');
        expect(text).toContain('failure-cause');
        expect(text).toContain('not-found');
        expect(text).not.toContain(f.ref.name);
        expect(text).not.toContain(f.home);
      }
    } finally {
      logs.close();
    }
  });

  it('preserves immutable facts, independent equal-content occurrences and explicit canonical identity reuse', async () => {
    const f = fixture();
    f.seed('first');
    f.seed('independent');
    const shared = f.channels.createGroup({ name: 'Shared retained placement', members: [] });
    let facts = f.facts();
    const notifications: unknown[] = [];
    const unsubscribe = f.owner.subscribe((event) => notifications.push(event));
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 2, failed: 0, resumed: 0 });
    expect(f.facts()).toEqual(facts);
    expect(notifications).toEqual([]);
    unsubscribe();
    const first = f.channels.message(f.channel.id, 'first')!;
    const independent = f.channels.message(f.channel.id, 'independent')!;
    const a = first.attachments![0]!;
    const b = independent.attachments![0]!;
    expect(a.fileId).toMatch(/^file:/);
    expect(a.hash).toBeUndefined();
    expect(a.fileId).not.toBe(b.fileId);
    await f.channels.appendMessage(shared.id, {
      id: 'explicit-shared',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Explicit canonical reuse',
      attachments: [a],
    });
    expect(f.channels.message(shared.id, 'explicit-shared')?.attachments?.[0]?.fileId).toBe(
      a.fileId,
    );
    facts = f.facts();
    const access = createMessageAttachmentFiles(f.channels, f.files);
    const target = access.target(f.channel.id, 'first', a.fileId!);
    writeFileSync(target.path, 'Edited current destination');
    expect(await (await f.get(f.hash, 'first')).text()).toBe('Edited current destination');
    expect(await (await f.get(a.fileId!, 'first')).text()).toBe('Edited current destination');
    expect(await (await f.get(a.fileId!, 'explicit-shared', shared.id)).text()).toBe(
      'Edited current destination',
    );
    expect(await (await f.get(f.hash, 'independent')).text()).toBe(f.body);
    expect(readFileSync(f.path, 'utf8')).toBe(f.body);
    const refreshed = f.channels.message(f.channel.id, 'first')!;
    const view = { channelId: f.channel.id, channelName: f.channel.name, message: refreshed };
    expect(
      JSON.parse(boundModelPage({ messages: [view] }, () => undefined).output).messages[0].message
        .attachments[0],
    ).toEqual(f.files.current(a));
    expect(readModelContent(view).output).toContain(a.fileId!);
    expect(readModelContent(view).output).not.toContain(f.home);
    expect(
      f.channels.queryMessages(f.channel.id).messages.find((message) => message.id === 'first')
        ?.attachments,
    ).toEqual(refreshed.attachments);
    expect(f.facts()).toEqual(facts);
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 0, failed: 0, resumed: 0 });
    expect(readFileSync(target.path, 'utf8')).toBe('Edited current destination');
    expect(
      (
        await createAttachmentHttp(
          f.files,
          f.channels,
        )(new Request('http://local/api/botharness/attachment?hash=' + f.hash))
      ).status,
    ).toBe(400);
    expect((await f.get(f.hash, 'wrong')).status).toBe(404);
    expect(() => f.channels.assertAttachmentRefs([f.ref])).toThrow('obsolete hash');
    expect(() => f.channels.assertAttachmentRefs([f.files.current(a)])).not.toThrow();
    rmSync(target.path);
    await f.channels.migrateAttachments!();
    expect((await f.get(f.hash, 'first')).status).toBe(404);
    expect(existsSync(target.path)).toBe(false);
  });

  it('keeps same-hash entries within one message independent and refuses an ambiguous old hash', async () => {
    const f = fixture();
    f.seed('duplicates', [f.ref, f.ref]);
    await f.channels.migrateAttachments!();
    const refs = f.channels.message(f.channel.id, 'duplicates')!.attachments!;
    expect(refs[0]!.fileId).not.toBe(refs[1]!.fileId);
    expect((await f.get(f.hash, 'duplicates')).status).toBe(400);
    expect(await (await f.get(refs[0]!.fileId!, 'duplicates')).text()).toBe(f.body);
    expect(() => f.channels.attachmentReference!(f.channel.id, 'duplicates', f.hash)).toThrow(
      'Ambiguous',
    );
  });

  it('keeps duplicate hashes readable while every occurrence still resolves to the same legacy object', async () => {
    const f = fixture();
    f.seed('pending-duplicates', [f.ref, f.ref]);
    const hook = vi
      .spyOn(f.files, 'upload')
      .mockRejectedValue(new Error('destination unavailable'));
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 0, failed: 2, resumed: 0 });
    expect(f.channels.attachmentReference!(f.channel.id, 'pending-duplicates', f.hash)).toEqual(
      f.ref,
    );
    const response = await f.get(f.hash, 'pending-duplicates');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(f.body);
    hook.mockRestore();
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 2, failed: 0, resumed: 2 });
    expect((await f.get(f.hash, 'pending-duplicates')).status).toBe(400);
    const canonical = f.channels.message(f.channel.id, 'pending-duplicates')!.attachments![0]!;
    expect(await (await f.get(canonical.fileId!, 'pending-duplicates')).text()).toBe(f.body);
  });

  it('resumes the reserved identity after interruption between file publication and reference activation', async () => {
    const f = fixture();
    f.seed('interrupted');
    const controller = new AbortController();
    const upload = f.files.upload.bind(f.files);
    const hook = vi.spyOn(f.files, 'upload').mockImplementation(async (input) => {
      const ref = await upload(input);
      controller.abort();
      return ref;
    });
    expect((await f.channels.migrateAttachments!(controller.signal)).converted).toBe(0);
    hook.mockRestore();
    const pending = f.database.read((db) =>
      db.prepare('SELECT file_id, state FROM attachment_file_bindings').get(),
    )!;
    expect(pending.state).toBe('pending');
    expect(
      f.files.sweepUnreferenced(new Date(Date.now() + 1000), () =>
        f.channels.referencedAttachmentHashes(),
      ),
    ).toBe(0);
    const files = createAttachmentStore({ rootDir: f.files.rootDir });
    f.owner.close();
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: f.home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'messaging');
    const channels = createSqliteChannelStore({
      database,
      rootDir: f.channels.rootDir,
      attachments: files,
    });
    expect(await channels.migrateAttachments!()).toEqual({ converted: 1, failed: 0, resumed: 1 });
    expect(channels.message(f.channel.id, 'interrupted')?.attachments?.[0]?.fileId).toBe(
      pending.file_id,
    );
    const path = files.fileTarget(String(pending.file_id)).path;
    writeFileSync(path, 'external save after migration');
    await channels.migrateAttachments!();
    expect(readFileSync(path, 'utf8')).toBe('external save after migration');
    expect(
      database.read(
        (db) => db.prepare('SELECT COUNT(*) AS count FROM attachment_file_bindings').get()!.count,
      ),
    ).toBe(1);
  });

  it('preserves readable old bytes on conversion failure and protects mixed-state cleanup until every dependency is converted', async () => {
    const f = fixture();
    f.seed('failed');
    f.seed('converted');
    const upload = f.files.upload.bind(f.files);
    const hook = vi
      .spyOn(f.files, 'upload')
      .mockRejectedValueOnce(new Error('interrupted destination operation'))
      .mockImplementation(upload);
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 1, failed: 1, resumed: 0 });
    hook.mockRestore();
    expect(await (await f.get(f.hash, 'failed')).text()).toBe(f.body);
    expect(f.channels.message(f.channel.id, 'failed')!.attachments![0]).toEqual(f.ref);
    expect(f.channels.message(f.channel.id, 'converted')!.attachments![0]!.fileId).toBeDefined();
    expect(
      f.logs.some(
        (line) =>
          line.includes('phase=refused') &&
          line.includes('action=repair-legacy-object-and-restart'),
      ),
    ).toBe(true);
    expect(f.logs.join('\n')).not.toContain(f.home);
    expect(
      f.files.sweepUnreferenced(new Date(Date.now() + 1000), () =>
        f.channels.referencedAttachmentHashes(),
      ),
    ).toBe(0);
    expect(existsSync(f.path)).toBe(true);
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 1, failed: 0, resumed: 1 });
    f.channels.deleteGroup(f.channel.id);
    expect(
      f.files.sweepUnreferenced(new Date(Date.now() + 1000), () =>
        f.channels.referencedAttachmentHashes(),
      ),
    ).toBe(1);
    expect(existsSync(f.path)).toBe(false);
    const refs = f.database.read((db) =>
      db.prepare("SELECT file_id FROM attachment_file_bindings WHERE state = 'ready'").all(),
    );
    for (const row of refs)
      expect(existsSync(f.files.fileTarget(String(row.file_id)).path)).toBe(true);
  });

  it('shares one conversion operation for concurrent callers and closes an unconsumed source on refusal', async () => {
    const f = fixture();
    f.seed('concurrent');
    const cancel = vi.fn();
    const download = f.files.download.bind(f.files);
    const hook = vi
      .spyOn(f.files, 'download')
      .mockImplementation(async (identity, name, signal) => {
        const value = await download(identity, name, signal);
        await value.body.cancel();
        return { ...value, body: new ReadableStream({ cancel }) };
      });
    const upload = vi
      .spyOn(f.files, 'upload')
      .mockRejectedValue(new Error('destination unavailable'));
    const first = f.channels.migrateAttachments!();
    expect(f.channels.migrateAttachments!()).toBe(first);
    expect(await first).toEqual({ converted: 0, failed: 1, resumed: 0 });
    expect(cancel).toHaveBeenCalledOnce();
    hook.mockRestore();
    upload.mockRestore();
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 1, failed: 0, resumed: 1 });
  });

  it('refuses a converted destination changed before activation, preserving readable legacy bytes and the pending destination', async () => {
    const f = fixture();
    f.seed('verification');
    const upload = f.files.upload.bind(f.files);
    let path = '';
    const hook = vi.spyOn(f.files, 'upload').mockImplementation(async (input) => {
      const ref = await upload(input);
      path = f.files.fileTarget(ref.fileId!).path;
      writeFileSync(path, 'External edit before activation');
      return ref;
    });
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 0, failed: 1, resumed: 0 });
    hook.mockRestore();
    expect((await f.get(f.hash, 'verification')).status).toBe(200);
    expect(await (await f.get(f.hash, 'verification')).text()).toBe(f.body);
    expect(f.channels.message(f.channel.id, 'verification')!.attachments![0]).toEqual(f.ref);
    expect(readFileSync(path, 'utf8')).toBe('External edit before activation');
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 0, failed: 1, resumed: 1 });
    expect(readFileSync(path, 'utf8')).toBe('External edit before activation');
    const row = f.database.read((db) =>
      db.prepare('SELECT file_id, state, last_error FROM attachment_file_bindings').get(),
    )!;
    expect(row.state).toBe('pending');
    expect(row.last_error).toBe('corrupt');
    writeFileSync(path, f.body);
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 1, failed: 0, resumed: 1 });
    expect(f.channels.message(f.channel.id, 'verification')!.attachments![0]!.fileId).toBe(
      row.file_id,
    );
  });

  it('refuses damaged legacy bytes before publishing a destination and resumes after source repair', async () => {
    const f = fixture();
    f.seed('damaged-source');
    writeFileSync(f.path, 'Damaged legacy object');
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 0, failed: 1, resumed: 0 });
    const row = f.database.read((db) =>
      db.prepare('SELECT file_id, state FROM attachment_file_bindings').get(),
    )!;
    expect(row.state).toBe('pending');
    expect(
      f.files.has({
        name: f.ref.name,
        mime: f.ref.mime,
        size: f.ref.size,
        fileId: String(row.file_id),
      }),
    ).toBe(false);
    writeFileSync(f.path, f.body);
    expect(await f.channels.migrateAttachments!()).toEqual({ converted: 1, failed: 0, resumed: 1 });
    expect(await (await f.get(String(row.file_id), 'damaged-source')).text()).toBe(f.body);
  });

  it('reads a migrated image through cached legacy and canonical model references using current bytes and membership', async () => {
    const f = fixture(['ada']);
    const registry = createTestRegistry({ rootDir: join(f.home, 'bots') });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const hash = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const dir = join(f.files.rootDir, 'objects', hash.slice(7, 9));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, hash.slice(7)), bytes);
    f.seed('legacy-image', [{ hash, name: 'visual.png', mime: 'image/png', size: bytes.length }]);
    await f.channels.migrateAttachments!();
    const ref = f.channels.message(f.channel.id, 'legacy-image')!.attachments![0]!;
    const dm = f.channels.getOrCreateDm('ada', 'Ada')!;
    await f.channels.appendMessage(dm.id, {
      id: 'inspect',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Inspect migrated image',
    });
    let inspected = false;
    const runtime = createBotRuntime({
      database: f.owner,
      registry,
      channels: f.channels,
      attachments: f.files,
      grants: createTestWorkspaceGrants(f.owner, f.home),
      agents: {
        runOrchestrator: async (run) => {
          const read = run.channels.readAttachment!;
          const input = { channelId: f.channel.id, messageId: 'legacy-image', maxBytes: 1024 };
          expect((await read({ ...input, hash })).data).toEqual(bytes);
          const edited = Uint8Array.from([...bytes, 4, 5]);
          writeFileSync(f.files.fileTarget(ref.fileId!).path, edited);
          expect((await read({ ...input, hash })).data).toEqual(edited);
          expect((await read({ ...input, attachmentId: ref.fileId! })).data).toEqual(edited);
          await expect(read({ ...input, hash, maxBytes: bytes.length })).rejects.toThrow(
            'read limit',
          );
          await expect(read({ ...input, hash, messageId: 'wrong' })).rejects.toThrow('not found');
          const privateChannel = f.channels.createGroup({ name: 'Private', members: [] });
          await expect(read({ ...input, hash, channelId: privateChannel.id })).rejects.toThrow(
            'not a member',
          );
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
    });
    try {
      const admission = runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'inspect',
        body: 'Inspect migrated image',
      });
      expect(admission.admitted).toBe(true);
      if (!admission.admitted) throw new Error('Image inspection admission refused');
      await admission.settled;
      expect(inspected).toBe(true);
    } finally {
      await runtime.close();
    }
  });
});
