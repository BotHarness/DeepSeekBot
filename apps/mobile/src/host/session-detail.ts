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
    .filter((row) => row.role === 'orchestrator')
    .map(({ sessionId, createdAt, displayTitle, currentOrchestrator }) => ({
      id: sessionId,
      createdAt,
      title: displayTitle ?? sessionId,
      current: currentOrchestrator,
    }))
    .sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        right.createdAt.localeCompare(left.createdAt),
    );
}

export type ProfileOrchestrator = Awaited<ReturnType<typeof orchestratorSessions>>[number];
