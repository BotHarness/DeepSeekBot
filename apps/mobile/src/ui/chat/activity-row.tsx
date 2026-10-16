import { useRef } from 'react';
import { Pressable, View } from 'react-native';

import type { ChannelActivity } from '../../host/channel-activity';
import type { RosterView } from '../../host/client';
import type { ConversationMessage } from '../../host/conversation';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { motion, radius, space } from '../design/tokens';
import { haptic } from '../haptics';
import { Text } from '../primitives/text';
import {
  ChatsIcon,
  GitCommitIcon,
  MessageIcon,
  PersonIcon,
  PlusIcon,
  RecordingStopIcon,
} from '../shell/icons';
import { t } from '../strings';
import { activityPeer, activityText, type ActivityTarget } from './activity-text';
import { bubbleRow } from './bubble-shape';
import type { Rect } from './menu-placement';
import { SPEAKER_AVATAR } from './speaker-row';

export function ActivityRow({
  message,
  activity,
  roster,
  count = 1,
  dmSlug,
  lifted = false,
  onLongPress,
}: {
  message: ConversationMessage;
  activity: ChannelActivity;
  roster: RosterView | undefined;
  count?: number;
  dmSlug?: string | undefined;
  lifted?: boolean;
  onLongPress(anchor: Rect, label: string, target: ActivityTarget | undefined): void;
}) {
  const ref = useRef<View>(null);
  const theme = useDesignTheme();
  const line = activityText(message, activity, roster, count);
  const actor = roster?.bots.find((entry) => entry.slug === line.botSlug);
  const peerSlug = activityPeer(activity, line.botSlug, roster);
  const peer = roster?.bots.find((entry) => entry.slug === peerSlug);
  const label = [`${line.name} ${line.verb}`, line.detail]
    .filter((part) => part !== undefined)
    .join(' ');
  const detail =
    activity.kind === 'memory'
      ? activity.commit.subject || line.verb
      : [line.verb, line.detail].filter((part) => part !== undefined).join(' ');
  const summary =
    dmSlug !== undefined && line.botSlug === dmSlug ? detail : `${line.name} ${detail}`;
  const Icon =
    activity.kind === 'memory'
      ? GitCommitIcon
      : activity.kind === 'dm-action'
        ? MessageIcon
        : activity.kind === 'channel-post'
          ? ChatsIcon
          : activity.kind === 'bot-create'
            ? PlusIcon
            : activity.kind === 'departure'
              ? PersonIcon
              : RecordingStopIcon;
  const size = theme.type.meta.line;
  const hit = Math.max(0, (theme.touch - size) / 2);
  const open = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ x, y, width, height }, label, line.target);
    });
  };
  return (
    <View style={bubbleRow(true)}>
      <View ref={ref} collapsable={false} style={{ opacity: lifted ? 0 : 1 }}>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t.activityRow.actionsHint}
          accessibilityActions={[{ name: 'longpress', label: t.activityRow.actions }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'longpress') open();
          }}
          onAccessibilityTap={open}
          delayLongPress={motion.lift}
          hitSlop={{ top: hit, bottom: hit }}
          onLongPress={() => {
            haptic('menu');
            open();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            backgroundColor: pressed ? theme.layer.sheet.pressed : 'transparent',
          })}
        >
          {dmSlug !== undefined ? null : (
            <View style={{ width: SPEAKER_AVATAR, alignItems: 'center' }}>
              {actor === undefined ? (
                <PersonIcon color={theme.color.muted} size={size} />
              ) : (
                <BotAvatar bot={actor} size={size} corner={radius.xs} ring={false} />
              )}
            </View>
          )}
          <Icon color={theme.color.muted} size={size} />
          {dmSlug === undefined || peerSlug === undefined ? null : peer === undefined ? (
            <PersonIcon color={theme.color.muted} size={size} />
          ) : (
            <BotAvatar bot={peer} size={size} corner={radius.xs} ring={false} />
          )}
          <Text
            variant="meta"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1 }}
          >
            {summary.replace(/\s+/gu, ' ')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
