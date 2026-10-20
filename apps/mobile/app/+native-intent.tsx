import * as SecureStore from 'expo-secure-store';
import { cloudAvailable } from '../src/cloud/available';
import { cloudNativeIntent } from '../src/cloud/native-intent';
import { parseInvitationLink } from '../src/cloud/invitation-link';
import { isSharePath } from '../src/ui/share/share-path';
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (isSharePath(path)) return '/share';
  const destination = cloudNativeIntent(path);
  if (!cloudAvailable && destination.startsWith('/cloud-')) return '/';
  if (destination.startsWith('/cloud-join?link=')) {
    try {
      const link = new URL(destination, 'https://native.invalid').searchParams.get('link')!;
      parseInvitationLink(link);
      await SecureStore.setItemAsync('tob.cloud.pending-join.v1', link);
    } catch {}
    return destination;
  }
  if (destination !== '/cloud-services') return destination;
  try {
    const pending = await SecureStore.getItemAsync('tob.cloud.pending-join.v1');
    if (pending) {
      parseInvitationLink(pending);
      return '/cloud-join';
    }
  } catch {}
  return destination;
}
