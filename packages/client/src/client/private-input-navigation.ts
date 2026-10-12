import type { ClientStore } from './store.js';

export function watchPrivateInputNavigation(
  store: Pick<ClientStore, 'subscribe' | 'getSnapshot'>,
  locator: { channelId: string; messageId: string },
  open: (channelId: string, messageId: string) => void,
): () => void {
  let opened = false;
  const navigate = (): void => {
    const snapshot = store.getSnapshot();
    if (
      opened ||
      snapshot.status !== 'ready' ||
      !snapshot.channels.some((channel) => channel.id === locator.channelId)
    )
      return;
    opened = true;
    unsubscribe();
    open(locator.channelId, locator.messageId);
  };
  const unsubscribe = store.subscribe(navigate);
  navigate();
  return unsubscribe;
}
