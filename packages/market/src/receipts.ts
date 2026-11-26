import { sha256Hex } from '../../core/src/marketplace/altcha.js';
import type { D1Database } from './d1.js';

const HOST_ID = /^[A-Za-z0-9_-]{22,128}$/u;

export function isMarketplaceHostId(value: unknown): value is string {
  return typeof value === 'string' && HOST_ID.test(value);
}

export type ReceiptResult = { ok: true; counted: boolean; installs: number } | { ok: false };

export interface Receipts {
  record(botId: string, hostId: string): Promise<ReceiptResult>;
}

interface ReceiptTables {
  listed: string;
  claim: string;
  increment: string;
}

const BOT_RECEIPTS: ReceiptTables = {
  listed: "SELECT installs FROM indexed_repositories WHERE node_id = ? AND visibility = 'listed'",
  claim:
    'INSERT INTO install_receipts (bot_id, host_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (bot_id, host_hash) DO NOTHING RETURNING bot_id',
  increment:
    'UPDATE indexed_repositories SET installs = installs + 1 WHERE node_id = ? RETURNING installs',
};

const SKILL_RECEIPTS: ReceiptTables = {
  listed: "SELECT installs FROM marketplace_skills WHERE id = ? AND visibility = 'listed'",
  claim:
    'INSERT INTO skill_install_receipts (skill_id, target_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (skill_id, target_hash) DO NOTHING RETURNING skill_id',
  increment:
    'UPDATE marketplace_skills SET installs = installs + 1 WHERE id = ? RETURNING installs',
};

async function claimInstall(
  db: D1Database,
  tables: ReceiptTables,
  id: string,
  receiptHash: string,
  now: Date,
): Promise<ReceiptResult> {
  const listed = await db.prepare(tables.listed).bind(id).first<{ installs: number }>();
  if (listed === null) return { ok: false };
  const claimed = await db
    .prepare(tables.claim)
    .bind(id, receiptHash, now.getTime())
    .first<Record<string, unknown>>();
  if (claimed === null) return { ok: true, counted: false, installs: listed.installs };
  const updated = await db.prepare(tables.increment).bind(id).first<{ installs: number }>();
  return { ok: true, counted: true, installs: updated?.installs ?? listed.installs + 1 };
}

export function createReceipts(deps: { db: D1Database; now: () => Date }): Receipts {
  return {
    async record(botId, hostId) {
      return claimInstall(deps.db, BOT_RECEIPTS, botId, await sha256Hex(hostId), deps.now());
    },
  };
}

export function recordSkillInstall(
  deps: { db: D1Database; now: () => Date },
  skillId: string,
  targetHash: string,
): Promise<ReceiptResult> {
  return claimInstall(deps.db, SKILL_RECEIPTS, skillId, targetHash, deps.now());
}
