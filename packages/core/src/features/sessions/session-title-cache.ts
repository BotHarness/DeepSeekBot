export type SessionTitleReader = (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;

export type SessionTitleVersion = { sessionId: string; updatedAt: number };

type Known = { updatedAt: number; title: string | undefined };

export const SESSION_TITLE_WAIT_MS = 2_000;
export const SESSION_TITLE_BATCH = 16;

export function createSessionTitleCache(
  read: SessionTitleReader,
  {
    waitMs = SESSION_TITLE_WAIT_MS,
    batch = SESSION_TITLE_BATCH,
    onTitled,
  }: { waitMs?: number; batch?: number; onTitled?: (sessionIds: string[]) => void } = {},
) {
  const known = new Map<string, Known>();
  const queued = new Map<string, number>();
  let drain: Promise<void> | undefined;

  async function readQueued() {
    while (queued.size > 0) {
      const chunk = [...queued].slice(0, batch);
      const titles = await read(chunk.map(([id]) => id)).catch(() => undefined);
      const titled: string[] = [];
      for (const [id, updatedAt] of chunk) {
        if (queued.get(id) === updatedAt) queued.delete(id);
        if (titles === undefined) continue;
        const current = known.get(id);
        if (current !== undefined && current.updatedAt > updatedAt) continue;
        const title = titles.get(id);
        if (title !== undefined && title !== current?.title) titled.push(id);
        known.set(id, { updatedAt, title });
      }
      if (titled.length > 0) onTitled?.(titled);
    }
  }

  function settled(rows: readonly SessionTitleVersion[]) {
    return rows.every((row) => known.get(row.sessionId)?.updatedAt === row.updatedAt);
  }

  return async function titles(
    rows: readonly SessionTitleVersion[],
  ): Promise<ReadonlyMap<string, string>> {
    for (const row of rows)
      if (
        known.get(row.sessionId)?.updatedAt !== row.updatedAt &&
        queued.get(row.sessionId) !== row.updatedAt
      )
        queued.set(row.sessionId, row.updatedAt);
    drain ??= readQueued().finally(() => {
      drain = undefined;
    });
    if (!settled(rows)) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        (async () => {
          while (!settled(rows) && drain !== undefined) await drain;
        })(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, waitMs);
        }),
      ]);
      clearTimeout(timer);
    }
    const result = new Map<string, string>();
    for (const row of rows) {
      const title = known.get(row.sessionId)?.title;
      if (title !== undefined) result.set(row.sessionId, title);
    }
    return result;
  };
}

export type SessionTitleCache = ReturnType<typeof createSessionTitleCache>;
