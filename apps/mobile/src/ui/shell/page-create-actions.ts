import { router } from 'expo-router';
import { savedHostIdentity, type SavedHost } from '@botharness/host-client/hosts';

export function canCreateNativeSession(host: SavedHost | null | undefined): boolean {
  return host != null && savedHostIdentity(host).kind === 'owner';
}

export function tabCreateAction(
  route: string | undefined,
  sessionsEnabled: boolean,
  host: SavedHost | null | undefined,
): 'chats' | 'session' | undefined {
  if (route === '(home)') return 'chats';
  if (route === '(sessions)' && sessionsEnabled && canCreateNativeSession(host)) return 'session';
}

export function tabStackRoot(route: object | undefined): boolean {
  const stack = route !== undefined && 'state' in route ? route.state : undefined;
  return (
    typeof stack !== 'object' ||
    stack === null ||
    !('index' in stack) ||
    stack.index === undefined ||
    stack.index === 0
  );
}

export function openNewSession(): void {
  router.push('/create-session');
}
