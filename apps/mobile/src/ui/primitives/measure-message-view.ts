import type { ViewInstance } from 'react-native';

/** See the Android variant: exactly one of `callback` or `failed` runs. */
export function measureMessageView(
  view: ViewInstance | null,
  callback: (x: number, y: number, width: number, height: number) => void,
  failed: () => void,
) {
  if (view === null) failed();
  else view.measureInWindow(callback);
}
