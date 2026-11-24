import { savedHostIdentity, type SavedHost } from '@botharness/host-client/hosts';

export function canCreateNativeSession(host: SavedHost | null | undefined): boolean {
  return host != null && savedHostIdentity(host).kind === 'owner';
}
