import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createMarketplaceClient, type MarketplaceClient } from '../src/marketplace/client.js';
import {
  createInstallReceipts,
  ensureMarketplaceHostId,
  MARKETPLACE_HOST_FILE,
  type InstallReceipts,
} from '../src/marketplace/install-receipts.js';
import { createMarketplaceUploads } from '../src/marketplace/uploaded-bots.js';
import type { MemoryCloneResult } from '../src/memory/clone.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { ensureInstallId } from '../src/telemetry/service.js';
import { createMarket, fakeRepository, submit } from '../../market/test/market-harness.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';

const dirs: string[] = [];
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bh-install-receipts-'));
  dirs.push(dir);
  return dir;
}

function marketClient(market: ReturnType<typeof createMarket>): MarketplaceClient {
  return createMarketplaceClient({
    baseUrl: 'https://market.test',
    fetchImpl: (input, init) =>
      market.request(
        new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        ).href.replace('https://market.test', ''),
        init,
      ),
  });
}

async function listedRepository(market: ReturnType<typeof createMarket>): Promise<string> {
  const repository = fakeRepository();
  market.publish(repository);
  return ((await (await submit(market, repository.htmlUrl)).json()) as { bot: { id: string } }).bot
    .id;
}

async function installs(market: ReturnType<typeof createMarket>, id: string): Promise<number> {
  return ((await (await market.request(`/v1/bots/${id}`)).json()) as { bot: { installs: number } })
    .bot.installs;
}

describe('marketplace Host identifier', () => {
  it('is random, private to the Host, reused, and never the Telemetry install id', () => {
    const dataDir = tempDir();
    const telemetryId = ensureInstallId(dataDir);

    const id = ensureMarketplaceHostId(dataDir);
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/u);
    expect(id).not.toContain(telemetryId);
    expect(ensureMarketplaceHostId(dataDir)).toBe(id);
    expect(ensureInstallId(dataDir)).toBe(telemetryId);
    expect(statSync(join(dataDir, MARKETPLACE_HOST_FILE)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dataDir, 'telemetry.json'), 'utf8')).not.toContain(id);
    expect(ensureMarketplaceHostId(tempDir())).not.toBe(id);
  });

  it('replaces an unreadable or malformed identifier file', () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, MARKETPLACE_HOST_FILE), '{"hostId":"short"}');
    const id = ensureMarketplaceHostId(dataDir, () => 'fresh_identifier_0123456789');
    expect(id).toBe('fresh_identifier_0123456789');
    expect(ensureMarketplaceHostId(dataDir)).toBe(id);
  });
});

describe('Install Receipts', () => {
  it('counts a Host once per entry and another Host separately', async () => {
    const market = createMarket();
    const id = await listedRepository(market);
    const client = marketClient(market);
    const logs: Record<string, unknown>[] = [];
    const host = createInstallReceipts({ client, dataDir: tempDir(), log: (e) => logs.push(e) });

    await host.send(id);
    await host.send(id);
    expect(await installs(market, id)).toBe(1);
    await createInstallReceipts({ client, dataDir: tempDir() }).send(id);
    expect(await installs(market, id)).toBe(2);
    expect(logs.map((e) => [e['module'], e['outcome'], e['counted']])).toEqual([
      ['marketplace-receipt', 'ok', true],
      ['marketplace-receipt', 'ok', false],
    ]);
  });

  it('never throws when the Marketplace is unreachable', async () => {
    const logs: Record<string, unknown>[] = [];
    const receipts = createInstallReceipts({
      client: createMarketplaceClient({
        baseUrl: 'https://market.test',
        fetchImpl: () => Promise.reject(new Error('offline')),
      }),
      dataDir: tempDir(),
      log: (e) => logs.push(e),
    });
    await expect(receipts.send('R_any')).resolves.toBeUndefined();
    expect(logs).toMatchObject([{ outcome: 'refused', reason: 'marketplace-unavailable' }]);
  });
});

describe('installing from the Marketplace', () => {
  function bridge(clone: () => MemoryCloneResult) {
    const root = tempDir();
    const database = registryDatabase(join(root, 'bots'));
    cleanup.push(() => database.close());
    const registry = createTestRegistry({
      rootDir: join(root, 'bots'),
      database,
      cloneMemory: async (destination) => {
        const result = clone();
        if (result.ok) {
          mkdirSync(destination, { recursive: true });
          writeFileSync(join(destination, 'PERSONA.md'), 'persona');
        }
        return result;
      },
    });
    const sent: string[] = [];
    const receipts: InstallReceipts = {
      send: (listingId) => {
        sent.push(listingId);
        return Promise.resolve();
      },
    };
    let next = 0;
    const methods = createBridgeMethods({
      registry,
      states: createBotStateTracker(),
      createBotId: () => `bot-${(next += 1)}`,
      marketplaceReceipts: receipts,
    } as unknown as Parameters<typeof createBridgeMethods>[0]);
    return { methods, sent };
  }

  const listing = {
    displayName: 'Helper',
    gitUrl: 'https://github.com/alice/helper-bot.git',
    origin: 'marketplace',
    listingId: 'R_alice_helper-bot',
  };

  it('sends a receipt for an Indexed Repository only after the Bot is created', async () => {
    const { methods, sent } = bridge(() => ({ ok: true }));
    expect((await methods.createFromGit(listing)).ok).toBe(true);
    expect(sent).toEqual(['R_alice_helper-bot']);
    const { listingId: _, ...plain } = listing;
    expect((await methods.createFromGit(plain)).ok).toBe(true);
    expect(sent).toEqual(['R_alice_helper-bot']);
  });

  it('sends nothing when the install fails', async () => {
    const { methods, sent } = bridge(() => ({ ok: false, code: 'git-clone-failed' }));
    expect((await methods.createFromGit(listing)).ok).toBe(false);
    expect(sent).toEqual([]);
  });

  it('refuses a listing id outside a Marketplace install', async () => {
    const { methods, sent } = bridge(() => ({ ok: true }));
    for (const payload of [
      { ...listing, origin: undefined },
      { ...listing, listingId: '' },
      { ...listing, listingId: 7 },
    ]) {
      expect(await methods.createFromGit(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(sent).toEqual([]);
  });

  it('prepares an Indexed Repository listing at its indexed commit for marketplace-install', async () => {
    const market = createMarket();
    const id = await listedRepository(market);
    const uploads = createMarketplaceUploads({
      client: marketClient(market),
      account: () => undefined,
      memoryDir: () => undefined,
    });
    expect(await uploads.installInput(id)).toMatchObject({
      ok: true,
      value: {
        entry: { id, source: 'github' },
        input: {
          displayName: 'helper-bot',
          source: {
            kind: 'git',
            gitUrl: 'https://github.com/alice/helper-bot.git',
            commit: 'abcdef1234567890abcdef1234567890abcdef12',
          },
        },
      },
    });
  });
});
