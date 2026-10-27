import { FilledTonalButton, Host, RNHostView, useMaterialColors } from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxWidth,
  semantics,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import { ComputerMouseIcon } from './computer-mouse-icon';

export function ComputerMouseButton({
  side,
  enabled,
  compact,
  onClick,
}: {
  side: 'left' | 'right';
  enabled: boolean;
  compact: boolean;
  onClick(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const colors = useMaterialColors({ colorScheme: theme.scheme, seedColor: theme.color.accent });
  const label = side === 'left' ? t.computerLeftClick : t.computerRightClick;
  return (
    <Host
      matchContents={{ vertical: true }}
      style={{ width: theme.touch * 1.75 }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeAreaKeyboardInsets
    >
      <FilledTonalButton
        enabled={enabled}
        onClick={onClick}
        modifiers={[
          fillMaxWidth(),
          defaultMinSize({
            minWidth: theme.touch,
            minHeight: theme.touch * (compact ? 1.25 : 1.5),
          }),
          testID(`computer-video-${side}-click`),
          semantics({ contentDescription: label }),
        ]}
      >
        <RNHostView matchContents>
          <ComputerMouseIcon
            button={side}
            size={theme.type.title.line}
            color={enabled ? colors.onSecondaryContainer : theme.color.muted}
          />
        </RNHostView>
      </FilledTonalButton>
    </Host>
  );
}
