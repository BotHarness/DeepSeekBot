import {
  CircularProgressIndicator,
  Column,
  Host,
  Icon,
  IconButton,
  RNHostView,
  Row,
  Shape,
  Surface,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  background,
  clip,
  dropShadow,
  fillMaxWidth,
  height as nativeHeight,
  innerShadow,
  padding,
  semantics,
  size,
  testID,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { chatHeaderSurface, materialIconButton, radius, space } from '../design/tokens';
import { useStrings } from '../strings';
import type { ConversationTopBarProps } from './conversation-top-bar';
import { ChatHeaderSurface } from './chat-header-surface.android';
import { GroupMark } from './group-mark';
import { HeaderBotStack } from './header-bot-stack';

function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) return hex;
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

export function ConversationTopBar({
  title,
  subtitle,
  bot,
  activeBots = [],
  avatar,
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
  const mark = materialIconButton.container;
  const islandHeight = Math.max(
    theme.touch,
    Math.ceil((theme.type.title.line + theme.type.meta.line) * theme.fontScale + space.x2 * 2),
  );
  const status = connectionLabel ?? subtitle;
  const action = (id: string, label: string, source: number, onClick: () => void) => (
    <IconButton
      onClick={onClick}
      colors={{ contentColor: theme.color.fg }}
      modifiers={[
        size(islandHeight, islandHeight),
        testID(id),
        semantics({ contentDescription: label }),
      ]}
    >
      <Icon source={source} size={materialIconButton.iconSize} />
    </IconButton>
  );
  const look = chatHeaderSurface.island;
  const scheme = theme.scheme;
  const ink = scheme === 'dark' ? '#ffffff' : '#000000';
  const pill = { type: 'roundedCorner', radius: islandHeight / 2 } as const;
  const island = {
    color: 'transparent',
    contentColor: theme.color.fg,
    shape: Shape.Pill({}),
    border: { width: look.rim.width, color: withAlpha(ink, look.rim[scheme]) },
  };
  const islandLook = [
    dropShadow(pill, {
      radius: look.shadow.radius,
      offsetY: look.shadow.offsetY,
      color: '#000000',
      alpha: look.shadow[scheme],
    }),
    clip(pill),
    background(theme.layer.raised.fill),
    innerShadow(pill, {
      radius: look.highlight.width,
      offsetY: look.highlight.width,
      color: '#ffffff',
      alpha: look.highlight[scheme],
    }),
  ];
  return (
    <View
      testID="android-chat-header"
      pointerEvents="box-none"
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
        height={height || insets.top + theme.touch + space.x3}
        solid={insets.top}
      />
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <Row
          verticalAlignment="center"
          horizontalArrangement={{ spacedBy: space.x2 }}
          modifiers={[fillMaxWidth(), padding(space.x3, space.x2, space.x3, space.x2)]}
        >
          <Surface {...island} modifiers={islandLook}>
            {action('chat-back', t.back, require('../../../assets/header/arrow-back.xml'), onBack)}
          </Surface>
          <Surface
            {...island}
            {...(onProfile === undefined ? {} : { onClick: onProfile })}
            modifiers={[
              weight(1),
              ...islandLook,
              testID('chat-identity'),
              semantics({ contentDescription: [title, status].filter(Boolean).join(', ') }),
            ]}
          >
            <Row
              verticalAlignment="center"
              horizontalArrangement={{ spacedBy: space.x3 }}
              modifiers={[
                nativeHeight(islandHeight),
                padding(space.x2, space.x2, space.x4, space.x2),
              ]}
            >
              <RNHostView modifiers={[size(mark, mark)]}>
                <View accessible={false} importantForAccessibility="no-hide-descendants">
                  {bot === undefined ? (
                    <GroupMark avatar={avatar} size={mark} corner={radius.round} />
                  ) : (
                    <BotAvatar bot={bot} size={mark} ring={false} />
                  )}
                </View>
              </RNHostView>
              <Column modifiers={[weight(1)]}>
                <Text
                  style={{ typography: 'titleMedium', fontWeight: 'bold' }}
                  maxLines={1}
                  overflow="ellipsis"
                >
                  {title}
                </Text>
                {status === undefined ? null : (
                  <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: space.x2 }}>
                    {activeBots.length === 0 ? null : (
                      <RNHostView
                        modifiers={[
                          size(
                            theme.type.meta.line * Math.min(3, activeBots.length) -
                              space.x2 * (Math.min(3, activeBots.length) - 1),
                            theme.type.meta.line,
                          ),
                        ]}
                      >
                        <HeaderBotStack bots={activeBots} size={theme.type.meta.line} />
                      </RNHostView>
                    )}
                    <Text
                      modifiers={[weight(1)]}
                      color={theme.color.muted}
                      style={{ typography: 'bodySmall' }}
                      maxLines={1}
                      overflow="ellipsis"
                    >
                      {status}
                    </Text>
                  </Row>
                )}
              </Column>
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
          </Surface>
          {onCall === undefined && onProfile === undefined ? null : (
            <Surface {...island} modifiers={[...islandLook, testID('chat-action-island')]}>
              <Row verticalAlignment="center">
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
              </Row>
            </Surface>
          )}
        </Row>
      </Host>
    </View>
  );
}
