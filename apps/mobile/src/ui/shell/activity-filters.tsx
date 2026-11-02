import type { ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INBOX_SECTIONS, type InboxSection, type InboxSetAside } from '../../host/inbox';
import { Sheet } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { androidSettings, edge, radius, space } from '../design/tokens';
import { CheckmarkRow } from '../primitives/checkmark-row';
import { DrawerHeader } from '../primitives/drawer-header';
import { RadioMark } from '../primitives/radio-mark';
import { segmentCorners } from '../design/segment-corners';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { useStrings, t } from '../strings';

export type ActivitySection = 'all' | InboxSection | InboxSetAside;
export type ActivityFilter = {
  section: ActivitySection;
  bot: string | undefined;
  channel?: string | undefined;
  unreadOnly?: boolean;
};
export type ActivitySort = 'default' | 'newest' | 'oldest';
export const ALL_ACTIVITY: ActivityFilter = { section: 'all', bot: undefined };
export const DEFAULT_ACTIVITY: ActivityFilter = ALL_ACTIVITY;
export const ACTIVITY_SECTIONS: readonly ActivitySection[] = [
  'all',
  ...INBOX_SECTIONS.filter((section) => section !== 'unread'),
  'snoozed',
  'cleared',
];

export function sectionLabel(section: ActivitySection): string {
  if (section === 'all') return t.filterAll;
  if (section === 'cleared' || section === 'snoozed') return t.activitySetAside[section];
  return t.inboxSections[section];
}

type Props = {
  visible: boolean;
  bots: ReadonlyArray<{ slug: string; name: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  filter: ActivityFilter;
  sort: ActivitySort;
  onFilter(next: ActivityFilter): void;
  onSort(next: ActivitySort): void;
  onClose(): void;
};

type Choice = { key: string; label: string; selected: boolean; choose(): void };
type Row =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'choice'; first: boolean; last: boolean; choice: Choice; key: string }
  | { kind: 'unread'; key: string };

function TextAction({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        justifyContent: 'center',
        paddingHorizontal: space.x3,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text tone="accent" strong>
        {label}
      </Text>
    </Pressable>
  );
}

export function ActivityFilterContent({
  bots,
  channels,
  filter,
  sort,
  onFilter,
  onSort,
  onClose,
}: Omit<Props, 'visible'>) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const group = (key: string, label: string, choices: Choice[]): Row[] => [
    { kind: 'heading', key, label },
    ...choices.map((choice, index) => ({
      kind: 'choice' as const,
      key: choice.key,
      choice,
      first: index === 0,
      last: index === choices.length - 1,
    })),
  ];
  const rows: Row[] = [
    ...group('sort', t.activitySort, [
      {
        key: 'default',
        label: t.activitySortDefault,
        selected: sort === 'default',
        choose: () => onSort('default'),
      },
      {
        key: 'newest',
        label: t.activitySortNewest,
        selected: sort === 'newest',
        choose: () => onSort('newest'),
      },
      {
        key: 'oldest',
        label: t.activitySortOldest,
        selected: sort === 'oldest',
        choose: () => onSort('oldest'),
      },
    ]),
    ...group(
      'category',
      t.activityCategory,
      ACTIVITY_SECTIONS.map((section) => ({
        key: `section:${section}`,
        label: sectionLabel(section),
        selected: filter.section === section,
        choose: () => onFilter({ ...filter, section }),
      })),
    ),
    { kind: 'unread', key: 'unread' },
    ...group('bots', t.bots, [
      {
        key: 'bot:all',
        label: t.filterAllBots,
        selected: filter.bot === undefined,
        choose: () => onFilter({ ...filter, bot: undefined }),
      },
      ...bots.map((bot) => ({
        key: `bot:${bot.slug}`,
        label: bot.name,
        selected: filter.bot === bot.slug,
        choose: () => onFilter({ ...filter, bot: bot.slug }),
      })),
    ]),
    ...group('channels', t.channels, [
      {
        key: 'channel:all',
        label: t.activityAllChannels,
        selected: filter.channel === undefined,
        choose: () => onFilter({ ...filter, channel: undefined }),
      },
      ...channels.map((channel) => ({
        key: `channel:${channel.id}`,
        label: channel.name,
        selected: filter.channel === channel.id,
        choose: () => onFilter({ ...filter, channel: channel.id }),
      })),
    ]),
  ];
  const content = (
    <>
      {ios ? (
        <View
          style={{
            alignSelf: 'center',
            width: space.x6 + space.x3,
            height: space.x2,
            borderRadius: radius.round,
            backgroundColor: theme.layer.canvas.selected,
            marginTop: space.x3,
            marginBottom: space.x3,
          }}
        />
      ) : null}
      {!ios ? (
        <View style={{ paddingHorizontal: space.x5, paddingTop: space.x2 }}>
          <DrawerHeader title={t.activityOptions} onClose={onClose} />
        </View>
      ) : null}
      <FlatList
        nestedScrollEnabled
        ListHeaderComponent={
          ios ? (
            <View style={{ paddingHorizontal: space.x5, paddingTop: space.x2 }}>
              <DrawerHeader title={t.activityOptions} onClose={onClose} />
            </View>
          ) : undefined
        }
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.x6 }}
        renderItem={({ item }) => {
          if (item.kind === 'heading')
            return (
              <Text
                variant="meta"
                tone="muted"
                accessibilityRole="header"
                style={{
                  paddingHorizontal: space.x6,
                  paddingTop: space.x6,
                  paddingBottom: space.x3,
                }}
              >
                {item.label}
              </Text>
            );
          if (item.kind === 'unread')
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  marginTop: space.x6,
                  marginHorizontal: space.x5,
                  paddingHorizontal: space.x5,
                  paddingVertical: space.x3,
                  borderRadius: ios ? radius.md : androidSettings.listRadius,
                  backgroundColor: theme.layer.raised.fill,
                }}
              >
                <Text style={{ flex: 1 }}>{t.activityUnreadOnly}</Text>
                <Toggle
                  label={t.activityUnreadOnly}
                  value={filter.unreadOnly === true}
                  on="raised"
                  onChange={(unreadOnly) => onFilter({ ...filter, unreadOnly })}
                />
              </View>
            );
          const { choice, first, last } = item;
          if (ios)
            return (
              <View
                style={{
                  marginHorizontal: space.x5,
                  borderTopLeftRadius: first ? radius.md : 0,
                  borderTopRightRadius: first ? radius.md : 0,
                  borderBottomLeftRadius: last ? radius.md : 0,
                  borderBottomRightRadius: last ? radius.md : 0,
                  borderBottomWidth: last ? 0 : edge.hairline,
                  borderBottomColor: theme.layer.raised.divider,
                  backgroundColor: theme.layer.raised.fill,
                  overflow: 'hidden',
                }}
              >
                <CheckmarkRow
                  label={choice.label}
                  selected={choice.selected}
                  onPress={choice.choose}
                />
              </View>
            );
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked: choice.selected }}
              onPress={choice.choose}
              style={({ pressed }) => ({
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x4,
                marginHorizontal: space.x5,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
                ...segmentCorners(first, last),
                marginTop: first ? 0 : androidSettings.segmentGap,
                overflow: 'hidden',
                backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
              })}
            >
              <RadioMark selected={choice.selected} />
              <Text style={{ flex: 1 }}>{choice.label}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View
            style={{ alignItems: 'flex-start', paddingHorizontal: space.x5, paddingTop: space.x5 }}
          >
            <TextAction
              label={t.activityReset}
              onPress={() => {
                onFilter(DEFAULT_ACTIVITY);
                onSort('default');
              }}
            />
          </View>
        }
      />
    </>
  );
  return (
    <View
      style={{
        flex: 1,
        flexShrink: 1,
        paddingBottom: ios ? Math.max(insets.bottom, space.x5) : 0,
        backgroundColor: ios ? theme.layer.sheet.fill : theme.overlay.fill,
      }}
    >
      {content}
    </View>
  );
}

function OptionsSurface({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const t = useStrings();
  if (Platform.OS === 'ios')
    return (
      <Modal
        visible
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={onClose}
      >
        <View
          accessibilityViewIsModal
          accessibilityLabel={t.activityOptions}
          onAccessibilityEscape={onClose}
          style={{ flex: 1 }}
        >
          {children}
        </View>
      </Modal>
    );
  return (
    <Sheet visible label={t.activityOptions} onClose={onClose}>
      {children}
    </Sheet>
  );
}

export function ActivityFilters(props: Props) {
  return props.visible ? (
    <OptionsSurface onClose={props.onClose}>
      <ActivityFilterContent {...props} />
    </OptionsSurface>
  ) : null;
}
