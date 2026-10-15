import { Fragment, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MENU_REACTIONS,
  reactable,
  reactedByMe,
  type ConversationMessage,
} from '../../host/conversation';
import { edge, motion, radius, space } from '../design/tokens';
import { glassShadow, useDesignTheme, type DesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { CopyIcon, ShareIcon } from '../shell/icons';
import { t } from '../strings';
import type { BubbleGroup } from './bubble-shape';
import { BubbleBody } from './message-bubble';
import { separatorLabel } from './message-groups';
import { placeMenu, type Rect } from './menu-placement';

export type MessageMenuTarget = { message: ConversationMessage; anchor: Rect; group: BubbleGroup };

export type MessageMenuAction = { key: 'copy' | 'share'; label: string };

export function messageMenuActions(message: ConversationMessage): MessageMenuAction[] {
  if (message.body.trim() === '') return [];
  return [
    { key: 'copy', label: t.copy },
    { key: 'share', label: t.shareText },
  ];
}

export function menuTime(iso: string, now: Date): string {
  const label = separatorLabel(iso, now, t.yesterday);
  return label !== '' && new Date(iso).toDateString() === now.toDateString()
    ? `${t.today} ${label}`
    : label;
}

export function menuSizes(theme: DesignTheme, rows: number, reactions: boolean) {
  return {
    bar: reactions ? theme.touch + space.x2 * 2 : 0,
    menu:
      theme.type.meta.line +
      space.x4 +
      space.x2 +
      rows * theme.touch +
      Math.max(0, rows - 1) * edge.hairline,
    menuWidth: theme.touch * 5,
    islandWidth:
      MENU_REACTIONS.length * theme.touch + (MENU_REACTIONS.length - 1) * space.x1 + space.x2 * 2,
  };
}

function sideOffset(anchor: Rect, human: boolean, width: number, screen: number) {
  const left = human ? anchor.x + anchor.width - width : anchor.x;
  return Math.min(Math.max(left, space.x4), screen - space.x4 - width);
}

const POP = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.quad) },
}).duration(motion.menu);

function Pop({
  from,
  style,
  children,
}: {
  from: 'top' | 'bottom';
  style: object;
  children: ReactNode;
}) {
  return (
    <Animated.View entering={POP} style={[style, { transformOrigin: from }]}>
      {children}
    </Animated.View>
  );
}

function ReactionIsland({
  message,
  onReact,
}: {
  message: ConversationMessage;
  onReact(emoji: string, active: boolean): void;
}) {
  const theme = useDesignTheme();
  const mine = new Set((message.reactions ?? []).filter(reactedByMe).map((r) => r.emoji));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t.reactions}
      contentContainerStyle={{ padding: space.x2, gap: space.x1 }}
    >
      {MENU_REACTIONS.map((emoji) => {
        const picked = mine.has(emoji);
        return (
          <Pressable
            key={emoji}
            accessibilityRole="button"
            accessibilityLabel={picked ? t.unreact(emoji) : t.react(emoji)}
            accessibilityState={{ selected: picked }}
            onPress={() => onReact(emoji, !picked)}
            style={({ pressed }) => ({
              width: theme.touch,
              height: theme.touch,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.round,
              backgroundColor: picked
                ? theme.layer.sheet.chosen
                : pressed
                  ? theme.layer.sheet.pressed
                  : theme.layer.sheet.fill,
            })}
          >
            <Text variant="title">{emoji}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ActionIcon({
  action,
  color,
  size,
}: {
  action: MessageMenuAction;
  color: string;
  size: number;
}) {
  return action.key === 'copy' ? (
    <CopyIcon color={color} size={size} />
  ) : (
    <ShareIcon color={color} size={size} />
  );
}

export function MessageActions({
  target,
  onClose,
  onReact,
  onCopy,
  onShareText,
}: {
  target: MessageMenuTarget | undefined;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
  onShareText(text: string): void;
}) {
  return (
    <Modal
      visible={target !== undefined}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {target === undefined ? null : (
        <MessageMenu
          key={target.message.id}
          target={target}
          onClose={onClose}
          onReact={onReact}
          onCopy={onCopy}
          onShareText={onShareText}
        />
      )}
    </Modal>
  );
}

function MessageMenu({
  target,
  onClose,
  onReact,
  onCopy,
  onShareText,
}: {
  target: MessageMenuTarget;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
  onShareText(text: string): void;
}) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { width: screen, height } = useWindowDimensions();
  const { message, anchor, group } = target;
  const human = message.author === 'human';
  const actions = messageMenuActions(message);
  const reactions = reactable(message);
  const sizes = menuSizes(theme, actions.length, reactions);
  const place = placeMenu({
    anchor,
    top: insets.top + space.x3,
    bottom: height - insets.bottom - space.x3,
    bar: sizes.bar,
    menu: sizes.menu,
    gap: space.x3,
  });
  const islandWidth = Math.min(sizes.islandWidth, screen - space.x4 * 2);
  const menuWidth = Math.min(sizes.menuWidth, screen - space.x4 * 2);
  const card = {
    position: 'absolute' as const,
    backgroundColor: theme.layer.sheet.fill,
    boxShadow: glassShadow(theme.scheme),
    overflow: 'hidden' as const,
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.scrim }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.cancel}
        onPress={onClose}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        accessibilityViewIsModal
        accessibilityLabel={t.messageActions}
        onAccessibilityEscape={onClose}
        pointerEvents="box-none"
        style={{ flex: 1 }}
      >
        {reactions ? (
          <Pop
            from="bottom"
            style={{
              ...card,
              top: place.barTop,
              left: sideOffset(anchor, human, islandWidth, screen),
              width: islandWidth,
              height: sizes.bar,
              borderRadius: radius.round,
            }}
          >
            <ReactionIsland
              message={message}
              onReact={(emoji, active) => {
                onReact(message, emoji, active);
                onClose();
              }}
            />
          </Pop>
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: place.bubbleTop,
            left: anchor.x,
            width: anchor.width,
          }}
        >
          <BubbleBody
            message={message}
            group={group}
            fill={{ maxWidth: '100%', width: anchor.width, maxHeight: place.bubbleHeight }}
          />
        </View>
        {actions.length === 0 ? null : (
          <Pop
            from="top"
            style={{
              ...card,
              top: place.menuTop,
              left: sideOffset(anchor, human, menuWidth, screen),
              width: menuWidth,
              borderRadius: radius.lg,
            }}
          >
            <Text
              variant="meta"
              tone="muted"
              numberOfLines={1}
              style={{ paddingHorizontal: space.x5, paddingTop: space.x4, paddingBottom: space.x2 }}
            >
              {menuTime(message.at, new Date())}
            </Text>
            {actions.map((action, index) => (
              <Fragment key={action.key}>
                {index === 0 ? null : (
                  <View
                    style={{
                      height: edge.hairline,
                      marginLeft: space.x5,
                      backgroundColor: theme.layer.sheet.divider,
                    }}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => {
                    if (action.key === 'copy') onCopy(message.body);
                    else onShareText(message.body);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    height: theme.touch,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.x4,
                    paddingHorizontal: space.x5,
                    backgroundColor: pressed ? theme.layer.sheet.pressed : theme.layer.sheet.fill,
                  })}
                >
                  <Text numberOfLines={1} style={{ flex: 1 }}>
                    {action.label}
                  </Text>
                  <ActionIcon action={action} color={theme.color.fg} size={theme.type.title.line} />
                </Pressable>
              </Fragment>
            ))}
          </Pop>
        )}
      </View>
    </View>
  );
}
