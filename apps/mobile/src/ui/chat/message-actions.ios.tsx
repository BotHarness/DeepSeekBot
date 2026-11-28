import { MessageMenuHeader } from './message-turn-targets';
import {
  BottomSheet,
  Button,
  Group,
  HStack,
  Host,
  Label,
  List,
  RNHostView,
  ScrollView,
  Section,
  Text,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listSectionMargins,
  listStyle,
  presentationDetents,
  presentationDragIndicator,
  padding,
  scrollContentBackground,
} from '@expo/ui/swift-ui/modifiers';
import { useRef, useState } from 'react';
import { Platform, PlatformColor, View } from 'react-native';

import { MENU_REACTIONS, reactedByMe } from '@botharness/host-client/conversation';
import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { rowSymbol } from '../primitives/row-icon';
import { useStrings } from '../strings';
import {
  actionId,
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
import { iosMajor } from '../platform-version';

export function MessageActions({
  target,
  catalog,
  readOnly = false,
  onClose,
  onReact,
  onCopy,
  onSelectCopy,
  onShareText,
  onShareAttachment,
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
      >
        <Group
          modifiers={[
            presentationDetents(['medium', 'large']),
            presentationDragIndicator('visible'),
          ]}
        >
          <SheetContent
            target={shown}
            catalog={catalog}
            readOnly={readOnly}
            selectCopy={onSelectCopy !== undefined}
            onReact={(emoji, active) => {
              onReact(shown.message, emoji, active);
              onClose();
            }}
            onAction={(action) => {
              runAction(action, shown.message, {
                onFeedback: () => queue.after(() => shown.actions?.feedback()),
                onSelect: () => queue.after(() => shown.actions?.select()),
                onCopy,
                onSelectCopy: (message) => queue.after(() => onSelectCopy?.(message)),
                onShareText: (text) => queue.after(() => onShareText(text)),
                onShareAttachment: (attachment) =>
                  queue.after(() => onShareAttachment?.(attachment)),
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
  catalog,
  readOnly,
  selectCopy,
  onReact,
  onAction,
}: {
  target: MessageMenuTarget;
  catalog: MessageActionsProps['catalog'];
  readOnly: boolean;
  selectCopy: boolean;
  onReact(emoji: string, active: boolean): void;
  onAction(action: MessageMenuAction): void;
}) {
  const t = useStrings();
  const { message } = target;
  const time = menuTime(message.at, new Date());
  const theme = useDesignTheme();
  const glass = iosMajor() >= 26;
  const mine = new Set((message.reactions ?? []).filter(reactedByMe).map((r) => r.emoji));
  return (
    <List
      modifiers={[
        listStyle('insetGrouped'),
        scrollContentBackground('hidden'),
        accessibilityElement('contain'),
        accessibilityLabel(menuLabel(target)),
      ]}
    >
      <Section
        header={
          message.turnTargets === undefined ? (
            <Text
              testID="message-menu-time"
              modifiers={[padding({ top: space.x5, horizontal: space.x5 })]}
            >
              {time}
            </Text>
          ) : (
            <RNHostView matchContents={{ vertical: true }}>
              <View style={{ paddingTop: space.x5, paddingHorizontal: space.x5 }}>
                <MessageMenuHeader time={time} targets={message.turnTargets} catalog={catalog} />
              </View>
            </RNHostView>
          )
        }
        modifiers={[listSectionMargins({ edges: 'horizontal', length: 0 })]}
      >
        {menuReactions(target, readOnly) ? (
          <ScrollView
            axes="horizontal"
            showsIndicators={false}
            modifiers={[
              listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
              listRowBackground('transparent'),
              listRowSeparator('hidden'),
              accessibilityElement('contain'),
              accessibilityLabel(t.reactions),
            ]}
          >
            <HStack spacing={space.x3} modifiers={[padding({ horizontal: space.x5 })]}>
              {MENU_REACTIONS.map((emoji) => {
                const picked = mine.has(emoji);
                return (
                  <Button
                    key={emoji}
                    onPress={() => onReact(emoji, !picked)}
                    modifiers={[
                      buttonStyle(
                        glass
                          ? picked
                            ? 'glassProminent'
                            : 'glass'
                          : picked
                            ? 'borderedProminent'
                            : 'bordered',
                      ),
                      buttonBorderShape('circle'),
                      accessibilityLabel(picked ? t.unreact(emoji) : t.react(emoji)),
                      accessibilityAddTraits(picked ? ['isSelected'] : []),
                    ]}
                  >
                    <Text
                      modifiers={[
                        font({ textStyle: 'title2' }),
                        frame({ width: theme.touch - space.x4, height: theme.touch - space.x4 }),
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
      </Section>
      {target.activity === undefined ? null : (
        <Section>
          <RNHostView matchContents={{ vertical: true }}>
            <MessageSheetText body={message.body} />
          </RNHostView>
        </Section>
      )}
      {menuGroups(
        messageMenuActions(message, target.activity, target.actions !== undefined, selectCopy),
      ).map((group) => (
        <Section key={group.map(actionId).join()}>
          {group.map((action) => (
            <Button
              key={actionId(action)}
              onPress={() => onAction(action)}
              modifiers={[accessibilityLabel(action.label)]}
            >
              <Label
                title={action.label}
                systemImage={
                  rowSymbol(
                    action.key === 'select-copy'
                      ? 'copy'
                      : action.key === 'attachments'
                        ? 'download'
                        : action.key,
                  ).ios
                }
                modifiers={[foregroundStyle(PlatformColor('label'))]}
              />
            </Button>
          ))}
        </Section>
      ))}
    </List>
  );
}
