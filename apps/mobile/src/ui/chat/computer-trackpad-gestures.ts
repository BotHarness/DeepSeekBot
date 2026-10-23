import { WHEEL_STEP } from '../../host/computer-viewer';

export type PadTouch = { id: number; x: number; y: number };
export type PadState = {
  touches: PadTouch[];
  origins: PadTouch[];
  peak: number;
  moved: boolean;
  invalid: boolean;
  started: number;
  remainder: { x: number; y: number };
};
export function emptyPad(): PadState {
  'worklet';
  return {
    touches: [],
    origins: [],
    peak: 0,
    moved: false,
    invalid: false,
    started: 0,
    remainder: { x: 0, y: 0 },
  };
}
export function updatePad(
  state: PadState,
  phase: 'down' | 'move' | 'up' | 'cancel',
  touches: PadTouch[],
  now: number,
  lifted: PadTouch[] = [],
) {
  'worklet';
  const result: {
    state: PadState;
    move?: { x: number; y: number };
    scroll?: { x: number; y: number };
    click?: 'left' | 'right';
  } = { state };
  if (phase === 'cancel') return { state: emptyPad() };
  let next = state.peak === 0 ? { ...emptyPad(), started: now } : { ...state };
  next = {
    ...next,
    touches,
    peak: Math.max(next.peak, touches.length),
    invalid: next.invalid || touches.length > 2,
  };
  if (phase === 'down')
    next.origins = [
      ...next.origins,
      ...touches.filter((t) => !next.origins.some((o) => o.id === t.id)),
    ];
  next.moved =
    next.moved ||
    [...touches, ...lifted].some((t) => {
      const origin = next.origins.find((o) => o.id === t.id);
      return origin !== undefined && Math.hypot(t.x - origin.x, t.y - origin.y) > 10;
    });
  if (phase === 'up' && touches.length === 0) {
    if (!next.invalid && !next.moved && now - next.started <= 300 && next.peak > 0)
      result.click = next.peak === 2 ? 'right' : 'left';
    result.state = emptyPad();
    return result;
  }
  if (
    phase === 'move' &&
    !next.invalid &&
    next.moved &&
    touches.length === state.touches.length &&
    touches.length === next.peak
  ) {
    let dx = 0;
    let dy = 0;
    for (const touch of touches) {
      const previous = state.touches.find((t) => t.id === touch.id);
      if (!previous) {
        result.state = next;
        return result;
      }
      dx += (touch.x - previous.x) / touches.length;
      dy += (touch.y - previous.y) / touches.length;
    }
    if (touches.length === 1) result.move = { x: dx, y: dy };
    if (touches.length === 2) {
      const x = next.remainder.x - dx;
      const y = next.remainder.y - dy;
      const steps = { x: Math.trunc(x / WHEEL_STEP), y: Math.trunc(y / WHEEL_STEP) };
      next.remainder = { x: x - steps.x * WHEEL_STEP, y: y - steps.y * WHEEL_STEP };
      if (steps.x || steps.y) result.scroll = steps;
    }
  }
  result.state = next;
  return result;
}
