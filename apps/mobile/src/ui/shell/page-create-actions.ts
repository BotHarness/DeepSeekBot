import { savedHostIdentity, type SavedHost } from '@botharness/host-client/hosts';

export function canCreateNativeSession(host: SavedHost | null | undefined): boolean {
  return host != null && savedHostIdentity(host).kind === 'owner';
}

export function tabCreateAction(route: string | undefined): 'chats' | undefined {
  if (route === '(home)') return 'chats';
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
