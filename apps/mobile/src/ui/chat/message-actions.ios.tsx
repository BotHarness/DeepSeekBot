import {
  BottomSheet,
  Button,
  Divider,
  Group,
  HStack,
  Host,
  Image,
  RNHostView,
  ScrollView,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel,
  background,
  buttonStyle,
  contentShape,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  imageScale,
  padding,
  presentationBackground,
  presentationDragIndicator,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { MENU_REACTIONS, reactedByMe } from '../../host/conversation';
import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { rowSymbol } from '../primitives/row-icon';
import { useStrings } from '../strings';
import {
  dismissQueue,
  menuGroups,
  menuLabel,
  menuReactions,
  menuTime,
  messageMenuActions,
  runAction,
  type MessageActionsProps,
  type MessageMenuAction,
  type MessageMenuTarget,
} from './message-sheet';
import { MessageSheetText } from './message-sheet-text';

export {
  dismissQueue,
  menuTime,
  messageMenuActions,
  type ActivityMenuLink,
  type MessageMenuAction,
  type MessageMenuTarget,
} from './message-sheet';

export function MessageActions({
  target,
  readOnly = false,
  onClose,
  onReact,
  onCopy,
  onShareText,
}: MessageActionsProps) {
  const theme = useDesignTheme();
  const queue = useRef(dismissQueue(Platform.OS)).current;
  const [last, setLast] = useState(target);
  if (target !== undefined && target !== last) setLast(target);
  const shown = target ?? last;
  if (shown === undefined) return null;
  return (
    <Host
      key={theme.scheme}
      colorScheme={theme.scheme}
      pointerEvents="none"
      style={{ position: 'absolute' }}
    >
      <BottomSheet
        isPresented={target !== undefined}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose();
        }}
        onDismiss={queue.flush}
        fitToContents
      >
        <Group
          modifiers={[
            frame({ maxWidth: Infinity, alignment: 'topLeading' }),
            padding({ top: space.x6, bottom: space.x4, horizontal: space.x5 }),
            presentationDragIndicator('visible'),
            presentationBackground(theme.overlay.fill),
          ]}
        >
          <SheetContent
            target={shown}
            readOnly={readOnly}
            onReact={(emoji, active) => {
              onReact(shown.message, emoji, active);
              onClose();
            }}
            onAction={(action) => {
              runAction(action, shown.message, {
                onCopy,
                onShareText: (text) => queue.after(() => onShareText(text)),
                onOpen: () => queue.after(() => shown.activity?.onOpen?.()),
              });
              onClose();
            }}
          />
        </Group>
      </BottomSheet>
    </Host>
  );
}

function SheetContent({
  target,
  readOnly,
  onReact,
  onAction,
}: {
  target: MessageMenuTarget;
  readOnly: boolean;
  onReact(emoji: string, active: boolean): void;
  onAction(action: MessageMenuAction): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const { message } = target;
  const mine = new Set((message.reactions ?? []).filter(reactedByMe).map((r) => r.emoji));
  const icon = theme.type.title.line;
  return (
    <VStack
      alignment="leading"
      spacing={space.x5}
      modifiers={[
        fixedSize({ horizontal: false, vertical: true }),
        accessibilityElement('contain'),
        accessibilityLabel(menuLabel(target)),
      ]}
    >
      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(theme.color.muted)]}>
        {menuTime(message.at, new Date())}
      </Text>
      {menuReactions(target, readOnly) ? (
        <ScrollView
          axes="horizontal"
          showsIndicators={false}
          modifiers={[accessibilityElement('contain'), accessibilityLabel(t.reactions)]}
        >
          <HStack spacing={space.x3}>
            {MENU_REACTIONS.map((emoji) => {
              const picked = mine.has(emoji);
              return (
                <Button
                  key={emoji}
                  onPress={() => onReact(emoji, !picked)}
                  modifiers={[
                    buttonStyle('plain'),
                    accessibilityLabel(picked ? t.unreact(emoji) : t.react(emoji)),
                    accessibilityAddTraits(picked ? ['isSelected'] : []),
                  ]}
                >
                  <Text
                    modifiers={[
                      font({ textStyle: 'title2' }),
                      padding({ all: space.x3 }),
                      frame({ minWidth: theme.touch, minHeight: theme.touch }),
                      background(
                        picked ? theme.layer.raised.chosen : theme.layer.raised.fill,
                        shapes.circle(),
                      ),
                      contentShape(shapes.circle()),
                    ]}
                  >
                    {emoji}
                  </Text>
                </Button>
              );
            })}
          </HStack>
        </ScrollView>
      ) : null}
      {target.activity === undefined ? null : (
        <RNHostView matchContents={{ vertical: true }}>
          <MessageSheetText body={message.body} />
        </RNHostView>
      )}
      {menuGroups(messageMenuActions(message, target.activity)).map((group) => (
        <VStack
          key={group.map((action) => action.key).join()}
          spacing={0}
          modifiers={[
            background(
              theme.layer.raised.fill,
              shapes.roundedRectangle({
                cornerRadius: radius.lg,
                roundedCornerStyle: 'continuous',
              }),
            ),
          ]}
        >
          {group.map((action, index) => (
            <Fragment key={action.key}>
              {index === 0 ? null : (
                <Divider modifiers={[padding({ leading: space.x5 + icon + space.x4 })]} />
              )}
              <Button
                onPress={() => onAction(action)}
                modifiers={[buttonStyle('plain'), accessibilityLabel(action.label)]}
              >
                <HStack
                  spacing={space.x4}
                  modifiers={[
                    padding({ horizontal: space.x5, vertical: space.x4 }),
                    frame({ minHeight: theme.touch }),
                    contentShape(shapes.rectangle()),
                  ]}
                >
                  <Image
                    systemName={rowSymbol(action.key).ios}
                    modifiers={[
                      font({ textStyle: 'body' }),
                      foregroundStyle(theme.color.fg),
                      imageScale('medium'),
                      frame({ minWidth: icon }),
                    ]}
                  />
                  <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle(theme.color.fg)]}>
                    {action.label}
                  </Text>
                  <Spacer />
                </HStack>
              </Button>
            </Fragment>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}
