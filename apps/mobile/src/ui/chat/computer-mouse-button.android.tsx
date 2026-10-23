import { Column, FilledTonalButton, Host, Icon, Text } from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { t } from '../strings';

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
        <Column horizontalAlignment="center">
          <Icon
            source={
              side === 'left'
                ? require('../../../assets/toolbar/mouse-left.xml')
                : require('../../../assets/toolbar/mouse-right.xml')
            }
            size={theme.type.body.line}
          />
          <Text>{label}</Text>
        </Column>
      </FilledTonalButton>
    </Host>
  );
}
