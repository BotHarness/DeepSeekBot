import { scrollChrome } from '../design/tokens';

export type ScrollChromeState = { offset: number; travel: number; hidden: boolean };

export function scrollChromeStep(
  state: ScrollChromeState,
  offset: number,
  extent: number,
): ScrollChromeState {
  'worklet';
  const y = Math.max(0, Math.min(offset, Math.max(0, extent)));
  const delta = y - state.offset;
  const travel = delta === 0 || delta * state.travel >= 0 ? state.travel + delta : delta;
  const atTop = y <= scrollChrome.top;
  return {
    offset: y,
    travel: atTop ? 0 : travel,
    hidden: atTop
      ? false
      : travel >= scrollChrome.threshold
        ? true
        : travel <= -scrollChrome.threshold
          ? false
          : state.hidden,
  };
}
