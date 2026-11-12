import { Host, Icon, IconButton, Text, TopAppBar } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, size, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { materialIconButton } from '../design/tokens';
import { useStrings } from '../strings';
import type { MessageSourceHeaderProps } from './message-source-header';

export function MessageSourceHeader({ onClose, onCopy }: MessageSourceHeaderProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeAreaKeyboardInsets
    >
      <TopAppBar
        windowInsets={{}}
        modifiers={[fillMaxWidth()]}
        colors={{
          containerColor: theme.color.base,
          titleContentColor: theme.color.fg,
          navigationIconContentColor: theme.color.fg,
        }}
      >
        <TopAppBar.NavigationIcon>
          <IconButton
            onClick={onClose}
            modifiers={[
              size(theme.touch, theme.touch),
              testID('message-source-back'),
              semantics({ contentDescription: t.back }),
            ]}
          >
            <Icon
              source={require('../../../assets/header/arrow-back.xml')}
              size={materialIconButton.iconSize}
            />
          </IconButton>
        </TopAppBar.NavigationIcon>
        <TopAppBar.Title>
          <Text
            style={{ typography: 'titleLarge' }}
            color={theme.color.fg}
            maxLines={1}
            overflow="ellipsis"
          >
            {t.selectCopy}
          </Text>
        </TopAppBar.Title>
        <TopAppBar.Actions>
          <IconButton
            onClick={onCopy}
            modifiers={[
              size(theme.touch, theme.touch),
              testID('message-source-copy-all'),
              semantics({ contentDescription: t.copyAll }),
            ]}
          >
            <Icon
              source={require('../../../assets/row-icons/copy.xml')}
              size={materialIconButton.iconSize}
            />
          </IconButton>
        </TopAppBar.Actions>
      </TopAppBar>
    </Host>
  );
}
