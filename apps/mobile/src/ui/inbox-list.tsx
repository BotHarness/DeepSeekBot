import type { ReactElement } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';

import type { RosterBot } from '../host/client';
import { INBOX_SECTIONS, type InboxSection, type InboxSnapshot } from '../host/inbox';
import type { HumanAttentionItem } from '../host/wire';
import { BotAvatar } from './bot-avatar';
import { Loading, Notice } from './request-parts';
import { t } from './strings';
import { useTheme } from './theme';

function minutesSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
}

export function InboxList({
  snapshot,
  bot,
  onOpen,
  refreshing,
  onRefresh,
  header,
  now = Date.now(),
}: {
  snapshot: InboxSnapshot;
  bot(slug: string): RosterBot | undefined;
  onOpen(item: HumanAttentionItem): void;
  refreshing: boolean;
  onRefresh(): void;
  header?: ReactElement | null;
  now?: number;
}) {
  const theme = useTheme();
  const sections =
    snapshot.status === 'ready'
      ? INBOX_SECTIONS.map((section) => ({ section, data: snapshot.sections[section] })).filter(
          (entry) => entry.data.length > 0 || entry.section === 'action',
        )
      : [];
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      sections={sections}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          {header}
          {snapshot.status === 'ready' && snapshot.stale !== undefined ? (
            <View style={{ paddingHorizontal: 16 }}>
              <Notice tone="warning">{`${t.inboxStale} ${snapshot.stale}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'error' ? (
            <View style={{ paddingHorizontal: 16 }}>
              <Notice tone="danger">{`${t.inboxFailed} ${snapshot.error}`}</Notice>
            </View>
          ) : null}
          {snapshot.status === 'loading' ? <Loading /> : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
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
          {t.inboxSections[section.section as InboxSection]}
        </Text>
      )}
      renderSectionFooter={({ section }) =>
        section.section === 'action' && section.data.length === 0 ? (
          <Text style={{ color: theme.inkSoft, paddingHorizontal: 16 }}>{t.inboxEmpty}</Text>
        ) : null
      }
      renderItem={({ item }) => (
        <InboxRow item={item} bot={bot(item.botSlug)} onOpen={onOpen} now={now} />
      )}
    />
  );
}

export function InboxRow({
  item,
  bot,
  onOpen,
  now,
}: {
  item: HumanAttentionItem;
  bot: RosterBot | undefined;
  onOpen(item: HumanAttentionItem): void;
  now: number;
}) {
  const theme = useTheme();
  const kind = t.kind[item.kind] ?? t.otherKind;
  const name = bot?.displayName ?? item.botSlug;
  const where =
    item.channelName !== undefined && !item.channelId?.startsWith('dm-')
      ? ` · ${t.inChannel(item.channelName)}`
      : '';
  const action = item.category === 'action';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kind}, ${name}${where}, ${item.summary}`}
      testID={`inbox-row-${item.id}`}
      onPress={() => onOpen(item)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {bot === undefined ? (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.border }} />
      ) : (
        <BotAvatar bot={bot} size={40} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {action ? (
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.warning }}
            />
          ) : null}
          <Text
            style={{
              color: action ? theme.warning : theme.inkSoft,
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            {kind}
          </Text>
          <Text style={{ color: theme.inkSoft, fontSize: 13, marginLeft: 'auto' }}>
            {t.ago(minutesSince(item.createdAt, now))}
          </Text>
        </View>
        <Text style={{ color: theme.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
          {name}
          <Text style={{ color: theme.inkSoft, fontWeight: '400' }}>{where}</Text>
        </Text>
        {item.summary.length > 0 ? (
          <Text style={{ color: theme.inkSoft, fontSize: 14 }} numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
