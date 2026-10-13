export interface AvatarAnchor {
  read(): { x: number; y: number } | undefined;
}

export function createAvatarAnchor(node: HTMLElement): AvatarAnchor {
  const head = node.querySelector<SVGGraphicsElement>('.bh-illustrated-head');
  const svg = head?.ownerSVGElement;
  let local: { x: number; y: number } | undefined;
  let measured = false;
  const measure = () => {
    measured = true;
    try {
      const box = head?.getBBox();
      if (box && box.width > 0 && box.height > 0) local = { x: box.x + box.width / 2, y: box.y };
    } catch {}
  };
  return {
    read() {
      if (!node.isConnected) return;
      if (!measured) measure();
      if (local && head?.isConnected && svg) {
        try {
          const target = svg.hasAttribute('data-pixel-cover') ? svg : head;
          const matrix = target.getScreenCTM();
          if (matrix) {
            const x = matrix.a * local.x + matrix.c * local.y + matrix.e;
            const y = matrix.b * local.x + matrix.d * local.y + matrix.f;
            if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
          }
        } catch {}
      }
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return { x: box.left + box.width / 2, y: box.top };
      return;
    },
  };
}
