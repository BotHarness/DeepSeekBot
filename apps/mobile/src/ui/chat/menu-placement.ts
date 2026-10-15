export type Rect = { x: number; y: number; width: number; height: number };

export type MenuPlacement = {
  barTop: number;
  bubbleTop: number;
  bubbleHeight: number;
  menuTop: number;
};

export function placeMenu({
  anchor,
  top,
  bottom,
  bar,
  menu,
  gap,
}: {
  anchor: Rect;
  top: number;
  bottom: number;
  bar: number;
  menu: number;
  gap: number;
}): MenuPlacement {
  const above = bar === 0 ? 0 : bar + gap;
  const below = menu === 0 ? 0 : menu + gap;
  const bubbleHeight = Math.max(0, Math.min(anchor.height, bottom - top - above - below));
  const total = above + bubbleHeight + below;
  const start = Math.min(Math.max(anchor.y - above, top), bottom - total);
  const barTop = Math.max(start, top);
  const bubbleTop = barTop + above;
  return { barTop, bubbleTop, bubbleHeight, menuTop: bubbleTop + bubbleHeight + gap };
}

export function menuSide(
  anchor: Rect,
  human: boolean,
  screen: number,
): { left: number } | { right: number } {
  return human ? { right: Math.max(0, screen - anchor.x - anchor.width) } : { left: anchor.x };
}
