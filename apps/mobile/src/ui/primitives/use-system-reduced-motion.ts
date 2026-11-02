import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

let reduced = true;
const readReducedMotion = () => reduced;
function subscribeReducedMotion(notify: () => void) {
  let active = true;
  let revision = 0;
  const update = (value: boolean) => {
    reduced = value;
    notify();
  };
  const read = () => {
    const request = ++revision;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active && request === revision) update(value);
      },
      () => {},
    );
  };
  const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    revision++;
    update(value);
  });
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') read();
  });
  read();
  return () => {
    active = false;
    preference.remove();
    foreground.remove();
  };
}

export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion);
}
