import { Host } from '@expo/ui';
import { Button, Image } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  background,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  disabled as nativeDisabled,
  opacity,
  foregroundStyle,
  frame,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useLiquidGlass } from '../primitives/drawer-material';
import type { ComposerSymbol } from './composer-symbol';

export function NativeComposerButton({
  label,
  testID,
  symbol,
  size,
  embedded = true,
  filled = false,
  disabled = false,
  onPress,
}: {
  label: string;
  testID?: string;
  symbol: ComposerSymbol;
  size: number;
  embedded?: boolean;
  filled?: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const standaloneGlass = !embedded && glass;
  const contentSize = standaloneGlass ? size - space.x5 : size;
  const ink = filled ? theme.color.base : theme.color.fg;
  return (
    <Host
      colorScheme={theme.scheme}
      style={{
        width: size,
        height: size,
        ...(!embedded && !glass
          ? {
              borderRadius: radius.round,
              borderWidth: edge.hairline,
              borderColor: theme.color.borderStrong,
            }
          : {}),
      }}
    >
      <Button
        {...(testID === undefined ? {} : { testID })}
        onPress={() => {
          if (!disabled) onPress();
        }}
        modifiers={[
          buttonStyle(standaloneGlass ? 'glass' : 'plain'),
          buttonBorderShape('circle'),
          accessibilityLabel(label),
          nativeDisabled(disabled),
          opacity(disabled ? 0.4 : 1),
          foregroundStyle(ink),
        ]}
      >
        <Image
          systemName={symbol}
          size={theme.type.title.line}
          color={ink}
          modifiers={[
            frame({ width: contentSize, height: contentSize, alignment: 'center' }),
            contentShape(shapes.rectangle()),
            ...(filled || (!embedded && !glass)
              ? [background(filled ? theme.color.fg : theme.color.surface, shapes.circle())]
              : []),
          ]}
        />
      </Button>
    </Host>
  );
}
