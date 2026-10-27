import { ReadFailure } from '../primitives/read-failure';
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { FlatList, Pressable, View, type ViewInstance } from 'react-native';

import {
  unpinnedEntries,
  type BotProfile,
  type MemoryEntry,
  type PinnedMemory,
  type ProfileAssignment,
  type ProfilePart,
} from '../../host/bot-profile';
import type { RosterBot, RosterChannel } from '../../host/client';
import type { MemoryChange, MemoryChangesPage } from '../../host/memory-changes';
import type { BotScheduleSummary, ProfileActivity } from '../../host/wire';
import { botBanner } from '../../marketplace/artwork';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { edge, memoryGrid, profileShell, radius, rowGlyph, space } from '../design/tokens';
import { profileTabPaths, profileTabSymbols } from '../design/profile-tab-icons';
import { useFocusEffect } from 'expo-router';
import { SettingsHeading, SettingsRow, SettingsSection } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import type { IconTabOption } from '../primitives/icon-tabs';
import { useSheetContent } from '../primitives/sheet-content';
import { HeaderIconButton, type HeaderIcon } from '../shell/header-icon-button';
import {
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  MembersIcon,
  MemoryIcon,
  SettingsIcon,
  WorkIcon,
} from '../shell/icons';
import { useStrings, t } from '../strings';
import { ActivityGlance } from './activity-glance';
import { AssignmentActivityIcon } from './assignment-marks';
import { botStateTone } from './bot-tone';
import {
  MemoryGridRow,
  MemoryPinnedCards,
  memoryGridRows,
  useMemoryColumns,
} from './memory-browser';
import {
  NewRoutineButton,
  RoutineGroupCard,
  routineGroups,
  type RoutineChanges,
  type RoutineGroup,
} from './profile-routines';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { Button } from '../primitives/button';
import { Segmented } from '../primitives/segmented';
import { memoryChangeTime, useMemoryChanges, type MemoryChanges } from './memory-changes';
import {
  AvatarSettings,
  EditableAvatar,
  useAvatarEditor,
  type AvatarActions,
} from './avatar-editor';
import { ProfileShell, type ProfileRow as ShellRow, type ProfileTabBody } from './profile-shell';
import {
  openingTab,
  profileTabs,
  type ProfileTab,
  type ProfileTabMemory,
  type RememberedProfileKind,
} from './profile-tabs';
import { ProfileHero } from './profile-hero';

export const PROFILE_SECTIONS = [
  'work',
  'activity',
  'memory',
  'routines',
  'channels',
  'files',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

type RowBody =
  | { kind: 'item'; title: string; detail?: string }
  | { kind: 'pinned'; pinned: PinnedMemory[] }
  | { kind: 'grid'; entries: MemoryEntry[]; columns: number; lead: boolean }
  | { kind: 'commit'; change: MemoryChange }
  | { kind: 'more'; busy: boolean }
  | { kind: 'routine-group'; group: RoutineGroup; routines: BotScheduleSummary[] }
  | { kind: 'assignment'; assignment: ProfileAssignment }
  | { kind: 'day'; label: string }
  | { kind: 'activity'; activity: ProfileActivity }
  | { kind: 'note'; text: string }
  | { kind: 'failed'; error: string }
  | { kind: 'loading' };

type Row = RowBody & { key: string; first: boolean; last: boolean };

type MemoryView = 'files' | 'changes';

export interface BotProfileActions {
  onComputer?(): void;
  onBrowser?(): void;
  onNotifications(): void;
  onOpenMemory(entry: MemoryEntry): void;
  onOpenMemoryChange?(change: MemoryChange): void;
  onOpenRoutine?(routine: BotScheduleSummary): void;
  onOpenAssignment?(assignment: ProfileAssignment): void;
  onNewRoutine?(): void;
  routines?: RoutineChanges;
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

function dayRows<T>(
  items: readonly T[],
  at: (item: T) => string,
  body: (item: T) => RowBody,
  now: Date,
): RowBody[] {
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
  for (const item of items) {
    const day = localDay(at(item));
    if (day !== previous) rows.push({ kind: 'day', label: label(at(item)) });
    previous = day;
    rows.push(body(item));
  }
  return rows;
}

export function workRowBodies(assignments: readonly ProfileAssignment[], now = new Date()) {
  return dayRows(
    assignments,
    (assignment) => assignment.updatedAt,
    (assignment) => ({ kind: 'assignment', assignment }),
    now,
  );
}

export function memoryChangeRows(
  changes: MemoryChanges,
  now = new Date(),
  empty = t.memoryChangesEmpty,
): Row[] {
  if (!changes.loaded)
    return frame(
      'memory',
      changes.error === undefined
        ? [{ kind: 'loading' }]
        : [{ kind: 'failed', error: changes.error }],
    );
  return frame('memory', [
    ...(changes.commits.length === 0
      ? [{ kind: 'note' as const, text: empty }]
      : dayRows(
          changes.commits,
          (change) => change.authoredAt,
          (change) => ({ kind: 'commit', change }),
          now,
        )),
    ...(changes.error === undefined ? [] : [{ kind: 'failed' as const, error: changes.error }]),
    ...(changes.hasMore ? [{ kind: 'more' as const, busy: changes.busy }] : []),
  ]);
}

export function assignmentRows(part: ProfilePart<ProfileAssignment[]> | undefined): Row[] {
  return frame(
    'work',
    partRows(part, 'work', (work) => workRowBodies(work)),
  );
}

export function profileRows(
  profile: BotProfile | undefined,
  channels: RosterChannel[],
  columns = 3,
): Record<ProfileSection, Row[]> {
  return {
    work: assignmentRows(profile?.work),
    activity: frame(
      'activity',
      partRows(profile?.activity, 'activity', (activity) => [{ kind: 'activity', activity }]),
    ),
    memory: frame(
      'memory',
      partRows(profile?.memory, 'memory', (memory): RowBody[] =>
        memory.status === 'unavailable'
          ? [{ kind: 'note', text: t.memoryNotAttached }]
          : [
              { kind: 'pinned', pinned: memory.pinned },
              ...(memory.files.length === 0
                ? [{ kind: 'note' as const, text: t.profileEmpty.memory }]
                : memoryGridRows(unpinnedEntries(memory.files, memory.pinned), columns).map(
                    (entries, index): RowBody => ({
                      kind: 'grid',
                      entries,
                      columns,
                      lead: index === 0,
                    }),
                  )),
            ],
      ),
    ),
    routines: frame(
      'routines',
      partRows(profile?.routines, 'routines', (routines) =>
        routineGroups(routines).map(({ group, routines }) => ({
          kind: 'routine-group',
          group,
          routines,
        })),
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
  members: MembersIcon,
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
  icon: HeaderIcon;
  onPress(): void;
}) {
  return <HeaderIconButton icon={icon} label={label} testID={testID} onPress={onPress} />;
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
  return (
    <ProfileHero
      banner={{ source: botBanner(bot), headers: bot.bannerHeaders }}
      name={bot.displayName}
      avatar={
        <EditableAvatar editor={avatar} corner={radius.round} testID="bot-avatar-change">
          <BotAvatar bot={bot} size={profileShell.avatar} />
        </EditableAvatar>
      }
    >
      <Text variant="meta" tone={botStateTone(bot)}>
        {[bot.paused ? t.paused : t.state[bot.state], ...bot.roles].join(' · ')}
      </Text>
      {bot.description === undefined || bot.description.trim() === '' ? null : (
        <Text tone="muted" numberOfLines={3} style={{ textAlign: 'center' }}>
          {bot.description}
        </Text>
      )}
      {actions.onBrowser === undefined && actions.onComputer === undefined ? null : (
        <View style={{ flexDirection: 'row', gap: space.x4, paddingTop: space.x1 }}>
          {actions.onBrowser === undefined ? null : (
            <RoundAction
              label={t.profileBrowser}
              testID="profile-browser"
              icon="browser"
              onPress={actions.onBrowser}
            />
          )}
          {actions.onComputer === undefined ? null : (
            <RoundAction
              label={t.profileComputer}
              testID="profile-computer"
              icon="computer"
              onPress={actions.onComputer}
            />
          )}
        </View>
      )}
    </ProfileHero>
  );
}

function rowShape(theme: ReturnType<typeof useDesignTheme>, row: Row) {
  return {
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
}

export type WorkRow = Row;

export function WorkListRow({
  row,
  onRetry,
  onOpen,
}: {
  row: Row;
  onRetry(): void;
  onOpen?: ((assignment: ProfileAssignment) => void) | undefined;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
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
  const shape = rowShape(theme, row);
  if (row.kind === 'assignment') {
    const { assignment } = row;
    const time = new Date(assignment.updatedAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const state = t.profileAssignmentState[assignment.activity];
    const description = assignment.description?.trim() ?? '';
    return (
      <Pressable
        testID={`profile-assignment-${assignment.sessionId}`}
        accessibilityRole={onOpen === undefined ? undefined : 'button'}
        accessibilityLabel={[assignment.title, state, description, time]
          .filter((part) => part !== '')
          .join(', ')}
        accessibilityHint={
          onOpen === undefined ? undefined : t.profileAssignmentOpen(assignment.title)
        }
        disabled={onOpen === undefined}
        onPress={() => onOpen?.(assignment)}
        style={({ pressed }) => [
          shape,
          {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space.x3,
            minHeight: theme.touch,
            backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
          },
        ]}
      >
        <View style={{ paddingTop: (theme.type.body.line - rowGlyph.size) / 2 }}>
          <AssignmentActivityIcon activity={assignment.activity} size={rowGlyph.size} />
        </View>
        <View style={{ flex: 1, gap: space.x1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x3 }}>
            <Text numberOfLines={2} style={{ flex: 1 }}>
              {assignment.title}
            </Text>
            <Text variant="meta" tone="muted">
              {time}
            </Text>
          </View>
          {description === '' ? null : (
            <Text variant="meta" tone="muted" numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }
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
  return null;
}

function ProfileRow({
  bot,
  row,
  onRetry,
  onMore,
  actions,
}: {
  bot: RosterBot;
  row: Row;
  onRetry(): void;
  onMore?: (() => void) | undefined;
  actions: BotProfileActions;
}) {
  const theme = useDesignTheme();
  if (row.kind === 'activity')
    return <ActivityGlance bot={bot} activity={row.activity} onOpen={actions.onOpenActivity} />;
  if (row.kind === 'pinned')
    return <MemoryPinnedCards pinned={row.pinned} onOpen={actions.onOpenMemory} />;
  if (row.kind === 'grid')
    return (
      <View style={{ paddingTop: row.lead ? space.x5 : memoryGrid.gap }}>
        <MemoryGridRow entries={row.entries} columns={row.columns} onOpen={actions.onOpenMemory} />
      </View>
    );
  if (
    row.kind === 'day' ||
    row.kind === 'assignment' ||
    row.kind === 'loading' ||
    row.kind === 'failed' ||
    row.kind === 'note'
  )
    return <WorkListRow row={row} onRetry={onRetry} onOpen={actions.onOpenAssignment} />;
  const shape = rowShape(theme, row);
  if (row.kind === 'commit') {
    const { change } = row;
    const time = memoryChangeTime(change.authoredAt);
    const status = change.status === 'accepted' ? '' : t.memoryChangeStatus[change.status];
    return (
      <Pressable
        testID={`memory-change-${change.sha}`}
        accessibilityRole="button"
        accessibilityLabel={[change.subject, status, time].filter((part) => part !== '').join(', ')}
        accessibilityHint={t.memoryChangeOpen}
        disabled={actions.onOpenMemoryChange === undefined}
        onPress={() => actions.onOpenMemoryChange?.(change)}
        style={({ pressed }) => [
          shape,
          {
            minHeight: theme.touch,
            gap: space.x1,
            backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x3 }}>
          <Text numberOfLines={2} style={{ flex: 1 }}>
            {change.subject}
          </Text>
          <Text variant="meta" tone="muted">
            {time}
          </Text>
        </View>
        {status === '' ? null : (
          <Text variant="meta" tone="warning">
            {status}
          </Text>
        )}
      </Pressable>
    );
  }
  if (row.kind === 'more')
    return (
      <View style={{ paddingTop: space.x3, alignItems: 'center' }}>
        <Button
          label={t.memoryChangesMore}
          variant="text"
          testID="memory-changes-more"
          busy={row.busy}
          onPress={() => onMore?.()}
        />
      </View>
    );
  if (row.kind === 'routine-group')
    return (
      <RoutineGroupCard
        group={row.group}
        routines={row.routines}
        first={row.first}
        changes={actions.routines}
        onOpen={actions.onOpenRoutine}
        onChanged={onRetry}
      />
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
  return null;
}

export function useRememberedProfileTab(
  memory: ProfileTabMemory,
  tabs: readonly ProfileTab[],
  kind: RememberedProfileKind = 'bot',
) {
  const remembered = useSyncExternalStore(memory.subscribe, () => memory.get(kind));
  return [openingTab(tabs, remembered), (next: ProfileTab) => memory.remember(kind, next)] as const;
}

export function BotProfilePage({
  bot,
  channels,
  load,
  actions,
  settings,
  permissions,
  workActions,
  files,
  memoryChanges,
  initialProfile,
  avatar,
  tabMemory,
}: {
  bot: RosterBot;
  channels: RosterChannel[];
  load: () => Promise<BotProfile>;
  actions: BotProfileActions;
  settings?: ReactNode;
  permissions?: ReactNode;
  workActions?: ReactNode;
  files?: ((active: boolean, render: (body: ProfileTabBody) => ReactNode) => ReactNode) | undefined;
  memoryChanges?: ((offset: number) => Promise<MemoryChangesPage>) | undefined;
  initialProfile?: BotProfile | undefined;
  avatar: AvatarActions;
  tabMemory: ProfileTabMemory;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const avatarEditor = useAvatarEditor(avatar);
  const [profile, setProfile] = useState(initialProfile);
  const content = useSheetContent();
  const columns = useMemoryColumns();
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
  const rows = profileRows(content.ready ? profile : undefined, channels, columns);
  const [memoryView, setMemoryView] = useState<MemoryView>('files');
  const changes = useMemoryChanges(memoryChanges);
  const attached =
    memoryChanges !== undefined &&
    profile?.memory.status === 'ready' &&
    profile.memory.value.status === 'attached';
  const showChanges = attached && memoryView === 'changes';
  const rowOf = (row: Row): ShellRow => ({
    key: row.key,
    render: () => <ProfileRow bot={bot} row={row} onRetry={read} actions={actions} />,
  });
  const changeRowOf = (row: Row): ShellRow => ({
    key: `changes:${row.key}`,
    render: () => (
      <ProfileRow
        bot={bot}
        row={row}
        onRetry={changes.reload}
        onMore={changes.more}
        actions={actions}
      />
    ),
  });
  const node = (key: string, render: () => ReactNode): ShellRow => ({
    key,
    render,
  });
  const section = (key: string, child: ReactNode) =>
    node(key, () => <View style={{ paddingTop: space.x5 }}>{child}</View>);
  const settingsHeading = (key: string, title: string) =>
    node(`${key}:heading`, () => (
      <View style={{ paddingTop: space.x5, paddingBottom: space.x2 }}>
        <SettingsHeading>{title}</SettingsHeading>
      </View>
    ));
  const bodies: Record<Exclude<ProfileTab, 'files' | 'members'>, ProfileTabBody> = {
    work: {
      rows: [
        ...(workActions === undefined ? [] : [node('work:actions', () => workActions)]),
        ...rows.work.map(rowOf),
      ],
    },
    memory: {
      rows: [
        ...(attached
          ? [
              node('memory:views', () => (
                <View testID="memory-views" style={{ paddingBottom: space.x5 }}>
                  <Segmented<MemoryView>
                    label={t.memoryViews}
                    options={[
                      { value: 'files', label: t.memoryViewFiles },
                      { value: 'changes', label: t.memoryViewChanges },
                    ]}
                    value={memoryView}
                    onChange={(next) => {
                      setMemoryView(next);
                      if (next === 'changes') changes.reload();
                    }}
                  />
                </View>
              )),
            ]
          : []),
        ...(showChanges
          ? memoryChangeRows(changes.state).map(changeRowOf)
          : rows.memory.map(rowOf)),
      ],
    },
    routines: {
      ...(actions.onNewRoutine === undefined
        ? {}
        : { action: <NewRoutineButton onPress={actions.onNewRoutine} /> }),
      rows: rows.routines.map(rowOf),
    },
    settings: {
      rows: [
        ...rows.activity.map(rowOf),
        ...(permissions === undefined
          ? []
          : [
              settingsHeading('settings:permissions', t.approvals.permissions),
              node('settings:permissions:rows', () => permissions),
            ]),
        ...(content.ready && settings !== undefined
          ? [section('settings:panel', settings)]
          : [
              node('settings:bot', () => (
                <View style={{ paddingTop: space.x5 }}>
                  <SettingsHeading>{t.profileSettingsBot}</SettingsHeading>
                </View>
              )),
            ]),
        ...(content.ready && settings !== undefined
          ? []
          : [
              section(
                'settings:notifications',
                <SettingsSection on="raised">
                  <SettingsRow
                    on="raised"
                    testID="profile-notifications"
                    title={t.profileNotifications}
                    trailing={
                      <ChevronRightIcon color={theme.color.muted} size={theme.type.body.line} />
                    }
                    onPress={actions.onNotifications}
                  />
                </SettingsSection>,
              ),
            ]),
        section(
          'settings:avatar',
          <AvatarSettings
            on="raised"
            editor={avatarEditor}
            hasAvatar={bot.avatarUrl !== undefined}
            portrait={<BotAvatar bot={bot} size={32} ring={false} corner={radius.sm} />}
            testID="bot-avatar-settings"
          />,
        ),
        settingsHeading('channels', t.profileSection.channels),
        ...rows.channels.map(rowOf),
        settingsHeading('files', t.profileSection.files),
        ...rows.files.map(rowOf),
      ],
    },
  };
  const shell = (filesBody: ProfileTabBody) => (
    <ProfileShell
      identity={<BotIdentity bot={bot} actions={actions} avatar={avatarEditor} />}
      tabs={tabs}
      options={profileTabOptions(tabs)}
      tab={tab}
      onTab={setTab}
      body={tab === 'files' || tab === 'members' ? filesBody : bodies[tab]}
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

export function MemoryFileChanges({
  bot,
  load,
  onOpen,
}: {
  bot: RosterBot;
  load: (offset: number) => Promise<MemoryChangesPage>;
  onOpen(change: MemoryChange): void;
}) {
  const changes = useMemoryChanges(load);
  const mount = useMounted<ViewInstance>(() => changes.reload(), [load]);
  const actions: BotProfileActions = {
    onNotifications: () => undefined,
    onOpenMemory: () => undefined,
    onOpenActivity: () => undefined,
    onClose: () => undefined,
    onOpenMemoryChange: onOpen,
  };
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <FlatList
        testID="memory-file-history"
        data={memoryChangeRows(changes.state, new Date(), t.memoryHistoryEmpty)}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ padding: space.x5 }}
        renderItem={({ item }) => (
          <ProfileRow
            bot={bot}
            row={item}
            onRetry={changes.reload}
            onMore={changes.more}
            actions={actions}
          />
        )}
      />
    </View>
  );
}
