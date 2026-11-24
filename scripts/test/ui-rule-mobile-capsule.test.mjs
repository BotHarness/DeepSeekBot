import { describe, expect, it } from 'vitest';
import { parseSource } from '../check-ui-rules.mjs';
import { mobileWrappingCapsule } from '../ui-rule-mobile-capsule.mjs';

const file = 'apps/mobile/src/ui/example.ios.tsx';
const check = (source) =>
  mobileWrappingCapsule(file, parseSource(source, file)).map(({ rule, text, line }) => [
    rule,
    text,
    line,
  ]);

describe('mobile wrapping capsule', () => {
  it('rejects a fixed capsule shape on a SwiftUI button', () => {
    expect(
      check(`
        import { Button } from '@expo/ui/swift-ui';
        import { buttonBorderShape as shape } from '@expo/ui/swift-ui/modifiers';
        export function Examples() {
          return <Button modifiers={[shape('capsule')]} />;
        }
      `),
    ).toEqual([['wrappingCapsule', 'buttonBorderShape', 5]]);
  });

  it('accepts the shared fallback and non-capsule shapes', () => {
    expect(
      check(`
        import { Button } from '@expo/ui/swift-ui';
        import { buttonBorderShape } from '@expo/ui/swift-ui/modifiers';
        import { capsuleBorderShape } from '../design/large-text-fallback';
        export function Examples() {
          const border = capsuleBorderShape(theme.fontScale);
          return <>
            <Button modifiers={[buttonBorderShape(border.shape, border.cornerRadius)]} />
            <Button modifiers={[buttonBorderShape('circle')]} />
          </>;
        }
      `),
    ).toEqual([]);
  });

  it('ignores a buttonBorderShape that is not the SwiftUI modifier', () => {
    expect(check(`const shape = buttonBorderShape('capsule');`)).toEqual([]);
  });

  it('rejects a React Native capsule that can grow with its text', () => {
    expect(
      check(`
        import { radius } from '../design/tokens';
        export const chip = {
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: radius.round,
        };
        export const pressed = ({ pressed }) => ({ minHeight: 44, borderRadius: radius.round });
      `),
    ).toEqual([
      ['wrappingCapsule', 'borderRadius', 6],
      ['wrappingCapsule', 'borderRadius', 8],
    ]);
  });

  it('accepts the shared radius, fixed circles and pills, and Android files', () => {
    expect(
      check(`
        import { radius } from '../design/tokens';
        import { capsuleRadius } from '../design/large-text-fallback';
        export const styles = [
          { minHeight: 44, borderRadius: capsuleRadius(theme.fontScale) },
          { width: 44, height: 44, minHeight: 44, borderRadius: radius.round },
          { height: 32, minHeight: 32, borderRadius: radius.round },
          { minHeight: 44, borderRadius: radius.lg },
          { padding: 4, borderRadius: radius.round },
        ];
      `),
    ).toEqual([]);
    expect(
      mobileWrappingCapsule(
        'apps/mobile/src/ui/example.android.tsx',
        parseSource('export const s = { minHeight: 44, borderRadius: radius.round };', 'x.tsx'),
      ),
    ).toEqual([]);
  });
});
