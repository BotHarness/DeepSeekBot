import { Stack, useFocusEffect, useIsFocused, useNavigationContainerRef } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { createChannelFiles, type ChannelFile } from '../../host/channel-files';
import type { HostClient } from '../../host/client';
import type { MessageAttachment } from '../../host/conversation';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { shareAttachment } from '../../host/share-attachment';
import { edge, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { ActionMenuButton, type MenuAction } from '../primitives/action-menu-button';
import { showActionMenu } from '../primitives/app-dialog';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Text } from '../primitives/text';
import { FileIcon, PhotoIcon } from '../shell/icons';
import { conversationHref } from '../shell/open-conversation';
import { navigateChannel } from '../shell/channel-navigation';
import { useStrings } from '../strings';
import { ImageViewer } from './image-viewer';
import { fileSize } from './message-attachments';

type FilesPlace = { channelId: string; hostId: string; botSlug?: string };

export function ChannelFilesScreen(place: FilesPlace) {
  const { client, saved } = useHostSession();
  const t = useStrings();
  if (!client || saved?.hostId !== place.hostId) return <Text>{t.sourceChanged}</Text>;
  return <Files key={`${place.hostId}:${place.channelId}`} {...place} client={client} />;
}

function Files({ client, channelId, hostId, botSlug }: FilesPlace & { client: HostClient }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const navigation = useNavigationContainerRef();
  const focused = useIsFocused();
  const host = useHostSnapshot(client, focused);
  const files = useMemo(() => createChannelFiles({ host: client, channelId }), [client, channelId]);
  const snapshot = useSyncExternalStore(files.subscribe, files.getSnapshot);
  const [previewKey, setPreviewKey] = useState<string>();
  const [sharing, setSharing] = useState<string>();
  const [shareFailed, setShareFailed] = useState(false);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);
  const active = useRef(false);
  const lifecycle = useRef(0);
  const sharePending = useRef(false);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      sharePending.current = false;
      setSharing(undefined);
      files.start();
      return () => {
        active.current = false;
        lifecycle.current++;
        files.stop();
      };
    }, [files]),
  );
  const available =
    focused && snapshot.status === 'ready' && host.connection.status === 'connected';
  const preview = available
    ? snapshot.files.find((file) => file.key === previewKey)?.attachment
    : undefined;
  const share = async (attachment: MessageAttachment) => {
    if (sharePending.current || !available) return;
    const epoch = lifecycle.current;
    sharePending.current = true;
    const stillAvailable = () =>
      active.current &&
      lifecycle.current === epoch &&
      client.getSnapshot().connection.status === 'connected' &&
      files.getSnapshot().status === 'ready' &&
      files
        .getSnapshot()
        .files.some(
          (file) =>
            file.attachment.key === attachment.key &&
            file.attachment.source?.uri === attachment.source?.uri,
        );
    setSharing(attachment.key);
    setShareFailed(false);
    try {
      await shareAttachment(
        { ...attachment, key: `${hostId}:${channelId}:${attachment.key}` },
        stillAvailable,
      );
    } catch {
      if (active.current && lifecycle.current === epoch) setShareFailed(true);
    } finally {
      if (active.current && lifecycle.current === epoch) {
        sharePending.current = false;
        setSharing(undefined);
      }
    }
  };
  const viewMessage = (file: ChannelFile) => {
    if (
      !available ||
      !active.current ||
      client.getSnapshot().connection.status !== 'connected' ||
      files.getSnapshot().status !== 'ready' ||
      !files.getSnapshot().files.some((current) => current.key === file.key)
    )
      return;
    if (
      botSlug !== undefined &&
      host.roster?.bots.find((bot) => bot.slug === botSlug)?.dmChannelId !== channelId
    ) {
      setSourceUnavailable(true);
      return;
    }
    const opened = navigateChannel(
      navigation,
      conversationHref(
        botSlug === undefined
          ? { kind: 'channel', channel: { id: channelId } }
          : { kind: 'bot', bot: { slug: botSlug } },
        hostId,
        file.messageId,
      ),
    );
    if (!opened) setSourceUnavailable(true);
  };
  const author = ({ author: sender }: ChannelFile) =>
    sender.kind === 'human'
      ? t.activityRow.human
      : sender.kind === 'bot'
        ? (host.roster?.bots.find((bot) => bot.slug === sender.slug)?.displayName ?? sender.slug)
        : sender.kind === 'bridged'
          ? sender.source
          : t.channelFiles.system;
  const notice =
    snapshot.status === 'refused'
      ? t.channelFiles.unavailable
      : snapshot.status === 'interrupted'
        ? t.channelFiles.disconnected
        : sourceUnavailable
          ? t.channelFiles.messageUnavailable
          : shareFailed
            ? t.channelFiles.fileUnavailable
            : undefined;
  return (
    <>
      <Stack.Screen
        options={{ title: t.channelFiles.title, headerBackButtonDisplayMode: 'minimal' }}
      />
      <FlatList
        testID="channel-files-list"
        style={{ flex: 1, backgroundColor: theme.color.base }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5, paddingBottom: space.x6 }}
        data={snapshot.files}
        keyExtractor={(file) => file.key}
        ListHeaderComponent={
          notice === undefined ? (
            <></>
          ) : (
            <View style={{ gap: space.x3, paddingBottom: space.x5 }}>
              <Text accessibilityRole="alert" tone="muted">
                {notice}
              </Text>
              {snapshot.status === 'interrupted' ? (
                <Button
                  testID="channel-files-reconnect"
                  label={t.retry}
                  onPress={() => {
                    client.retryNow();
                    files.retry();
                  }}
                />
              ) : null}
            </View>
          )
        }
        ListEmptyComponent={
          snapshot.status === 'opening' ? (
            <LoadingIndicator />
          ) : snapshot.status === 'ready' ? (
            <Text tone="muted">
              {snapshot.hasOlder ? t.channelFiles.noRecent : t.channelFiles.empty}
            </Text>
          ) : (
            <></>
          )
        }
        renderItem={({ item }) => {
          const attachment = item.attachment;
          const disabled = !available || attachment.source === undefined;
          const busy = sharing === attachment.key;
          const date = new Date(item.at).toLocaleString();
          const Icon = attachment.kind === 'image' ? PhotoIcon : FileIcon;
          const rowId = item.key.toLowerCase().replace(/[^a-z0-9-]/gu, '-');
          const actions: MenuAction[] = [
            ...(disabled || sharing !== undefined
              ? []
              : [
                  {
                    label: t.shareFile(attachment.name),
                    icon: 'share' as const,
                    run: () => {
                      void share(attachment);
                    },
                  },
                ]),
            ...(available
              ? [
                  {
                    label: t.channelFiles.viewMessage,
                    icon: 'chat' as const,
                    run: () => viewMessage(item),
                  },
                ]
              : []),
          ];
          return (
            <View
              style={{
                borderBottomWidth: edge.hairline,
                borderColor: theme.color.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
              }}
            >
              <Pressable
                testID={`channel-file-row-${rowId}`}
                accessibilityRole="button"
                accessibilityLabel={`${attachment.name}, ${author(item)}, ${date}`}
                accessibilityState={{ disabled, busy }}
                disabled={disabled || sharing !== undefined}
                android_ripple={{ color: theme.layer.raised.pressed }}
                onPress={() =>
                  attachment.kind === 'image' ? setPreviewKey(item.key) : void share(attachment)
                }
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  paddingVertical: space.x5,
                  minHeight: theme.touch,
                  backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
                })}
              >
                {busy ? (
                  <LoadingIndicator size="control" />
                ) : (
                  <Icon color={theme.color.muted} size={theme.type.title.line} />
                )}
                <View style={{ flex: 1, gap: space.x2 }}>
                  <Text strong numberOfLines={2}>
                    {attachment.name}
                  </Text>
                  <Text variant="meta" tone="muted">
                    {author(item)} · {date}
                  </Text>
                  <Text variant="meta" tone="muted">
                    {attachment.cleared
                      ? t.attachmentCleared(fileSize(attachment.size ?? 0))
                      : attachment.source === undefined
                        ? t.attachmentElsewhere
                        : [
                            attachment.mime ?? t.fileKind,
                            attachment.size === undefined ? undefined : fileSize(attachment.size),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                  </Text>
                </View>
              </Pressable>
              <ActionMenuButton
                testID={`channel-file-actions-${rowId}`}
                label={t.conversationActions(attachment.name)}
                disabled={!available}
                actions={actions}
                onOpen={() =>
                  showActionMenu(
                    attachment.name,
                    actions.map((action) => ({
                      text: action.label,
                      icon: action.icon,
                      onPress: action.run,
                    })),
                  )
                }
              />
            </View>
          );
        }}
        ListFooterComponent={
          snapshot.hasOlder ? (
            <View style={{ paddingTop: space.x5, gap: space.x3 }}>
              {snapshot.pageFailed ? (
                <Text accessibilityRole="alert" tone="muted">
                  {t.channelFiles.pageFailed}
                </Text>
              ) : null}
              <Button
                testID={
                  snapshot.pageFailed ? 'channel-files-page-retry' : 'channel-files-load-older'
                }
                label={snapshot.pageFailed ? t.retry : t.channelFiles.loadOlder}
                disabled={!available}
                busy={snapshot.loadingOlder}
                onPress={() => {
                  void files.loadOlder();
                }}
              />
            </View>
          ) : (
            <></>
          )
        }
      />
      <ImageViewer
        attachment={preview}
        onClose={() => setPreviewKey(undefined)}
        onShare={share}
        cachePolicy="none"
      />
    </>
  );
}
