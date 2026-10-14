import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConversationDraft, ConversationMessage } from '../../src/host/conversation';
import {
  useConversation,
  useConversationSnapshot,
  useHostSession,
  useHostSnapshot,
} from '../../src/host/host-session';
import { BotAvatar } from '../../src/ui/bot-avatar';
import { botColor } from '../../src/ui/bot-color';
import { AccentProvider } from '../../src/ui/design/theme';
import { DraftBubble, MessageBubble } from '../../src/ui/message-bubble';
import { t } from '../../src/ui/strings';
import { stateColor, useTheme } from '../../src/ui/theme';

type Row =
  | { kind: 'message'; message: ConversationMessage }
  | { kind: 'draft'; draft: ConversationDraft };

export default function DmScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return (
    <AccentProvider accent={bot === undefined ? undefined : botColor(bot)}>
      <DmConversation slug={slug} />
    </AccentProvider>
  );
}

function DmConversation({ slug }: { slug: string | undefined }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { client } = useHostSession();
  const host = useHostSnapshot(client);
  const bot = host.roster?.bots.find((entry) => entry.slug === slug);
  const target = useMemo(
    () =>
      slug === undefined
        ? undefined
        : {
            slug,
            ...(bot === undefined ? {} : { displayName: bot.displayName }),
            ...(bot?.dmChannelId === undefined ? {} : { dmChannelId: bot.dmChannelId }),
          },
    [slug, bot !== undefined],
  );
  const conversation = useConversation(client, target);
  const snapshot = useConversationSnapshot(conversation);
  const [draft, setDraft] = useState('');

  const rows = useMemo<Row[]>(
    () => [
      ...snapshot.drafts.map((entry): Row => ({ kind: 'draft', draft: entry })),
      ...[...snapshot.messages].reverse().map((message): Row => ({ kind: 'message', message })),
    ],
    [snapshot.drafts, snapshot.messages],
  );

  const send = () => {
    const body = draft.trim();
    if (body === '' || conversation === undefined) return;
    conversation.send(body);
    setDraft('');
  };

  const notice =
    snapshot.status === 'refused'
      ? t.dmRefused
      : host.roster !== undefined && bot === undefined
        ? t.noBot
        : snapshot.fromCache && host.connection.status !== 'connected'
          ? t.offline
          : snapshot.status === 'interrupted'
            ? t.liveInterrupted
            : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerTitle: () =>
            bot === undefined ? (
              <Text style={{ color: theme.ink, fontSize: 17, fontWeight: '600' }}>{slug}</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <BotAvatar bot={bot} size={28} />
                <View>
                  <Text
                    style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {bot.displayName}
                  </Text>
                  <Text style={{ color: stateColor(theme, bot.state), fontSize: 12 }}>
                    {bot.paused ? t.paused : t.state[bot.state]}
                  </Text>
                </View>
              </View>
            ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        {notice === undefined ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: theme.warning,
              backgroundColor: theme.warningSurface,
              paddingHorizontal: 16,
              paddingVertical: 8,
              fontSize: 13,
            }}
          >
            {notice}
          </Text>
        )}
        <FlatList
          inverted
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          data={rows}
          keyExtractor={(row) =>
            row.kind === 'draft' ? `draft:${row.draft.draftId}` : row.message.id
          }
          renderItem={({ item }) =>
            item.kind === 'draft' ? (
              <DraftBubble draft={item.draft} />
            ) : (
              <MessageBubble message={item.message} onRetry={(id) => conversation?.retry(id)} />
            )
          }
          onEndReached={() => void conversation?.loadOlder()}
          onEndReachedThreshold={0.5}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 40 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            snapshot.loadingOlder ? (
              <View style={{ padding: 12, alignItems: 'center', gap: 6 }}>
                <ActivityIndicator />
                <Text style={{ color: theme.inkSoft, fontSize: 12 }}>{t.olderLoading}</Text>
              </View>
            ) : !snapshot.hasOlder && snapshot.status === 'live' ? (
              <Text
                style={{
                  color: theme.inkSoft,
                  fontSize: 12,
                  textAlign: 'center',
                  padding: 16,
                }}
              >
                {t.beginning}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            snapshot.status === 'opening' ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            borderTopWidth: 1,
            borderTopColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t.messagePlaceholder}
            placeholderTextColor={theme.inkSoft}
            multiline
            style={{
              flex: 1,
              maxHeight: 140,
              minHeight: 38,
              color: theme.ink,
              fontSize: 16,
              paddingHorizontal: 12,
              paddingTop: 9,
              paddingBottom: 9,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.background,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.send}
            disabled={draft.trim() === '' || conversation === undefined}
            onPress={send}
            style={({ pressed }) => ({
              height: 38,
              paddingHorizontal: 16,
              borderRadius: 19,
              justifyContent: 'center',
              backgroundColor: theme.accent,
              opacity: draft.trim() === '' ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: theme.humanInk, fontSize: 16, fontWeight: '600' }}>{t.send}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
