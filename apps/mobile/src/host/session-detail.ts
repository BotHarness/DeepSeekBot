import type { HostClient } from '@botharness/host-client/client';
import type { HostCall } from '@botharness/host-client/host-answer';
import { ownedSessions } from '@botharness/host-client/session-model';

export function sessionReadHost(client: Pick<HostClient, 'call'>, signal: AbortSignal): HostCall {
  return {
    call: (method, args) => client.call(method, args, { signal, timeoutMs: 20_000 }),
  };
}

export async function orchestratorSessions(host: HostCall, slug: string) {
  const sessions = await ownedSessions(host, slug, true);
  return sessions
    .flatMap((row) => {
      const id = row['sessionId'];
      const createdAt = row['createdAt'];
      const displayTitle = row['displayTitle'];
      return row['role'] === 'orchestrator' &&
        typeof id === 'string' &&
        id !== '' &&
        typeof createdAt === 'string' &&
        Number.isFinite(Date.parse(createdAt))
        ? [
            {
              id,
              title:
                typeof displayTitle === 'string' && displayTitle.trim() !== '' ? displayTitle : id,
              createdAt,
              current: row['currentOrchestrator'] === true,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        right.createdAt.localeCompare(left.createdAt),
    );
}

export type ProfileOrchestrator = Awaited<ReturnType<typeof orchestratorSessions>>[number];
