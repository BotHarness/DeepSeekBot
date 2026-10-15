import type { FullClientLanding } from '../../../core/src/credentials/web-locator.js';
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
  locator: FullClientLanding,
  land: (target: FullClientLanding) => void,
): () => void {
  let landed = false;
  const navigate = (): void => {
    const snapshot = store.getSnapshot();
    if (landed || snapshot.status !== 'ready') return;
    landed = true;
    unsubscribe();
    const exists =
      locator.kind === 'dm'
        ? snapshot.bots.some((bot) => bot.slug === locator.slug)
        : locator.kind === 'channel'
          ? snapshot.channels.some((channel) => channel.id === locator.channelId)
          : true;
    land(exists ? locator : { kind: 'home' });
  };
  const unsubscribe = store.subscribe(navigate);
  navigate();
  return unsubscribe;
}
