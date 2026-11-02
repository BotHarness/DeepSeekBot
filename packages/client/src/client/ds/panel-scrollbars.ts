export const PANEL_SCROLLBAR_IDLE_MS = 800;
export const PANEL_SCROLLBAR_FADE_MS = 200;
const opacityProperty = '--bh-panel-scrollbar-opacity';

export function mountPanelScrollbars(root: HTMLElement): () => void {
  const active = new Map<HTMLElement, { show(): void; finish(): void }>();
  root.setAttribute('data-panel-scrollbars', '');
  const onScroll = (event: Event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement) || !root.contains(node)) return;
    const activity = active.get(node);
    if (activity !== undefined) {
      activity.show();
      return;
    }
    if (node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth) return;
    const previous = node.style.getPropertyValue(opacityProperty);
    const priority = node.style.getPropertyPriority(opacityProperty);
    let frame: number | undefined;
    let timer: number | undefined;
    const finish = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (previous) node.style.setProperty(opacityProperty, previous, priority);
      else node.style.removeProperty(opacityProperty);
      active.delete(node);
    };
    const hide = () => {
      if (root.ownerDocument.documentElement.dataset['botharnessMotion'] === 'reduce') {
        finish();
        return;
      }
      const started = performance.now();
      const fade = (now: number) => {
        const opacity = Math.max(0, 1 - (now - started) / PANEL_SCROLLBAR_FADE_MS);
        if (!opacity || !root.contains(node)) {
          finish();
          return;
        }
        node.style.setProperty(opacityProperty, String(opacity));
        frame = window.requestAnimationFrame(fade);
      };
      frame = window.requestAnimationFrame(fade);
    };
    const show = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      if (node.style.getPropertyValue(opacityProperty) !== '1')
        node.style.setProperty(opacityProperty, '1');
      timer = window.setTimeout(hide, PANEL_SCROLLBAR_IDLE_MS);
    };
    active.set(node, { show, finish });
    show();
  };
  root.addEventListener('scroll', onScroll, true);
  return () => {
    root.removeEventListener('scroll', onScroll, true);
    for (const activity of active.values()) activity.finish();
    root.removeAttribute('data-panel-scrollbars');
  };
}

export const PANEL_SCROLLBAR_CSS = `
[data-panel-scrollbars], [data-panel-scrollbars] * { --bh-panel-scrollbar-opacity:0; }
[data-panel-scrollbars]::-webkit-scrollbar-thumb,
[data-panel-scrollbars] *::-webkit-scrollbar-thumb { background-color:color-mix(in srgb, var(--dsh-scrollbar-thumb) calc(var(--bh-panel-scrollbar-opacity) * 100%), transparent); }
[data-panel-scrollbars]::-webkit-scrollbar-thumb:hover,
[data-panel-scrollbars] *::-webkit-scrollbar-thumb:hover { background-color:color-mix(in srgb, var(--dsh-scrollbar-thumb-hover) calc(var(--bh-panel-scrollbar-opacity) * 100%), transparent); }
[data-panel-scrollbars]::-webkit-scrollbar-thumb:active,
[data-panel-scrollbars] *::-webkit-scrollbar-thumb:active { background-color:var(--dsh-scrollbar-thumb-hover); }
@supports not selector(::-webkit-scrollbar) {
  [data-panel-scrollbars], [data-panel-scrollbars] * { scrollbar-color:color-mix(in srgb, var(--dsh-scrollbar-thumb) calc(var(--bh-panel-scrollbar-opacity) * 100%), transparent) transparent; }
}
`;
