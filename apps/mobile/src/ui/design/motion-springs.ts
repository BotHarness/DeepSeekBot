import type { ReduceMotion } from 'react-native-reanimated';

import { springs, type PlatformOS, type SpringPhysics, type SpringSpeed } from './tokens';

export type Spring = SpringPhysics & { reduceMotion: ReduceMotion };

const SYSTEM = 'system' as ReduceMotion;

function system(physics: SpringPhysics): Spring {
  return { ...physics, reduceMotion: SYSTEM };
}

function speeds(table: Record<SpringSpeed, SpringPhysics>): Record<SpringSpeed, Spring> {
  return { fast: system(table.fast), default: system(table.default), slow: system(table.slow) };
}

export function platformSprings(os: PlatformOS) {
  const release = springs[os].spatial.default;
  return {
    spatial: speeds(springs[os].spatial),
    effects: speeds(springs[os].effects),
    release: system({ ...release, damping: 2 * Math.sqrt(release.stiffness * release.mass) }),
  } as const;
}

interface SpringBuilder {
  mass(mass: number): this;
  damping(damping: number): this;
  stiffness(stiffness: number): this;
  reduceMotion(reduceMotion: ReduceMotion): this;
}

export function springy<T extends SpringBuilder>(builder: T, config: Spring): T {
  return builder
    .mass(config.mass)
    .damping(config.damping)
    .stiffness(config.stiffness)
    .reduceMotion(config.reduceMotion);
}
