import { useRouter } from 'expo-router';
import { useCallback, useRef, useSyncExternalStore } from 'react';

import { readCallReadiness } from '../../../../../packages/core/src/voice/call-client';
import { VOICE_CALL_PATH } from '../../../../../packages/core/src/voice/call-contract';
import type { HostClient } from '../../host/client';
import { callMediaSupported } from '../../host/call-media';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { callConfigured, readinessMessage } from './call-model';
import { callSessions, sameCall } from './call-session';

type Readiness = Awaited<ReturnType<typeof readCallReadiness>>;

const configured = new Map<string, boolean>();
const listeners = new Set<() => void>();
const pendingReads = new Map<string, number>();
let reads = 0;

function publish(key: string, value: boolean) {
  if (configured.get(key) === value) return;
  configured.set(key, value);
  for (const listener of listeners) listener();
}

function readiness(client: HostClient, slug: string): Promise<Readiness> {
  return readCallReadiness(
    async (body) =>
      (await client.api(VOICE_CALL_PATH, { body })).body as Awaited<
        ReturnType<Parameters<typeof readCallReadiness>[0]>
      >,
    slug,
  );
}

export function useBotCall(
  client: HostClient | undefined,
  slug: string | undefined,
  hostId: string | undefined,
  connected: boolean,
  focused: boolean,
): (() => void) | undefined {
  const t = useStrings();
  const router = useRouter();
  const pending = useRef(false);
  const key = `${hostId ?? ''}\u0000${slug ?? ''}`;
  const enabled = callMediaSupported && client !== undefined && slug !== undefined;
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      const read = ++reads;
      if (enabled && connected && focused) {
        pendingReads.set(key, read);
        readiness(client, slug).then(
          (result) => {
            if (pendingReads.get(key) === read) publish(key, callConfigured(result));
          },
          () => undefined,
        );
      }
      return () => {
        listeners.delete(listener);
        if (pendingReads.get(key) === read) pendingReads.delete(key);
      };
    },
    [enabled, client, slug, key, connected, focused],
  );
  const shown = useSyncExternalStore(subscribe, () => configured.get(key) ?? false);
  const call = useCallback(() => {
    if (client === undefined || slug === undefined || pending.current) return;
    const running = callSessions.getSnapshot();
    if (running !== undefined && sameCall(running.request, { slug, hostId })) {
      router.push({
        pathname: '/call/[slug]',
        params: { slug, ...(hostId === undefined ? {} : { hostId }) },
      });
      return;
    }
    pending.current = true;
    void (async () => {
      try {
        const result = await readiness(client, slug);
        const problem = readinessMessage(t, result);
        if (problem !== undefined) {
          showAppDialog(t.call.unavailableTitle, problem, [{ text: t.call.close }]);
          return;
        }
        router.push({
          pathname: '/call/[slug]',
          params: { slug, ...(hostId === undefined ? {} : { hostId }) },
        });
      } catch (error) {
        showAppDialog(t.call.unavailableTitle, error instanceof Error ? error.message : undefined, [
          { text: t.call.close },
        ]);
      } finally {
        pending.current = false;
      }
    })();
  }, [client, slug, hostId, router, t]);
  return enabled && shown ? call : undefined;
}
