export type CursorChanges<Cursor, Delta> = { reset: true; cursor?: Cursor } | Delta;

export async function syncByCursor<Stored, Cursor, Delta, Full>(steps: {
  stored(): Promise<{ value: Stored; cursor?: Cursor } | undefined>;
  changes(cursor: Cursor): Promise<CursorChanges<Cursor, Delta> | undefined>;
  apply(delta: Delta): Promise<Stored>;
  start(): Promise<Cursor | undefined>;
  full(): Promise<Full>;
  replace(full: Full, cursor: Cursor | undefined): Promise<Stored>;
}): Promise<Stored> {
  const stored = await steps.stored();
  if (stored?.cursor !== undefined) {
    const changes = await steps.changes(stored.cursor);
    if (changes !== undefined && !isReset(changes)) return steps.apply(changes);
  }
  const cursor = await steps.start();
  return steps.replace(await steps.full(), cursor);
}

function isReset<Cursor, Delta>(
  changes: CursorChanges<Cursor, Delta>,
): changes is { reset: true; cursor?: Cursor } {
  return (changes as { reset?: unknown }).reset === true;
}
