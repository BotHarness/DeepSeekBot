import type { ChannelMessage } from './store.js';

const SEND_FLY_MS = 360;
const LATEST_SLOP = 80;

export interface SendFlight {
  from: DOMRectReadOnly;
  known: ReadonlySet<string>;
}

export function shouldFly({
  atLatest,
  reducedMotion,
}: {
  atLatest: boolean;
  reducedMotion: boolean;
}): boolean {
  return atLatest && !reducedMotion;
}

export function sendFollowsLatest(
  viewport: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'> | null,
  hasNewer: boolean,
): boolean {
  return (
    viewport !== null &&
    !hasNewer &&
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= LATEST_SLOP
  );
}

function pendingHumanIds(messages: readonly ChannelMessage[]): Set<string> {
  return new Set(
    messages
      .filter((message) => message.author.kind === 'human' && message.pending === true)
      .map((message) => message.id),
  );
}

function composerInput(viewport: HTMLElement): HTMLElement | undefined {
  for (let node = viewport.parentElement; node !== null; node = node.parentElement) {
    const input = node.querySelector<HTMLElement>('.bh-composer-input');
    if (input !== null) return input;
  }
  return undefined;
}

function textBox(element: HTMLElement): { left: number; bottom: number } {
  const box = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return {
    left: box.left + (Number.parseFloat(style?.paddingLeft ?? '') || 0),
    bottom: box.bottom - (Number.parseFloat(style?.paddingBottom ?? '') || 0),
  };
}

export function launchSendFlight(
  viewport: HTMLElement | null,
  hasNewer: boolean,
  messages: readonly ChannelMessage[],
): SendFlight | undefined {
  if (viewport === null) return undefined;
  const reducedMotion =
    viewport.ownerDocument.documentElement.dataset['botharnessMotion'] === 'reduce';
  if (!shouldFly({ atLatest: sendFollowsLatest(viewport, hasNewer), reducedMotion }))
    return undefined;
  const input = composerInput(viewport);
  if (input === undefined) return undefined;
  const text = textBox(input);
  const box = input.getBoundingClientRect();
  return {
    from: DOMRectReadOnly.fromRect({
      x: text.left,
      y: box.top,
      width: box.width,
      height: text.bottom - box.top,
    }),
    known: pendingHumanIds(messages),
  };
}

export function sentMessageId(
  flight: SendFlight,
  messages: readonly ChannelMessage[],
): string | undefined {
  return messages.findLast(
    (message) =>
      message.author.kind === 'human' && message.pending === true && !flight.known.has(message.id),
  )?.id;
}

export function flySentBubble(bubble: HTMLElement, from: DOMRectReadOnly): Animation | undefined {
  if (typeof bubble.animate !== 'function') return undefined;
  const to = textBox(bubble);
  const dx = Math.round(from.left - to.left);
  const dy = Math.round(from.bottom - to.bottom);
  if (dx === 0 && dy === 0) return undefined;
  for (const animation of bubble.closest('.bh-bubble-wrap')?.getAnimations?.() ?? [])
    animation.cancel();
  return bubble.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px)`,
        backgroundColor: 'transparent',
        boxShadow: 'none',
      },
      { transform: 'none' },
    ],
    { duration: SEND_FLY_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  );
}
