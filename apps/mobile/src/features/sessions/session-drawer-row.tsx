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
import { RowStatusGlyph } from '../../ui/chat/row-status-glyph';
import { useHostLook } from '../../host/native-host-look';
import { HostGlyph } from '../../ui/shell/host-tile';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { cornerBadge, radius, rowGlyph, space } from '../../ui/design/tokens';
import { clampScaledIconSize } from '../../ui/design/scaled-icon-size';
import { Text } from '../../ui/primitives/text';
import { useStrings } from '../../ui/strings';
import { folderColorIndex, folderMonogram, type SessionQueryRow } from './session-query-model';

export type SessionRowStatus = 'working' | 'needs-you' | 'done';

export function sessionRowStatus(
  row: Pick<SessionQueryRow, 'running' | 'waiting'>,
): SessionRowStatus {
  return row.waiting === true ? 'needs-you' : row.running ? 'working' : 'done';
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
  const look = useHostLook(row.hostId);
  const title = row.title ?? (row.source.kind === 'bot' ? row.source.displayName : t.untitled);
  const status = sessionRowStatus(row);
  const statusText = { working: t.running, 'needs-you': t.waiting, done: t.done }[status];
  const place = [showHost ? row.hostName : undefined, row.folderName].filter(
    (part): part is string => part !== undefined && part !== '',
  );
  const minutes = Math.max(0, Math.floor((now - (row.lastPromptAt ?? row.updatedAt)) / 60_000));
  const when = strings.ago(minutes);
  const brand = row.model === undefined ? undefined : modelBrand(row.model);
  const colorId = HOST_COLOR_IDS[folderColorIndex(row.folderName, HOST_COLOR_IDS.length)];
  const badge = Math.round(clampScaledIconSize(theme.touch, theme.fontScale, theme.touch * 1.5));
  const avatar = Math.round(badge / 2);
  const metaIcon = Math.round(theme.type.meta.line * theme.fontScale);
  const statusIcon = Math.round(rowGlyph.size * theme.fontScale);
  const statusLine = (
    <View
      testID={`session-status-${row.sessionId}`}
      accessibilityLabel={statusText}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}
    >
      <RowStatusGlyph status={status} size={statusIcon} />
      <Text variant="meta" tone="subtle" numberOfLines={1}>
        {when}
      </Text>
    </View>
  );
  const modelIcon =
    row.model === undefined ? null : (
      <View testID={`session-model-${row.sessionId}`}>
        <ModelBrandIcon brand={brand} size={metaIcon} color={theme.color.muted} />
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        ...place,
        row.source.kind === 'bot' ? row.source.displayName : undefined,
        statusText,
        when,
        row.model?.model,
      ]
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
            maxFontSizeMultiplier={Math.max(cornerBadge.maxTextScale, badge / theme.touch)}
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
        <View
          testID={`session-title-line-${row.sessionId}`}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}
        >
          <Text strong numberOfLines={2} ellipsizeMode="tail" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </Text>
          {theme.largeText ? null : statusLine}
        </View>
        <View
          testID={`session-place-line-${row.sessionId}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, minWidth: 0 }}
        >
          <View
            testID={`session-place-${row.sessionId}`}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.x2,
              minWidth: 0,
            }}
          >
            <HostGlyph icon={look.icon} size={metaIcon} color={theme.color.muted} />
            <Text
              variant="meta"
              tone="muted"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ flex: 1, minWidth: 0 }}
            >
              {place.length === 0 ? row.hostName : place.join(' · ')}
            </Text>
          </View>
          {theme.largeText ? null : modelIcon}
        </View>
        {theme.largeText ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
            {statusLine}
            {modelIcon}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
