import { Pressable, View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import { modelBrand } from '@botharness/host-client/shared/model-brand';
import {
  HOST_COLOR_IDS,
  hostColorInk,
  hostTileFill,
} from '@botharness/host-client/ui/design/host-look';
import { BotPortrait } from '../../ui/bot-avatar';
import { ModelBrandIcon } from '../../ui/chat/model-brand-icon';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { cornerBadge, edge, radius, space, statusChip } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { useStrings } from '../../ui/strings';
import { folderColorIndex, folderMonogram, type SessionQueryRow } from './session-query-model';

export type SessionRowStatus = 'running' | 'waiting' | 'done';

export function sessionRowStatus(
  row: Pick<SessionQueryRow, 'running' | 'waiting'>,
): SessionRowStatus {
  return row.waiting === true ? 'waiting' : row.running ? 'running' : 'done';
}

export function SessionDrawerRow({
  row,
  client,
  showHost,
  selected,
  now = Date.now(),
  onPress,
}: {
  row: SessionQueryRow;
  client: HostClient | undefined;
  showHost: boolean;
  selected: boolean;
  now?: number;
  onPress(): void;
}) {
  const strings = useStrings();
  const t = strings.hostSessions;
  const theme = useDesignTheme();
  const title = row.title ?? (row.source.kind === 'bot' ? row.source.displayName : t.untitled);
  const status = sessionRowStatus(row);
  const statusText = { running: t.running, waiting: t.waiting, done: t.done }[status];
  const statusColor = {
    running: theme.color.accent,
    waiting: theme.color.warning,
    done: theme.color.subtle,
  }[status];
  const place = [
    showHost ? row.hostName : undefined,
    row.folderName,
    row.source.kind === 'bot' ? row.source.displayName : undefined,
  ].filter((part): part is string => part !== undefined && part !== '');
  const minutes = Math.max(0, Math.floor((now - (row.lastPromptAt ?? row.updatedAt)) / 60_000));
  const when = strings.ago(minutes);
  const brand = row.model === undefined ? undefined : modelBrand(row.model);
  const colorId = HOST_COLOR_IDS[folderColorIndex(row.folderName, HOST_COLOR_IDS.length)];
  const badge = theme.touch;
  const avatar = Math.round(badge / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, ...place, statusText, when, row.model?.model]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected }}
      testID={`host-session-${row.sessionId}`}
      onPress={onPress}
      android_ripple={{ color: pressTint(theme.color.fg) }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        borderRadius: radius.md,
        padding: space.x3,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.x3,
        backgroundColor: pressed || selected ? theme.layer.raised.inset : undefined,
      })}
    >
      <View accessible={false} style={{ width: badge, height: badge }}>
        <View
          testID={`session-monogram-${row.sessionId}`}
          style={{
            width: badge,
            height: badge,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: hostTileFill(theme.scheme, theme.color, colorId, theme.color.base),
          }}
        >
          <Text
            strong
            variant="meta"
            numberOfLines={1}
            maxFontSizeMultiplier={cornerBadge.maxTextScale}
            style={{ color: hostColorInk(theme.scheme, theme.color, colorId) }}
          >
            {folderMonogram(row.folderName)}
          </Text>
        </View>
        {row.source.kind === 'bot' ? (
          <View
            testID={`session-bot-${row.sessionId}`}
            style={{
              position: 'absolute',
              right: -space.x1,
              bottom: -space.x1,
              borderRadius: radius.round,
              borderWidth: edge.focus,
              borderColor: theme.color.base,
              backgroundColor: theme.color.base,
            }}
          >
            <BotPortrait
              size={avatar}
              bot={{
                slug: row.source.botSlug,
                displayName: row.source.displayName,
                ...(row.source.appearance === undefined
                  ? {}
                  : { appearance: row.source.appearance }),
                ...(row.source.avatarSeed === undefined
                  ? {}
                  : { avatarSeed: row.source.avatarSeed }),
                ...(row.source.avatar === undefined
                  ? {}
                  : row.source.avatar.startsWith('/')
                    ? client === undefined
                      ? {}
                      : { avatarSource: client.resource(row.source.avatar) }
                    : { avatarUrl: row.source.avatar }),
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
        <Text strong numberOfLines={theme.largeText ? undefined : 2}>
          {title}
        </Text>
        {place.length === 0 ? null : (
          <Text variant="meta" tone="muted" numberOfLines={theme.largeText ? undefined : 1}>
            {place.join(' · ')}
          </Text>
        )}
      </View>
      <View
        style={{
          flexShrink: 0,
          alignSelf: 'stretch',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: space.x1,
        }}
      >
        <View style={{ alignItems: 'flex-end', gap: space.x1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
            <View
              style={{
                width: statusChip.dot,
                height: statusChip.dot,
                borderRadius: radius.round,
                backgroundColor: statusColor,
              }}
            />
            <Text
              variant="meta"
              testID={`session-status-${row.sessionId}`}
              style={{ color: statusColor }}
            >
              {statusText}
            </Text>
          </View>
          <Text variant="meta" tone="subtle">
            {when}
          </Text>
        </View>
        {row.model === undefined ? null : (
          <View testID={`session-model-${row.sessionId}`}>
            <ModelBrandIcon brand={brand} size={theme.type.meta.line} color={theme.color.muted} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
