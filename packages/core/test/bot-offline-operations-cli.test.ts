import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { chmodSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';
import { invoke } from './bot-create-cli-fixture.js';

describe('deepseekbot lifecycle', () => {
  it('pauses and resumes a bot', async () => {
    const home = createTempRoot('botharness-lifecycle-pause-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const paused = await invoke(['pause', id], home);
    expect(paused.code).toBe(0);
    expect(paused.json.bot).toMatchObject({ id, paused: true });
    const resumed = await invoke(['resume', id], home);
    expect(resumed.code).toBe(0);
    expect(resumed.json.bot).toMatchObject({ id, paused: false });
    const missing = await invoke(['pause', 'bot-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });

  it('updates name, description, and roles within profile limits', async () => {
    const home = createTempRoot('botharness-lifecycle-update-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const updated = await invoke(
      [
        'update',
        id,
        '--name',
        'Ada Lovelace',
        '--description',
        'Analytical engine',
        '--role',
        'scout',
      ],
      home,
    );
    expect(updated.code).toBe(0);
    expect(updated.json.bot).toMatchObject({
      id,
      name: 'Ada Lovelace',
      description: 'Analytical engine',
      roles: ['scout'],
    });
    const shown = await invoke(['show', id], home);
    expect(shown.json.bot.name).toBe('Ada Lovelace');
    const empty = await invoke(['update', id], home);
    expect(empty.code).toBe(2);
    expect(empty.json.error.code).toBe('usage');
    const longBio = await invoke(['update', id, '--description', 'x'.repeat(161)], home);
    expect(longBio.code).toBe(1);
    expect(longBio.json.error.code).toBe('invalid-input');
    const manyRoles = await invoke(
      ['update', id, ...Array.from({ length: 9 }, (_, index) => `--role=t${index}`)],
      home,
    );
    expect(manyRoles.code).toBe(1);
    expect(manyRoles.json.error.code).toBe('invalid-input');
    const missing = await invoke(['update', 'bot-absent', '--name', 'Ghost'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });

  it('sets and clears the Human display name', async () => {
    const home = createTempRoot('botharness-lifecycle-human-');
    const set = await invoke(['human-name-set', '--name', 'Operator'], home);
    expect(set.code).toBe(0);
    expect(set.json.human).toMatchObject({ displayName: 'Operator' });
    const humanId = set.json.human.humanId as string;
    const cleared = await invoke(['human-name-set', '--clear'], home);
    expect(cleared.code).toBe(0);
    expect(cleared.json.human.humanId).toBe(humanId);
    const both = await invoke(['human-name-set', '--name', 'X', '--clear'], home);
    expect(both.code).toBe(2);
    expect(both.json.error.code).toBe('usage');
    const neither = await invoke(['human-name-set'], home);
    expect(neither.code).toBe(2);
    expect(neither.json.error.code).toBe('usage');
    const multiline = await invoke(['human-name-set', '--name', 'a\nb'], home);
    expect(multiline.code).toBe(1);
    expect(multiline.json.error.code).toBe('invalid-input');
  });

  it('sets and clears a per-channel Human nickname', async () => {
    const home = createTempRoot('botharness-lifecycle-nick-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      const channels = createSqliteChannelStore({
        database: attachOperationalModule(owner, 'messaging'),
        rootDir: join(home, 'botharness', 'channels'),
      });
      channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, id, 'Ada');
    } finally {
      owner.close();
    }
    const channelId = `dm-${id}`;
    const set = await invoke(['channel-human-name-set', channelId, '--nickname', 'Ops'], home);
    expect(set.code).toBe(0);
    expect(set.json).toMatchObject({ channel: { id: channelId }, nickname: 'Ops' });
    const cleared = await invoke(['channel-human-name-set', channelId, '--clear'], home);
    expect(cleared.code).toBe(0);
    expect(cleared.json.nickname).toBeNull();
    const missing = await invoke(
      ['channel-human-name-set', 'dm-absent', '--nickname', 'Ops'],
      home,
    );
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-channel');
  });
});

describe('deepseekbot memory', () => {
  it('reads snapshot, file, and history on a fresh bot', async () => {
    const home = createTempRoot('botharness-memory-read-');
    const bot = await invoke(['create', '--name', 'Ada', '--persona', 'You are a scout.'], home);
    const id = bot.json.bot.id as string;
    const snapshot = await invoke(['memory-snapshot', id], home);
    expect(snapshot.code).toBe(0);
    expect(snapshot.json.bot).toMatchObject({ id, name: 'Ada' });
    expect(snapshot.json.snapshot).toBeDefined();
    const file = await invoke(['memory-file', id, '--path', 'SOUL.md'], home);
    expect(file.code).toBe(0);
    expect(file.json.file.body).toContain('You are a scout.');
    const missing = await invoke(['memory-file', id, '--path', 'absent.md'], home);
    expect(missing.code).toBe(0);
    expect(missing.json.file).toBeNull();
    const history = await invoke(['memory-history', id], home);
    expect(history.code).toBe(0);
    expect(history.json.commits).toEqual([]);
  });

  it('saves a file, shows it in history, and diffs the commit', async () => {
    const home = createTempRoot('botharness-memory-save-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const saved = await invoke(
      ['memory-save', id, '--path', 'notes.md', '--body', '# notes\n'],
      home,
    );
    expect(saved.code).toBe(0);
    expect(saved.json.commit.sha).toMatch(/^[0-9a-f]{40}$/u);
    const file = await invoke(['memory-file', id, '--path', 'notes.md'], home);
    expect(file.json.file.body).toBe('# notes\n');
    const history = await invoke(['memory-history', id], home);
    expect(history.json.commits[0].sha).toBe(saved.json.commit.sha);
    const limited = await invoke(['memory-history', id, '--limit', '1'], home);
    expect(limited.json.commits).toHaveLength(1);
    const diff = await invoke(['memory-diff', id, '--sha', saved.json.commit.sha], home);
    expect(diff.code).toBe(0);
    expect(diff.json.diff).toContain('notes.md');
  });

  it('reads the save body from stdin', async () => {
    const home = createTempRoot('botharness-memory-stdin-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const saved = await invoke(
      ['memory-save', bot.json.bot.id, '--path', 'piped.md', '--body-stdin'],
      home,
      {},
      '# piped\n',
    );
    expect(saved.code).toBe(0);
    const file = await invoke(['memory-file', bot.json.bot.id, '--path', 'piped.md'], home);
    expect(file.json.file.body).toBe('# piped\n');
  });

  it('rejects stale heads and no-change saves as conflicts', async () => {
    const home = createTempRoot('botharness-memory-conflict-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const stale = await invoke(
      [
        'memory-save',
        id,
        '--path',
        'notes.md',
        '--body',
        '# notes\n',
        '--expected-head',
        '0'.repeat(40),
      ],
      home,
    );
    expect(stale.code).toBe(1);
    expect(stale.json.error.code).toBe('memory-conflict');
    const first = await invoke(
      ['memory-save', id, '--path', 'notes.md', '--body', '# notes\n'],
      home,
    );
    expect(first.code).toBe(0);
    const same = await invoke(
      ['memory-save', id, '--path', 'notes.md', '--body', '# notes\n'],
      home,
    );
    expect(same.code).toBe(1);
    expect(same.json.error.code).toBe('memory-conflict');
  });

  it('reports unknown bots and bad shas with coded errors', async () => {
    const home = createTempRoot('botharness-memory-errors-');
    for (const argv of [
      ['memory-snapshot', 'bot-absent'],
      ['memory-file', 'bot-absent', '--path', 'a.md'],
      ['memory-history', 'bot-absent'],
      ['memory-diff', 'bot-absent', '--sha', '0'.repeat(40)],
      ['memory-save', 'bot-absent', '--path', 'a.md', '--body', 'x'],
    ]) {
      const result = await invoke(argv, home);
      expect(result.code).toBe(1);
      expect(result.json.error.code).toBe('unknown-bot');
    }
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const badSha = await invoke(['memory-diff', bot.json.bot.id, '--sha', 'xyz'], home);
    expect(badSha.code).toBe(1);
    expect(badSha.json.error.code).toBe('invalid-input');
    const badLimit = await invoke(['memory-history', bot.json.bot.id, '--limit', '0'], home);
    expect(badLimit.code).toBe(2);
    expect(badLimit.json.error.code).toBe('usage');
    const noPath = await invoke(['memory-file', bot.json.bot.id], home);
    expect(noPath.code).toBe(2);
    expect(noPath.json.error.code).toBe('usage');
  });
});

describe('deepseekbot writer lease', () => {
  it('fails coded while the Host holds the writer lease', async () => {
    const home = createTempRoot('botharness-lease-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      const listed = await invoke(['model-presets'], home);
      expect(listed.code).toBe(1);
      expect(listed.json.error.code).toBe('lease-unavailable');
      const created = await invoke(['create', '--name', 'Ada'], home);
      expect(created.code).toBe(1);
      expect(created.json.error.code).toBe('lease-unavailable');
    } finally {
      owner.close();
    }
    const after = await invoke(['create', '--name', 'Ada'], home);
    expect(after.code).toBe(0);
  });
});

describe('deepseekbot channels, grants, schedules, pairings', () => {
  async function seedDm(home: string, slug: string, name: string): Promise<string> {
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      const channels = createSqliteChannelStore({
        database: attachOperationalModule(owner, 'messaging'),
        rootDir: join(home, 'botharness', 'channels'),
      });
      const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, name)!;
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'seed-one',
        at: '2026-10-10T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'first',
      });
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'seed-two',
        at: '2026-10-10T00:01:00.000Z',
        author: { kind: 'human' },
        body: 'second',
      });
      return dm.id;
    } finally {
      owner.close();
    }
  }

  it('lists channels and reads messages with limit and before', async () => {
    const home = createTempRoot('botharness-cli-channels-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const channelId = await seedDm(home, id, 'Ada');
    const listed = await invoke(['channels'], home);
    expect(listed.code).toBe(0);
    expect(listed.json.channels.map((channel: { id: string }) => channel.id)).toContain(channelId);
    const messages = await invoke(['channel-messages', channelId], home);
    expect(messages.code).toBe(0);
    expect(messages.json.messages.map((message: { id: string }) => message.id)).toEqual([
      'seed-two',
      'seed-one',
    ]);
    const limited = await invoke(['channel-messages', channelId, '--limit', '1'], home);
    expect(limited.json.messages.map((message: { id: string }) => message.id)).toEqual([
      'seed-two',
    ]);
    const before = await invoke(['channel-messages', channelId, '--before', 'seed-two'], home);
    expect(before.json.messages.map((message: { id: string }) => message.id)).toEqual(['seed-one']);
    const missing = await invoke(['channel-messages', 'dm-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-channel');
  });

  it('lists grants and refuses unknown grants without a Host registry', async () => {
    const home = createTempRoot('botharness-cli-grants-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const listed = await invoke(['grants', id], home);
    expect(listed.code).toBe(0);
    expect(listed.json.grants).toEqual([]);
    const revoked = await invoke(['grant-revoke', id, '--grant', 'absent'], home);
    expect(revoked.code).toBe(1);
    expect(revoked.json.error.code).toBe('invalid-grant');
    const writeSet = await invoke(['grant-write-set', id, '--grant', 'absent', '--enabled'], home);
    expect(writeSet.code).toBe(1);
    expect(writeSet.json.error.code).toBe('invalid-grant');
    const noFlag = await invoke(['grant-write-set', id, '--grant', 'absent'], home);
    expect(noFlag.code).toBe(2);
    expect(noFlag.json.error.code).toBe('usage');
    const missing = await invoke(['grants', 'bot-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });

  it('runs the full schedule lifecycle and previews triggers', async () => {
    const home = createTempRoot('botharness-cli-schedules-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const created = await invoke(
      ['schedule-create', id, '--title', 'Ping', '--prompt', 'Say hi', '--every', '3600'],
      home,
    );
    expect(created.code).toBe(0);
    const sid = created.json.schedule.id as string;
    const listed = await invoke(['schedules', id], home);
    expect(listed.json.schedules.map((schedule: { id: string }) => schedule.id)).toEqual([sid]);
    const updated = await invoke(['schedule-update', id, '--sid', sid, '--title', 'Pong'], home);
    expect(updated.code).toBe(0);
    expect(updated.json.schedule.title).toBe('Pong');
    const history = await invoke(['schedule-history', id, '--sid', sid], home);
    expect(history.json.firings).toEqual([]);
    const fired = await invoke(['schedule-run-now', id, '--sid', sid], home);
    expect(fired.code).toBe(0);
    expect(fired.json.firing.trigger).toBe('manual');
    const after = await invoke(['schedule-history', id, '--sid', sid], home);
    expect(after.json.firings).toHaveLength(1);
    const preview = await invoke(['schedule-preview', '--every', '3600'], home);
    expect(preview.code).toBe(0);
    expect(preview.json.occurrences.length).toBeGreaterThan(0);
    const deleted = await invoke(['schedule-delete', id, '--sid', sid], home);
    expect(deleted.code).toBe(0);
    expect(deleted.json.removed).toBe(true);
    const gone = await invoke(['schedules', id], home);
    expect(gone.json.schedules).toEqual([]);
  });

  it('rejects bad triggers, unknown schedules, and unknown bots', async () => {
    const home = createTempRoot('botharness-cli-schedule-errors-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const id = bot.json.bot.id as string;
    const noTrigger = await invoke(['schedule-create', id, '--title', 'T', '--prompt', 'P'], home);
    expect(noTrigger.code).toBe(2);
    expect(noTrigger.json.error.code).toBe('usage');
    const twoTriggers = await invoke(
      [
        'schedule-create',
        id,
        '--title',
        'T',
        '--prompt',
        'P',
        '--every',
        '60',
        '--cron',
        '* * * * *',
      ],
      home,
    );
    expect(twoTriggers.code).toBe(2);
    expect(twoTriggers.json.error.code).toBe('usage');
    const noTimezone = await invoke(
      ['schedule-create', id, '--title', 'T', '--prompt', 'P', '--daily', '09:00'],
      home,
    );
    expect(noTimezone.code).toBe(2);
    expect(noTimezone.json.error.code).toBe('usage');
    const missing = await invoke(['schedule-delete', id, '--sid', 'absent'], home);
    expect(missing.code).toBe(0);
    expect(missing.json.removed).toBe(false);
    const missingHistory = await invoke(['schedule-history', id, '--sid', 'absent'], home);
    expect(missingHistory.code).toBe(1);
    expect(missingHistory.json.error.code).toBe('unknown-schedule');
    const noBot = await invoke(['schedules', 'bot-absent'], home);
    expect(noBot.code).toBe(1);
    expect(noBot.json.error.code).toBe('unknown-bot');
    const noId = await invoke(['schedule-delete', id], home);
    expect(noId.code).toBe(2);
    expect(noId.json.error.code).toBe('usage');
  });

  it('lists empty pairings for a fresh bot and refuses unknown bots', async () => {
    const home = createTempRoot('botharness-cli-pairings-');
    const bot = await invoke(['create', '--name', 'Ada'], home);
    const listed = await invoke(['pairings', bot.json.bot.id], home);
    expect(listed.code).toBe(0);
    expect(listed.json.pairings).toEqual([]);
    const missing = await invoke(['pairings', 'bot-absent'], home);
    expect(missing.code).toBe(1);
    expect(missing.json.error.code).toBe('unknown-bot');
  });
});

describe('deepseekbot secrets', () => {
  const credentialFile = (home: string): string => join(home, '.credentials.yaml');
  const backups = (home: string): string[] =>
    readdirSync(home).filter((name) => name.startsWith('.credentials.yaml.bak-'));

  it('puts, lists, and unsets a secret without ever echoing the value', async () => {
    const home = createTempRoot('botharness-secrets-');
    const put = await invoke(['secret-put', 'E2E_FAKE_KEY'], home, {}, 'fake-value-1');
    expect(put.code).toBe(0);
    expect(put.json.secret).toMatchObject({
      name: 'E2E_FAKE_KEY',
      configured: true,
      source: 'file',
      writable: true,
    });
    expect(put.stdout).not.toContain('fake-value-1');
    expect(put.stderr).not.toContain('fake-value-1');
    expect(readFileSync(credentialFile(home), 'utf8')).toContain('fake-value-1');
    if (!process.platform.startsWith('win')) {
      expect(statSync(credentialFile(home)).mode & 0o777).toBe(0o600);
    }
    const listed = await invoke(['secret-list'], home);
    expect(listed.code).toBe(0);
    expect(listed.json.secrets).toMatchObject([
      { name: 'E2E_FAKE_KEY', configured: true, source: 'file', writable: true },
    ]);
    expect(listed.stdout).not.toContain('fake-value-1');
    const overwrite = await invoke(['secret-put', 'E2E_FAKE_KEY'], home, {}, 'fake-value-2');
    expect(overwrite.code).toBe(0);
    expect(backups(home)).toHaveLength(1);
    expect(readFileSync(credentialFile(home), 'utf8')).toContain('fake-value-2');
    const removed = await invoke(['secret-unset', 'E2E_FAKE_KEY'], home);
    expect(removed.code).toBe(0);
    expect(removed.json.secret).toMatchObject({ name: 'E2E_FAKE_KEY', configured: false });
    expect(readFileSync(credentialFile(home), 'utf8')).not.toContain('E2E_FAKE_KEY');
    const empty = await invoke(['secret-list'], home);
    expect(empty.json).toEqual({ secrets: [] });
  });

  it('reports environment overrides as read-only and keeps them on unset', async () => {
    const home = createTempRoot('botharness-secrets-env-');
    const put = await invoke(['secret-put', 'E2E_ENV_KEY'], home, {}, 'file-value');
    expect(put.code).toBe(0);
    const listed = await invoke(['secret-list'], home, { E2E_ENV_KEY: 'env-value' });
    expect(listed.json.secrets).toMatchObject([
      { name: 'E2E_ENV_KEY', configured: true, source: 'environment', writable: false },
    ]);
    expect(listed.stdout).not.toContain('env-value');
    expect(listed.stdout).not.toContain('file-value');
    const removed = await invoke(['secret-unset', 'E2E_ENV_KEY'], home, {
      E2E_ENV_KEY: 'env-value',
    });
    expect(removed.code).toBe(0);
    expect(removed.json.secret).toMatchObject({
      name: 'E2E_ENV_KEY',
      configured: true,
      source: 'environment',
      writable: false,
    });
  });

  it('rejects bad names, empty values, and malformed stores', async () => {
    const home = createTempRoot('botharness-secrets-errors-');
    const badName = await invoke(['secret-put', 'has space'], home, {}, 'x');
    expect(badName.code).toBe(1);
    expect(badName.json.error.code).toBe('invalid-input');
    const empty = await invoke(['secret-put', 'E2E_EMPTY'], home, {}, '');
    expect(empty.code).toBe(1);
    expect(empty.json.error.code).toBe('invalid-input');
    const missing = await invoke(['secret-list'], home);
    expect(missing.code).toBe(0);
    expect(missing.json).toEqual({ secrets: [] });
    writeFileSync(credentialFile(home), 'not: [valid, yaml\n');
    const badPut = await invoke(['secret-put', 'E2E_X'], home, {}, 'x');
    expect(badPut.code).toBe(1);
    expect(badPut.json.error.code).toBe('bad-credentials');
    const badList = await invoke(['secret-list'], home);
    expect(badList.code).toBe(1);
    expect(badList.json.error.code).toBe('bad-credentials');
  });

  it('refuses secret flags and wide-open files', async () => {
    const home = createTempRoot('botharness-secrets-guard-');
    const flagged = await invoke(['secret-list', '--token', 'sk-fake-9'], home);
    expect(flagged.code).toBe(2);
    expect(flagged.json.error.code).toBe('secret-in-argv');
    expect(flagged.stdout).not.toContain('sk-fake-9');
    if (process.platform.startsWith('win')) return;
    writeFileSync(credentialFile(home), 'version: 1\n\nrefs:\n');
    if (!process.platform.startsWith('win')) chmodSync(credentialFile(home), 0o644);
    const refused = await invoke(['secret-list'], home);
    expect(refused.code).toBe(1);
    expect(refused.json.error.code).toBe('bad-credentials');
  });

  it('preserves records and comments around refs edits', async () => {
    const home = createTempRoot('botharness-secrets-shape-');
    writeFileSync(
      credentialFile(home),
      [
        'version: 1',
        '',
        '# operator note',
        'refs:',
        '  KEEP_ME: |-',
        '    abc',
        '',
        'records:',
        '  owner/id:',
        '    kind: grant',
        '    payload: { retained: true }',
      ].join('\n') + '\n',
    );
    if (!process.platform.startsWith('win')) chmodSync(credentialFile(home), 0o600);
    const put = await invoke(['secret-put', 'E2E_NEW'], home, {}, 'line1\nline2');
    expect(put.code).toBe(0);
    const text = readFileSync(credentialFile(home), 'utf8');
    expect(text).toContain('# operator note');
    expect(text).toContain('records:');
    expect(text).toContain('KEEP_ME');
    const listed = await invoke(['secret-list'], home);
    expect(listed.json.secrets.map((entry: { name: string }) => entry.name).sort()).toEqual([
      'E2E_NEW',
      'KEEP_ME',
    ]);
  });
});

describe('deepseekbot search and compact', () => {
  it('finds commands by words with exact names first', async () => {
    const home = createTempRoot('botharness-search-');
    const schedules = await invoke(['search', 'schedule'], home);
    expect(schedules.code).toBe(0);
    const names = schedules.json.matches.map((match: { command: string }) => match.command);
    for (const command of [
      'schedules',
      'schedule-create',
      'schedule-update',
      'schedule-delete',
      'schedule-history',
      'schedule-run-now',
      'schedule-preview',
    ]) {
      expect(names).toContain(command);
    }
    expect(names).not.toContain('create');
    const exact = await invoke(['search', 'model', 'preset', 'apply'], home);
    expect(exact.json.matches[0].command).toBe('model-preset-apply');
    const none = await invoke(['search', 'zzzznothing'], home);
    expect(none.code).toBe(0);
    expect(none.json.matches).toEqual([]);
    const empty = await invoke(['search'], home);
    expect(empty.code).toBe(2);
    expect(empty.json.error.code).toBe('usage');
  });

  it('keeps the search index in sync with the dispatch table', async () => {
    const source = readFileSync(new URL('../src/bots/bot-create-cli.ts', import.meta.url), 'utf8');
    const dispatched = new Set<string>();
    for (const match of source.matchAll(/if \(command === '([a-z-]+)'\)/gu)) {
      dispatched.add(match[1]!);
    }
    const home = createTempRoot('botharness-search-sync-');
    expect(dispatched.size).toBeGreaterThan(30);
    for (const command of [...dispatched].sort()) {
      const found = await invoke(['search', command], home);
      expect(found.code).toBe(0);
      expect(found.json.matches.length).toBeGreaterThan(0);
      expect(found.json.matches[0].command).toBe(command);
    }
  });

  it('condenses stdout JSON with --compact and leaves help text alone', async () => {
    const home = createTempRoot('botharness-compact-');
    const pretty = await invoke(['model-presets'], home);
    expect(pretty.stdout.includes('\n')).toBe(true);
    const compact = await invoke(['--compact', 'model-presets'], home);
    expect(compact.code).toBe(0);
    expect(compact.stdout.includes('\n')).toBe(false);
    expect(JSON.parse(compact.stdout)).toEqual(JSON.parse(pretty.stdout));
    const out: string[] = [];
    const code = await runBotCreateCli(['--compact', '--help'], {
      env: { ...process.env },
      stdout: (text) => out.push(text),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(out.join('\n').includes('\n')).toBe(true);
  });
});
