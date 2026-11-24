import { router } from 'expo-router';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { closeSessionDrawer } from './session-drawer-state';

export function openDrawerSession(
  hostId: string,
  row: Pick<HostSessionRow, 'sessionId' | 'source' | 'title'>,
): void {
  closeSessionDrawer();
  router.replace({
    pathname: '/session/[id]',
    params: {
      id: row.sessionId,
      hostId,
      ...(row.source.kind === 'native' ? { source: 'native' } : { slug: row.source.botSlug }),
      ...(row.title === undefined ? {} : { title: row.title }),
    },
  });
}

export function openNewSession(): void {
  closeSessionDrawer();
  router.replace('/sessions');
}
