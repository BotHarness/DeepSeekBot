import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { readCallReadiness } from '../../../../../packages/core/src/voice/call-client';
import { VOICE_CALL_PATH } from '../../../../../packages/core/src/voice/call-contract';
import type { HostClient } from '../../host/client';
import { callMediaSupported } from '../../host/call-media';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { readinessMessage } from './call-model';
import { callSessions, sameCall } from './call-session';

export function useBotCall(
  client: HostClient | undefined,
  slug: string | undefined,
  hostId: string | undefined,
): (() => void) | undefined {
  const t = useStrings();
  const router = useRouter();
  const pending = useRef(false);
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
        const readiness = await readCallReadiness(
          async (body) =>
            (await client.api(VOICE_CALL_PATH, { body })).body as Awaited<
              ReturnType<Parameters<typeof readCallReadiness>[0]>
            >,
          slug,
        );
        const problem = readinessMessage(t, readiness);
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
  return callMediaSupported && client !== undefined && slug !== undefined ? call : undefined;
}
