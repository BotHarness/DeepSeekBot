import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';

import type { BotModeMotionPreference } from '@botharness/host-client/shared/bot-mode-settings';

export type EffectiveMotion = 'reduce' | 'full';

export interface SystemMotionSource {
  readonly reduced: boolean;
  subscribe(listener: (reduced: boolean) => void): () => void;
}

export interface MotionPolicySnapshot {
  effectiveMotion: EffectiveMotion;
}

export function resolveEffectiveMotion(
  preference: BotModeMotionPreference,
  systemReduced: boolean,
): EffectiveMotion {
  if (preference === 'reduce') return 'reduce';
  if (preference === 'full') return 'full';
  return systemReduced ? 'reduce' : 'full';
}

export function browserSystemMotionSource(): SystemMotionSource | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    get reduced() {
      return query.matches;
    },
    subscribe(listener) {
      const onChange = (event: MediaQueryListEvent): void => {
        listener(event.matches);
      };
      query.addEventListener('change', onChange);
      return () => {
        query.removeEventListener('change', onChange);
      };
    },
  };
}

export function mountMotionPolicyAttribute(
  source: SnapshotStore<MotionPolicySnapshot>,
  root: Pick<HTMLElement, 'dataset'>,
): () => void {
  const previous = root.dataset['botharnessMotion'];
  const sync = (): void => {
    root.dataset['botharnessMotion'] = source.getSnapshot().effectiveMotion;
  };
  sync();
  const unsubscribe = source.subscribe(sync);
  return () => {
    unsubscribe();
    if (previous === undefined) delete root.dataset['botharnessMotion'];
    else root.dataset['botharnessMotion'] = previous;
  };
}
