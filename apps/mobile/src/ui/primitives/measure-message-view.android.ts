import { requireNativeModule } from 'expo';
import { findNodeHandle, type ViewInstance } from 'react-native';

const native = requireNativeModule<{
  measureInWindow(
    tag: number,
  ): Promise<{ x: number; y: number; width: number; height: number } | null>;
}>('ChatRecycler');

export function measureMessageView(
  view: ViewInstance | null,
  callback: (x: number, y: number, width: number, height: number) => void,
  failed: () => void,
) {
  if (view === null) {
    failed();
    return;
  }
  const tag = findNodeHandle(view);
  if (tag === null || tag === undefined) {
    failed();
    return;
  }
  native.measureInWindow(tag).then(
    (bounds) => {
      if (bounds === null) failed();
      else callback(bounds.x, bounds.y, bounds.width, bounds.height);
    },
    () => failed(),
  );
}
