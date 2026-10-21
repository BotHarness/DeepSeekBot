export const RATIOS = [1.5, 1.25, 1, 0.75];

export type Pacing = {
  pace: number;
  ratioStep: number;
  top: number;
  slow: number;
  fast: number;
  promoteAfter: number;
};

export type Sample = {
  fps: number;
  work: number;
  target: number;
  reduced: boolean;
};

export function createPacing(devicePixelRatio: number): Pacing {
  const found = RATIOS.findIndex((value) => value <= Math.min(devicePixelRatio, 1.5));
  const top = found < 0 ? RATIOS.length - 1 : found;
  return { pace: 60, ratioStep: top, top, slow: 0, fast: 0, promoteAfter: 5 };
}

export function frameRate(pacing: Pacing, calm: boolean, reduced: boolean) {
  if (reduced) return 10;
  return calm ? Math.min(pacing.pace, 30) : pacing.pace;
}

export function nextPacing(state: Pacing, { fps, work, target, reduced }: Sample): Pacing {
  const next = { ...state };
  const degraded = state.pace < 60 || state.ratioStep > state.top;
  next.slow = fps < target * 0.8 ? state.slow + 1 : 0;
  next.fast = degraded && fps >= Math.min(27, target * 0.9) && work < 6 ? state.fast + 1 : 0;
  if (next.fast >= state.promoteAfter && !reduced) {
    next.fast = 0;
    next.slow = 0;
    if (state.pace < 60) next.pace = 60;
    else next.ratioStep = state.ratioStep - 1;
  } else if (next.slow >= 2 && state.pace > 30) {
    next.slow = 0;
    next.promoteAfter = Math.min(state.promoteAfter * 2, 60);
    next.pace = 30;
  } else if (next.slow >= 2 && state.ratioStep < RATIOS.length - 1) {
    next.slow = 0;
    next.promoteAfter = Math.min(state.promoteAfter * 2, 60);
    next.ratioStep = state.ratioStep + 1;
  }
  return next;
}
