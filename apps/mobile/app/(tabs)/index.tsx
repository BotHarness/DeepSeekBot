import { Redirect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  Text,
  View,
} from 'react-native';

import type { RosterBot, RosterChannel } from '../../src/host/client';
import { hostSession, useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { BotAvatar } from '../../src/ui/bot-avatar';
import { ConnectionBanner } from '../../src/ui/connection-banner';
import { OpenFullClientButton } from '../../src/ui/open-full-client';
import { t } from '../../src/ui/strings';
import { stateColor, useTheme } from '../../src/ui/theme';

type Row = { kind: 'bot'; bot: RosterBot } | { kind: 'channel'; channel: RosterChannel };

export default function RosterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { saved, client } = useHostSession();
  const snapshot = useHostSnapshot(client);
  const [refreshing, setRefreshing] = useState(false);

  if (saved === undefined)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  if (saved === null) return <Redirect href="/pair" />;

  const roster = snapshot.roster;
  const sections = [
    {
      title: t.bots,
      data: (roster?.bots ?? []).map((bot): Row => ({ kind: 'bot', bot })),
    },
    ...(roster !== undefined && roster.channels.length > 0
      ? [
          {
            title: t.channels,
            data: roster.channels.map((channel): Row => ({ kind: 'channel', channel })),
          },
        ]
      : []),
  ];

  const refresh = async () => {
    setRefreshing(true);
    await client?.refresh().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                paddingHorizontal: 16,
              }}
            >
              <OpenFullClientButton target={{ kind: 'home' }} />
              <Pressable
                onPress={() => void hostSession.unpair()}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={{ color: theme.accent, fontSize: 16 }}>{t.unpair}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.background }}
        sections={sections}
        keyExtractor={(row) => (row.kind === 'bot' ? row.bot.slug : row.channel.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <ConnectionBanner
            connection={snapshot.connection}
            onRetry={() => client?.retryNow()}
            onPairAgain={() => router.push('/pair')}
          />
        }
        ListEmptyComponent={null}
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              color: theme.inkSoft,
              fontSize: 13,
              fontWeight: '600',
              textTransform: 'uppercase',
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 6,
              backgroundColor: theme.background,
            }}
          >
            {section.title}
          </Text>
        )}
        renderSectionFooter={({ section }) =>
          section.title === t.bots && section.data.length === 0 && roster !== undefined ? (
            <Text style={{ color: theme.inkSoft, paddingHorizontal: 16 }}>{t.noBots}</Text>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'bot' ? <BotRow bot={item.bot} /> : <ChannelRow channel={item.channel} />
        }
      />
    </>
  );
}

function BotRow({ bot }: { bot: RosterBot }) {
  const theme = useTheme();
  const router = useRouter();
  const color = stateColor(theme, bot.state);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/dm/[slug]', params: { slug: bot.slug } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: pressed ? theme.codeSurface : 'transparent',
      })}
      accessibilityRole="button"
      accessibilityLabel={`${bot.displayName}, ${bot.paused ? t.paused : t.state[bot.state]}`}
    >
      <BotAvatar bot={bot} size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              color: theme.ink,
              fontSize: 16,
              fontWeight: '600',
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {bot.displayName}
          </Text>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: color,
            }}
          />
          <Text style={{ color, fontSize: 13 }}>{bot.paused ? t.paused : t.state[bot.state]}</Text>
        </View>
        {bot.preview !== undefined ? (
          <Text style={{ color: theme.inkSoft, fontSize: 14 }} numberOfLines={1}>
            {bot.preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ChannelRow({ channel }: { channel: RosterChannel }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 2 }}>
      <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
        # {channel.name}
      </Text>
      <Text style={{ color: theme.inkSoft, fontSize: 14 }} numberOfLines={1}>
        {channel.preview ?? t.members(channel.memberCount)}
      </Text>
    </View>
  );
}
