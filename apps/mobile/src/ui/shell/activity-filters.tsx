import type { ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import {
  INBOX_SECTIONS,
  type InboxSection,
  type InboxSetAside,
} from '@botharness/host-client/inbox';
import { SHEET_GROUP, Sheet } from '../chat/sheet';
import { useDesignTheme } from '../design/theme';
import { androidSettings, space } from '../design/tokens';
import { SheetHeader } from '../primitives/sheet-header';
import { RadioMark } from '../primitives/radio-mark';
import { segmentCorners } from '../design/segment-corners';
import { Text } from '../primitives/text';
import { Toggle } from '../primitives/toggle';
import { useStrings, t } from '../strings';
import { SystemListSheet, type SystemListSection } from '../primitives/system-list-sheet';

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

type ActivityChoice = { key: string; label: string; selected: boolean; choose(): void };
type ActivityChoiceGroup = { key: string; label: string; choices: ActivityChoice[] };
type Row =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'choice'; first: boolean; last: boolean; choice: ActivityChoice; key: string }
  | { kind: 'unread'; key: string };

type Strings = ReturnType<typeof useStrings>;

export function activityChoiceGroups(
  {
    bots,
    channels,
    filter,
    sort,
    onFilter,
    onSort,
  }: Pick<Props, 'bots' | 'channels' | 'filter' | 'sort' | 'onFilter' | 'onSort'>,
  t: Strings,
): ActivityChoiceGroup[] {
  return [
    {
      key: 'sort',
      label: t.activitySort,
      choices: [
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
      ],
    },
    {
      key: 'category',
      label: t.activityCategory,
      choices: ACTIVITY_SECTIONS.map((section) => ({
        key: `section:${section}`,
        label: sectionLabel(section),
        selected: filter.section === section,
        choose: () => onFilter({ ...filter, section }),
      })),
    },
    {
      key: 'bots',
      label: t.bots,
      choices: [
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
      ],
    },
    {
      key: 'channels',
      label: t.channels,
      choices: [
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
      ],
    },
  ];
}

function TextAction({
  label,
  testID,
  onPress,
}: {
  label: string;
  testID: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
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
  const rowsOf = ({ key, label, choices }: ActivityChoiceGroup): Row[] => [
    { kind: 'heading', key, label },
    ...choices.map((choice, index) => ({
      kind: 'choice' as const,
      key: choice.key,
      choice,
      first: index === 0,
      last: index === choices.length - 1,
    })),
  ];
  const [sortGroup, categoryGroup, ...restGroups] = activityChoiceGroups(
    { bots, channels, filter, sort, onFilter, onSort },
    t,
  );
  const rows: Row[] = [
    ...(sortGroup === undefined ? [] : rowsOf(sortGroup)),
    ...(categoryGroup === undefined ? [] : rowsOf(categoryGroup)),
    { kind: 'unread', key: 'unread' },
    ...restGroups.flatMap(rowsOf),
  ];
  const content = (
    <>
      <SheetHeader title={t.activityOptions} onClose={onClose} />
      <FlatList
        nestedScrollEnabled
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
                  borderRadius: androidSettings.listRadius,
                  backgroundColor: theme.layer[SHEET_GROUP].fill,
                }}
              >
                <Text style={{ flex: 1 }}>{t.activityUnreadOnly}</Text>
                <Toggle
                  label={t.activityUnreadOnly}
                  value={filter.unreadOnly === true}
                  on={SHEET_GROUP}
                  onChange={(unreadOnly) => onFilter({ ...filter, unreadOnly })}
                />
              </View>
            );
          const { choice, first, last } = item;
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
                backgroundColor: pressed
                  ? theme.layer[SHEET_GROUP].pressed
                  : theme.layer[SHEET_GROUP].fill,
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
              testID="activity-filter-reset"
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
  return <View style={{ flex: 1, flexShrink: 1 }}>{content}</View>;
}

function OptionsSurface({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const t = useStrings();
  return (
    <Sheet visible label={t.activityOptions} onClose={onClose}>
      {children}
    </Sheet>
  );
}

function systemSections(props: Props, t: Strings): SystemListSection[] {
  const section = ({ key, label, choices }: ActivityChoiceGroup): SystemListSection => ({
    key,
    title: label,
    rows: choices.map((choice) => ({
      kind: 'choice',
      key: choice.key,
      label: choice.label,
      selected: choice.selected,
      onPress: choice.choose,
    })),
  });
  const [sortGroup, categoryGroup, ...restGroups] = activityChoiceGroups(props, t).map(section);
  return [
    ...(sortGroup === undefined ? [] : [sortGroup]),
    ...(categoryGroup === undefined ? [] : [categoryGroup]),
    {
      key: 'unread',
      rows: [
        {
          kind: 'toggle',
          key: 'unread',
          label: t.activityUnreadOnly,
          value: props.filter.unreadOnly === true,
          onChange: (unreadOnly) => props.onFilter({ ...props.filter, unreadOnly }),
        },
      ],
    },
    ...restGroups,
    {
      key: 'reset',
      rows: [
        {
          kind: 'action',
          key: 'reset',
          label: t.activityReset,
          onPress: () => {
            props.onFilter(DEFAULT_ACTIVITY);
            props.onSort('default');
          },
        },
      ],
    },
  ];
}

export function ActivityFilters(props: Props) {
  const t = useStrings();
  if (SystemListSheet !== undefined)
    return (
      <SystemListSheet
        visible={props.visible}
        title={t.activityOptions}
        closeLabel={t.close}
        sections={systemSections(props, t)}
        onClose={props.onClose}
      />
    );
  return props.visible ? (
    <OptionsSurface onClose={props.onClose}>
      <ActivityFilterContent {...props} />
    </OptionsSurface>
  ) : null;
}
