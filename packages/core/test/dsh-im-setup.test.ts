import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createTempRoot } from './helpers.js';

it('negotiates identity-only setup metadata and never exposes Provider credentials or QR tokens', async () => {
  const service = {
    contractVersion: 1,
    setupVersion: 1,
    describeSetup: async () => ({
      version: 1,
      channel: 'feishu',
      endpoint: 'dsh-im/app-setup',
      kind: 'credentials',
      appSecret: 'private-sentinel',
      qrToken: 'private-qr',
    }),
    describeBot: async () => undefined,
    sendChecked: async () => undefined,
    listBots: async () => [],
    listTargets: async () => [],
  } as unknown as DshImOutboundService;
  const provider = createDshImProvider(service)!;
  expect(await provider.setup?.()).toEqual({
    version: 1,
    platform: 'feishu',
    endpoint: 'dsh-im/app-setup',
    kind: 'credentials',
  });
  delete service.setupVersion;
  expect(await createDshImProvider(service)!.setup?.()).toBeUndefined();
});

it('copies no Provider secret into the account it binds', async () => {
  const sentinel = 'private-sentinel-secret';
  const fingerprint = 'c'.repeat(64);
  const service = {
    contractVersion: 1,
    listBots: async () => [{ botId: 'bot-1', channel: 'feishu', appSecret: sentinel }],
    describeBot: async () => ({
      version: 1,
      channel: 'feishu',
      botId: 'bot-1',
      appSecret: sentinel,
      account: { fingerprint, name: 'Lark app', appSecret: sentinel, token: sentinel },
      connected: true,
      capabilities: [],
      credentials: { appSecret: sentinel },
    }),
    sendChecked: async () => undefined,
    listTargets: async () => [],
  } as unknown as DshImOutboundService;
  const accounts = await createDshImProvider(service)!.accounts();
  expect(accounts).toHaveLength(1);
  expect(accounts[0]).toMatchObject({ ref: 'bot-1', fingerprint, name: 'Lark app' });
  expect(JSON.stringify(accounts)).not.toContain(sentinel);
});

it('gives the Messaging tables no column that could hold a credential', () => {
  const owner = mountOperationalDatabase({
    dshHome: createTempRoot('botharness-im-columns-'),
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const db = new DatabaseSync(owner.databasePath, { readOnly: true });
  try {
    const columns = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'messaging_%'")
        .all() as { name: string }[]
    ).flatMap(({ name }) =>
      (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map(
        (column) => `${name}.${column.name}`,
      ),
    );
    expect(columns.length).toBeGreaterThan(20);
    expect(columns.filter((column) => /secret|token|password|credential/i.test(column))).toEqual(
      [],
    );
  } finally {
    db.close();
  }
});
