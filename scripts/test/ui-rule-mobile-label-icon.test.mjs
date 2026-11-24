import { describe, expect, it } from 'vitest';
import { parseSource } from '../check-ui-rules.mjs';
import { mobileLabelIcon } from '../ui-rule-mobile-label-icon.mjs';

const file = 'apps/mobile/src/ui/example.tsx';
const check = (source) =>
  mobileLabelIcon(file, parseSource(source, file)).map(({ rule, text, line }) => [
    rule,
    text,
    line,
  ]);

describe('mobile label icon', () => {
  it('rejects a fixed glyph beside a text label', () => {
    expect(
      check(`
        import { Text } from '../primitives/text';
        export function Row({ theme }) {
          return <View>
            <ChevronRightIcon size={theme.type.meta.line} />
            <Text>{label}</Text>
          </View>;
        }
      `),
    ).toEqual([['unscaledLabelIcon', 'ChevronRightIcon', 5]]);
  });

  it('accepts a glyph that grows with its label', () => {
    expect(
      check(`
        export function Row({ theme }) {
          return <View>
            <FileIcon size={theme.type.body.line * theme.fontScale} />
            <Text>{name}</Text>
          </View>;
        }
      `),
    ).toEqual([]);
  });

  it('accepts a glyph clamped to its fixed slot, and rejects a clamp that ignores the font scale', () => {
    expect(
      check(`
        import { clampScaledIconSize } from '../design/scaled-icon-size';
        export function Tile({ theme, slot }) {
          return <>
            <View>
              <PhotoIcon size={clampScaledIconSize(theme.type.title.line, theme.fontScale, slot)} />
              <Text>{fallback}</Text>
            </View>
            <View>
              <PhotoIcon size={clampScaledIconSize(theme.type.title.line, 1, slot)} />
              <Text>{fallback}</Text>
            </View>
          </>;
        }
      `),
    ).toEqual([['unscaledLabelIcon', 'PhotoIcon', 10]]);
  });

  it('ignores icon-only controls, which follow the header-action ceiling', () => {
    expect(
      check(`
        export function Close({ theme }) {
          return <Pressable accessibilityLabel={strings.close}>
            <CloseIcon size={theme.type.title.line} />
          </Pressable>;
        }
      `),
    ).toEqual([]);
  });

  it('rejects a point-sized SwiftUI symbol beside text and accepts a text style', () => {
    expect(
      check(`
        import { HStack, Image, Text } from '@expo/ui/swift-ui';
        import { font } from '@expo/ui/swift-ui/modifiers';
        export function Rows() {
          return <>
            <HStack><Image systemName="clock" size={14} /><Text>{time}</Text></HStack>
            <HStack><Image systemName="clock" modifiers={[font({ size: 14 })]} /><Text>{time}</Text></HStack>
            <HStack><Image systemName="clock" modifiers={[font({ textStyle: 'footnote' })]} /><Text>{time}</Text></HStack>
            <HStack><Image systemName="clock" /><Text>{time}</Text></HStack>
          </>;
        }
      `),
    ).toEqual([
      ['unscaledLabelIcon', 'Image', 6],
      ['unscaledLabelIcon', 'Image', 7],
    ]);
  });
});
