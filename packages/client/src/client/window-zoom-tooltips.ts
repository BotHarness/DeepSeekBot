import { space } from './ds/tokens.stylex.js';

interface TooltipPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  side: string | undefined;
  align: string | undefined;
}

export function tooltipViewportPosition(
  placement: TooltipPlacement,
  viewport: { width: number; height: number; top: number },
): { x: number; y: number } {
  const { left, top, width, height, side, align } = placement;
  const x = left - (side === 'right' ? 0 : align === 'end' ? width : width / 2);
  const y = top - (side === 'right' ? height / 2 : side === 'top' ? height : 0);
  const margin = Number.parseFloat(space.x4);
  return {
    x: Math.max(margin, Math.min(x, viewport.width - width - margin)),
    y: Math.max(viewport.top, Math.min(y, viewport.height - height - margin)),
  };
}

export function mountZoomTooltips(doc: Document): () => void {
  const win = doc.defaultView;
  if (!win || !doc.body) return () => {};
  const owned = new Map<
    HTMLElement,
    {
      translate: string;
      maxWidth: string;
      widthKey?: string;
      anchor: Element | null;
      side: string | undefined;
      gap: number;
      x: number;
      y: number;
    }
  >();
  let resize: ResizeObserver | undefined;
  let anchor: Element | null = null;
  const rememberAnchor = (event: Event) => {
    const target = event.target;
    if (!(target instanceof win.Element)) return;
    anchor = target.closest('button, a, input, [tabindex]') ?? target;
  };
  const place = () => {
    for (const [node, previous] of owned) {
      if (node.isConnected) continue;
      resize?.unobserve(node);
      if (previous.anchor) resize?.unobserve(previous.anchor);
      owned.delete(node);
    }
    for (const node of doc.querySelectorAll<HTMLElement>(
      '[role="tooltip"][data-side][data-align]',
    )) {
      const style = win.getComputedStyle(node);
      if (style.position !== 'fixed') continue;
      const left = Number.parseFloat(node.style.left);
      const top = Number.parseFloat(node.style.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
      const scale =
        'currentCSSZoom' in node && typeof node.currentCSSZoom === 'number'
          ? node.currentCSSZoom
          : Number.parseFloat(win.getComputedStyle(doc.documentElement).zoom) || 1;
      if (!(scale > 0)) continue;
      let previous = owned.get(node);
      if (!previous) {
        if (node.style.translate) continue;
        const anchorRect = anchor?.getBoundingClientRect();
        const side = node.dataset.side;
        const gap = anchorRect
          ? side === 'right'
            ? left - anchorRect.right
            : side === 'top'
              ? anchorRect.top - top
              : top - anchorRect.bottom
          : 0;
        previous = {
          translate: node.style.translate,
          maxWidth: node.style.maxWidth,
          anchor,
          side,
          gap,
          x: 0,
          y: 0,
        };
        owned.set(node, previous);
        resize?.observe(node);
        if (anchor) resize?.observe(anchor);
      }
      const margin = Number.parseFloat(space.x4);
      const maxWidth = `min(${previous.maxWidth || '50vw'}, ${Math.max(0, win.innerWidth - 2 * margin) / scale}px)`;
      if (previous.widthKey !== maxWidth) {
        previous.widthKey = maxWidth;
        node.style.maxWidth = maxWidth;
      }
      const rect = node.getBoundingClientRect();
      const root = doc.documentElement;
      const clearance = root.hasAttribute('data-fullscreen')
        ? margin
        : Math.max(
            margin,
            Number.parseFloat(
              win.getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance'),
            ) || 0,
          );
      const anchorRect = previous.anchor?.isConnected
        ? previous.anchor.getBoundingClientRect()
        : null;
      let side = previous.side;
      let targetLeft = left;
      let targetTop = top;
      if (anchorRect) {
        const below = anchorRect.bottom + previous.gap + rect.height <= win.innerHeight - margin;
        const above = anchorRect.top - previous.gap - rect.height >= clearance;
        if (side === 'bottom' && !below && above) side = 'top';
        else if (side === 'top' && !above && below) side = 'bottom';
        targetLeft =
          side === 'right'
            ? anchorRect.right + previous.gap
            : node.dataset.align === 'end'
              ? anchorRect.right
              : (anchorRect.left + anchorRect.right) / 2;
        targetTop =
          side === 'right'
            ? (anchorRect.top + anchorRect.bottom) / 2
            : side === 'top'
              ? anchorRect.top - previous.gap
              : anchorRect.bottom + previous.gap;
      }
      if (side && node.dataset.side !== side) node.dataset.side = side;
      const alignedRect = node.getBoundingClientRect();
      const desired = tooltipViewportPosition(
        {
          left: targetLeft,
          top: targetTop,
          width: rect.width,
          height: rect.height,
          side,
          align: node.dataset.align,
        },
        { width: win.innerWidth, height: win.innerHeight, top: clearance },
      );
      const x = previous.x + (desired.x - alignedRect.left) / scale;
      const y = previous.y + (desired.y - alignedRect.top) / scale;
      if (Math.abs(x - previous.x) < 0.02 && Math.abs(y - previous.y) < 0.02) continue;
      previous.x = x;
      previous.y = y;
      node.style.translate = `${x}px ${y}px`;
    }
  };
  const observer = new win.MutationObserver(place);
  resize = typeof win.ResizeObserver === 'undefined' ? undefined : new win.ResizeObserver(place);
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'data-side', 'data-align', 'data-fullscreen'],
  });
  doc.addEventListener('mouseover', rememberAnchor, true);
  doc.addEventListener('focusin', rememberAnchor, true);
  doc.addEventListener('click', rememberAnchor, true);
  win.addEventListener('resize', place);
  win.addEventListener('scroll', place, true);
  place();
  return () => {
    observer.disconnect();
    resize?.disconnect();
    doc.removeEventListener('mouseover', rememberAnchor, true);
    doc.removeEventListener('focusin', rememberAnchor, true);
    doc.removeEventListener('click', rememberAnchor, true);
    win.removeEventListener('resize', place);
    win.removeEventListener('scroll', place, true);
    for (const [node, previous] of owned) {
      node.style.translate = previous.translate;
      node.style.maxWidth = previous.maxWidth;
      if (previous.side === undefined) delete node.dataset.side;
      else node.dataset.side = previous.side;
    }
    owned.clear();
  };
}
