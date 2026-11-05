import type { CachedChanges } from './conversation';
import { applyStoredChanges } from './local-conversation-cache';
import type { LocalStore } from './local-store';

type ChangePage = { reset: true } | (CachedChanges & { reset?: never; hasMore: boolean });

export interface CatchUpOptions {
  store(hostId: string): Promise<LocalStore>;
  concurrency?: number;
  maxPages?: number;
  constrained?(): Promise<boolean>;
}

export interface CatchUpHost {
  hostId: string;
  call(method: string, args: Record<string, unknown>): Promise<unknown>;
  liveKeys(): readonly string[];
}

export function createCatchUp(options: CatchUpOptions) {
  const concurrency = options.concurrency ?? 2;
  const maxPages = options.maxPages ?? 20;
  const running = new Map<string, Promise<void>>();
  const queued = new Map<string, CatchUpHost>();

  const pull = async (db: LocalStore, host: CatchUpHost, channelId: string) => {
    for (let page = 0; page < maxPages; page += 1) {
      const cursor = await db.get<{ epoch: string; seq: number }>(
        'select epoch, seq from cursors where channel_id = ?',
        [channelId],
      );
      if (cursor === undefined) return;
      const pulled = (await host.call('channelChanges', {
        channelId,
        sinceSeq: cursor.seq,
        epoch: cursor.epoch,
      })) as ChangePage;
      if (pulled.reset) return;
      await db.write((tx) => applyStoredChanges(tx, channelId, pulled));
      if (!pulled.hasMore) return;
    }
  };

  const constrained = () => options.constrained?.().catch(() => false) ?? Promise.resolve(false);

  const run = async (host: CatchUpHost) => {
    if (await constrained()) return;
    const db = await options.store(host.hostId);
    const live = new Set(host.liveKeys());
    const rows = await db.all<{ channel_id: string; live: number }>(
      `select cursors.channel_id,
         exists (select 1 from conversation_keys
           where conversation_keys.channel_id = cursors.channel_id
             and conversation_keys.key in (select value from json_each(?))) as live
       from cursors`,
      [JSON.stringify([...live])],
    );
    const queue = rows.filter((row) => row.live === 0).map((row) => row.channel_id);
    const worker = async () => {
      for (let channelId = queue.shift(); channelId !== undefined; channelId = queue.shift()) {
        if (await constrained()) {
          queue.length = 0;
          return;
        }
        await pull(db, host, channelId).catch(() => undefined);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  };

  const sync = (host: CatchUpHost): Promise<void> => {
    const existing = running.get(host.hostId);
    if (existing !== undefined) {
      queued.set(host.hostId, host);
      return existing.then(() => running.get(host.hostId));
    }
    const task = run(host)
      .catch(() => undefined)
      .finally(() => {
        running.delete(host.hostId);
        const next = queued.get(host.hostId);
        queued.delete(host.hostId);
        if (next !== undefined) void sync(next);
      });
    running.set(host.hostId, task);
    return task;
  };

  return { sync };
}
