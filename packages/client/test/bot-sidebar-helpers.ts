import { type RemoteHostsSnapshot } from '../src/client/remote-hosts.js';
import { type BridgeActions } from '../src/client/actions.js';
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { type RosterConfig } from '../src/client/roster-config.js';
import { type RosterSection } from '../src/client/roster.js';
import { type RosterSnapshot } from '../src/client/roster.js';
import { type BotSummary } from '../src/client/store.js';
import { type ChannelSummary } from '../src/client/store.js';
import { createHumanAvatarCache } from '@botharness/host-client/human-profile';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { hoverTooltip } from './primitive-mocks.js';
import { afterEach, beforeEach, vi } from 'vitest';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

const environmentProbe = vi.hoisted(
  (): { snapshot: RemoteHostsSnapshot; dock?: boolean | undefined } => ({
    snapshot: { hosts: [], avatars: new Map(), tab: 'local' },
  }),
);

const captured = vi.hoisted(() => ({
  dock: false,
  menus: [] as Array<{
    open: boolean;
    items: readonly Record<string, unknown>[];
    selectedId?: string | undefined;
    onSelect?: (id: string) => void;
    point?: { x: number; y: number };
  }>,
  uploads: [] as Array<{ initialSlug?: string | undefined; onListed: () => void }>,
  tooltipLabels: [] as string[],
  avatarEditors: [] as Array<{
    bot: { slug: string };
    channelId: string;
    onSave(channelId: string, recipe: unknown): Promise<boolean>;
  }>,
}));

const AT = '2026-09-19T00:00:00.000Z';

const BOT: BotSummary = {
  slug: 'atlas',
  displayName: 'Atlas',
  roles: ['研究', '写作'],
  description: '文件研究助手',
  aggregateState: 'working',
  workspaces: [],
  createdAt: AT,
};

const SECTION_CHANNEL: ChannelSummary = {
  id: 'c-section',
  type: 'group',
  name: '一级渠道',
  members: ['atlas'],
  createdAt: AT,
  updatedAt: AT,
};

const FLAT_CHANNEL: ChannelSummary = {
  id: 'c-flat',
  type: 'group',
  name: '散装渠道',
  members: [],
  createdAt: AT,
  updatedAt: AT,
};

const DM_CHANNEL: ChannelSummary = {
  id: 'dm-atlas',
  type: 'dm',
  name: 'Atlas',
  members: ['atlas'],
  botSlug: 'atlas',
  createdAt: AT,
  updatedAt: AT,
};

const NO_INSTALL = { installable: false, install: { phase: 'idle' as const } };

function stubActions(): BridgeActions {
  return {
    genuiDocumentView: vi.fn(),
    saveGenuiDocumentView: vi.fn(),
    sendGenuiDocumentReply: vi.fn(),
    genuiView: vi.fn(),
    saveGenuiView: vi.fn(),
    sendGenuiReply: vi.fn(),
    humanIdentity: vi.fn(),
    humanAvatarSet: vi.fn(),
    humanAvatars: createHumanAvatarCache(async () => []),
    tobHome: vi.fn(),
    sendHome: vi.fn(),
    channelHistory: vi.fn(),
    channelHistorySources: vi.fn(),
    channelPurgePreview: vi.fn(),
    channelPurgeConfirm: vi.fn(),
    onboarding: vi.fn(),
    onboardingModel: vi.fn(),
    inheritModel: vi.fn(),
    telemetryEvent: vi.fn(),
    retryMessage: vi.fn(),
    stopBot: vi.fn(),
    cancelAutoContinue: vi.fn(async () => undefined),
    botContext: vi.fn(),
    botSystemPrompt: vi.fn(),
    botTurnInput: vi.fn(),
    newBotSession: vi.fn(),
    compactBot: vi.fn(),
    validateComposerDraft: vi.fn(),
    deletionPreview: vi.fn(),
    deletionConfirm: vi.fn(),
    deletionRetry: vi.fn(),
    deletionFolderApplications: vi.fn(),
    deletionFolderOpen: vi.fn(),
    skillCatalog: vi.fn(async () => []),
    allBotPreview: vi.fn(async () => {
      throw new Error('unexpected All Bots preview');
    }),
    overviewMemory: vi.fn(async () => {
      throw new Error('unexpected Overview Memory');
    }),
    overviewUsage: vi.fn(async () => {
      throw new Error('unexpected Overview usage');
    }),
    marketplaceList: vi.fn(async () => ({ bots: [] })),
    marketplaceAvatarList: vi.fn(),
    marketplaceAvatarTags: vi.fn(),
    marketplaceAvatarDetail: vi.fn(),
    marketplaceAvatarReport: vi.fn(),
    marketplaceAvatarApplyCandidates: vi.fn(),
    marketplaceAvatarApply: vi.fn(),
    marketplaceAvatarPublish: vi.fn(),
    marketplaceAvatarSource: vi.fn(),
    marketplaceAvatarMine: vi.fn(),
    marketplaceAvatarEdit: vi.fn(),
    marketplaceAvatarDelete: vi.fn(),
    marketplaceAccount: vi.fn(async () => ({ signedIn: false, author: null })),
    marketplaceAuthorSave: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceAuthorAvatarSet: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceUploadPlan: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceUpload: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceInstallReview: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceMine: vi.fn(async () => []),
    marketplaceDelete: vi.fn(async () => {}),
    shareDraftStart: vi.fn(async () => {
      throw new Error('unused');
    }),
    shareDraftGet: vi.fn(async () => undefined),
    shareDraftDiscard: vi.fn(async () => undefined),
    shareDraftExport: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceInstall: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceTopics: vi.fn(async () => []),
    marketplaceSections: vi.fn(async () => []),
    marketplaceDigests: vi.fn(async () => []),
    marketplaceDigest: vi.fn(async () => {
      throw new Error('digest-not-found');
    }),
    marketplaceDetail: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceFile: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceSubmit: vi.fn(async () => {
      throw new Error('unexpected Marketplace submission');
    }),
    marketplaceChallenge: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceReport: vi.fn(async () => {
      throw new Error('unused');
    }),
    groupWakePolicies: vi.fn(async () => []),
    channelAssignments: vi.fn(async () => []),
    channelBridges: vi.fn(async (channelId) => ({
      channelId,
      bridges: [],
      sources: [],
    })),
    channelIngests: vi.fn(async (channelId) => ({
      channelId,
      ingests: [],
      candidates: [],
    })),
    channelIngest: vi.fn(async () => undefined),
    channelBridge: vi.fn(async () => undefined),
    messagingChannelTarget: async () => undefined,
    messagingThreadPolicy: async () => undefined,
    messagingGroupPolicy: async () => undefined,
    messagingReceive: vi.fn(async () => undefined),
    messagingSource: vi.fn(async () => {
      throw new Error('unexpected source read');
    }),
    approvalRoute: vi.fn(async () => {}),
    approvalTest: vi.fn(async () => {}),
    approvalRetry: vi.fn(async () => {}),
    questionRetry: vi.fn(),
    failureAlertsSet: vi.fn(async () => {}),
    failureAlertsTest: vi.fn(async () => {}),
    failureAlertsRetry: vi.fn(async () => {}),
    pairingReview: vi.fn(),
    senderAccess: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingConversation: vi.fn(),
    messagingSnapshot: vi.fn(async () => ({
      accounts: [],
      grants: [],
      intents: [],
    })),
    messagingTargets: vi.fn(async () => []),
    resolveWorkspaceGrantRequest: vi.fn(async () => undefined),
    pickWorkspaceFolder: vi.fn(async () => null),
    humanAssignmentContext: vi.fn(async () => {
      throw new Error('unexpected Assignment context');
    }),
    replyToHumanAssignment: vi.fn(async () => {
      throw new Error('unexpected Assignment reply');
    }),
    messagingAuthorize: vi.fn(async () => {
      throw new Error('unexpected IM authorization');
    }),
    messagingRevoke: vi.fn(async () => undefined),
    messagingSend: vi.fn(async () => {
      throw new Error('unexpected IM send');
    }),
    modelCatalog: vi.fn(async () => ({ models: [] })),
    routingGroupEngines: vi.fn(async () => []),
    modelPresets: vi.fn(async () => []),
    routingGroups: vi.fn(async () => ({ groups: [], rests: [] })),
    createRoutingGroup: vi.fn(),
    updateRoutingGroup: vi.fn(),
    deleteRoutingGroup: vi.fn(),
    modelPlan: vi.fn(async () => undefined),
    modelPlanState: vi.fn(async () => ({})),
    applyModelPreset: vi.fn(async () => {
      throw new Error('unexpected Model Preset application');
    }),
    setStandingLimits: vi.fn(async () => {
      throw new Error('unused');
    }),
    chooseModelPlanGroup: vi.fn(async () => {
      throw new Error('not used');
    }),
    customizeModelPlan: vi.fn(async () => {
      throw new Error('unexpected Model Plan customization');
    }),
    setModelPlanAssignments: vi.fn(async () => {
      throw new Error('unexpected Assignment model plan change');
    }),
    setModelPlanSub: vi.fn(),
    setModelPlan: vi.fn(async () => {
      throw new Error('unexpected Model Plan change');
    }),
    listHostFolders: vi.fn(async () => ({
      path: '/',
      home: '/',
      crumbs: [],
      entries: [],
      truncated: false,
    })),
    addWorkspaceFolder: vi.fn(async () => undefined),
    userQuestionStatus: vi.fn(async () => 'expired' as const),
    answerUserQuestion: vi.fn(async () => undefined),
    authorizeWorkspacePath: vi.fn(async () => ({ id: 'grant-1' }) as never),
    memoryDirectory: vi.fn(async () => undefined),
    moveMemoryLocation: vi.fn(async () => '/tmp/memory'),
    load: vi.fn(async () => undefined),
    refreshRoster: vi.fn(async () => undefined),
    refreshGit: vi.fn(async () => undefined),
    installGit: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    refreshBotInbox: vi.fn(async () => undefined),
    openActivityCenter: vi.fn(async () => undefined),
    attachActivityCenterPanel: vi.fn(() => () => undefined),
    activityPage: vi.fn(),
    openActivityList: vi.fn(async () => undefined),
    refreshActivityListStatus: vi.fn(async () => undefined),
    refreshActivityList: vi.fn(async () => undefined),
    setActivityListFilters: vi.fn(async () => undefined),
    loadMoreActivityList: vi.fn(async () => undefined),
    ignoreHumanReport: vi.fn(async () => undefined),
    loadMoreBotInbox: vi.fn(async () => undefined),
    botInboxPage: vi.fn(async () => ({ items: [] })),
    openChannel: vi.fn(async () => undefined),
    openChannelAtMessage: vi.fn(async () => undefined),
    dismissActivityList: vi.fn(async () => undefined),
    dismissAllActivityList: vi.fn(async () => ({ dismissed: 0, more: false })),
    allowAutoRejectionOnce: vi.fn(async () => undefined),
    snoozeActivityList: vi.fn(async () => undefined),
    channelFilesPage: vi.fn(async () => ({ entries: [] })),
    activityListContextPage: vi.fn(async () => ({
      entries: [],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    })),
    activityListContext: vi.fn(async () => []),
    replyFromActivityList: vi.fn(async () => {
      throw new Error('No reply expected');
    }),
    loadOlder: vi.fn(async () => undefined),
    loadNewer: vi.fn(async () => undefined),
    openLatest: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    markChannelRead: vi.fn(async () => undefined),
    setChannelMuted: vi.fn(async () => true),
    refreshChannelMessages: vi.fn(async () => undefined),
    applyChannelTail: vi.fn(),
    dismissFailedMessage: vi.fn(() => false),
    openSession: vi.fn(() => undefined),
    readSessions: vi.fn(async () => []),
    refreshSessions: vi.fn(async () => undefined),
    setSessionArchived: vi.fn(async () => undefined),
    stopSession: vi.fn(async () => undefined),
    messageAttachmentTarget: vi.fn(async () => ({
      path: '/attachment',
      relativePath: 'attachment',
      kind: 'file' as const,
    })),
    messageAttachmentApplications: vi.fn(async () => ({
      available: false,
      applications: [],
    })),
    messageAttachmentOpen: vi.fn(async () => undefined),
    messageAttachmentDownload: vi.fn(async () => undefined),
    workspaceFileTarget: async () => ({
      path: '/workspace',
      relativePath: '',
      kind: 'directory' as const,
    }),
    workspaceFileApplications: async () => ({
      available: false,
      applications: [],
    }),
    workspaceFileOpen: async () => {},
    memoryFileTarget: vi.fn(),
    memoryFileApplications: vi.fn(),
    memoryFileOpen: vi.fn(),
    memoryFileDownload: vi.fn(),
    submissions: {
      subscribe: vi.fn(() => () => {}),
      snapshot: vi.fn(),
      begin: vi.fn(),
      cancel: vi.fn(),
      sync: vi.fn(),
      check: vi.fn(),
      reconcile: vi.fn(async () => {}),
    },
    fileOpenPreferences: {
      ready: vi.fn(async () => {}),
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    },
    memorySnapshot: vi.fn(async () => ({
      head: null,
      files: [],
      provisional: false,
      standing: [],
    })),
    memoryFile: vi.fn(async () => undefined),
    memoryHistory: vi.fn(async () => []),
    memoryDiff: vi.fn(async () => ''),
    memoryGitGraph: vi.fn(async () => ({
      head: '',
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [],
      hasMore: false,
    })),
    memoryGitCommitDiff: vi.fn(async () => ({ sha: '', files: [], diff: '' })),
    setBotAvatar: vi.fn(async () => true),
    setBotBanner: vi.fn(async () => true),
    setBotPrimaryColor: vi.fn(async () => true),
    updateBotProfile: vi.fn(async () => true),
    setBotAppearance: vi.fn(async () => true),
    loadPartLibrary: vi.fn(async () => []),
    addLibraryPart: vi.fn(async () => undefined),
    exportLibraryParts: vi.fn(async () => undefined),
    importLibraryParts: vi.fn(async () => ({ added: [], refused: 0 })),
    importLibraryImage: vi.fn(async () => ({ error: 'unavailable' })),
    profileUsage: vi.fn(),
    profileSessionUsage: vi.fn(),
    profileActivity: vi.fn(async () => ({
      slug: '',
      weeks: 26,
      since: '',
      today: '2026-09-29',
      events: [],
      memoryCommits: [],
      tokens: [],
      tokenTotals: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    })),
    channelActivityToday: vi.fn(),
    groupProfileActivity: vi.fn(async (channelId) => ({
      channelId,
      weeks: 26,
      since: '',
      today: '2026-09-29',
      days: [],
      authors: [],
    })),
    memoryWorkingChanges: vi.fn(async () => []),
    memoryWorkingDiff: vi.fn(async (_channelId, path, kind) => ({
      path,
      kind,
      status: 'M',
      diff: '',
      binary: false,
    })),
    memoryRecoveryHistory: vi.fn(async () => []),
    memoryRestore: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memoryRestoreCommit: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memoryNameVersion: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memoryRemoveVersionName: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memoryVersions: vi.fn(async () => []),
    botSourcePolicies: vi.fn(async () => []),
    botSchedules: vi.fn(async () => []),
    createBotSchedule: vi.fn(async () => {
      throw new Error('unexpected Bot Schedule create');
    }),
    updateBotSchedule: vi.fn(async () => {
      throw new Error('unexpected Bot Schedule update');
    }),
    deleteBotSchedule: vi.fn(async () => undefined),
    botScheduleHistory: vi.fn(async () => []),
    runBotScheduleNow: vi.fn(async () => {
      throw new Error('unused');
    }),
    botSchedulePreview: vi.fn(async () => []),
    setBotSourcePolicy: vi.fn(async () => undefined),
    resetBotSourcePolicy: vi.fn(async () => undefined),
    memoryRepair: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memorySave: vi.fn(async () => {
      throw new Error('not configured');
    }),
    listWorkspaceOptions: vi.fn(async () => []),
    listWorkspaceGrants: vi.fn(async () => []),
    authorizeGroupWorkspacePath: vi.fn(),
    resolveWorkspaceFolder: vi.fn(),
    readGroupWorkspaceGrant: vi.fn(),
    createWorkspaceGrant: vi.fn(async () => ({
      id: 'grant-1',
      path: '/project',
      title: 'Project',
      botSlug: 'atlas',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: AT,
    })),
    assignmentAccess: vi.fn(async () => ({
      botSlug: 'ada',
      mode: 'workspace-write' as const,
      revision: 0,
    })),
    setAssignmentAccess: vi.fn(async () => ({
      botSlug: 'ada',
      mode: 'workspace-write' as const,
      revision: 0,
    })),
    listToolApprovalRules: vi.fn(async () => []),
    revokeToolApprovalRule: vi.fn(async () => undefined),
    toolApprovalStatus: vi.fn(async () => 'expired' as const),
    decideToolApproval: vi.fn(async () => undefined),
    setWorkspaceGrantWrite: vi.fn(
      async (_slug, _id, enabled) => ({ id: 'grant-1', orchestratorWrite: enabled }) as never,
    ),
    revokeWorkspaceGrant: vi.fn(async () => ({
      id: 'grant-1',
      path: '/project',
      title: 'Project',
      botSlug: 'atlas',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: AT,
      revokedAt: AT,
    })),
    send: vi.fn(async () => false),
    createBot: vi.fn(async () => BOT),
    previewBotImport: vi.fn(async (gitUrl: string) => ({ gitUrl, commit: 'a'.repeat(40) })),
    openCreatedBot: vi.fn(async () => undefined),
    importBotZip: vi.fn(async () => BOT),
    botZipFiles: vi.fn(async () => ({ files: [], always: [] })),
    exportBotZip: vi.fn(async () => undefined),
    createGroup: vi.fn(async () => undefined),
    renameChannel: vi.fn(async () => true),
    setHumanNickname: vi.fn(async () => true),
    setGroupAvatar: vi.fn(async () => true),
    inviteGroupBot: vi.fn(async () => true),
    cancelGroupInvitation: vi.fn(async () => true),
    decideGroupJoin: vi.fn(async () => true),
    setGroupWakePolicy: vi.fn(async () => true),
    removeGroupMember: vi.fn(async () => true),
    deleteGroupChannel: vi.fn(async () => true),
    createSection: vi.fn(async () => undefined),
    renameSection: vi.fn(async () => true),
    removeSection: vi.fn(async () => true),
    setChannelPinned: vi.fn(async () => true),
    reorderPinnedChannels: vi.fn(async () => true),
    setChannelHidden: vi.fn(async () => true),
    batchRoster: vi.fn(async () => true),
    movePinnedChannel: vi.fn(async () => true),
    movePinnedChannelToFlat: vi.fn(async () => true),
    assignChannel: vi.fn(async () => true),
    setSectionChannelOrder: vi.fn(async () => true),
    moveChannel: vi.fn(async () => true),
    reorderSections: vi.fn(async () => true),
    reorderFlat: vi.fn(async () => true),
    moveToFlat: vi.fn(async () => true),
    ensureChannelPins: vi.fn(async () => true),
    ensureFlatTopOrder: vi.fn(async () => true),
    averageReplyPerf: vi.fn(async () => undefined),
  };
}

function config(patch?: Partial<RosterConfig>): RosterConfig {
  return { collapsed: {}, ...patch };
}

function section(id: string, name: string, channelIds: string[]): RosterSection {
  return { id, name, channelIds };
}

function setRoster(patch?: Partial<RosterSnapshot>): void {
  store.setRosterState({
    pins: [],
    hidden: [],
    muted: [],
    sections: [],
    topOrder: undefined,
    readOnly: false,
    ...patch,
  });
}

let prefs: BotModePrefsSnapshot = {
  motionPreference: 'system',
  botIcon: 'mascot' as const,
  sendKey: 'enter' as const,
  autoCollapseMessages: false,
  showDeliveryReceipts: false,
  showDmAvatar: false,
  showOwnAvatar: false,
  streamReplies: false,
  sessionDetailLevel: 'standard',
  sessionCollapse: 'completion',
  sessionFoldedReplies: 'all',
  autoAcceptGroupInvites: true,
  assignmentConcurrencyLimit: 3,
  botHopLimit: 128,
  developerMode: false,
  showBotSessions: false,
  showApprovalReviewSessions: false,
  effectiveMotion: 'full',
  sortMode: 'updated',
  sortModes: {},
  mode: 'host',
  status: 'ready',
};

let setSortMode = vi.fn();

let setSectionSortMode = vi.fn();

let menuView: { root: ReturnType<typeof createRoot>; host: HTMLDivElement } | undefined;

function disposeMenuView() {
  if (menuView === undefined) return;
  act(() => menuView!.root.unmount());
  menuView.host.remove();
  menuView = undefined;
}

function renderSidebar(wide = true): string {
  disposeMenuView();
  return renderToStaticMarkup(
    createElement(BotSidebar, {
      wide,
      actions: stubActions(),
      useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
        selector(prefs)) as never,
      setSortMode,
      setSectionSortMode,
      t: zhTranslate as never,
    }),
  );
}

function openSidebarMenu(label: string): HTMLElement {
  if (document.querySelector(`button[aria-label="${label}"]`) === null) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    menuView = { root, host };
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    act(() =>
      root.render(
        createElement(BotSidebar, {
          wide: true,
          actions: stubActions(),
          useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
            selector(prefs)) as never,
          setSortMode,
          setSectionSortMode,
          t: zhTranslate,
        }),
      ),
    );
  }
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (trigger === null) throw new Error(`No sidebar menu ${label}`);
  if (trigger.getAttribute('aria-expanded') !== 'true') act(() => trigger.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (menu === null) throw new Error(`No menu opened by ${label}`);
  return menu;
}

async function renderRailPreviews(): Promise<string> {
  disposeMenuView();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  menuView = { root, host };
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  try {
    await act(async () =>
      root.render(
        createElement(BotSidebar, {
          wide: false,
          actions: stubActions(),
          useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
            selector(prefs)) as never,
          setSortMode,
          setSectionSortMode,
          t: zhTranslate,
        }),
      ),
    );
    let markup = host.innerHTML;
    for (const button of host.querySelectorAll<HTMLElement>('.bh-rail-channel')) {
      const trigger = button.parentElement!;
      await hoverTooltip(trigger, vi.advanceTimersByTimeAsync, 350);
      const preview = document.querySelector('.bh-rail-preview');
      if (preview === null) throw new Error('No rail preview after hover');
      markup += preview.outerHTML;
      await act(async () => {
        trigger.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }));
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    return markup;
  } finally {
    disposeMenuView();
    vi.useRealTimers();
  }
}

function rowNames(menu: HTMLElement): (string | null)[] {
  return [...menu.querySelectorAll('[role="menuitem"]')].map((row) => row.textContent);
}

function menuWithItem(id: string): {
  open: boolean;
  items: readonly Record<string, unknown>[];
  selectedId?: string | undefined;
  onSelect?: (id: string) => void;
} {
  const found = captured.menus.find((menu) => menu.items.some((item) => item['id'] === id));
  if (found === undefined) throw new Error(`menu with item ${id} not rendered`);
  return found;
}

export {
  AT,
  BOT,
  SECTION_CHANNEL,
  FLAT_CHANNEL,
  DM_CHANNEL,
  NO_INSTALL,
  stubActions,
  config,
  section,
  setRoster,
  prefs,
  setSortMode,
  setSectionSortMode,
  renderSidebar,
  openSidebarMenu,
  renderRailPreviews,
  rowNames,
  menuWithItem,
  environmentProbe,
  captured,
};

export function registerSidebarHooks() {
  beforeEach(() => {
    captured.dock = false;
    environmentProbe.snapshot = { hosts: [], avatars: new Map(), tab: 'local' };
    environmentProbe.dock = undefined;
    captured.menus.length = 0;
    store.setMode('dsh');
    store.setQuery('');
    store.select(undefined);
    store.setConfig(config());
    store.setRoster([], []);
    store.setGit({
      available: true,
      version: '2.47.1',
      source: 'system',
      ...NO_INSTALL,
    });
    setRoster();
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoCollapseMessages: false,
      showDeliveryReceipts: false,
      showDmAvatar: false,
      showOwnAvatar: false,
      streamReplies: false,
      sessionDetailLevel: 'standard',
      sessionCollapse: 'completion',
      sessionFoldedReplies: 'all',
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      botHopLimit: 128,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    setSortMode = vi.fn();
    setSectionSortMode = vi.fn();
  });

  afterEach(() => {
    disposeMenuView();
    vi.unstubAllGlobals();
    captured.menus.length = 0;
    store.setActivityList({ unreadCount: 0, hasAction: false, channelUnread: {} });
    store.setMode('dsh');
    store.setQuery('');
    store.select(undefined);
    store.setConfig(config());
    store.setRoster([], []);
    setRoster();
  });
}

export function setSidebarPrefs(snapshot: BotModePrefsSnapshot) {
  prefs = snapshot;
}
