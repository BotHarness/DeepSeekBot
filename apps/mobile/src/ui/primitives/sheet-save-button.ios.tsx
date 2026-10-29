import { Host } from '@expo/ui';
import { Button, Image, ProgressView } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  disabled,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { useLiquidGlass } from './drawer-material';
import type { SheetSaveButtonProps } from './sheet-save-button';

export function SheetSaveButton(props: SheetSaveButtonProps) {
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <Button
        testID={props.testID}
        onPress={props.onPress}
        modifiers={[
          buttonStyle(glass ? 'glassProminent' : 'borderedProminent'),
          buttonBorderShape('circle'),
          tint(theme.color.accent),
          disabled(props.disabled || props.busy),
          accessibilityLabel(props.label),
          frame({ minWidth: theme.touch, minHeight: theme.touch }),
        ]}
      >
        {props.busy ? (
          <ProgressView />
        ) : (
          <Image systemName="checkmark" size={theme.type.title.line} />
        )}
      </Button>
    </Host>
  );
}
