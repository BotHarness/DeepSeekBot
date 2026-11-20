export function singleLineBubble(height: number, paddingY: number, lineHeight: number): boolean {
  return height > 0 && height <= paddingY + lineHeight * 1.5;
}

function lineHeightOf(element: Element): number {
  const style = getComputedStyle(element);
  const line = Number.parseFloat(style.lineHeight);
  return Number.isFinite(line) ? line : Number.parseFloat(style.fontSize) * 1.2;
}

function singleLine(bubble: HTMLElement, height: number): boolean {
  const body = bubble.querySelector('.bh-bubble-body');
  if (body === null) return false;
  const style = getComputedStyle(bubble);
  return singleLineBubble(
    height,
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
    lineHeightOf(body),
  );
}

let shared: ResizeObserver | undefined;

function observer(): ResizeObserver {
  shared ??= new ResizeObserver((entries) => {
    const results: [HTMLElement, boolean][] = [];
    for (const entry of entries) {
      const bubble = entry.target as HTMLElement;
      if (!bubble.isConnected) continue;
      results.push([bubble, singleLine(bubble, bubble.clientHeight)]);
    }
    for (const [bubble, single] of results) {
      if (single === bubble.hasAttribute('data-single-line')) continue;
      if (single) bubble.dataset['singleLine'] = '';
      else delete bubble.dataset['singleLine'];
    }
  });
  return shared;
}

export function observeSingleLineBubble(wrap: HTMLElement): (() => void) | undefined {
  const bubble = wrap.querySelector<HTMLElement>('.bh-bubble');
  if (bubble === null || typeof ResizeObserver !== 'function') return;
  const resize = observer();
  resize.observe(bubble);
  return () => resize.unobserve(bubble);
}
