import { Icon } from '../../ds/icon.js';
import { Tag } from '../../ds/tag.js';
import { ASSIGNMENT_SESSION_ICON } from '../../channel-sidebar-icon.js';
import { useTeamMode } from '../../team-state.js';
import { BotAccessEntry } from '../../bot-access-entry.js';
import type { ConversationStateView } from '../../store.js';
import { Menu } from '../../appearance-primitives.js';
import { ChannelNicknameEntry, ChannelTraceEntry } from '../../channel-personal-settings.js';
import { useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { type MenuEntry } from '../../ds/menu.js';
import { Tooltip } from '../../ds/tooltip.js';
import type { BotModePrefs } from '../../bot-mode-prefs.js';
import { WorkspaceGrantsEntry } from '../../workspace-grants-entry.js';
import { AutoApprovalBadge, AutoApprovalSettingsEntry } from '../../approval-template-entry.js';
import { ModelPresetProfile } from '../../model-preset-profile.js';
import { BotPromptSettingsEntry } from '../../prompt-preset-settings.js';
import { BotModeSettingsEntry } from '../../bot-mode-settings.js';
import { BotVoiceSettingsEntry } from '../../voice-settings.js';
import { modelPlanOf, rememberModelPlan, subscribeModelPlans } from '../../model-plan-store.js';
import type { ModelPlanStateView, ModelPlanView } from '../../bridge.js';
import { AssignmentConcurrencySetting } from '../../assignment-concurrency-setting.js';
import { useChannelSettings } from '../../channel-settings-state.js';
import { hasChannelBots } from '../../channel-kind.js';
import { useMountedResource } from '../../mounted-resource.js';
import { useMessageHost } from '../../message-host.js';
import { WakePolicyBadge, WakePolicyEntry } from '../../wake-policy-entry.js';
import {
  ExternalConnectorsAttention,
  ExternalConnectorsEntry,
  ExternalIdentitiesEntry,
} from '../../external-entries.js';
import {
  GroupConnectorsAttention,
  GroupConnectorsEntry,
  GroupWakePolicyEntry,
  isGroupConversation,
} from '../../group-entries.js';
import { sameBotNames, useClientStore } from '../../use-client-store.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarTab,
} from '../../channel-sidebar.js';
import { MemoryEntry } from '../../memory-entry.js';
import { MemoryRecovery } from '../../memory-recovery.js';
import { cachedMemory, invalidateMemory } from '../../memory-read-cache.js';
import { MemoryFilesEntry } from '../../memory-files-entry.js';
import { Note } from '../../ds/note.js';
import { PanelDialog } from '../../ds/panel-dialog.js';
import { DisbandGroupDialog, GroupManagementSettings } from '../../group-management-settings.js';
import { MembersEntry, MembersHeaderAction } from '../../group-member-controls.js';
import { setSessionTarget, useSessionTarget } from '../../session-target.js';
import { PrivateAccountsSection } from '../../private-accounts-section.js';
import { BotSchedulesEntry, BotSchedulesHeaderAction } from '../../schedules-entry.js';
import {
  SessionsEntry,
  SessionsHeaderAction,
  type NativeSessionCatalog,
} from '../../sessions-entry.js';
import { SidebarViewMenu } from '../../sidebar-view-menu.js';
import { channelSidebarPrefs } from '../../channel-sidebar-prefs.js';
import { memoryViewSnapshot, setMemoryView, subscribeMemoryView } from '../../memory-view-prefs.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { IconButton } from '../../ds/icon-button.js';
import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { BotInboxEntry, BotInboxHeaderAction, BotInboxBadge } from './bot-inbox-entry.js';

const styles = stylex.create({
  sessionTarget: {
    minWidth: 0,
    flexShrink: 1,
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: color.muted,
    fontSize: text.metaSize,
  },
  viewTabs: {
    display: 'inline-flex',
    gap: space.x1,
    padding: space.x1,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  viewTab: {
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: { default: color.muted, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    cursor: 'pointer',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: '-2px',
  },
  viewTabSelected: {
    backgroundColor: color.base,
    color: { default: color.fg, ':hover': color.fg },
    fontWeight: text.strong,
  },
});

const inactiveSubscribe = (): (() => void) => () => {};

const NO_NATIVE_SESSION_STATE = { ids: [], byId: {} };

const NO_NATIVE_SESSIONS: NativeSessionCatalog = {
  subscribe: inactiveSubscribe,
  getSnapshot: () => NO_NATIVE_SESSION_STATE,
};

function GroupManagementEntry(props: ChannelSidebarEntryProps): ReactElement {
  const group = useClientStore((state) => state.conversation.channel);
  if (group?.type !== 'group') return <></>;
  return (
    <GroupManagementSettings key={group.id} actions={props.actions} t={props.t} group={group} />
  );
}

function GroupManagementHeaderAction(props: ChannelSidebarEntryProps): ReactElement {
  return <GroupManagementHeaderForChannel key={props.channelId} {...props} />;
}

function GroupManagementHeaderForChannel({
  actions,
  t,
  channelId,
}: ChannelSidebarEntryProps): ReactElement {
  const group = useClientStore((state) => state.conversation.channel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (group?.type !== 'group' || group.id !== channelId) return <></>;
  const items: readonly MenuEntry[] = [{ id: 'disband', label: t('members.delete') }];
  return (
    <>
      <Menu
        open={menuOpen}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={t('group.more')} side="bottom" delayMs={500}>
            <IconButton
              size="row"
              tone="subtle"
              aria-label={t('group.more')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <Icon name="ellipsis" size={16} />
            </IconButton>
          </Tooltip>
        }
        items={items}
        onSelect={() => {
          setMenuOpen(false);
          setConfirmOpen(true);
        }}
        onClose={() => setMenuOpen(false)}
      />
      {confirmOpen ? (
        <DisbandGroupDialog
          group={group}
          actions={actions}
          t={t}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}

function MembersBadge(): ReactElement {
  const count = useClientStore(
    (state) =>
      (state.conversation.channel?.members.length ?? 0) +
      (state.conversation.channel?.humanMembers?.length ?? 0),
  );
  return <Tag tone="neutral">{count}</Tag>;
}

function MemoryViewTabs({ t, setExpanded }: ChannelSidebarEntryProps): ReactElement {
  const view = useSyncExternalStore(subscribeMemoryView, memoryViewSnapshot, memoryViewSnapshot);
  return (
    <span
      role="tablist"
      aria-label={t('memory.view.label')}
      data-memory-view-tabs=""
      {...stylex.props(styles.viewTabs)}
    >
      {(['graph', 'versions', 'branches'] as const).map((id) => (
        <Tooltip
          key={id}
          label={t(`memory.view.${id}Help`)}
          side="bottom"
          maxWidth={280}
          delayMs={300}
          portal
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === id}
            {...stylex.props(styles.viewTab, view === id && styles.viewTabSelected)}
            onClick={() => {
              setMemoryView(id);
              setExpanded?.(true);
            }}
          >
            {t(`memory.view.${id}`)}
          </button>
        </Tooltip>
      ))}
    </span>
  );
}

function MemoryHeaderAction({
  t,
  actions,
  channelId,
  refreshRevision,
}: ChannelSidebarEntryProps): ReactElement {
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  const [backups, setBackups] = useState(false);
  return (
    <>
      <SidebarViewMenu
        label={t('memory.menu')}
        items={[
          {
            type: 'label',
            id: 'terminology-label',
            text: t('memory.terminology'),
          },
          { id: 'memory', label: t('memory.terms.memory') },
          { id: 'git', label: t('memory.terms.git') },
          { type: 'separator', id: 'backups-separator' },
          { id: 'backups', label: t('memory.backups.open') },
        ]}
        selectedIds={[terminology]}
        onSelect={(id) => {
          if (id === 'backups') setBackups(true);
          else channelSidebarPrefs.setMemoryTerminology(id === 'git' ? 'git' : 'memory');
        }}
      />
      {!backups ? null : (
        <PanelDialog
          size="small"
          onClose={() => setBackups(false)}
          closeLabel={t('common.close')}
          title={t('memory.backups.title')}
          description={t('memory.backups.intro')}
        >
          <MemoryRecovery
            actions={actions}
            channelId={channelId}
            refreshRevision={refreshRevision}
            t={t}
            onRestored={() => invalidateMemory(cachedMemory(actions, channelId))}
          />
        </PanelDialog>
      )}
    </>
  );
}

function ModelEntry({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const deleted = useClientStore((state) =>
    state.bots.some((bot) => bot.slug === botSlug && bot.deleted === true),
  );
  const disallowed = useClientStore((state) =>
    state.bots.some((bot) => bot.slug === botSlug && bot.modelAllowed === false),
  );
  const team = useTeamMode(actions.teamCall);
  const canChoose =
    team?.viewer.owner === true || team?.viewer.permissions.includes('models.use') === true;
  if (botSlug === undefined || deleted) return <></>;
  return (
    <>
      {disallowed ? (
        <Note tone="warning">
          {t(canChoose ? 'team.models.notAllowed' : 'team.models.notAllowedAsk')}
        </Note>
      ) : null}
      <ModelPresetProfile key={botSlug} slug={botSlug} actions={actions} t={t} />
    </>
  );
}

function useModelPlan(
  slug: string | undefined,
  actions: ChannelSidebarEntryProps['actions'],
): [ModelPlanView | null | undefined, (element: HTMLSpanElement | null) => void] {
  const deleted = useClientStore((state) =>
    state.bots.some((bot) => bot.slug === slug && bot.deleted === true),
  );
  const botSlug = deleted ? undefined : slug;
  const plan = useSyncExternalStore(
    (listener) => subscribeModelPlans(listener, actions),
    () => modelPlanOf(botSlug, actions),
    () => modelPlanOf(botSlug, actions),
  );
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (botSlug === undefined || modelPlanOf(botSlug, actions) !== undefined) return;
    let active = true;
    void actions.modelPlanState(botSlug).then(
      (state: ModelPlanStateView | undefined) => {
        if (active) rememberModelPlan(botSlug, state?.plan, actions);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [actions, botSlug, plan === undefined]);
  return [plan, mount];
}

function routeLabel(route: ModelPlanView['orchestrator'] | undefined): string {
  if (route === undefined) return '…';
  return route.reasoningEffort === undefined
    ? route.model
    : `${route.model} · ${route.reasoningEffort}`;
}

function ModelBadge({ botSlug, actions }: ChannelSidebarEntryProps): ReactElement {
  const [plan, mount] = useModelPlan(botSlug, actions);
  const route = plan?.orchestrator ?? undefined;
  return (
    <span ref={mount} className="bh-channel-sidebar-summary">
      {route === undefined ? null : <Tag tone="neutral">{routeLabel(route)}</Tag>}
    </span>
  );
}

function AssignmentLimitDialog({
  prefs,
  t,
  onClose,
}: {
  prefs: BotModePrefs;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const snapshot = useSyncExternalStore(
    prefs.source.subscribe,
    prefs.source.getSnapshot,
    prefs.source.getSnapshot,
  );
  return (
    <PanelDialog
      size="small"
      title={t('assignmentLimit.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <AssignmentConcurrencySetting
        t={t}
        limit={snapshot.assignmentConcurrencyLimit}
        writable={snapshot.status === 'ready' && snapshot.mode === 'host'}
        save={(limit) => prefs.setAssignmentConcurrencyLimit(limit)}
        variant="dialog"
      />
    </PanelDialog>
  );
}

function SessionsHeaderWithSettings({
  prefs,
  targetItems,
  targetId,
  ...props
}: ChannelSidebarEntryProps & {
  prefs: BotModePrefs | undefined;
  targetItems: readonly MenuEntry[];
  targetId: string | undefined;
}): ReactElement {
  const { actions, t } = props;
  const channelSettings = useChannelSettings();
  const botDeleted = useClientStore((state) =>
    state.bots.some((bot) => bot.slug === props.botSlug && bot.deleted === true),
  );
  const botSlug = botDeleted ? undefined : props.botSlug;
  const [plan, mount] = useModelPlan(botSlug, actions);
  const readLimit = () => prefs?.source.getSnapshot().assignmentConcurrencyLimit;
  const limit = useSyncExternalStore(
    prefs?.source.subscribe ?? inactiveSubscribe,
    readLimit,
    readLimit,
  );
  const [limitOpen, setLimitOpen] = useState(false);
  const extraItems: MenuEntry[] = [
    ...targetItems,
    ...(botSlug === undefined || props.scope === 'channel'
      ? []
      : [
          { type: 'separator' as const, id: 'model-separator' },
          { type: 'label' as const, id: 'model-label', text: t('entry.model') },
          {
            id: 'model:orchestrator',
            label: `${t('modelPreset.orchestrator')} · ${plan === null ? t('onboarding.inherit') : routeLabel(plan?.orchestrator)}`,
          },
          {
            id: 'model:assignment',
            label: `${t('modelPreset.assignment')} · ${plan === undefined ? '…' : plan?.assignmentDefault === undefined ? t('onboarding.inherit') : routeLabel(plan.assignmentDefault)}`,
          },
        ]),
    ...(prefs === undefined || limit === undefined
      ? []
      : [
          { type: 'separator' as const, id: 'limit-separator' },
          {
            type: 'label' as const,
            id: 'limit-label',
            text: t('assignmentLimit.title'),
          },
          {
            id: 'limit:edit',
            label: t('sessions.limit.value', { count: limit }),
          },
        ]),
  ];
  return (
    <span ref={mount} className="bh-sessions-header-action">
      <SessionsHeaderAction
        {...props}
        extraItems={extraItems}
        extraSelectedIds={targetId ? [targetId] : []}
        onExtraSelect={(id) => {
          if (id.startsWith('target:'))
            setSessionTarget(
              props.channelId,
              id === 'target:channel' ? '' : id.slice('target:bot:'.length),
            );
          else if (id === 'limit:edit') setLimitOpen(true);
          else channelSettings.open('model');
        }}
      />
      {limitOpen && prefs !== undefined ? (
        <AssignmentLimitDialog prefs={prefs} t={t} onClose={() => setLimitOpen(false)} />
      ) : null}
    </span>
  );
}

export function createChannelSidebarBuiltinTabs(
  t: BotHarnessTranslate,
): readonly ChannelSidebarTab[] {
  return [
    {
      id: 'conversation',
      icon: 'messages-circle',
      label: t('tab.conversation'),
      order: 1,
      scope: 'personabot',
    },
    {
      id: 'memory',
      icon: 'brain',
      label: t('tab.memory'),
      order: 2,
      scope: 'personabot',
    },
    {
      id: 'screen',
      icon: 'monitor',
      label: t('tab.screen'),
      order: 3,
      scope: 'personabot',
    },
  ];
}

export function createChannelSidebarBuiltins(
  t: BotHarnessTranslate,
  prefs?: BotModePrefs,
  nativeSessions: NativeSessionCatalog = {
    subscribe: inactiveSubscribe,
    getSnapshot: () => ({ ids: [], byId: {} }),
  },
): readonly ChannelSidebarEntry[] {
  function SessionsWithNative(props: ChannelSidebarEntryProps): ReactElement {
    const host = useMessageHost();
    const localPrefs = host === undefined ? prefs : undefined;
    const readLimit = () => localPrefs?.source.getSnapshot().assignmentConcurrencyLimit;
    const assignmentLimit = useSyncExternalStore(
      localPrefs?.source.subscribe ?? inactiveSubscribe,
      readLimit,
      readLimit,
    );
    return (
      <SessionsEntry
        {...props}
        nativeSessions={host === undefined ? nativeSessions : NO_NATIVE_SESSIONS}
        assignmentLimit={assignmentLimit}
      />
    );
  }

  function WorkspaceGrantsWithPrefs(props: ChannelSidebarEntryProps): ReactElement {
    const developerMode = useSyncExternalStore(
      prefs?.source.subscribe ?? inactiveSubscribe,
      () => prefs?.source.getSnapshot().developerMode ?? false,
    );
    return <WorkspaceGrantsEntry {...props} developerMode={developerMode} />;
  }
  function SessionsHeader(props: ChannelSidebarEntryProps): ReactElement {
    const host = useMessageHost();
    const target = useSessionTarget(props);
    const group = props.botSlug === undefined;
    const channel = useClientStore((state) =>
      state.conversation.channel?.id === props.channelId
        ? state.conversation.channel
        : state.channels.find((channel) => channel.id === props.channelId),
    );
    const allBots = useClientStore((state) => state.bots, sameBotNames);
    const bots = allBots.filter((bot) => channel?.members.includes(bot.slug));
    const selected =
      target.kind === 'bot' ? allBots.find((bot) => bot.slug === target.slug) : undefined;
    const targetId = group
      ? target.kind === 'channel'
        ? 'target:channel'
        : `target:bot:${target.slug}`
      : undefined;
    const targetItems: MenuEntry[] = group
      ? [
          {
            type: 'label',
            id: 'target-label',
            text: props.t('sessions.target.label'),
          },
          { id: 'target:channel', label: props.t('sessions.target.channel') },
          ...bots.map((bot) => ({
            id: `target:bot:${bot.slug}`,
            label: props.t('sessions.target.bot', { name: bot.displayName }),
          })),
        ]
      : [];
    return (
      <>
        {group && selected ? (
          <span
            data-session-target=""
            title={selected.displayName}
            {...stylex.props(styles.sessionTarget)}
          >
            {props.t('sessions.target.bot', { name: selected.displayName })}
          </span>
        ) : null}
        <SessionsHeaderWithSettings
          {...props}
          botSlug={target.kind === 'bot' ? target.slug : undefined}
          prefs={group || host !== undefined ? undefined : prefs}
          targetItems={targetItems}
          targetId={targetId}
        />
      </>
    );
  }
  function MemoryEvolutionEntry(props: ChannelSidebarEntryProps): ReactElement {
    return <MemoryEntry {...props} showFiles={false} />;
  }
  return [
    {
      id: 'memory-files',
      tab: 'memory',
      icon: 'brain',
      label: t('entry.memoryFiles'),
      order: 5,
      scope: 'personabot',
      component: MemoryFilesEntry,
    },
    {
      id: 'memory-evolution',
      tab: 'memory',
      icon: 'git-branch',
      label: t('entry.memoryEvolution'),
      order: 6,
      scope: 'personabot',
      component: MemoryEvolutionEntry,
      headerAction: MemoryHeaderAction,
      headerLabel: t('entry.memory'),
      headerTabs: MemoryViewTabs,
    },
    {
      id: 'sessions',
      icon: ASSIGNMENT_SESSION_ICON,
      label: t('entry.sessions'),
      order: 10,
      scope: 'both',
      component: SessionsWithNative,
      headerAction: SessionsHeader,
    },
    {
      id: 'bot-inbox',
      tab: 'conversation',
      icon: 'inbox',
      label: t('entry.botInbox'),
      order: 15,
      scope: 'personabot',
      component: BotInboxEntry,
      badge: BotInboxBadge,
      headerAction: BotInboxHeaderAction,
    },
    {
      id: 'schedules',
      defaultHidden: true,
      icon: 'alarm-clock',
      label: t('entry.schedules'),
      order: 16,
      scope: 'personabot',
      component: BotSchedulesEntry,
      headerAction: BotSchedulesHeaderAction,
    },
    ...(['personabot', 'channel'] as const).map((scope) => ({
      id: scope === 'personabot' ? 'human-nickname' : 'group-human-nickname',
      surface: 'settings' as const,
      icon: 'user',
      label: t('humanNickname.title'),
      order: 1,
      scope,
      component: ChannelNicknameEntry,
      visible: (state: ConversationStateView) =>
        state.conversation.channel?.humanNickname !== undefined,
    })),
    {
      id: 'dm-trace',
      surface: 'settings',
      icon: 'eye',
      label: t('dmTrace.menu'),
      order: 2,
      scope: 'personabot',
      component: ChannelTraceEntry,
    },
    {
      id: 'bot-access',
      surface: 'settings',
      icon: 'users',
      label: t('entry.botAccess'),
      order: 19,
      scope: 'personabot',
      component: BotAccessEntry,
    },
    {
      id: 'workspace-grants',
      surface: 'settings',
      icon: 'folder-key',
      label: t('entry.workspaceGrants'),
      order: 20,
      scope: 'personabot',
      component: WorkspaceGrantsWithPrefs,
    },
    {
      id: 'auto-approval',
      surface: 'settings',
      icon: 'shield-check',
      label: t('entry.autoApproval'),
      order: 22,
      scope: 'personabot',
      component: AutoApprovalSettingsEntry,
      badge: AutoApprovalBadge,
    },
    {
      id: 'prompts',
      surface: 'settings',
      icon: 'file-text',
      label: t('entry.prompts'),
      order: 24,
      scope: 'personabot',
      component: BotPromptSettingsEntry,
    },
    {
      id: 'voice',
      surface: 'settings',
      icon: 'audio-lines',
      label: t('entry.voice'),
      order: 24.5,
      scope: 'personabot',
      component: BotVoiceSettingsEntry,
    },
    {
      id: 'model',
      surface: 'settings',
      icon: 'cpu',
      label: t('entry.model'),
      order: 25,
      scope: 'personabot',
      component: ModelEntry,
      badge: ModelBadge,
    },
    {
      id: 'mode',
      surface: 'settings',
      icon: 'sliders-horizontal',
      label: t('entry.mode'),
      order: 25.5,
      scope: 'personabot',
      component: BotModeSettingsEntry,
    },
    {
      id: 'wake-policy',
      surface: 'settings',
      icon: 'bell-ring',
      label: t('entry.wakePolicy'),
      order: 26,
      scope: 'personabot',
      component: WakePolicyEntry,
      badge: WakePolicyBadge,
    },
    {
      id: 'external-identities',
      surface: 'settings',
      icon: 'id-card',
      label: t('entry.externalIdentities'),
      order: 27,
      scope: 'personabot',
      component: ExternalIdentitiesEntry,
    },
    {
      id: 'external-connectors',
      surface: 'settings',
      icon: 'plug',
      label: t('entry.externalConnectors'),
      order: 28,
      scope: 'personabot',
      component: ExternalConnectorsEntry,
      attention: ExternalConnectorsAttention,
    },
    {
      id: 'private-accounts',
      surface: 'settings',
      icon: 'shield-check',
      label: t('entry.privateAccounts'),
      order: 29,
      scope: 'personabot',
      component: PrivateAccountsSection,
    },
    {
      id: 'members',
      icon: 'users',
      label: t('entry.members'),
      order: 10,
      scope: 'channel',
      component: MembersEntry,
      headerAction: MembersHeaderAction,
      badge: MembersBadge,
    },
    {
      id: 'group-wake-policy',
      surface: 'settings',
      icon: 'bell-ring',
      label: t('entry.wakePolicy'),
      order: 12,
      scope: 'channel',
      component: GroupWakePolicyEntry,
      visible: (state) => isGroupConversation(state) && hasChannelBots(state.conversation.channel),
    },
    {
      id: 'group-external-connectors',
      surface: 'settings',
      icon: 'plug',
      label: t('entry.externalConnectors'),
      order: 14,
      scope: 'channel',
      component: GroupConnectorsEntry,
      attention: GroupConnectorsAttention,
      visible: isGroupConversation,
    },
    {
      id: 'group-management',
      surface: 'settings',
      icon: 'settings-2',
      label: t('entry.groupManagement'),
      order: 20,
      scope: 'channel',
      component: GroupManagementEntry,
      headerAction: GroupManagementHeaderAction,
      visible: (state) => state.conversation.channel?.type === 'group',
    },
  ];
}
