interface ChromeGroup {
  element: HTMLElement;
  panels: readonly { id: string }[];
}

function effectiveZoom(element: HTMLElement): number {
  if ('currentCSSZoom' in element && typeof element.currentCSSZoom === 'number') {
    const zoom = element.currentCSSZoom;
    if (Number.isFinite(zoom) && zoom > 0) return zoom;
  }
  let zoom = 1;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const own = Number.parseFloat(getComputedStyle(current).zoom);
    if (Number.isFinite(own) && own > 0) zoom *= own;
  }
  return zoom;
}

export function updateWorkspaceChrome(root: HTMLElement, groups: readonly ChromeGroup[]): void {
  const zoom = effectiveZoom(root);
  root.style.setProperty('--bh-workspace-zoom', String(zoom));
  const corner = root.querySelector('.bh-workspace-chrome')?.getBoundingClientRect();
  for (const group of groups) {
    const box = group.element.getBoundingClientRect();
    const intersects =
      corner &&
      corner.width > 0 &&
      corner.height > 0 &&
      box.left < corner.right &&
      box.right > corner.left &&
      box.top < corner.bottom &&
      box.bottom > corner.top;
    const inset = intersects ? Math.max(0, (corner.right - box.left) / zoom) : 0;
    group.element.toggleAttribute('data-bh-mac-corner', inset > 0);
    group.element.toggleAttribute(
      'data-bh-rail-corner',
      inset > 0 && group.panels.some((panel) => panel.id === 'bh:workspace-rail'),
    );
    group.element.style.setProperty('--bh-mac-leading', `${inset}px`);
  }
}

export function mountWorkspaceChrome(
  root: HTMLElement,
  groups: () => readonly ChromeGroup[],
): () => void {
  const update = () => updateWorkspaceChrome(root, groups());
  const attributes = new MutationObserver(update);
  attributes.observe(root.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'data-fullscreen', 'data-platform'],
  });
  const resize = new ResizeObserver(update);
  resize.observe(root);
  update();
  return () => {
    attributes.disconnect();
    resize.disconnect();
    root.style.removeProperty('--bh-workspace-zoom');
  };
}
