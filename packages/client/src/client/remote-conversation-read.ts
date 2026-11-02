import { createReadMarker, readTarget } from '../../../../apps/mobile/src/ui/chat/mark-read.js';
import { shownInChat, type Conversation } from '../../../../apps/mobile/src/host/conversation.js';

export function observeRemoteRead(
  node: HTMLElement,
  conversation: Pick<Conversation, 'subscribe' | 'getSnapshot'>,
  mark: (messageId: string) => Promise<void>,
): () => void {
  const marker = createReadMarker((_channelId, messageId) => mark(messageId));
  const document = node.ownerDocument;
  const offer = (): void => {
    const current = conversation.getSnapshot();
    if (
      document.visibilityState === 'hidden' ||
      node.getClientRects().length === 0 ||
      Math.abs(node.scrollTop) > 24 ||
      current.status !== 'live' ||
      current.fromCache
    ) {
      marker.stop();
      return;
    }
    marker.offer('conversation', readTarget(current.messages.filter(shownInChat)));
  };
  const release = conversation.subscribe(offer);
  const resize = new ResizeObserver(offer);
  resize.observe(node);
  node.addEventListener('scroll', offer);
  document.addEventListener('visibilitychange', offer);
  offer();
  return () => {
    release();
    resize.disconnect();
    marker.stop();
    node.removeEventListener('scroll', offer);
    document.removeEventListener('visibilitychange', offer);
  };
}
