import { router } from 'expo-router';
import { savedHostIdentity, type SavedHost } from '@botharness/host-client/hosts';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';

export function canCreateNativeSession(host: SavedHost | null | undefined): boolean {
  return host != null && savedHostIdentity(host).kind === 'owner';
}

export function openNewSession(): void {
  router.push('/create-session');
}

export function sessionHref(row: HostSessionRow, hostId: string) {
  return {
    pathname: '/session/[id]' as const,
    params: {
      id: row.sessionId,
      hostId,
      ...(row.source.kind === 'native' ? { source: 'native' } : { slug: row.source.botSlug }),
      ...(row.title === undefined ? {} : { title: row.title }),
    },
  };
}
