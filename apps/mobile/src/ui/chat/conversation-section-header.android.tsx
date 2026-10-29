import { Host, Icon, IconButton, RNHostView, TopAppBar } from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';

import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import type {
  ConversationSectionHeaderProps,
  SectionHeaderAction,
} from './conversation-section-header';

const icons = {
  close: require('../../../assets/toolbar/close.png'),
  back: require('../../../assets/toolbar/back.png'),
  add: require('../../../assets/toolbar/add.png'),
  check: require('../../../assets/toolbar/check.png'),
};

export function ConversationSectionHeader({
  title,
  leading,
  trailing,
}: ConversationSectionHeaderProps) {
  const theme = useDesignTheme();
  const action = (item: SectionHeaderAction, id: string) => (
    <IconButton
      enabled={!item.disabled}
      onClick={item.onPress}
      modifiers={[
        testID(id),
        semantics({ contentDescription: item.label }),
        defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
      ]}
    >
      <Icon source={icons[item.icon]} size={theme.type.title.line} />
    </IconButton>
  );
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeAreaKeyboardInsets
    >
      <TopAppBar
        windowInsets={{}}
        colors={{
          containerColor: theme.overlay.fill,
          navigationIconContentColor: theme.color.fg,
          actionIconContentColor: theme.color.fg,
        }}
      >
        <TopAppBar.Title>
          <RNHostView>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          </RNHostView>
        </TopAppBar.Title>
        <TopAppBar.NavigationIcon>{action(leading, 'section-close')}</TopAppBar.NavigationIcon>
        <TopAppBar.Actions>{action(trailing, 'section-action')}</TopAppBar.Actions>
      </TopAppBar>
    </Host>
  );
}
