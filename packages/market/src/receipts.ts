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

export function createReceipts(deps: { db: D1Database; now: () => Date }): Receipts {
  const { db } = deps;
  return {
    async record(botId, hostId) {
      const listed = await db
        .prepare(
          "SELECT installs FROM indexed_repositories WHERE node_id = ? AND visibility = 'listed'",
        )
        .bind(botId)
        .first<{ installs: number }>();
      if (listed === null) return { ok: false };
      const claimed = await db
        .prepare(
          'INSERT INTO install_receipts (bot_id, host_hash, created_at) VALUES (?, ?, ?) ON CONFLICT (bot_id, host_hash) DO NOTHING RETURNING bot_id',
        )
        .bind(botId, await sha256Hex(hostId), deps.now().getTime())
        .first<{ bot_id: string }>();
      if (claimed === null) return { ok: true, counted: false, installs: listed.installs };
      const updated = await db
        .prepare(
          'UPDATE indexed_repositories SET installs = installs + 1 WHERE node_id = ? RETURNING installs',
        )
        .bind(botId)
        .first<{ installs: number }>();
      return { ok: true, counted: true, installs: updated?.installs ?? listed.installs + 1 };
    },
  };
}
