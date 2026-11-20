import type { ConnectionDiagnostic } from '@botharness/host-client/connection-diagnostic';
import { ReadFailure } from '../primitives/read-failure';
import { watchAccountHosts } from '../../host/watch-account-hosts';
import { closeWorkspacePage } from './workspace-paging';
import { router, usePathname, useGlobalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, FlatList, Platform, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cloudClient, useCloudSnapshot } from '../../cloud/native';
import { cloudAvailable } from '../../cloud/available';
import { cloudError } from '../../cloud/client';
import {
  createWorkspaceDirectory,
  cloudViewScope,
  type CloudWorkspace,
  type WorkspaceDirectoryEntry,
} from '../../cloud/workspace-directory';
import { computerEnvironmentKey } from '../../host/conversation-environments';
import { useConversationFilter } from '../../host/native-conversation-filter';
import type { ConnectHost } from '@botharness/host-client/connect-account';
import { connectAccount } from '../../host/native-connect-account';
import { liveGlance } from '../../host/host-glance';
import {
  useHostSession,
  useHostSnapshot,
  useInbox,
  useHostSessions,
} from '../../host/host-session';
import { pressTint, useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { edge, motion, sidebar, space, workspaceStack } from '../design/tokens';
import { HeaderCircleButton } from '../chat/header-chrome';
import { HumanAvatarButton } from './human-avatar';
import { useLiquidGlass } from '../primitives/drawer-material';
import { SettingsForm } from '../primitives/settings-form';
import { SettingsRow, SettingsSection } from '../primitives/settings-row';
import { DrawerListItem } from '../primitives/drawer-list-item';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { WorkspaceTabs, type WorkspaceTab } from './workspace-tabs';
import { WorkspaceAddButton } from './workspace-add';
import { useFloatingTabInset } from './floating-tab-inset';
import { hostDrawerRows, unpairedAccountHosts, type HostDrawerRow } from './host-drawer-model';
import { ActivityIcon, ChatsIcon, CloudIcon, PlusIcon } from './icons';
import { chooseCloudWorkspace } from './native-workspace-navigation';
import { holdBack } from './back-owner';
import { hostDrawer, settle, focusOn, closeThen } from './host-drawer-state';
import {
  FooterRow,
  StackedHostTiles,
  HostFormRow,
  AccountHostRow,
  loadAccountName,
  rowStyle,
  HostRow,
  WorkspaceRow,
  CloudServiceRow,
} from './workspace-drawer-rows';

const workspaceDirectory = createWorkspaceDirectory(cloudClient);

type WorkspaceDrawerItem =
  | { kind: 'all'; key: string }
  | { kind: 'host'; key: string; row: HostDrawerRow }
  | { kind: 'account-title'; key: string }
  | { kind: 'account'; key: string; host: ConnectHost }
  | { kind: 'workspace'; key: string; workspace: CloudWorkspace; server: string }
  | { kind: 'status'; key: string; entry: WorkspaceDirectoryEntry };

export function WorkspacePanel({
  active,
  page = false,
  docked = false,
}: {
  active: boolean;
  page?: boolean;
  docked?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const glass = useLiquidGlass();
  const insets = useSafeAreaInsets();
  const bottom = useFloatingTabInset();
  const { saved, hosts, client, inbox } = useHostSession();
  const [filter] = useConversationFilter();
  const connection = useHostSnapshot(client, active).connection;
  const list = useInbox(inbox, active);
  const feeds = useHostSessions(active);
  const glanceMap = useMemo(
    () =>
      Object.fromEntries(
        feeds.map((host) => [
          host.saved.hostId,
          {
            ...liveGlance(host.snapshot.connection, host.attention),
            ...(host.attention.status === 'ready'
              ? {
                  unread: Object.values(host.attention.unread ?? {}).filter((count) => count > 0)
                    .length,
                }
              : {}),
          },
        ]),
      ),
    [feeds],
  );
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ instanceId?: string; organizationId?: string }>();
  const cloud = useCloudSnapshot();
  const directory = useSyncExternalStore(
    workspaceDirectory.subscribe,
    workspaceDirectory.getSnapshot,
  );
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const cloudRoute = pathname.startsWith('/cloud-');
  const [tab, setTab] = useState<WorkspaceTab>(cloudRoute ? 'cloud' : 'computers');
  const tabMount = useMounted<ViewInstance>(() => {
    if (active) setTab(cloudRoute ? 'cloud' : 'computers');
  }, [active, cloudRoute]);
  const [linked, setLinked] = useState<ConnectHost[]>([]);
  const [directoryFailure, setDirectoryFailure] = useState<ConnectionDiagnostic>();
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const accountRefresh = useRef(() => {});
  const accountMount = useMounted<ViewInstance>(() => {
    if (!active || tab !== 'computers') return;
    const watcher = watchAccountHosts({
      account: connectAccount,
      update: setLinked,
      failed: setDirectoryFailure,
      busy: setDirectoryBusy,
      onResume: (refresh) => {
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') refresh();
        });
        return () => subscription.remove();
      },
    });
    accountRefresh.current = watcher.refresh;
    return () => {
      accountRefresh.current = () => {};
      watcher.close();
    };
  }, [active, tab]);
  const currentId = cloudRoute ? undefined : saved?.hostId;
  const cloudKey = JSON.stringify(cloud.rows.map(cloudViewScope));
  const cloudMount = useMounted<ViewInstance>(() => {
    if (!active || tab !== 'cloud' || !cloud.ready) return;
    void workspaceDirectory.refresh(cloud.rows);
    return () => workspaceDirectory.clear();
  }, [active, tab, cloud.ready, cloudKey]);
  const choose = async (workspace: CloudWorkspace) => {
    if (selecting || cloud.busy || directory.busy) return;
    const current = hostDrawer.beginWorkspaceSelection();
    setSelecting(true);
    setSelectionError(undefined);
    try {
      if (await chooseCloudWorkspace(workspace, current)) settle(false);
    } catch (error) {
      if (current()) setSelectionError(cloudError(error));
    } finally {
      setSelecting(false);
    }
  };
  const icon = theme.type.title.size + space.x2;

  const rows = useMemo(
    () => hostDrawerRows(hosts, currentId, glanceMap, liveGlance(connection, list)),
    [hosts, currentId, glanceMap, connection, list],
  );

  const tabFocus = useMounted<ViewInstance>(
    (node) => {
      if (!active || page) return;

      const focus = setTimeout(() => focusOn(node), motion.drawer);
      const back = docked
        ? undefined
        : holdBack(() => {
            settle(false);
            return true;
          });
      return () => {
        clearTimeout(focus);
        back?.remove();
      };
    },
    [active, page, docked, hosts],
  );

  const unpaired = unpairedAccountHosts(linked, hosts);
  const drawerRows: WorkspaceDrawerItem[] =
    tab === 'computers'
      ? [
          { kind: 'all', key: 'all' },
          ...rows.map((row): WorkspaceDrawerItem => ({
            kind: 'host',
            key: 'host:' + row.hostId,
            row,
          })),
          ...(unpaired.length === 0
            ? []
            : [
                { kind: 'account-title', key: 'account-title' } as const,
                ...unpaired.map((host): WorkspaceDrawerItem => ({
                  kind: 'account',
                  key: 'account:' + host.id,
                  host,
                })),
              ]),
        ]
      : directory.entries.flatMap((entry): WorkspaceDrawerItem[] => [
          ...entry.workspaces.map((workspace): WorkspaceDrawerItem => ({
            kind: 'workspace',
            key: entry.instanceId + ':' + workspace.organizationId,
            workspace,
            server: entry.server,
          })),
          { kind: 'status', key: entry.instanceId + ':status', entry },
        ]);
  const top = (
    <>
      <View
        ref={tabMount}
        style={{
          paddingTop: Math.max(insets.top - (glass ? sidebar.inset : 0), 0) + space.x5,
          paddingHorizontal: space.x5,
          paddingBottom: space.x4,
        }}
      >
        {cloudAvailable && <WorkspaceTabs value={tab} onChange={setTab} selectedRef={tabFocus} />}
      </View>
      <WorkspaceAddButton
        glass={glass}
        label={tab === 'computers' ? t.pairAnother : t.workspaceAdd.join}
        onPress={() =>
          closeThen(() => {
            if (tab === 'computers') hostDrawer.pairNew();
            else router.push('/cloud-join');
          })
        }
      />
    </>
  );
  const status = (
    <View ref={page ? undefined : accountMount}>
      {tab === 'cloud' && directory.busy && (
        <Text style={{ padding: space.x5 }} accessibilityLiveRegion="polite">
          {t.workspaceLoading}
        </Text>
      )}
      {tab === 'cloud' && !!selectionError && (
        <Text style={{ padding: space.x5 }} accessibilityLiveRegion="polite">
          {selectionError}
        </Text>
      )}
      {tab === 'cloud' && cloud.ready && !directory.busy && directory.entries.length === 0 && (
        <Text style={{ padding: space.x5 }} tone="muted">
          {t.workspaceEmpty}
        </Text>
      )}
      {tab === 'computers' && directoryFailure && (
        <View style={{ padding: space.x5 }}>
          <ReadFailure
            title={t.pairAccount.directoryFailed}
            detail={JSON.stringify(directoryFailure, null, 2)}
            busy={directoryBusy}
            onRetry={() => accountRefresh.current()}
          />
        </View>
      )}
      {tab === 'computers' && !directoryFailure && rows.length === 0 && (
        <Text style={{ padding: space.x5 }} tone="muted">
          {t.workspaceAdd.noComputers}
        </Text>
      )}
    </View>
  );
  const actions = (
    <View
      style={{
        paddingTop: space.x2,
        paddingBottom: page
          ? bottom
          : Math.max(insets.bottom - (glass ? sidebar.inset : 0), 0) + space.x2,
        borderTopWidth: edge.hairline,
        borderTopColor: theme.layer.sheet.edge,
      }}
    >
      {tab === 'cloud' && (
        <FooterRow
          label={t.workspaceAdd.manage}
          icon={<CloudIcon color={theme.color.fg} size={icon} />}
          onPress={() => closeThen(() => router.push('/cloud-services'))}
        />
      )}
      <FooterRow
        label={t.notifications}
        icon={<ActivityIcon color={theme.color.fg} size={icon} />}
        onPress={() => closeThen(() => hostDrawer.openNotifications())}
      />
    </View>
  );

  const allSelected = !cloudRoute && filter === 'all';
  const title = (
    <View
      ref={tabMount}
      style={{
        paddingTop: insets.top + space.x2,
        paddingHorizontal: space.x5,
        paddingBottom: space.x3,
        gap: space.x4,
      }}
    >
      <Text variant="display" accessibilityRole="header">
        {t.workspaces}
      </Text>
      {cloudAvailable && <WorkspaceTabs value={tab} onChange={setTab} selectedRef={tabFocus} />}
    </View>
  );
  const form = (
    <SettingsForm testID="workspace-panel">
      <SettingsSection>
        <SettingsRow
          testID="workspace-pair"
          title={t.pairAnother}
          tone="accent"
          icon="add"
          iconTone="accent"
          onPress={() => hostDrawer.pairNew()}
        />
      </SettingsSection>
      <SettingsSection footer={rows.length === 0 ? t.workspaceAdd.noComputers : undefined}>
        <SettingsRow
          testID="drawer-all"
          title={t.allEnvironmentsRow}
          leading={
            rows.length > 0 ? (
              <StackedHostTiles rows={rows} />
            ) : (
              <ChatsIcon color={theme.color.accent} size={workspaceStack.tile} />
            )
          }
          {...(allSelected ? { control: { kind: 'check' as const } } : {})}
          selected={allSelected}
          onPress={() => hostDrawer.selectAll()}
        />
        {rows.map((row) => (
          <HostFormRow
            key={row.hostId}
            row={row}
            selected={!cloudRoute && filter === computerEnvironmentKey(row.hostId)}
          />
        ))}
      </SettingsSection>
      {unpaired.length === 0 ? null : (
        <SettingsSection title={t.pairAccount.drawerTitle}>
          {unpaired.map((host) => (
            <AccountHostRow
              key={host.id}
              host={host}
              form
              onPress={() =>
                router.push({ pathname: '/pair/account', params: { account: host.id } })
              }
            />
          ))}
        </SettingsSection>
      )}
    </SettingsForm>
  );
  const bar = (
    <View
      ref={accountMount}
      testID="workspace-panel-bar"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.x4,
        paddingTop: space.x2,
        paddingBottom: Math.max(insets.bottom, space.x4),
      }}
    >
      <HumanAvatarButton
        client={client}
        testID="workspace-account"
        loadName={loadAccountName}
        onPress={() => {
          if (page) closeWorkspacePage();
          router.push('/settings');
        }}
      />
      <HeaderCircleButton
        testID="workspace-notifications"
        label={t.notifications}
        onPress={() => hostDrawer.openNotifications()}
      >
        <ActivityIcon color={theme.color.fg} size={theme.type.title.line} />
      </HeaderCircleButton>
    </View>
  );

  if (page && tab === 'computers')
    return (
      <View ref={cloudMount} style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
        {title}
        {form}
        {bar}
      </View>
    );

  return (
    <View
      ref={cloudMount}
      style={{ flex: 1, ...(page ? { backgroundColor: theme.overlay.fill } : {}) }}
    >
      {page ? title : top}
      <FlatList<WorkspaceDrawerItem>
        key={tab}
        testID={page ? 'workspace-panel' : undefined}
        style={{ flex: 1 }}
        data={drawerRows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingBottom: page ? 0 : space.x4 }}
        ListHeaderComponent={
          page ? (
            <WorkspaceAddButton
              glass={glass}
              label={t.workspaceAdd.join}
              onPress={() => router.push('/cloud-join')}
            />
          ) : undefined
        }
        renderItem={({ item }) => {
          if (item.kind === 'all' && Platform.OS === 'android')
            return (
              <View ref={cloudAvailable ? undefined : tabFocus}>
                <DrawerListItem
                  testID="drawer-all"
                  label={t.allEnvironmentsRow}
                  selected={!cloudRoute && filter === 'all'}
                  leading={
                    rows.length > 0 ? (
                      <StackedHostTiles rows={rows} />
                    ) : (
                      <ChatsIcon color={theme.color.accent} size={theme.type.body.line} />
                    )
                  }
                  onPress={() => closeThen(() => hostDrawer.selectAll())}
                />
              </View>
            );
          if (item.kind === 'all')
            return (
              <Pressable
                ref={cloudAvailable ? undefined : tabFocus}
                testID="drawer-all"
                accessibilityRole="button"
                accessibilityLabel={t.allEnvironmentsRow}
                accessibilityState={{ selected: !cloudRoute && filter === 'all' }}
                onPress={() => closeThen(() => hostDrawer.selectAll())}
                android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.x4,
                  minHeight: theme.touch + space.x3,
                  padding: space.x4,
                  ...rowStyle(theme, glass, pressed, !cloudRoute && filter === 'all'),
                  overflow: 'hidden',
                })}
              >
                {rows.length > 0 ? (
                  <StackedHostTiles rows={rows} />
                ) : (
                  <ChatsIcon
                    color={theme.color.accent}
                    size={theme.type.body.line * theme.fontScale}
                  />
                )}
                <Text strong style={{ flexShrink: 1 }}>
                  {t.allEnvironmentsRow}
                </Text>
              </Pressable>
            );
          if (item.kind === 'host')
            return (
              <HostRow
                row={item.row}
                selected={!cloudRoute && filter === computerEnvironmentKey(item.row.hostId)}
              />
            );
          if (item.kind === 'account-title')
            return (
              <Text
                variant="meta"
                tone="muted"
                accessibilityRole="header"
                style={{
                  paddingHorizontal: space.x5,
                  paddingTop: space.x4,
                  paddingBottom: space.x2,
                }}
              >
                {t.pairAccount.drawerTitle}
              </Text>
            );
          if (item.kind === 'account')
            return (
              <AccountHostRow
                host={item.host}
                onPress={() =>
                  closeThen(() =>
                    router.push({
                      pathname: '/pair/account',
                      params: { account: item.host.id },
                    }),
                  )
                }
              />
            );
          if (item.kind === 'workspace')
            return (
              <WorkspaceRow
                workspace={item.workspace}
                server={item.server}
                selected={
                  cloudRoute &&
                  params.instanceId === item.workspace.instanceId &&
                  params.organizationId === item.workspace.organizationId
                }
                disabled={selecting || cloud.busy || directory.busy}
                onPress={() => void choose(item.workspace)}
              />
            );
          const entry = item.entry;
          if (!entry.hasSession)
            return (
              <CloudServiceRow
                name={
                  cloud.rows.find((row) => row.config.instanceId === entry.instanceId)?.config
                    .name ?? entry.instanceId
                }
                server={entry.server}
                onPress={() => closeThen(() => router.push('/cloud-services'))}
              />
            );
          return (
            <View style={{ paddingHorizontal: space.x5, gap: space.x2 }}>
              {!!entry.error && (
                <Text accessibilityLiveRegion="polite">
                  {new URL(entry.server).host}: {entry.error}
                </Text>
              )}
              {!directory.busy &&
                !entry.error &&
                entry.workspaces.length === 0 &&
                entry.membersAfter === null &&
                entry.guestsAfter === null && <Text tone="muted">{t.workspaceEmpty}</Text>}
              {!directory.busy &&
                (entry.error || entry.membersAfter !== null || entry.guestsAfter !== null) && (
                  <FooterRow
                    label={entry.error ? t.retry : t.cloudOrganizations.more}
                    icon={<PlusIcon color={theme.color.fg} size={icon} />}
                    onPress={() => void workspaceDirectory.more(entry.instanceId)}
                  />
                )}
            </View>
          );
        }}
        ListFooterComponent={
          <>
            {status}
            {page && tab === 'cloud' ? (
              <FooterRow
                label={t.workspaceAdd.manage}
                icon={<CloudIcon color={theme.color.fg} size={icon} />}
                onPress={() => router.push('/cloud-services')}
              />
            ) : null}
          </>
        }
      />
      {page ? bar : actions}
    </View>
  );
}
