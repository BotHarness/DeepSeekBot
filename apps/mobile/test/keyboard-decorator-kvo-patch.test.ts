import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const path = new URL(
  '../../../patches/react-native-keyboard-controller@1.22.7.patch',
  import.meta.url,
);
const decorator = 'ios/views/ClippingScrollViewDecoratorViewManager.mm';
const section = (patch: string) =>
  patch.split('diff --git ').find((part) => part.startsWith(`a/${decorator} `)) ?? '';
const lines = (text: string, sign: '+' | '-') =>
  text
    .split('\n')
    .filter((line) => line.startsWith(sign) && !line.startsWith(`${sign}${sign}${sign}`))
    .join('\n');

it('keeps one keyboard decorator class under the KVO class when the chat scroll view re-enters a window', () => {
  expect(existsSync(path)).toBe(true);
  const diff = section(readFileSync(path, 'utf8'));
  const added = lines(diff, '+');
  expect(lines(diff, '-')).toContain('if ([originalClassName hasPrefix:@"KC_NoScrollRect_"]) {');
  expect(
    added.match(/for \(Class cls = originalClass; cls; cls = class_getSuperclass\(cls\)\)/g),
  ).toHaveLength(2);
  expect(added).toContain('[NSStringFromClass(cls) hasPrefix:KCNoScrollRectClassPrefix]');
  expect(added).toContain('[NSStringFromClass(cls) hasPrefix:KCFixedHitTestClassPrefix]');
});

it('restores only a decorator class that is still on top when Fabric recycles the decorator', () => {
  const added = lines(section(readFileSync(path, 'utf8')), '+');
  expect(added).toContain('- (void)prepareForRecycle');
  expect(added).toContain(
    '[NSStringFromClass(scrollViewClass) hasPrefix:KCNoScrollRectClassPrefix]',
  );
  expect(added).toContain('object_setClass(_scrollView, class_getSuperclass(scrollViewClass));');
  expect(added).toContain('_scrollView = scrollView;');
});
