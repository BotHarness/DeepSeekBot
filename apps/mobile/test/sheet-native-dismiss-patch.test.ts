import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const patch = readFileSync(
  new URL('../../../patches/react-native-screens@4.30.1.patch', import.meta.url),
  'utf8',
);
const added = (file: string) =>
  (patch.split('diff --git ').find((section) => section.startsWith(`a/${file} `)) ?? '')
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n');

it('lets a prevented Android form sheet cancel a swipe or outside tap instead of dismissing', () => {
  const root = 'android/src/main/java/com/swmansion/rnscreens';
  expect(added(`${root}/ScreenViewManager.kt`)).toContain('view?.preventNativeDismiss = value');
  expect(added(`${root}/ScreenViewManager.kt`)).toContain('"onNativeDismissCancelled"');
  expect(added(`${root}/ScreenStackFragment.kt`)).toContain(
    'ScreenNativeDismissCancelledEvent(surfaceId, screen.id)',
  );
  expect(added(`${root}/bottomsheet/SheetDelegate.kt`)).toContain(
    'sheetBehavior?.state = lastStableState',
  );
  expect(added(`${root}/events/ScreenNativeDismissCancelledEvent.kt`)).toContain(
    '"topNativeDismissCancelled"',
  );
});

it('sizes every new Android form sheet with the current top inset, not zero', () => {
  const delegate = added(
    'android/src/main/java/com/swmansion/rnscreens/bottomsheet/SheetDelegate.kt',
  );
  expect(delegate).toContain(
    'get() = if (hasObservedInsets) field else currentRootTopInset() ?: field',
  );
  expect(delegate).toContain('ViewCompat.getRootWindowInsets(it)');
  expect(delegate).toContain('hasObservedInsets = true');
});
