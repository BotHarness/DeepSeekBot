/** Same rule as the mobile bubble: one line of text plus padding, with room for emoji ascent. */
export function singleLineBubble(height: number, paddingY: number, lineHeight: number): boolean {
  return height > 0 && height <= paddingY + lineHeight * 1.5;
}

function lineHeightOf(element: Element): number {
  const style = getComputedStyle(element);
  const line = Number.parseFloat(style.lineHeight);
  return Number.isFinite(line) ? line : Number.parseFloat(style.fontSize) * 1.2;
}

function measure(bubble: HTMLElement): void {
  const body = bubble.querySelector('.bh-bubble-body');
  const style = getComputedStyle(bubble);
  const single =
    body !== null &&
    singleLineBubble(
      bubble.clientHeight,
      Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      lineHeightOf(body),
    );
  if (single) {
    bubble.dataset['singleLine'] = '';
    // A half-height radius, not 999px: the tail corner beside it must not be scaled away.
    bubble.style.setProperty('--bh-bubble-pill', `${bubble.offsetHeight / 2}px`);
  } else {
    delete bubble.dataset['singleLine'];
    bubble.style.removeProperty('--bh-bubble-pill');
  }
}

/**
 * Marks the text bubble inside a message wrap with `data-single-line` while it
 * fits on one line, so CSS can make a lone one a pill while grouped ones keep
 * the multi-line corners.
 */
export function observeSingleLineBubble(wrap: HTMLElement): (() => void) | undefined {
  const bubble = wrap.querySelector<HTMLElement>('.bh-bubble');
  if (bubble === null) return;
  measure(bubble);
  if (typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver(() => measure(bubble));
  observer.observe(bubble);
  return () => observer.disconnect();
}
