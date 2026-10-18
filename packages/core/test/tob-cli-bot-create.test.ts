import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createTobBotCreationOperations } from '../src/tob/cli-bot-create.js';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
function fixture() {
  const core = createCore({ dshHome: createTempRoot('tob-cli-create-') });
  cleanup.push(async () => {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  });
  const bridge = createBridgeMethods({ ...core });
  const prepare = createTobBotCreationOperations({
    creations: core.creations,
    bridge,
    registry: core.registry,
  });
  return { core, bridge, prepare };
}
const args = () => ({
  operationKey: 'tob-create-operation-01',
  displayName: 'Research',
  description: 'Research helper',
  roles: ['research'],
  persona: 'You are a careful research assistant.',
  coreMemory: 'Prefer concise answers.',
});
async function broker(f: ReturnType<typeof fixture>, approve = vi.fn(async () => {})) {
  const beforeWrite = vi.fn();
  const transport = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize() {},
    approve,
    beforeWrite,
    readSetting: () => ({ scope: 'global', value: 8, revision: 0 }),
    writeSetting: async () => {
      throw new Error('unexpected settings write');
    },
    prepareOperation: f.prepare,
  });
  cleanup.push(() => transport.close());
  return { transport, approve, beforeWrite };
}
async function invoke(transport: TobCliBroker, input = args()) {
  const response = await fetch(transport.endpoint + '/invoke', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + transport.token, 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'create', args: input }),
  });
  return response.json();
}

describe('Tob creation through the existing Host owner', () => {
  it('prepares a review without reservations or effects and refuses a revoked source before mutation', async () => {
    const f = fixture();
    const input = args();
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const prepared = (await f.prepare('create', input))!;
    expect(prepared.proposal).toMatchObject({ command: 'create', target: input.operationKey });
    const beforeEffect = vi.fn();
    expect(() =>
      prepared.run(() => {
        throw new TobError('human-dm-required');
      }, beforeEffect),
    ).toThrowError(expect.objectContaining({ code: 'human-dm-required' }));
    expect(beforeEffect).not.toHaveBeenCalled();
    const { operationKey, ...creationInput } = input;
    expect(f.core.creations.lookup(operationKey, creationInput)).toBeUndefined();
    expect(f.core.registry.list()).toEqual([]);
    expect(f.core.channels.list()).toEqual([]);
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
  });

  it('denied broker approval creates no identity, Memory, DM or receipt', async () => {
    const f = fixture();
    const approve = vi.fn(async () => {
      throw new TobError('approval-denied');
    });
    const b = await broker(f, approve);
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    expect(await invoke(b.transport)).toMatchObject({
      ok: false,
      error: { code: 'approval-denied' },
    });
    expect(approve).toHaveBeenCalledOnce();
    expect(b.beforeWrite).not.toHaveBeenCalled();
    expect(f.core.registry.list()).toEqual([]);
    expect(f.core.channels.list()).toEqual([]);
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
  });

  it('creates exactly one canonical identity, Git Memory and DM with no grants', async () => {
    const f = fixture();
    const b = await broker(f);
    const response = await invoke(b.transport);
    expect(response).toMatchObject({
      ok: true,
      value: {
        bot: { displayName: 'Research' },
        receipt: { operationKey: args().operationKey, status: 'created' },
      },
    });
    const created = f.core.registry.list();
    expect(created).toHaveLength(1);
    const bot = created[0]!;
    expect(bot).toMatchObject({
      description: 'Research helper',
      roles: ['research'],
      workspaces: [],
    });
    expect(f.core.channels.list()).toHaveLength(1);
    expect(f.core.channels.get(response.value.channelId)).toMatchObject({ botSlug: bot.slug });
    expect(response.value.bot.slug).toBe(bot.slug);
    const memory = f.core.registry.memoryDirFor(bot.slug)!;
    expect(JSON.stringify(response)).not.toContain(memory);
    expect(response.value.bot).not.toHaveProperty('memoryDir');
    expect(response.value.bot).not.toHaveProperty('sessions');
    expect(response.value.profileFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(existsSync(join(memory, '.git'))).toBe(true);
    expect(readFileSync(join(memory, 'SOUL.md'), 'utf8')).toContain(args().persona);
    expect(readFileSync(join(memory, 'MEMORY.md'), 'utf8')).toContain(args().coreMemory);
    expect(f.core.grants.list(bot.slug)).toEqual([]);
    expect(b.approve).toHaveBeenCalledOnce();
    expect(b.beforeWrite).toHaveBeenCalledOnce();
  });

  it('recovers a lost post-commit response through its receipt without another approval or mutation', async () => {
    const f = fixture();
    const create = f.bridge.create.bind(f.bridge);
    const submit = vi.spyOn(f.bridge, 'create').mockImplementationOnce((input) => {
      create(input);
      throw new Error('simulated lost creation response');
    });
    const b = await broker(f);
    expect(await invoke(b.transport)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    });
    const bot = f.core.registry.list()[0]!;
    const memory = f.core.registry.memoryDirFor(bot.slug)!;
    writeFileSync(join(memory, 'MEMORY.md'), 'A subsequent user edit');
    const before = f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted;
    const retry = await invoke(b.transport);
    expect(retry).toMatchObject({
      ok: true,
      value: { bot: { slug: bot.slug }, receipt: { status: 'created' } },
    });
    expect(JSON.stringify(retry)).not.toContain(memory);
    expect(retry.value.bot).not.toHaveProperty('memoryDir');
    expect(retry.value.bot).not.toHaveProperty('sessions');
    expect(retry.value.profileFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(submit).toHaveBeenCalledOnce();
    expect(b.approve).toHaveBeenCalledOnce();
    expect(b.beforeWrite).toHaveBeenCalledOnce();
    expect(f.core.operationalDatabase.diagnostics().metrics.transactionsCommitted).toBe(before);
    expect(f.core.registry.list()).toHaveLength(1);
    expect(f.core.channels.list()).toHaveLength(1);
    expect(readFileSync(join(memory, 'MEMORY.md'), 'utf8')).toBe('A subsequent user edit');
  });

  it('refuses changed key payloads and unsupported grant/path/identity fields before approval', async () => {
    const f = fixture();
    const b = await broker(f);
    expect(await invoke(b.transport)).toMatchObject({ ok: true });
    expect(await invoke(b.transport, { ...args(), persona: 'Changed request' })).toMatchObject({
      ok: false,
      error: { code: 'creation-key-conflict' },
    });
    for (const field of ['workspaces', 'memoryLocation', 'slug', 'systemRole', 'model']) {
      await expect(
        Promise.resolve().then(() => f.prepare('create', { ...args(), [field]: 'untrusted' })),
      ).rejects.toMatchObject({
        code: 'invalid-input',
      });
    }
    expect(f.core.registry.list()).toHaveLength(1);
    expect(b.approve).toHaveBeenCalledOnce();
  });
});
