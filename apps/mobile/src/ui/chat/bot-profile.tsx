import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, SectionList, View } from 'react-native';

import {
  memoryEntries,
  type BotProfile,
  type MemoryEntry,
  type ProfilePart,
} from '../../host/bot-profile';
import type { RosterBot, RosterChannel } from '../../host/client';
import type { BotScheduleSummary, ProfileActivity } from '../../host/wire';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { useFocusEffect } from 'expo-router';
import { Text } from '../primitives/text';
import { useSheetContent } from '../primitives/sheet-content';
import {
  ActivityIcon,
  BrowserIcon,
  ChevronRightIcon,
  ComputerIcon,
  MessageIcon,
  PlusIcon,
} from '../shell/icons';
import { t } from '../strings';
import { ActivityGlance } from './activity-glance';
import { botStateTone } from './bot-tone';
import { MemoryEntryRow } from './memory-browser';
import { routineDetail } from './routine-text';
import { LoadingIndicator } from '../primitives/loading-indicator';

const AVATAR = 72;
const ICON = 22;
const COLLAPSED_LINES = 6;
const LONG_TEXT = 280;

export const PROFILE_SECTIONS = [
  'activity',
  'identity',
  'memory',
  'routines',
  'channels',
  'files',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

type RowBody =
  | { kind: 'text'; label?: string; body: string }
  | { kind: 'item'; title: string; detail?: string }
  | { kind: 'entry'; entry: MemoryEntry }
  | { kind: 'routine'; routine: BotScheduleSummary }
  | { kind: 'new-routine' }
  | { kind: 'activity'; activity: ProfileActivity }
  | { kind: 'note'; text: string }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' };

type Row = RowBody & { key: string; first: boolean; last: boolean };

export interface BotProfileActions {
  onMessage(): void;
  onComputer?(): void;
  onBrowser?(): void;
  onNotifications(): void;
  onOpenMemory(entry: MemoryEntry): void;
  onOpenRoutine?(routine: BotScheduleSummary): void;
  onNewRoutine?(): void;
  onOpenActivity(): void;
}

function frame(section: ProfileSection, bodies: RowBody[]): Row[] {
  return bodies.map((body, index) => ({
    ...body,
    key: `${section}:${index}`,
    first: index === 0,
    last: index === bodies.length - 1,
  }));
}

function partRows<T>(
  part: ProfilePart<T> | undefined,
  section: ProfileSection,
  rows: (value: T) => RowBody[],
): RowBody[] {
  if (part === undefined) return [{ kind: 'loading' }];
  if (part.status === 'failed') return [{ kind: 'failed', error: part.error }];
  const ready = rows(part.value);
  return [
    ...(part.staleError === undefined ? [] : [{ kind: 'failed' as const, error: part.staleError }]),
    ...(ready.length === 0 ? [{ kind: 'note' as const, text: t.profileEmpty[section] }] : ready),
  ];
}

export function profileRows(
  profile: BotProfile | undefined,
  channels: RosterChannel[],
  addRoutine = false,
): Record<ProfileSection, Row[]> {
  return {
    activity: frame(
      'activity',
      partRows(profile?.activity, 'activity', (activity) => [{ kind: 'activity', activity }]),
    ),
    identity: frame(
      'identity',
      partRows(profile?.identity, 'identity', (soul) =>
        soul === undefined ? [] : [{ kind: 'text', body: soul }],
      ),
    ),
    memory: frame(
      'memory',
      partRows(profile?.memory, 'memory', (memory) =>
        memoryEntries(memory.files, '').map((entry) => ({
          kind: 'entry',
          entry,
        })),
      ),
    ),
    routines: frame(
      'routines',
      partRows(profile?.routines, 'routines', (routines) =>
        routines.map((routine) => ({ kind: 'routine', routine })),
      ).concat(
        addRoutine && profile?.routines?.status === 'ready' ? [{ kind: 'new-routine' }] : [],
      ),
    ),
    channels: frame(
      'channels',
      channels.length === 0
        ? [{ kind: 'note', text: t.profileEmpty.channels }]
        : channels.map((channel) => ({
            kind: 'item',
            title: `# ${channel.name}`,
            detail: t.members(channel.memberCount),
          })),
    ),
    files: frame(
      'files',
      partRows(profile?.files, 'files', (grants) =>
        grants.map((grant) => ({
          kind: 'item',
          title: grant.workspaceTitle,
          detail: `${grant.orchestratorWrite === true ? t.folderCanEdit : t.folderReadOnly} · ${grant.workspacePath}`,
        })),
      ),
    ),
  };
}

function ProfileAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: (color: string) => ReactNode;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: theme.touch,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x2,
        paddingVertical: space.x4,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      {icon(theme.color.fg)}
      <Text variant="meta" strong numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProfileHeader({
  bot,
  actions,
  settings,
}: {
  bot: RosterBot;
  actions: BotProfileActions;
  settings: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', gap: space.x3, paddingBottom: space.x5 }}>
      <BotAvatar bot={bot} size={AVATAR} />
      <View style={{ alignItems: 'center', gap: space.x1 }}>
        <Text accessibilityRole="header" variant="display" numberOfLines={2}>
          {bot.displayName}
        </Text>
        <Text variant="meta" tone={botStateTone(bot)}>
          {[bot.paused ? t.paused : t.state[bot.state], ...bot.roles].join(' · ')}
        </Text>
      </View>
      {bot.description === undefined || bot.description.trim() === '' ? null : (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {bot.description}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'stretch',
          gap: space.x3,
          paddingTop: space.x3,
        }}
      >
        <ProfileAction
          label={t.profileMessage}
          icon={(color) => <MessageIcon color={color} size={ICON} />}
          onPress={actions.onMessage}
        />
        {actions.onBrowser === undefined ? null : (
          <ProfileAction
            label={t.profileBrowser}
            icon={(color) => <BrowserIcon color={color} size={ICON} />}
            onPress={actions.onBrowser}
          />
        )}
        {actions.onComputer === undefined ? null : (
          <ProfileAction
            label={t.profileComputer}
            icon={(color) => <ComputerIcon color={color} size={ICON} />}
            onPress={actions.onComputer}
          />
        )}
        <ProfileAction
          label={t.profileNotifications}
          icon={(color) => <ActivityIcon color={color} size={ICON} />}
          onPress={actions.onNotifications}
        />
      </View>
      {settings === undefined ? null : (
        <View style={{ alignSelf: 'stretch', paddingTop: space.x3 }}>{settings}</View>
      )}
    </View>
  );
}

function ProfileRow({
  bot,
  row,
  expanded,
  onToggle,
  onRetry,
  actions,
}: {
  bot: RosterBot;
  row: Row;
  expanded: boolean;
  onToggle(): void;
  onRetry(): void;
  actions: BotProfileActions;
}) {
  const theme = useDesignTheme();
  if (row.kind === 'activity')
    return <ActivityGlance bot={bot} activity={row.activity} onOpen={actions.onOpenActivity} />;
  if (row.kind === 'entry')
    return (
      <MemoryEntryRow
        entry={row.entry}
        first={row.first}
        last={row.last}
        onOpen={actions.onOpenMemory}
      />
    );
  const shape = {
    backgroundColor: theme.layer.raised.fill,
    paddingHorizontal: space.x5,
    paddingVertical: space.x4,
    borderTopLeftRadius: row.first ? radius.md : 0,
    borderTopRightRadius: row.first ? radius.md : 0,
    borderBottomLeftRadius: row.last ? radius.md : 0,
    borderBottomRightRadius: row.last ? radius.md : 0,
    borderBottomWidth: row.last ? 0 : edge.hairline,
    borderBottomColor: theme.color.divider,
    gap: space.x2,
  };
  if (row.kind === 'routine') {
    const { routine } = row;
    const open = actions.onOpenRoutine;
    const detail = routineDetail(routine);
    return (
      <Pressable
        accessibilityRole={open === undefined ? undefined : 'button'}
        accessibilityLabel={
          open === undefined ? undefined : `${t.routineOpen(routine.title)}, ${detail}`
        }
        disabled={open === undefined}
        onPress={() => open?.(routine)}
        style={({ pressed }) => [
          shape,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            minHeight: theme.touch,
            backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
          },
        ]}
      >
        <View style={{ flex: 1, gap: space.x1 }}>
          <Text numberOfLines={1} tone={routine.enabled ? 'fg' : 'muted'}>
            {routine.title}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        {open === undefined ? null : (
          <ChevronRightIcon color={theme.color.muted} size={theme.type.title.line} />
        )}
      </Pressable>
    );
  }
  if (row.kind === 'new-routine')
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.routineNew}
        onPress={actions.onNewRoutine}
        style={({ pressed }) => [
          shape,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.x3,
            minHeight: theme.touch,
            backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
          },
        ]}
      >
        <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
        <Text>{t.routineNew}</Text>
      </Pressable>
    );
  if (row.kind === 'loading')
    return (
      <View style={[shape, { flexDirection: 'row', alignItems: 'center', gap: space.x3 }]}>
        <LoadingIndicator />
        <Text variant="meta" tone="muted">
          {t.profileLoading}
        </Text>
      </View>
    );
  if (row.kind === 'failed')
    return (
      <View style={shape}>
        <Text variant="meta" tone="danger">{`${t.profileFailed} ${row.error}`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.tryAgain}
          onPress={onRetry}
          style={{
            minHeight: theme.touch,
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Text tone="accent" strong>
            {t.tryAgain}
          </Text>
        </Pressable>
      </View>
    );
  if (row.kind === 'note')
    return (
      <View style={shape}>
        <Text tone="muted">{row.text}</Text>
      </View>
    );
  if (row.kind === 'item')
    return (
      <View style={[shape, { gap: space.x1 }]}>
        <Text numberOfLines={1}>{row.title}</Text>
        {row.detail === undefined ? null : (
          <Text variant="meta" tone="muted" numberOfLines={2}>
            {row.detail}
          </Text>
        )}
      </View>
    );
  const long = row.body.length > LONG_TEXT || row.body.split('\n').length > COLLAPSED_LINES;
  return (
    <View style={shape}>
      {row.label === undefined ? null : (
        <Text variant="meta" tone="muted" strong>
          {row.label}
        </Text>
      )}
      <Text selectable numberOfLines={long && !expanded ? COLLAPSED_LINES : undefined}>
        {row.body}
      </Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? t.showLess : t.showMore}
          onPress={onToggle}
          style={{
            minHeight: theme.touch,
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Text tone="accent" strong>
            {expanded ? t.showLess : t.showMore}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BotProfileSheet({
  bot,
  channels,
  load,
  actions: given,
  settings,
  initialProfile,
}: {
  bot: RosterBot;
  channels: RosterChannel[];
  load: () => Promise<BotProfile>;
  actions: BotProfileActions;
  settings?: ReactNode;
  initialProfile?: BotProfile | undefined;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const content = useSheetContent();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const read = useCallback(() => {
    let live = true;
    void load().then((value) => {
      if (live) setProfile(value);
    });
    return () => {
      live = false;
    };
  }, [load]);
  useFocusEffect(read);
  const actions = given;
  const rows = profileRows(
    content.ready ? profile : undefined,
    channels,
    given.onNewRoutine !== undefined,
  );
  const sections = PROFILE_SECTIONS.map((section) => ({
    section,
    data: rows[section],
  }));

  return (
    <View ref={content.mount} style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        nestedScrollEnabled
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.x5, paddingTop: space.x6 }}
        ListHeaderComponent={
          <ProfileHeader
            bot={bot}
            actions={actions}
            settings={content.ready ? settings : undefined}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            variant="meta"
            tone="muted"
            strong
            style={{
              paddingHorizontal: space.x5,
              paddingTop: space.x5,
              paddingBottom: space.x3,
            }}
          >
            {t.profileSection[section.section]}
          </Text>
        )}
        renderItem={({ item }) => (
          <ProfileRow
            bot={bot}
            row={item}
            expanded={expanded.has(item.key)}
            onRetry={read}
            actions={actions}
            onToggle={() =>
              setExpanded((current) => {
                const next = new Set(current);
                if (!next.delete(item.key)) next.add(item.key);
                return next;
              })
            }
          />
        )}
      />
    </View>
  );
}
