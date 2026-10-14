import type { ChannelMessage } from './store.js';

export function unreadAfterAnchor(
  messages: readonly ChannelMessage[],
  anchor: string | undefined,
  hasNewer: boolean,
): string | undefined {
  if (anchor === undefined) return undefined;
  const index = messages.findIndex((message) => message.id === anchor);
  if (index === -1) return undefined;
  if (hasNewer) return anchor;
  return messages
    .slice(index + 1)
    .some(
      (message) =>
        message.author.kind !== 'human' &&
        message.pending !== true &&
        message.streaming !== true &&
        message.failed === undefined,
    )
    ? anchor
    : undefined;
}

export interface TimelineScroll {
  messageId: string;
  offset: number;
  atLatest: boolean;
}

const MAX_REMEMBERED = 50;
const remembered = new Map<string, TimelineScroll>();

export function rememberTimelineScroll(channelId: string, scroll: TimelineScroll): void {
  remembered.delete(channelId);
  remembered.set(channelId, scroll);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

export function rememberedTimelineScroll(channelId: string): TimelineScroll | undefined {
  return remembered.get(channelId);
}

export function forgetTimelineScrolls(): void {
  remembered.clear();
}

export function timelineScrollAnchor(
  viewport: HTMLElement,
  atLatest: boolean,
): TimelineScroll | undefined {
  const top = viewport.getBoundingClientRect().top;
  for (const candidate of viewport.querySelectorAll<HTMLElement>('[data-message-id]')) {
    const bounds = candidate.getBoundingClientRect();
    if (bounds.bottom <= top) continue;
    const messageId = candidate.dataset['messageId'];
    if (messageId === undefined) continue;
    return { messageId, offset: bounds.top - top, atLatest };
  }
  return undefined;
}

export function restoreTimelineScroll(viewport: HTMLElement, scroll: TimelineScroll): boolean {
  const target = Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(
    (candidate) => candidate.dataset['messageId'] === scroll.messageId,
  );
  if (target === undefined) return false;
  const top = viewport.getBoundingClientRect().top;
  viewport.scrollTop += target.getBoundingClientRect().top - top - scroll.offset;
  return true;
}
