import { createVoiceDictationPort } from '../../../../packages/core/src/voice/dictation-client';
import type { HostClient } from './client';

const READINESS_TIMEOUT_MS = 2_500;
const READINESS_TTL_MS = 60_000;

const known = new WeakMap<HostClient, Map<string, { ready: boolean; at: number }>>();

export async function hostDictationReady(
  client: HostClient | undefined,
  slug: string | undefined,
  now: () => number = Date.now,
): Promise<boolean> {
  if (client === undefined || client.getSnapshot().connection.status !== 'connected') return false;
  const entries = known.get(client) ?? new Map<string, { ready: boolean; at: number }>();
  known.set(client, entries);
  const key = slug ?? '';
  const ask = createVoiceDictationPort((method, args) => client.call(method, args), { slug })
    .readiness()
    .then(({ ready }) => {
      entries.set(key, { ready, at: now() });
      return ready;
    });
  const cached = entries.get(key);
  if (cached !== undefined && now() - cached.at < READINESS_TTL_MS) {
    ask.catch(() => undefined);
    return cached.ready;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([ask.catch(() => false), late]);
  } finally {
    clearTimeout(timer);
  }
}
