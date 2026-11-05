import {
  CircularProgressIndicator,
  Host,
  Icon,
  IconButton,
  Row,
  Text,
  TopAppBar,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics, size, testID, weight } from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesignTheme } from '../design/theme';
import { materialIconButton, space } from '../design/tokens';
import { useStrings } from '../strings';
import type { ConversationTopBarProps } from './conversation-top-bar';
import { ChatHeaderSurface } from './chat-header-surface.android';

export function ConversationTopBar({
  blurTarget,
  title,
  connectionLabel,
  onBack,
  onProfile,
  onCall,
  onHeight,
}: ConversationTopBarProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const t = useStrings();
  const [height, setHeight] = useState(0);
  const action = (id: string, label: string, source: number, onClick: () => void) => (
    <IconButton
      onClick={onClick}
      modifiers={[testID(id), semantics({ contentDescription: label })]}
    >
      <Icon source={source} size={materialIconButton.iconSize} />
    </IconButton>
  );
  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height;
        setHeight(next);
        onHeight(next);
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ChatHeaderSurface
        target={blurTarget}
        height={height || insets.top + theme.touch + space.x4}
        solid={insets.top}
      />
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
            containerColor: 'transparent',
            titleContentColor: theme.color.fg,
            navigationIconContentColor: theme.color.fg,
            actionIconContentColor: theme.color.fg,
          }}
        >
          <TopAppBar.NavigationIcon>
            {action('chat-back', t.back, require('../../../assets/header/arrow-back.xml'), onBack)}
          </TopAppBar.NavigationIcon>
          <TopAppBar.Title>
            <Row
              verticalAlignment="center"
              horizontalArrangement={{ spacedBy: space.x3 }}
              modifiers={[fillMaxWidth()]}
            >
              <Text
                style={{ typography: 'titleLarge' }}
                maxLines={1}
                overflow="ellipsis"
                modifiers={[weight(1)]}
              >
                {title}
              </Text>
              {connectionLabel === undefined ? null : (
                <CircularProgressIndicator
                  color={theme.color.accent}
                  modifiers={[
                    size(materialIconButton.iconSize, materialIconButton.iconSize),
                    semantics({ contentDescription: connectionLabel }),
                  ]}
                />
              )}
            </Row>
          </TopAppBar.Title>
          <TopAppBar.Actions>
            {onCall === undefined
              ? null
              : action(
                  'chat-call-button',
                  t.call.button,
                  require('../../../assets/header/call.xml'),
                  onCall,
                )}
            {onProfile === undefined
              ? null
              : action(
                  'chat-profile-button',
                  t.openProfile,
                  require('../../../assets/header/more-vert.xml'),
                  onProfile,
                )}
          </TopAppBar.Actions>
        </TopAppBar>
      </Host>
    </View>
  );
}
