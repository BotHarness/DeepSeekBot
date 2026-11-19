import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CODEX_ACCOUNT } from '@botharness/host-protocol/subscription-engine';
import { describe, expect, it, vi } from 'vitest';

import { runEngineCommand } from '../src/bots/cli-engine.js';
import { createEngineAccountBridge } from '../src/engines/engine-account-bridge.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost, type EngineHostOptions } from '../src/engines/engine-host.js';
import { engineRouteFetch } from '../src/engines/engine-route.js';
import { createEngineStore, engineStorePath } from '../src/engines/engine-store.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { requireModelSources } from '../src/models/provider-bridge.js';
import { createTempRoot } from './helpers.js';

function setup(overrides: Partial<EngineHostOptions> = {}) {
  const root = createTempRoot('engine-accounts-');
  const host = new EngineHost({
    root,
    local: true,
    gateway: createEngineGateway(),
    sessions: () => undefined,
    persistence: () => undefined,
    detectCodex: async () => ({ installed: true, login: 'signed-out' }),
    detectClaude: async () => ({ installed: true, login: 'signed-out' }),
    ...overrides,
  });
  return { root, host };
}

describe('named Codex subscription accounts', () => {
  it('migrates the v1 Codex home, both roles and quota, and keeps the same account across restart', async () => {
    const { root, host } = setup();
    const home = join(root, 'codex', 'home');
    mkdirSync(home, { recursive: true });
    const path = engineStorePath(root);
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        bots: { ada: { orchestrator: 'codex', model: 'gpt', assignment: { engine: 'codex' } } },
        sessions: {},
        quota: { codex: { limited: false, usedPercent: 15, observedAt: '2026-11-20T00:00:00Z' } },
      }),
    );
    expect(host.accounts()).toMatchObject({
      revision: 0,
      accounts: [
        { id: DEFAULT_CODEX_ACCOUNT, engine: 'codex', name: 'Codex' },
        { id: 'claude', engine: 'claude' },
      ],
    });
    expect(host.store.resolveAccount('codex').homeDir).toBe('codex/home');
    expect(host.store.selections()).toMatchObject([
      { botSlug: 'ada', engine: 'codex', role: 'orchestrator', model: 'gpt' },
      { botSlug: 'ada', engine: 'codex', role: 'assignment' },
    ]);
    const account = host.addAccount('Work', 0);
    expect(host.quota('codex')).toMatchObject({ usedPercent: 15 });
    expect(host.quota('codex', account.id)).toBeUndefined();
    expect(createEngineStore(path).accounts()).toMatchObject({
      revision: 1,
      accounts: [{ id: DEFAULT_CODEX_ACCOUNT }, { id: account.id }, { id: 'claude' }],
    });
    expect(existsSync(home)).toBe(true);
    expect(() => host.removeAccount(DEFAULT_CODEX_ACCOUNT, 1)).toThrow('Bot ada');
  });

  it('fences changes and deletes the selected home only after a committed removal', () => {
    const accountUses = vi.fn((): string[] => ['Model Preset Daily', 'Routing Group Primary']);
    const { root, host } = setup({ accountUses });
    const account = host.addAccount('Work', 0);
    const home = join(root, 'codex', 'accounts', account.id);
    mkdirSync(home, { recursive: true });
    expect(() => host.renameAccount(account.id, 'Other', 0)).toThrow('changed');
    expect(() => host.removeAccount(account.id, 1)).toThrow(
      'Model Preset Daily, Routing Group Primary',
    );
    expect(existsSync(home)).toBe(true);
    expect(host.accounts().revision).toBe(1);
    accountUses.mockReturnValue([]);
    expect(host.renameAccount(account.id, 'Other', 1)).toMatchObject({ name: 'Other' });
    expect(host.removeAccount(account.id, 2)).toEqual({ id: account.id });
    expect(existsSync(home)).toBe(false);
    expect(() => host.use('ada', 'orchestrator', 'codex', { accountId: account.id })).toThrow(
      'was not found',
    );
    expect(host.accounts().revision).toBe(3);
  });

  it('keeps the home and revision if the file commit fails', () => {
    const { root, host } = setup();
    const account = host.addAccount('Work', 0);
    const home = join(root, 'codex', 'accounts', account.id);
    mkdirSync(home, { recursive: true });
    const path = engineStorePath(root);
    renameSync(path, `${path}.saved`);
    mkdirSync(path);
    expect(() => host.removeAccount(account.id, 1)).toThrow('Could not save subscription accounts');
    expect(existsSync(home)).toBe(true);
    expect(host.accounts().revision).toBe(1);
  });

  it('shares only simultaneous probes of the same account and passes its home to login', async () => {
    const detectCodex = vi.fn(async () => ({ installed: true, login: 'signed-out' as const }));
    const startCodexLogin = vi.fn(async () => ({ url: 'https://auth.openai.com/example' }));
    const { root, host } = setup({ detectCodex, startCodexLogin });
    const account = host.addAccount('Work', 0);
    const result = await Promise.all([host.status(), host.status(account.id)]);
    expect(result[1]).toMatchObject([{ accountId: account.id, accountName: 'Work' }]);
    expect(detectCodex).toHaveBeenCalledTimes(2);
    expect(detectCodex).toHaveBeenCalledWith(
      expect.objectContaining({ home: join(root, 'codex', 'home') }),
    );
    await expect(host.login('codex', account.id)).resolves.toMatchObject({ started: true });
    expect(startCodexLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        home: join(root, 'codex', 'accounts', account.id),
      }),
    );
  });

  it('refuses a missing Assignment account before admission even when another account exists', () => {
    const { host } = setup();
    const other = host.addAccount('Work', 0);
    host.removeAccount(other.id, 1);
    host.store.select('ada', 'assignment', 'codex', { accountId: other.id });
    expect(() => host.assertAssignmentAccount('ada')).toThrow('was not found');
  });

  it('refuses each management mutation for members and Bot callers at the shared gate', async () => {
    const { host } = setup();
    const member = { ...OWNER_HUMAN_CONTEXT, humanId: 'member' };
    const bot = { ...OWNER_HUMAN_CONTEXT, caller: 'bot' as const };
    for (const human of [member, bot]) {
      const bridge = createEngineAccountBridge(human, { engineAccounts: host });
      for (const method of [
        bridge.engineAccounts,
        bridge.engineAccountAdd,
        bridge.engineAccountRename,
        bridge.engineAccountRemove,
        bridge.engineAccountLogin,
      ]) {
        await expect(method({})).resolves.toMatchObject({
          ok: false,
          error: { code: 'permission-required', details: { permission: 'modelSources.manage' } },
        });
      }
    }
    const response = await engineRouteFetch(
      new Request('http://example.test/api/botharness/engines', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', engine: 'codex' }),
      }),
      {
        host,
        botExists: () => false,
        authorizeLogin: () => requireModelSources(member, undefined),
      },
    );
    expect(response.status).toBe(403);
    expect(host.accounts().revision).toBe(0);
  });

  it('uses the authenticated RPC for account changes and requires removal confirmation', async () => {
    const rpc = vi.fn(async () => ({ id: 'codex-new' }));
    const connect = async () => ({ rpc, http: vi.fn() });
    await runEngineCommand(
      'engine-account-add',
      ['codex'],
      { name: 'Work', 'expected-revision': '0' },
      connect,
    );
    expect(rpc).toHaveBeenLastCalledWith('engineAccountAdd', {
      engine: 'codex',
      name: 'Work',
      expectedRevision: 0,
    });
    await expect(
      runEngineCommand(
        'engine-account-remove',
        ['codex-new'],
        { 'expected-revision': '1' },
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(rpc).toHaveBeenCalledTimes(1);
    await runEngineCommand(
      'engine-account-remove',
      ['codex-new'],
      { confirm: true, 'expected-revision': '1' },
      connect,
    );
    expect(rpc).toHaveBeenLastCalledWith('engineAccountRemove', {
      id: 'codex-new',
      expectedRevision: 1,
      confirm: true,
    });
  });
});
