export type TouchAnchor = { x: number; y: number };

const freshFor = 1500;
let last: (TouchAnchor & { at: number }) | undefined;

export function noteTouch(event: { nativeEvent: { pageX: number; pageY: number } }): void {
  last = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: Date.now() };
}

export function recentTouch(now = Date.now()): TouchAnchor | undefined {
  return last !== undefined && now - last.at <= freshFor ? { x: last.x, y: last.y } : undefined;
}
