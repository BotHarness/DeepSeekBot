import { ScreenStackHeaderConfig } from 'react-native-screens';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { MessageSourceHeaderProps } from './message-source-header';

export function MessageSourceHeader({ onClose, onCopy }: MessageSourceHeaderProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <ScreenStackHeaderConfig
      title={t.selectCopy}
      hideBackButton
      translucent={false}
      backgroundColor={theme.color.base}
      color={theme.color.fg}
      titleColor={theme.color.fg}
      headerLeftBarButtonItems={[
        {
          type: 'button',
          index: 0,
          title: t.back,
          icon: { type: 'sfSymbol', name: 'chevron.left' },
          identifier: 'message-source-back',
          accessibilityLabel: t.back,
          onPress: onClose,
        },
      ]}
      headerRightBarButtonItems={[
        {
          type: 'button',
          index: 0,
          title: t.copyAll,
          icon: { type: 'sfSymbol', name: 'doc.on.doc' },
          identifier: 'message-source-copy-all',
          accessibilityLabel: t.copyAll,
          onPress: onCopy,
        },
      ]}
    />
  );
}
