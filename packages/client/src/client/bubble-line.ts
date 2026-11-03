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
    bubble.style.setProperty('--bh-bubble-pill', `${bubble.offsetHeight / 2}px`);
  } else {
    delete bubble.dataset['singleLine'];
    bubble.style.removeProperty('--bh-bubble-pill');
  }
}

export function observeSingleLineBubble(wrap: HTMLElement): (() => void) | undefined {
  const bubble = wrap.querySelector<HTMLElement>('.bh-bubble');
  if (bubble === null) return;
  measure(bubble);
  if (typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver(() => measure(bubble));
  observer.observe(bubble);
  return () => observer.disconnect();
}
