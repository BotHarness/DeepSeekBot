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

export function watchFullClientLanding(
  store: Pick<ClientStore, 'subscribe' | 'getSnapshot'>,
  locator: { kind: 'home' } | { kind: 'dm'; slug: string },
  land: (slug: string | undefined) => void,
): () => void {
  let landed = false;
  const navigate = (): void => {
    const snapshot = store.getSnapshot();
    if (landed || snapshot.status !== 'ready') return;
    landed = true;
    unsubscribe();
    land(
      locator.kind === 'dm' && snapshot.bots.some((bot) => bot.slug === locator.slug)
        ? locator.slug
        : undefined,
    );
  };
  const unsubscribe = store.subscribe(navigate);
  navigate();
  return unsubscribe;
}
