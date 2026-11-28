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
const patched = () => {
  expect(existsSync(path)).toBe(true);
  return section(readFileSync(path, 'utf8'));
};

it('never swaps the class of a chat scroll view or its container, so KVO stays valid in either order', () => {
  const diff = patched();
  const removed = lines(diff, '-');
  const added = lines(diff, '+');
  expect(removed).toContain('object_setClass(scrollView, subclass);');
  expect(removed).toContain('object_setClass(container, subclass);');
  expect(added).not.toMatch(/object_setClass\(|objc_allocateClassPair\(|objc_registerClassPair\(/);
  expect(added).toContain('KCHookScrollRectToVisible(KCDeclaredClass(scrollView));');
  expect(added).toContain('KCHookHitTest(KCDeclaredClass(container));');
});

it('limits the no-op scroll and the hit test fix to decorated views until Fabric recycles the decorator', () => {
  const added = lines(patched(), '+');
  expect(added).toContain('if (objc_getAssociatedObject(self, KCNoScrollRectKey)) {');
  expect(added).toContain('result == self && objc_getAssociatedObject(self, KCFixedHitTestKey)');
  expect(added).toContain(
    'objc_setAssociatedObject(scrollView, KCNoScrollRectKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);',
  );
  expect(added).toContain('- (void)prepareForRecycle');
  expect(added).toContain(
    'objc_setAssociatedObject(scrollView, KCNoScrollRectKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);',
  );
  expect(added).toContain(
    'objc_setAssociatedObject(container, KCFixedHitTestKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);',
  );
});
