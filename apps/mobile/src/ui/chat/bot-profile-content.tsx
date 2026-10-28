import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { botChannels, botProfileResource, memoryRouteParams } from '../../host/bot-profile';
import { loadMemoryChanges } from '../../host/memory-changes';
import { botRoutines } from '../../host/routines';
import { setBotAvatar } from '../../host/bot-avatar';
import { pickAvatarImage } from '../../host/pick-avatar-image';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { RequestActivityControl } from './request-activity-control';
import { BotProfilePage } from './bot-profile';
import { BotPermissions } from './bot-permissions';
import { BotSettingsPanel } from './bot-settings-panel';
import { ChannelFilesTab } from './channel-files-tab';
import { profileTabMemory } from './native-profile-tab-memory';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export type BotProfileParams = {
  slug: string;
  hostId?: string | undefined;
  channelId?: string | undefined;
  activityMessageId?: string | undefined;
};

export function BotProfileContent({
  slug,
  hostId,
  channelId,
  activityMessageId,
  onClose,
}: BotProfileParams & { onClose?: () => void }) {
  const t = useStrings();
  const router = useRouter();
  const theme = useDesignTheme();
  const { client, saved } = useHostSession(hostId);
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const snapshot = useHostSnapshot(client);
  const roster = snapshot.roster;
  const bot = roster?.bots.find((entry) => entry.slug === slug);
  const channels = useMemo(() => botChannels(roster, slug ?? ''), [roster, slug]);
  const routines = useMemo(
    () => (client === undefined || slug === undefined ? undefined : botRoutines(client, slug)),
    [client, slug],
  );
  const profile = useMemo(
    () => (client === undefined || bot === undefined ? undefined : botProfileResource(client, bot)),
    [client, bot?.slug, bot?.dmChannelId],
  );

  const sourceChanged = (hostId ?? openedOn) !== saved?.hostId;
  if (sourceChanged || bot === undefined || profile === undefined || client === undefined)
    return (
      <View
        style={{
          flex: 1,
          padding: space.x6,
          backgroundColor: theme.overlay.fill,
        }}
      >
        {sourceChanged ? (
          <Text tone="muted">{t.sourceChanged}</Text>
        ) : roster === undefined ? null : (
          <Text tone="muted">{t.noBot}</Text>
        )}
      </View>
    );

  const filesChannel =
    saved &&
    bot.dmChannelId &&
    snapshot.connection.status !== 'refused' &&
    (channelId === undefined || channelId === bot.dmChannelId)
      ? bot.dmChannelId
      : undefined;
  return (
    <BotProfilePage
      key={`${saved?.hostId}:${bot.slug}`}
      bot={bot}
      channels={channels}
      initialProfile={profile.peek()}
      load={profile.refresh}
      tabMemory={profileTabMemory}
      avatar={{
        pick: pickAvatarImage,
        save: (avatar) => setBotAvatar(client, bot, avatar),
      }}
      workActions={
        saved ? (
          <RequestActivityControl
            client={client}
            bot={bot}
            hostId={saved.hostId}
            messageId={activityMessageId}
            channelId={channelId}
            refused={snapshot.connection.status === 'refused'}
          />
        ) : undefined
      }
      files={
        saved && filesChannel
          ? (active, render) => (
              <ChannelFilesTab
                client={client}
                hostId={saved.hostId}
                channelId={filesChannel}
                botSlug={bot.slug}
                active={active}
              >
                {render}
              </ChannelFilesTab>
            )
          : undefined
      }
      memoryChanges={(offset) => loadMemoryChanges(client, bot, offset)}
      settings={<BotSettingsPanel client={client} bot={bot} />}
      permissions={
        <BotPermissions
          client={client}
          bot={bot}
          actions={{
            onHistory: () =>
              router.push({
                pathname: '/bot/[slug]/approval-history',
                params: { slug: bot.slug, hostId: saved?.hostId },
              }),
            onRules: () =>
              router.push({
                pathname: '/bot/[slug]/approval-rules',
                params: { slug: bot.slug, hostId: saved?.hostId },
              }),
            onWorkspace: () =>
              router.push({
                pathname: '/bot/[slug]/workspace',
                params: { slug: bot.slug, hostId: saved?.hostId },
              }),
            onAccess: () =>
              router.push({
                pathname: '/bot/[slug]/access',
                params: { slug: bot.slug, hostId: saved?.hostId },
              }),
          }}
        />
      }
      actions={{
        onClose: onClose ?? (() => router.back()),
        onOpenRoutine: (routine) =>
          router.push({
            pathname: '/bot/[slug]/routine/[id]',
            params: { slug: bot.slug, hostId: saved?.hostId, id: routine.id },
          }),
        onOpenAssignment: (assignment) =>
          router.push({
            pathname: '/bot/[slug]/assignment/[id]',
            params: { slug: bot.slug, hostId: saved?.hostId, id: assignment.sessionId },
          }),
        onNewRoutine: () =>
          router.push({
            pathname: '/bot/[slug]/routine-new',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        ...(routines === undefined || snapshot.connection.status === 'refused' ? {} : { routines }),
        ...(bot.browserAccess
          ? {
              onBrowser: () =>
                router.push({
                  pathname: '/browser/[slug]',
                  params: { slug: bot.slug, hostId: saved?.hostId },
                }),
            }
          : {}),
        ...(bot.computerAccess &&
        snapshot.computerAvailable === true &&
        snapshot.connection.status !== 'refused' &&
        snapshot.connection.status !== 'stopped'
          ? {
              onComputer: () =>
                router.push({
                  pathname: '/computer/[slug]',
                  params: { slug: bot.slug, hostId: saved?.hostId },
                }),
            }
          : {}),
        onNotifications: () =>
          router.push({
            pathname: '/bot/[slug]/notifications',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        onOpenActivity: () =>
          router.push({
            pathname: '/bot/[slug]/activity',
            params: { slug: bot.slug, hostId: saved?.hostId },
          }),
        onOpenMemory: (entry) =>
          router.push({
            pathname: '/bot/[slug]/memory',
            params: { ...memoryRouteParams(bot.slug, entry), hostId: saved?.hostId },
          }),
        onOpenMemoryChange: (change) =>
          router.push({
            pathname: '/bot/[slug]/memory-commit',
            params: {
              slug: bot.slug,
              hostId: saved?.hostId,
              sha: change.sha,
              at: change.authoredAt,
            },
          }),
      }}
    />
  );
}
