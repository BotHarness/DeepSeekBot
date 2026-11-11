import { requireOptionalNativeModule } from 'expo';
import { findNodeHandle, type ViewInstance } from 'react-native';

const native = requireOptionalNativeModule<{
  supported: boolean;
  measureInWindow(
    tag: number,
  ): Promise<{ x: number; y: number; width: number; height: number } | null>;
}>('ChatRecycler');

const recycler = process.env.EXPO_PUBLIC_CHAT_LIST !== 'flatlist';

export function measureMessageView(
  view: ViewInstance | null,
  callback: (x: number, y: number, width: number, height: number) => void,
  failed: () => void,
  actual = recycler,
) {
  if (view === null) {
    failed();
    return;
  }
  if (!actual || native?.supported !== true) {
    view.measureInWindow(callback);
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
