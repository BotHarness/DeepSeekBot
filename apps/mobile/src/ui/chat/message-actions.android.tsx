import {
  Box,
  Column,
  Host,
  ModalBottomSheet,
  RNHostView,
  Row,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  Shapes,
  background,
  clip,
  defaultMinSize,
  horizontalScroll,
  padding,
  paddingAll,
  semantics,
  toggleable,
} from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet } from 'react-native';

import { MENU_REACTIONS, reactedByMe } from '../../host/conversation';
import { materialMenu, space } from '../design/tokens';
import { MaterialMenuGroup } from '../primitives/material-menu.android';
import { useDesignTheme } from '../design/theme';
import { RowIcon } from '../primitives/row-icon';
import { useStrings } from '../strings';
import {
  menuGroups,
  menuLabel,
  menuReactions,
  menuTime,
  messageMenuActions,
  runAction,
  type MessageActionsProps,
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
  const t = useStrings();
  const theme = useDesignTheme();
  if (target === undefined) return null;
  const { message } = target;
  const mine = new Set((message.reactions ?? []).filter(reactedByMe).map((r) => r.emoji));
  const groups = menuGroups(
    messageMenuActions(message, target.activity, target.actions !== undefined),
  );
  const reactions = menuReactions(target, readOnly);
  return (
    <Host
      key={message.id}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={onClose} skipPartiallyExpanded>
        <Column modifiers={[semantics({ contentDescription: menuLabel(target) })]}>
          <Text
            color={theme.color.muted}
            style={{ typography: 'labelMedium' }}
            modifiers={[padding(space.x5, 0, space.x5, space.x3)]}
          >
            {menuTime(message.at, new Date())}
          </Text>
          {reactions ? (
            <Row
              horizontalArrangement={{ spacedBy: space.x3 }}
              modifiers={[
                horizontalScroll(),
                padding(space.x5, space.x3, space.x5, space.x4),
                semantics({ contentDescription: t.reactions }),
              ]}
            >
              {MENU_REACTIONS.map((emoji) => {
                const picked = mine.has(emoji);
                return (
                  <Box
                    key={emoji}
                    contentAlignment="center"
                    modifiers={[
                      defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
                      clip(Shapes.Circle),
                      background(picked ? theme.layer.raised.chosen : theme.layer.raised.fill),
                      toggleable(picked, () => {
                        onReact(message, emoji, !picked);
                        onClose();
                      }),
                      semantics({ contentDescription: picked ? t.unreact(emoji) : t.react(emoji) }),
                      paddingAll(space.x3),
                    ]}
                  >
                    <Text style={{ typography: 'titleLarge' }}>{emoji}</Text>
                  </Box>
                );
              })}
            </Row>
          ) : null}
          {target.activity === undefined ? null : (
            <RNHostView
              matchContents={{ vertical: true }}
              modifiers={[padding(space.x5, space.x3, space.x5, space.x4)]}
            >
              <MessageSheetText body={message.body} />
            </RNHostView>
          )}
          <Column
            verticalArrangement={{ spacedBy: materialMenu.groupGap }}
            modifiers={[padding(space.x5, 0, space.x5, space.x5)]}
          >
            {groups.map((group) => (
              <MaterialMenuGroup
                key={group.map((action) => action.key).join()}
                items={group.map((action) => ({
                  key: action.key,
                  label: action.label,
                  icon: (
                    <RowIcon
                      name={action.key}
                      color={theme.color.muted}
                      size={materialMenu.iconSize}
                    />
                  ),
                  onPress: () => {
                    runAction(action, message, {
                      onFeedback: target.actions?.feedback,
                      onSelect: target.actions?.select,
                      onCopy,
                      onShareText,
                      onOpen: () => target.activity?.onOpen?.(),
                    });
                    onClose();
                  },
                }))}
              />
            ))}
          </Column>
        </Column>
      </ModalBottomSheet>
    </Host>
  );
}
