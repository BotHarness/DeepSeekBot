import type { ComponentProps, Ref } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { pinnedGrid, radius, space } from '../design/tokens';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { showActionMenu } from '../primitives/app-dialog';
import { CountBadge } from '../primitives/count-badge';
import { Text } from '../primitives/text';
import { ConversationPeek } from '../shell/conversation-peek';
import { t } from '../strings';
import type { ConversationRow } from './conversation-row';
import { countBadge, rowLabel, rowStatus, titleOf } from './conversations';
import { GroupMark } from './group-mark';
import { RowStatusGlyph } from './row-status-glyph';

type Props = Omit<ComponentProps<typeof ConversationRow>, 'onPress'> & {
  onPress?: (() => void) | undefined;
};

export function PinnedConversationCard(props: Props) {
  const { row, actions = [], onAction, previewHref } = props;
  const theme = useDesignTheme();
  const title = titleOf(row);
  const menuActions: MenuAction[] = actions.map((action) => ({
    label: action.label,
    icon:
      action.key === 'section'
        ? 'folder'
        : action.key === 'read'
          ? 'check'
          : action.key === 'pin' || action.key === 'unpin'
            ? 'pin'
            : 'mute',
    run: () => onAction?.(action.key),
  }));
  const face = <PinnedCardFace {...props} onPress={previewHref ? undefined : props.onPress} />;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: radius.md,
        backgroundColor: theme.layer.canvas.fill,
      }}
    >
      {previewHref ? <ConversationPeek href={previewHref}>{face}</ConversationPeek> : face}
      {onAction && actions.length > 0 ? (
        <View style={{ alignItems: 'center' }}>
          <ActionMenuButton
            label={t.conversationActions(title)}
            actions={menuActions}
            onOpen={() =>
              showActionMenu(
                title,
                actions.map((action) => ({
                  text: action.label,
                  onPress: () => onAction(action.key),
                })),
              )
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function PinnedCardFace({
  row,
  now,
  actions = [],
  onAction,
  onPress,
  ref,
}: Props & { ref?: Ref<ViewInstance> }) {
  const theme = useDesignTheme();
  const title = titleOf(row);
  const status = rowStatus(row, now);
  const badge = countBadge(row);
  return (
    <Pressable
      ref={ref}
      testID={`pinned-conversation-${row.key}`}
      accessibilityRole="button"
      accessibilityLabel={rowLabel(row, title, status, '')}
      accessibilityActions={actions.map((action) => ({ name: action.key, label: action.label }))}
      onAccessibilityAction={(event) => {
        const action = actions.find((entry) => entry.key === event.nativeEvent.actionName);
        if (action) onAction?.(action.key);
      }}
      onPress={onPress}
      android_ripple={{ color: theme.layer.canvas.pressed }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        alignItems: 'center',
        gap: space.x2,
        padding: space.x3,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      {row.kind === 'bot' ? (
        <BotAvatar bot={row.bot} size={pinnedGrid.avatar} corner={radius.md} ring={false} />
      ) : (
        <GroupMark
          avatar={row.channel.avatar}
          size={pinnedGrid.avatar}
          corner={radius.md}
          variant="title"
          strong={false}
        />
      )}
      <Text variant="meta" strong style={{ textAlign: 'center', alignSelf: 'stretch' }}>
        {title}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: space.x2,
        }}
      >
        <RowStatusGlyph status={status} />
        {badge ? <CountBadge count={badge.count} tone={badge.tone} /> : null}
      </View>
    </Pressable>
  );
}
