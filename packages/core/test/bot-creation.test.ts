import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBotCreation, BotCreationError } from '../src/bots/creation.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});
function fixture(home = createTempRoot('bot-create-receipt-')) {
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  const database = attachOperationalModule(core.operationalDatabase, 'bot-creation-test');
  const owner = createBotCreation({ database, registry: core.registry, channels: core.channels });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  cleanup.push(close);
  return { home, core, database, owner, close };
}
const key = 'test-create-operation-01';
const input = {
  displayName: 'Ada',
  description: 'Research helper',
  roles: ['research'],
  persona: 'You are Ada.',
  coreMemory: 'Prefer short answers.',
};

describe('canonical keyed Bot creation', () => {
  it('creates one identity, Git Memory and DM and returns the same receipt after retry and restart', async () => {
    const f = fixture();
    expect(f.owner.lookup(key, input)).toBeUndefined();
    expect(f.core.registry.list()).toHaveLength(0);
    const first = f.owner.create(input, key);
    expect(f.owner.create(input, key)).toEqual(first);
    expect(f.core.registry.list()).toHaveLength(1);
    expect(f.core.channels.list()).toHaveLength(1);
    const memory = f.core.registry.memoryDirFor(first.record.slug)!;
    expect(existsSync(join(memory, '.git'))).toBe(true);
    expect(readFileSync(join(memory, 'SOUL.md'), 'utf8')).toContain('You are Ada.');
    expect(readFileSync(join(memory, 'MEMORY.md'), 'utf8')).toContain('Prefer short answers.');
    expect(f.core.grants.list(first.record.slug)).toEqual([]);
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.lookup(key, input)).toEqual(first.receipt);
    expect(restarted.owner.create(input, key).record.slug).toBe(first.record.slug);
    expect(restarted.core.registry.list()).toHaveLength(1);
    expect(restarted.core.channels.list()).toHaveLength(1);
  });

  it('reconciles a lost Registry result without repeating initialization or changing Memory', async () => {
    const f = fixture();
    const create = f.core.registry.create.bind(f.core.registry);
    const spy = vi.spyOn(f.core.registry, 'create').mockImplementation((value) => {
      create(value);
      throw new Error('lost Registry result');
    });
    expect(() => f.owner.create(input, key)).toThrow('lost Registry result');
    const bot = f.core.registry.list()[0]!;
    const memory = f.core.registry.memoryDirFor(bot.slug)!;
    writeFileSync(join(memory, 'MEMORY.md'), 'Changed after Registry commit');
    expect(f.owner.lookup(key, input)).toMatchObject({ botSlug: bot.slug, status: 'reserved' });
    spy.mockRestore();
    await f.close();
    const restarted = fixture(f.home);
    expect(restarted.owner.create(input, key).record.slug).toBe(bot.slug);
    expect(readFileSync(join(memory, 'MEMORY.md'), 'utf8')).toBe('Changed after Registry commit');
    expect(restarted.core.channels.list()).toHaveLength(1);
  });

  it('recognizes an existing DM after a lost post-write response without another mutation', () => {
    const f = fixture();
    const createDm = f.core.channels.getOrCreateDm.bind(f.core.channels);
    vi.spyOn(f.core.channels, 'getOrCreateDm').mockImplementation((...args) => {
      createDm(...args);
      throw new Error('lost DM result');
    });
    expect(() => f.owner.create(input, key)).toThrow('lost DM result');
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(f.owner.lookup(key, input)).toMatchObject({
      status: 'created',
      channelId: f.core.channels.list()[0]!.id,
    });
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
  });

  it('refuses a reused key with different payload, and never resurrects an archived identity', () => {
    const f = fixture();
    const first = f.owner.create(input, key);
    expect(() => f.owner.lookup(key, { ...input, persona: 'different' })).toThrowError(
      expect.objectContaining({ code: 'creation-key-conflict' }),
    );
    expect(() => f.owner.create({ ...input, displayName: 'Different' }, key)).toThrowError(
      expect.objectContaining({ code: 'creation-key-conflict' }),
    );
    f.core.registry.setPaused(first.record.slug, true);
    expect(() => f.owner.create(input, key)).toThrowError(
      expect.objectContaining({ code: 'creation-identity-unavailable' }),
    );
    expect(f.core.registry.listHistorical()).toHaveLength(1);
  });

  it('refuses an unknown Memory folder for a reserved identity without modifying it', () => {
    const f = fixture();
    const spy = vi.spyOn(f.core.registry, 'create').mockImplementation(() => {
      throw new Error('interrupted before create');
    });
    expect(() => f.owner.create(input, key)).toThrow();
    const reserved = f.owner.lookup(key, input)!;
    const memory = f.core.registry.defaultMemoryDirFor(reserved.botSlug);
    mkdirSync(memory, { recursive: true });
    writeFileSync(join(memory, 'SOUL.md'), 'Unowned content');
    spy.mockRestore();
    expect(() => f.owner.create(input, key)).toThrowError(
      expect.objectContaining({ code: 'creation-memory-conflict' }),
    );
    expect(readFileSync(join(memory, 'SOUL.md'), 'utf8')).toBe('Unowned content');
    expect(f.core.registry.list()).toEqual([]);
  });

  it('routes bridge creates through the same owner and carries the receipt', () => {
    const f = fixture();
    const bridge = createBridgeMethods({ ...f.core, creations: f.owner });
    const first = bridge.create({ ...input, operationKey: key });
    expect(first).toMatchObject({
      ok: true,
      value: { receipt: { operationKey: key, status: 'created' } },
    });
    expect(bridge.create({ ...input, operationKey: key })).toEqual(first);
    expect(bridge.create({ ...input, operationKey: key, coreMemory: 'changed' })).toMatchObject({
      ok: false,
      error: { code: 'creation-key-conflict' },
    });
    expect(bridge.create({ ...input, operationKey: 'bad' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-operation-key' },
    });
    expect(f.core.registry.list()).toHaveLength(1);
  });

  it('rejects custom Memory paths for keyed creation before reserving any identity', () => {
    const f = fixture();
    expect(() => f.owner.create({ ...input, memoryLocation: f.home }, key)).toThrow(
      BotCreationError,
    );
    expect(f.owner.lookup(key, input)).toBeUndefined();
  });

  it('migrates generation 96 forward while retaining protected Tob identity', () => {
    const home = createTempRoot('bot-creation-migration-');
    const before = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 96),
      ),
    });
    attachOperationalModule(before, 'migration-test').transaction((db) => {
      db.prepare('INSERT INTO tob_identity(singleton,bot_slug) VALUES(1,?)').run('tob-original');
    });
    before.close();
    const after = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    cleanup.push(() => after.close());
    const port = attachOperationalModule(after, 'migration-test');
    expect(after.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    expect(port.read((db) => db.prepare('SELECT bot_slug FROM tob_identity').get())).toEqual({
      bot_slug: 'tob-original',
    });
    expect(port.read((db) => db.prepare('SELECT * FROM bot_creation_operations').all())).toEqual(
      [],
    );
  });
});
