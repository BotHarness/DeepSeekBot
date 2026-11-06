import { parsePushData } from './push';

export type PushResolved = { hostId: string; itemIds: readonly string[] };

const MAX_RESOLVED = 50;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function json(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return record(value);
  try {
    return record(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function payloadOf(input: unknown): Record<string, unknown> | undefined {
  const outer = record(input);
  const data = record(outer?.['data']) ?? outer;
  if (data === undefined) return undefined;
  return json(data['dataString']) ?? json(data['body']) ?? data;
}

export function parsePushResolved(input: unknown): PushResolved | undefined {
  const payload = payloadOf(input);
  const target = parsePushData(payload);
  const resolved = payload?.['resolved'];
  if (target === undefined || !Array.isArray(resolved)) return undefined;
  const itemIds = resolved
    .filter((id): id is string => typeof id === 'string' && id !== '')
    .slice(0, MAX_RESOLVED);
  return itemIds.length === 0 ? undefined : { hostId: target.hostId, itemIds };
}

export function parsePushBadge(input: unknown): number | undefined {
  const payload = payloadOf(input);
  const badge = payload?.['badge'];
  return parsePushData(payload) !== undefined &&
    typeof badge === 'number' &&
    Number.isInteger(badge) &&
    badge >= 0
    ? badge
    : undefined;
}

export async function dismissResolved(
  port: {
    presented(): Promise<Array<{ id: string; data: unknown }>>;
    dismiss(id: string): Promise<void>;
  },
  resolved: PushResolved,
): Promise<number> {
  const ids = new Set(resolved.itemIds);
  const shown = await port.presented();
  const matches = shown.filter(({ data }) => {
    const target = parsePushData(data);
    return (
      target?.hostId === resolved.hostId && target.itemId !== undefined && ids.has(target.itemId)
    );
  });
  await Promise.all(matches.map(({ id }) => port.dismiss(id).catch(() => undefined)));
  return matches.length;
}
