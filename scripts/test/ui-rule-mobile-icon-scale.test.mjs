import { describe, expect, it } from 'vitest';
import { compare, parseSource } from '../check-ui-rules.mjs';
import { mobileIconScale } from '../ui-rule-mobile-icon-scale.mjs';

const file = 'apps/mobile/src/ui/example.ios.tsx';
const check = (source) => mobileIconScale(file, parseSource(source, file));

describe('mobile fixed-slot icon scale', () => {
  it('rejects raw RN scaling and SwiftUI text styles without an upper bound', () => {
    const found = check(`
      import { StyleSheet, View, useWindowDimensions } from 'react-native';
      import { Image as SymbolImage, VStack } from '@expo/ui/swift-ui';
      import { font as type, frame, dynamicTypeSize } from '@expo/ui/swift-ui/modifiers';
      import { PlusIcon as Add } from './icons';
      const styles = StyleSheet.create({ circle: { width: fab.size, height: fab.size } });
      const box = frame({ minHeight: symbolBox, maxHeight: symbolBox });
      function Examples() {
        const { fontScale: scale } = useWindowDimensions();
        const glyphSize = theme.type.title.line * (close ? 1 : scale);
        return <>
          <View style={[base, styles.circle]}>
            <Add size={glyphSize} />
          </View>
          <VStack modifiers={[box]}>
            <SymbolImage systemName="plus" modifiers={[type({ textStyle: 'title2' })]} />
          </VStack>
          <SymbolImage systemName="plus" modifiers={[
            type({ textStyle: 'body' }), frame({ width: theme.touch }),
            dynamicTypeSize({ min: 'large' }),
          ]} />
        </>;
      }
    `);
    expect(found.map(({ rule, text, line }) => [rule, text, line])).toEqual([
      ['fixedIconScale', 'Add', 13],
      ['fixedIconScale', 'SymbolImage', 16],
      ['fixedIconScale', 'SymbolImage', 18],
    ]);
    expect(compare(found, {}).problems).toEqual([
      expect.stringContaining('fit the glyph with clampScaledIconSize'),
    ]);
  });

  it('accepts clamped icons, intrinsic layouts and frames that grow with the icon', () => {
    expect(
      check(`
        import { Host, View } from '@expo/ui';
        import { Image, VStack } from '@expo/ui/swift-ui';
        import { dynamicTypeSize as typeSize, font, frame } from '@expo/ui/swift-ui/modifiers';
        import { clampScaledIconSize as fit } from '../design/scaled-icon-size';
        const cap = typeSize({ max: 'xxxLarge' });
        const textFont = font({ textStyle: 'body' });
        function Examples() {
          const size = theme.type.meta.line * theme.fontScale;
          return <>
            <View style={{ width: fab.size }}>
              <PlusIcon size={fit(theme.type.meta.line, theme.fontScale, fab.size)} />
              <SystemSymbol size={slot / theme.fontScale} />
            </View>
            <View style={{ width: size, height: size }}><PlusIcon size={size} /></View>
            <View style={{ minHeight: theme.touch }}><PlusIcon size={size} /></View>
            <Image systemName="plus" modifiers={[textFont, cap, frame({ width: slot })]} />
            <Image systemName="plus" modifiers={[textFont, frame({ width: size })]} />
            <Image systemName="plus" modifiers={[font({ size: slot }), frame({ width: slot })]} />
            <VStack modifiers={[typeSize('large'), frame({ width: slot })]}>
              <Image systemName="plus" modifiers={[textFont]} />
            </VStack>
            <Host matchContents={{ vertical: true }} style={{ maxHeight: measuredHeight }}>
              <Image systemName="plus" modifiers={[textFont, frame({ maxWidth: Infinity })]} />
            </Host>
          </>;
        }
      `),
    ).toEqual([]);
  });
});
