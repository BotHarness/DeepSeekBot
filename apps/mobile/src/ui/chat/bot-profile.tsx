import { ReadFailure } from '../primitives/read-failure';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import {
  memoryEntries,
  type BotProfile,
  type MemoryEntry,
  type ProfileAssignment,
  type ProfilePart,
} from '../../host/bot-profile';
import type { RosterBot, RosterChannel } from '../../host/client';
import type { BotScheduleSummary, ProfileActivity } from '../../host/wire';
import { botBanner } from '../../marketplace/artwork';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, profileShell, radius, space } from '../design/tokens';
import { profileTabPaths, profileTabSymbols } from '../design/profile-tab-icons';
import { useFocusEffect } from 'expo-router';
import { Text } from '../primitives/text';
import type { IconTabOption } from '../primitives/icon-tabs';
import { useSheetContent } from '../primitives/sheet-content';
import { HeaderIconButton } from '../shell/header-icon-button';
import {
  BrowserIcon,
  ChevronRightIcon,
  ClockIcon,
  ComputerIcon,
  FolderIcon,
  MemoryIcon,
  PlusIcon,
  SettingsIcon,
  WorkIcon,
} from '../shell/icons';
import { useStrings, t } from '../strings';
import { ActivityGlance } from './activity-glance';
import { botStateTone } from './bot-tone';
import { MemoryEntryRow } from './memory-browser';
import { routineDetail } from './routine-text';
import { LoadingIndicator } from '../primitives/loading-indicator';
import {
  AvatarSettings,
  EditableAvatar,
  useAvatarEditor,
  type AvatarActions,
} from './avatar-editor';
import { ProfileShell, type ProfileRow as ShellRow, type ProfileTabBody } from './profile-shell';
import { openingTab, profileTabs, type ProfileTab, type ProfileTabMemory } from './profile-tabs';
import { ProfileZoomTarget } from './profile-zoom-target';

const ICON = 22;
const COLLAPSED_LINES = 6;
const LONG_TEXT = 280;

export const PROFILE_SECTIONS = [
  'work',
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
  | { kind: 'assignment'; assignment: ProfileAssignment }
  | { kind: 'day'; label: string }
  | { kind: 'activity'; activity: ProfileActivity }
  | { kind: 'note'; text: string }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' };

type Row = RowBody & { key: string; first: boolean; last: boolean };

export interface BotProfileActions {
  onComputer?(): void;
  onBrowser?(): void;
  onNotifications(): void;
  onOpenMemory(entry: MemoryEntry): void;
  onOpenRoutine?(routine: BotScheduleSummary): void;
  onNewRoutine?(): void;
  onOpenActivity(): void;
  onClose(): void;
}

function frame(section: ProfileSection, bodies: RowBody[]): Row[] {
  return bodies.map((body, index) => ({
    ...body,
    key: `${section}:${index}`,
    first: index === 0 || bodies[index - 1]?.kind === 'day',
    last: index === bodies.length - 1 || bodies[index + 1]?.kind === 'day',
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

function localDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toDateString();
}

export function workRowBodies(assignments: readonly ProfileAssignment[], now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const label = (iso: string) => {
    const day = localDay(iso);
    if (day === now.toDateString()) return t.usageToday;
    if (day === yesterday.toDateString()) return t.yesterday;
    const at = new Date(iso);
    return Number.isNaN(at.getTime())
      ? ''
      : at.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
        });
  };
  const rows: RowBody[] = [];
  let previous: string | undefined;
  for (const assignment of assignments) {
    const day = localDay(assignment.updatedAt);
    if (day !== previous) rows.push({ kind: 'day', label: label(assignment.updatedAt) });
    previous = day;
    rows.push({ kind: 'assignment', assignment });
  }
  return rows;
}

export function profileRows(
  profile: BotProfile | undefined,
  channels: RosterChannel[],
  addRoutine = false,
): Record<ProfileSection, Row[]> {
  return {
    work: frame(
      'work',
      partRows(profile?.work, 'work', (work) => workRowBodies(work)),
    ),
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

const TAB_GLYPHS: Record<ProfileTab, typeof WorkIcon> = {
  work: WorkIcon,
  memory: MemoryIcon,
  files: FolderIcon,
  routines: ClockIcon,
  settings: SettingsIcon,
};

export function profileTabOptions(tabs: readonly ProfileTab[]): IconTabOption<ProfileTab>[] {
  return tabs.map((tab) => {
    const Glyph = TAB_GLYPHS[tab];
    return {
      value: tab,
      label: t.profileTabs[tab],
      symbol: profileTabSymbols[tab],
      path: profileTabPaths[tab],
      glyph: (color, size) => <Glyph color={color} size={size} />,
    };
  });
}

function RoundAction({
  label,
  testID,
  icon,
  onPress,
}: {
  label: string;
  testID: string;
  icon: (color: string) => ReactNode;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <HeaderIconButton label={label} testID={testID} onPress={onPress}>
      {icon(theme.color.fg)}
    </HeaderIconButton>
  );
}

export function ProfileBanner({
  source,
  headers,
}: {
  source: string;
  headers?: Record<string, string> | undefined;
}) {
  const theme = useDesignTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ paddingHorizontal: space.x5 }}
    >
      <Image
        testID="profile-banner"
        source={{ uri: source, ...(headers === undefined ? {} : { headers }) }}
        recyclingKey={source}
        contentFit="cover"
        cachePolicy="memory-disk"
        style={{
          width: '100%',
          aspectRatio: profileShell.bannerAspect,
          borderRadius: radius.lg,
          backgroundColor: theme.layer.raised.fill,
        }}
      />
    </View>
  );
}

function BotIdentity({
  bot,
  actions,
  avatar,
}: {
  bot: RosterBot;
  actions: BotProfileActions;
  avatar: ReturnType<typeof useAvatarEditor>;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x3, paddingBottom: space.x5 }}>
      <ProfileBanner source={botBanner(bot)} headers={bot.bannerHeaders} />
      <View
        style={{
          alignItems: 'center',
          gap: space.x3,
          paddingHorizontal: space.x5,
          marginTop: -profileShell.overlap - space.x3,
        }}
      >
        <View
          style={{
            padding: profileShell.avatarEdge,
            borderRadius: radius.round,
            backgroundColor: theme.overlay.fill,
          }}
        >
          <ProfileZoomTarget>
            <EditableAvatar editor={avatar} corner={radius.round} testID="bot-avatar-change">
              <BotAvatar bot={bot} size={profileShell.avatar} />
            </EditableAvatar>
          </ProfileZoomTarget>
        </View>
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
        {actions.onBrowser === undefined && actions.onComputer === undefined ? null : (
          <View
            style={{
              flexDirection: 'row',
              gap: space.x4,
              paddingTop: space.x2,
            }}
          >
            {actions.onBrowser === undefined ? null : (
              <RoundAction
                label={t.profileBrowser}
                testID="profile-browser"
                icon={(color) => <BrowserIcon color={color} size={ICON} />}
                onPress={actions.onBrowser}
              />
            )}
            {actions.onComputer === undefined ? null : (
              <RoundAction
                label={t.profileComputer}
                testID="profile-computer"
                icon={(color) => <ComputerIcon color={color} size={ICON} />}
                onPress={actions.onComputer}
              />
            )}
          </View>
        )}
      </View>
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
  const t = useStrings();
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
  if (row.kind === 'day')
    return (
      <Text
        variant="meta"
        tone="muted"
        strong
        style={{
          paddingTop: row.key.endsWith(':0') ? 0 : space.x4,
          paddingBottom: space.x2,
        }}
      >
        {row.label}
      </Text>
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
  if (row.kind === 'assignment') {
    const { assignment } = row;
    const time = new Date(assignment.updatedAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const state = t.profileAssignmentState[assignment.activity];
    return (
      <View
        testID={`profile-assignment-${assignment.sessionId}`}
        accessible
        accessibilityLabel={[assignment.title, state, time].join(', ')}
        style={[shape, { gap: space.x1 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
          <Text numberOfLines={2} style={{ flex: 1 }}>
            {assignment.title}
          </Text>
          <Text variant="meta" tone="muted">
            {time}
          </Text>
        </View>
        <Text
          variant="meta"
          tone={assignment.activity === 'error' ? 'danger' : 'muted'}
          numberOfLines={2}
        >
          {assignment.latestReport === undefined
            ? state
            : `${state} · ${assignment.latestReport.summary}`}
        </Text>
      </View>
    );
  }
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
        <ReadFailure title={t.profileFailed} detail={row.error} onRetry={onRetry} />
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

function SubHeading({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      variant="meta"
      tone="muted"
      strong
      style={{ paddingTop: space.x5, paddingBottom: space.x3 }}
    >
      {children}
    </Text>
  );
}

function SettingsRowLink({
  title,
  testID,
  onPress,
}: {
  title: string;
  testID: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x4,
        borderRadius: radius.md,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <Text style={{ flex: 1 }}>{title}</Text>
      <ChevronRightIcon color={theme.color.muted} size={theme.type.title.line} />
    </Pressable>
  );
}

export function useRememberedProfileTab(memory: ProfileTabMemory, tabs: readonly ProfileTab[]) {
  const remembered = useSyncExternalStore(memory.subscribe, () => memory.get('bot'));
  return [
    openingTab(tabs, remembered),
    (next: ProfileTab) => memory.remember('bot', next),
  ] as const;
}

export function BotProfilePage({
  bot,
  channels,
  load,
  actions,
  settings,
  workActions,
  files,
  initialProfile,
  avatar,
  tabMemory,
}: {
  bot: RosterBot;
  channels: RosterChannel[];
  load: () => Promise<BotProfile>;
  actions: BotProfileActions;
  settings?: ReactNode;
  workActions?: ReactNode;
  files?: ((active: boolean, render: (body: ProfileTabBody) => ReactNode) => ReactNode) | undefined;
  initialProfile?: BotProfile | undefined;
  avatar: AvatarActions;
  tabMemory: ProfileTabMemory;
}) {
  const t = useStrings();
  const avatarEditor = useAvatarEditor(avatar);
  const [profile, setProfile] = useState(initialProfile);
  const content = useSheetContent();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const tabs = profileTabs('bot');
  const [tab, setTab] = useRememberedProfileTab(tabMemory, tabs);
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
  const rows = profileRows(
    content.ready ? profile : undefined,
    channels,
    actions.onNewRoutine !== undefined,
  );
  const rowOf = (row: Row): ShellRow => ({
    key: row.key,
    render: () => (
      <ProfileRow
        bot={bot}
        row={row}
        expanded={expanded.has(row.key)}
        onRetry={read}
        actions={actions}
        onToggle={() =>
          setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(row.key)) next.add(row.key);
            return next;
          })
        }
      />
    ),
  });
  const node = (key: string, render: () => ReactNode): ShellRow => ({
    key,
    render,
  });
  const heading = (section: ProfileSection) =>
    node(`${section}:heading`, () => <SubHeading>{t.profileSection[section]}</SubHeading>);
  const bodies: Record<Exclude<ProfileTab, 'files'>, ProfileTabBody> = {
    work: {
      rows: [
        ...(workActions === undefined ? [] : [node('work:actions', () => workActions)]),
        ...rows.work.map(rowOf),
      ],
    },
    memory: {
      rows: [...rows.identity.map(rowOf), heading('memory'), ...rows.memory.map(rowOf)],
    },
    routines: { rows: rows.routines.map(rowOf) },
    settings: {
      rows: [
        ...rows.activity.map(rowOf),
        node('settings:bot', () => <SubHeading>{t.profileSettingsBot}</SubHeading>),
        ...(content.ready && settings !== undefined
          ? [node('settings:panel', () => settings)]
          : []),
        node('settings:notifications', () => (
          <View style={{ paddingTop: space.x4 }}>
            <SettingsRowLink
              testID="profile-notifications"
              title={t.profileNotifications}
              onPress={actions.onNotifications}
            />
          </View>
        )),
        node('settings:avatar', () => (
          <View style={{ paddingTop: space.x4 }}>
            <AvatarSettings
              editor={avatarEditor}
              hasAvatar={bot.avatarUrl !== undefined}
              portrait={<BotAvatar bot={bot} size={32} ring={false} corner={radius.sm} />}
              testID="bot-avatar-settings"
            />
          </View>
        )),
        heading('channels'),
        ...rows.channels.map(rowOf),
        heading('files'),
        ...rows.files.map(rowOf),
      ],
    },
  };
  const shell = (filesBody: ProfileTabBody) => (
    <ProfileShell
      title={bot.displayName}
      identity={<BotIdentity bot={bot} actions={actions} avatar={avatarEditor} />}
      tabs={tabs}
      options={profileTabOptions(tabs)}
      tab={tab}
      onTab={setTab}
      body={tab === 'files' ? filesBody : bodies[tab]}
      onClose={actions.onClose}
    />
  );
  return (
    <View ref={content.mount} style={{ flex: 1 }}>
      {files === undefined
        ? shell({
            rows: [
              node('files:none', () => (
                <Text testID="profile-files-none" tone="muted">
                  {t.channelFiles.empty}
                </Text>
              )),
            ],
          })
        : files(tab === 'files', shell)}
    </View>
  );
}
