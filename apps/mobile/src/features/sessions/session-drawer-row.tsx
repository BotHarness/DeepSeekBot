import { Pressable, View } from 'react-native';
import type { HostClient } from '@botharness/host-client/client';
import {
  HOST_COLOR_IDS,
  hostColorInk,
  shownHostName,
} from '@botharness/host-client/ui/design/host-look';
import { BotPortrait } from '../../ui/bot-avatar';
import { ModelBrandIcon } from '../../ui/chat/model-brand-icon';
import { RowStatusGlyph } from '../../ui/chat/row-status-glyph';
import { SourceMark } from '../../ui/chat/source-name';
import { useHostLook } from '../../host/native-host-look';
import { FolderIcon } from '../../ui/shell/icons';
import { pressTint, useDesignTheme } from '../../ui/design/theme';
import { radius, space } from '../../ui/design/tokens';
import { Text } from '../../ui/primitives/text';
import { useStrings } from '../../ui/strings';
import { sessionRowIdentity, sessionRowNeed } from './session-drawer-model';
import type { SessionQueryRow } from './session-query-model';

export type SessionRowStatus = 'working' | 'needs-you' | 'done';

const HOST_STATUS = { 'needs-you': 'needs-you', running: 'working', idle: 'done' } as const;

export function sessionRowStatus(
  row: Pick<SessionQueryRow, 'running' | 'waiting' | 'status' | 'attention'>,
): SessionRowStatus {
  if (row.attention !== undefined) return 'needs-you';
  if (row.status !== undefined) return HOST_STATUS[row.status];
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
  const identity = sessionRowIdentity(row, showHost, HOST_COLOR_IDS.length);
  const title = row.title ?? identity.bot?.displayName ?? t.untitled;
  const need = sessionRowNeed(row);
  const minutes = Math.max(0, Math.floor((now - (row.lastPromptAt ?? row.updatedAt)) / 60_000));
  const when = strings.ago(minutes);
  const status = sessionRowStatus(row);
  const statusText =
    need === undefined
      ? { working: t.running, 'needs-you': t.waiting, done: t.done }[status]
      : t.need[need];
  const hostName = shownHostName(look, row.hostName);
  const mark = theme.type.meta.line;
  const folderInk =
    identity.folder === undefined
      ? theme.color.muted
      : hostColorInk(theme.scheme, theme.color, HOST_COLOR_IDS[identity.folder.colorIndex]);
  const statusCluster = (
    <View
      testID={`session-status-${row.sessionId}`}
      accessibilityLabel={statusText}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1, flexShrink: 0 }}
    >
      <RowStatusGlyph status={need === 'failed' ? 'blocked' : status} />
      {need === undefined ? (
        <Text variant="meta" tone="subtle" numberOfLines={1}>
          {when}
        </Text>
      ) : (
        <Text variant="meta" tone={need === 'failed' ? 'danger' : 'warning'} numberOfLines={1}>
          {statusText}
        </Text>
      )}
    </View>
  );
  const trailing = (
    <>
      {identity.model === undefined ? null : (
        <View testID={`session-model-${row.sessionId}`}>
          <ModelBrandIcon brand={identity.model.brand} size={mark} color={theme.color.muted} />
        </View>
      )}
      {statusCluster}
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        identity.folder === undefined ? undefined : `${t.folder} ${identity.folder.name}`,
        identity.bot?.displayName,
        identity.model?.model,
        statusText,
        need === undefined ? when : undefined,
        identity.host === undefined ? undefined : hostName,
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
        gap: space.x1,
        backgroundColor: pressed || selected ? theme.layer.raised.inset : undefined,
      })}
    >
      <View
        testID={`session-top-line-${row.sessionId}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3, minWidth: 0 }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x2,
            minWidth: 0,
          }}
        >
          {identity.folder === undefined ? null : (
            <View
              testID={`session-folder-${row.sessionId}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x1,
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              <FolderIcon color={folderInk} size={mark} focused />
              <Text
                variant="meta"
                tone="muted"
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ flexShrink: 1, minWidth: 0 }}
              >
                {identity.folder.name}
              </Text>
            </View>
          )}
          {identity.bot === undefined ? null : (
            <View testID={`session-bot-${row.sessionId}`} style={{ flexShrink: 0 }}>
              <BotPortrait size={mark} bot={botLook(identity.bot, client)} />
            </View>
          )}
        </View>
        {theme.largeText ? null : trailing}
      </View>
      <Text testID={`session-title-${row.sessionId}`} strong numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
      {theme.largeText ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          {trailing}
        </View>
      ) : null}
      {identity.host === undefined ? null : (
        <View
          testID={`session-host-${row.sessionId}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2, minWidth: 0 }}
        >
          <SourceMark source="computer" look={look} size={mark} />
          <Text
            variant="meta"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, minWidth: 0 }}
          >
            {hostName}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function botLook(
  source: Extract<SessionQueryRow['source'], { kind: 'bot' }>,
  client: HostClient | undefined,
) {
  return {
    slug: source.botSlug,
    displayName: source.displayName,
    ...(source.appearance === undefined ? {} : { appearance: source.appearance }),
    ...(source.avatarSeed === undefined ? {} : { avatarSeed: source.avatarSeed }),
    ...(source.avatar === undefined
      ? {}
      : source.avatar.startsWith('/')
        ? client === undefined
          ? {}
          : { avatarSource: client.resource(source.avatar) }
        : { avatarUrl: source.avatar }),
  };
}
