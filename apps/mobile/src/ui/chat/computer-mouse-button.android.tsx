import { FilledTonalButton, Host, RNHostView } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
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
  const theme = useDesignTheme();
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
          defaultMinSize({
            minWidth: theme.touch,
            minHeight: theme.touch * (compact ? 1.25 : 1.5),
          }),
          testID(`computer-video-${side}-click`),
          semantics({ contentDescription: label }),
        ]}
      >
        <RNHostView matchContents>
          <View
            pointerEvents="none"
            accessible={false}
            style={{ width: theme.type.title.line, height: theme.type.title.line }}
          >
            <ComputerMouseIcon
              button={side}
              size={theme.type.title.line}
              color={enabled ? theme.color.fg : theme.color.muted}
            />
          </View>
        </RNHostView>
      </FilledTonalButton>
    </Host>
  );
}
