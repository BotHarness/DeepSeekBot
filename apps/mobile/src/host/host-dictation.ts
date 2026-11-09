import type {
  VoiceDictationPort,
  VoiceDictationReadiness,
  VoiceDictationView,
} from '../../../../packages/core/src/voice/dictation-client';
import type { HostClient } from './client';

const READINESS_TIMEOUT_MS = 2_500;
const READINESS_TTL_MS = 60_000;

type Answer = { readiness?: VoiceDictationReadiness; dictation?: VoiceDictationView };

function view(answer: Answer): VoiceDictationView {
  const dictation = answer.dictation;
  if (typeof dictation?.id !== 'string' || typeof dictation.text !== 'string')
    throw new Error('invalid voiceDictation response');
  return dictation;
}

export function createHostDictationPort(
  client: HostClient,
  slug: string | undefined,
): VoiceDictationPort {
  const scope = slug === undefined ? {} : { slug };
  const call = (args: Record<string, unknown>) => client.call<Answer>('voiceDictation', args);
  return {
    async readiness() {
      const readiness = (await call({ kind: 'readiness', ...scope })).readiness;
      if (typeof readiness?.ready !== 'boolean') throw new Error('invalid voiceDictation response');
      return readiness;
    },
    open: async () => view(await call({ kind: 'open', ...scope })),
    push: async (id, pcm) => view(await call({ kind: 'push', id, pcm })),
    stop: async (id) => view(await call({ kind: 'stop', id })),
    cancel: async (id) => view(await call({ kind: 'cancel', id })),
  };
}

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
  const ask = createHostDictationPort(client, slug)
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
