import { outsideTimeline } from './timeline-mutations.js';

export const BOT_NAV_MARKER = 'bh-bot-nav';

export const BOT_NAV_ICON_CLASS = 'bh-bot-nav-icon';

export function isBotNavLabel(text: string | null | undefined, labels: readonly string[]): boolean {
  const value = text?.trim();
  return value !== undefined && value !== '' && labels.includes(value);
}

function navLabelNode(button: Element): Element | undefined {
  const icon = button.querySelector(`:scope > .${BOT_NAV_ICON_CLASS}`);
  if (button.childElementCount - (icon === null ? 0 : 1) !== 2) return undefined;
  const spans = [...button.querySelectorAll(':scope > span')].filter((span) => span !== icon);
  return spans.length === 1 ? (spans[0] ?? undefined) : undefined;
}

export function findBotNavCell(doc: Document, labels: readonly string[]): HTMLElement | undefined {
  for (const button of doc.querySelectorAll('button')) {
    const label = navLabelNode(button);
    if (label === undefined || !isBotNavLabel(label.textContent, labels)) continue;
    return button as HTMLElement;
  }
  return undefined;
}

export interface BotNavIconOptions {
  readonly labels: () => readonly string[];
  readonly markup: () => string;
  readonly subscribe?: ((listener: () => void) => () => void) | undefined;
  readonly root?: Document | undefined;
}

export function installBotNavIcon(options: BotNavIconOptions): () => void {
  const doc = options.root ?? (typeof document === 'undefined' ? undefined : document);
  if (doc === undefined) return () => {};
  const touched = new Set<HTMLElement>();
  const renderedMarkup = new WeakMap<Element, string>();
  const hiddenGlyphs = new Map<HTMLElement, string>();
  let scheduled = false;

  const apply = (): void => {
    const labels = options.labels();
    const markup = options.markup();
    const cell = findBotNavCell(doc, labels);
    if (cell !== undefined) {
      const label = navLabelNode(cell);
      cell.classList.add(BOT_NAV_MARKER);
      touched.add(cell);
      for (const child of cell.children) {
        if (child === label || child.classList.contains(BOT_NAV_ICON_CLASS)) continue;
        const glyph = child as HTMLElement;
        if (!hiddenGlyphs.has(glyph)) hiddenGlyphs.set(glyph, glyph.style.display);
        glyph.style.display = 'none';
      }
      let box = cell.querySelector(`:scope > .${BOT_NAV_ICON_CLASS}`) as HTMLElement | null;
      if (box === null) {
        box = doc.createElement('span') as HTMLElement;
        box.className = BOT_NAV_ICON_CLASS;
        box.setAttribute('aria-hidden', 'true');
        cell.insertBefore(box, cell.firstChild);
      }
      box.style.cssText =
        'display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;';
      if (renderedMarkup.get(box) !== markup) {
        renderedMarkup.set(box, markup);
        box.innerHTML = markup;
        const media = box.firstElementChild as HTMLElement | null;
        if (media !== null) {
          media.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
        }
      }
    }
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    const run = (): void => {
      scheduled = false;
      apply();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else setTimeout(run, 0);
  };

  apply();

  const observer =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver((records) => {
          if (outsideTimeline(records)) schedule();
        });
  observer?.observe(doc.body, { childList: true, subtree: true });
  const unsubscribe = options.subscribe?.(schedule);

  return () => {
    observer?.disconnect();
    unsubscribe?.();
    for (const [glyph, display] of hiddenGlyphs) glyph.style.display = display;
    hiddenGlyphs.clear();
    for (const cell of touched) {
      cell.querySelector(`:scope > .${BOT_NAV_ICON_CLASS}`)?.remove();
      cell.classList.remove(BOT_NAV_MARKER);
    }
    touched.clear();
  };
}
