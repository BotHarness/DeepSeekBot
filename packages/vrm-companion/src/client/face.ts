import type { BotPresentationSnapshot } from '@botharness/ui/panels';

export const FACE_EXPRESSIONS = ['happy', 'relaxed', 'sad', 'angry', 'surprised'] as const;
export type FaceExpression = (typeof FACE_EXPRESSIONS)[number];
export type FaceWeights = Record<FaceExpression, number>;
export type FaceInput = Pick<
  BotPresentationSnapshot,
  'activity' | 'speaking' | 'sync' | 'available' | 'paused'
>;

const neutral = (): FaceWeights => ({ happy: 0, relaxed: 0, sad: 0, angry: 0, surprised: 0 });

const ACTIVITY_FACES: Record<BotPresentationSnapshot['activity'], Partial<FaceWeights>> = {
  idle: { relaxed: 0.35 },
  thinking: { sad: 0.3, surprised: 0.15 },
  working: { angry: 0.2, surprised: 0.12 },
  waiting: { happy: 0.4, surprised: 0.2 },
  blocked: { sad: 0.65, angry: 0.25 },
};

export function faceTarget(
  input: FaceInput | undefined,
  clock: number,
  reduced = false,
): FaceWeights {
  const target = neutral();
  if (!input || input.sync !== 'live' || !input.available || input.paused) return target;
  Object.assign(target, ACTIVITY_FACES[input.activity]);
  if (input.activity === 'idle' && !input.speaking && !reduced) {
    const cycle = clock % 11;
    if (cycle < 2.4) target.happy = 0.45 * Math.sin((cycle / 2.4) * Math.PI);
  }
  if (input.speaking) {
    target.relaxed = 0;
    target.happy = Math.max(target.happy, input.activity === 'blocked' ? 0 : 0.4);
  }
  return target;
}

export function dominantFace(weights: FaceWeights): FaceExpression | 'neutral' {
  let best: FaceExpression | 'neutral' = 'neutral';
  let value = 0.05;
  for (const name of FACE_EXPRESSIONS)
    if (weights[name] > value) {
      best = name;
      value = weights[name];
    }
  return best;
}

export class FaceBlend {
  readonly weights = neutral();
  constructor(readonly available: ReadonlySet<string>) {}

  step(target: FaceWeights, delta: number, reduced: boolean): FaceWeights {
    const rate = reduced ? 1 : 1 - Math.exp(-delta * 4);
    for (const name of FACE_EXPRESSIONS) {
      const goal = this.available.has(name) ? target[name] : 0;
      const next = this.weights[name] + (goal - this.weights[name]) * rate;
      this.weights[name] = Math.abs(next - goal) < 0.001 ? goal : next;
    }
    return this.weights;
  }
}
