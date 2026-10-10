// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<{
    open: boolean;
    items: readonly Record<string, unknown>[];
    selectedId?: string | undefined;
    onSelect?: (id: string) => void;
  }>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const icon = (name: string) => (props: { className?: string }) =>
    createElement('span', { 'data-icon': name, className: props.className });
  return {
    Button: (props: { children?: ReactNode; disabled?: boolean }) =>
      createElement('button', { disabled: props.disabled }, props.children),
    IconAgentPresetOutlineRegular: icon('IconAgentPresetOutlineRegular'),
    IconCheckOutlineRegular: icon('IconCheckOutlineRegular'),
    IconChevronDownOutlineRegular: icon('IconChevronDownOutlineRegular'),
    IconCloseFill14: icon('IconCloseFill14'),
    IconEditOutlineRegular: icon('IconEditOutlineRegular'),
    IconEllipsisOutlineRegular: icon('IconEllipsisOutlineRegular'),
    IconFolderOpenOutlineRegular: icon('IconFolderOpenOutlineRegular'),
    IconGlobeOutlineRegular: icon('IconGlobeOutlineRegular'),
    IconNewChatOutlineRegular: icon('IconNewChatOutlineRegular'),
    IconPlusOutlineRegular: icon('IconPlusOutlineRegular'),
    IconSearchOutlineRegular: icon('IconSearchOutlineRegular'),
    IconTrashOutlineRegular: icon('IconTrashOutlineRegular'),
    IconTriangleRightFill14: icon('IconTriangleRightFill14'),
    HoverCard: (props: { anchor: ReactNode; content: ReactNode }) =>
      createElement('span', { 'data-hover-card': 'true' }, props.anchor, props.content),
    Input: stub,
    Menu: (props: {
      open: boolean;
      items: readonly Record<string, unknown>[];
      selectedId?: string | undefined;
      anchor: unknown;
    }) => {
      captured.menus.push(props);
      return props.anchor as never;
    },
    Modal: stub,
    StateDot: stub,
    Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
    Tooltip: (props: { children?: unknown }) => (props.children ?? null) as never,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotSidebar, BulkChannelMenu, ChannelMoveMenu } from '../src/client/bot-sidebar.js';
import { UNGROUPED_MOVE_TARGET } from '../src/client/section-management.js';
import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { PINNED_SORT_SCOPE_ID } from '../src/bot-mode-settings.js';
import { zh, zhTranslate } from '../src/client/locale.js';
import type { RosterConfig } from '../src/client/roster-config.js';
import type { RosterSection, RosterSnapshot } from '../src/client/roster.js';
import { store } from '../src/client/store.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';

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
    channelHistory: vi.fn(),
    channelHistorySources: vi.fn(),
    channelPurgePreview: vi.fn(),
    channelPurgeConfirm: vi.fn(),
    onboarding: vi.fn(),
    onboardingModel: vi.fn(),
    inheritModel: vi.fn(),
    retryMessage: vi.fn(),
    deletionPreview: vi.fn(),
    deletionConfirm: vi.fn(),
    deletionRetry: vi.fn(),
    deletionFolderApplications: vi.fn(),
    deletionFolderOpen: vi.fn(),
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
    marketplaceTopics: vi.fn(async () => []),
    marketplaceDetail: vi.fn(async () => {
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
    channelBridges: vi.fn(async (channelId) => ({ channelId, bridges: [], sources: [] })),
    channelIngests: vi.fn(async (channelId) => ({ channelId, ingests: [], candidates: [] })),
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
    pairingReview: vi.fn(),
    senderAccess: vi.fn(),
    messagingIdentity: vi.fn(),
    messagingConversation: vi.fn(),
    messagingSnapshot: vi.fn(async () => ({ accounts: [], grants: [], intents: [] })),
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
    modelPresets: vi.fn(async () => []),
    modelPlan: vi.fn(async () => undefined),
    modelPlanState: vi.fn(async () => ({})),
    createModelPreset: vi.fn(async () => {
      throw new Error('unexpected Model Preset creation');
    }),
    updateModelPreset: vi.fn(async () => {
      throw new Error('unexpected Model Preset update');
    }),
    applyModelPreset: vi.fn(async () => {
      throw new Error('unexpected Model Preset application');
    }),
    setStandingLimits: vi.fn(async () => {
      throw new Error('unused');
    }),
    customizeModelPlan: vi.fn(async () => {
      throw new Error('unexpected Model Plan customization');
    }),
    setModelPlanAssignments: vi.fn(async () => {
      throw new Error('unexpected Assignment model plan change');
    }),
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
    load: vi.fn(async () => undefined),
    refreshRoster: vi.fn(async () => undefined),
    refreshGit: vi.fn(async () => undefined),
    installGit: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    refreshBotInbox: vi.fn(async () => undefined),
    openActivityCenter: vi.fn(async () => undefined),
    refreshOverview: vi.fn(async () => undefined),
    humanActionPage: vi.fn(async () => ({ items: [] })),
    openHumanInbox: vi.fn(async () => undefined),
    refreshHumanInboxStatus: vi.fn(async () => undefined),
    refreshHumanInbox: vi.fn(async () => undefined),
    setHumanInboxFilters: vi.fn(async () => undefined),
    loadMoreHumanInbox: vi.fn(async () => undefined),
    ignoreHumanReport: vi.fn(async () => undefined),
    loadMoreBotInbox: vi.fn(async () => undefined),
    openChannel: vi.fn(async () => undefined),
    openChannelAtMessage: vi.fn(async () => undefined),
    dismissHumanInbox: vi.fn(async () => undefined),
    humanInboxContextPage: vi.fn(async () => ({
      entries: [],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    })),
    humanInboxContext: vi.fn(async () => []),
    replyFromHumanInbox: vi.fn(async () => {
      throw new Error('No reply expected');
    }),
    loadOlder: vi.fn(async () => undefined),
    loadNewer: vi.fn(async () => undefined),
    openLatest: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    refreshChannelMessages: vi.fn(async () => undefined),
    dismissFailedMessage: vi.fn(() => false),
    openSession: vi.fn(() => undefined),
    refreshSessions: vi.fn(async () => undefined),
    messageAttachmentTarget: vi.fn(async () => ({
      path: '/attachment',
      relativePath: 'attachment',
      kind: 'file' as const,
    })),
    messageAttachmentApplications: vi.fn(async () => ({ available: false, applications: [] })),
    messageAttachmentOpen: vi.fn(async () => undefined),
    messageAttachmentDownload: vi.fn(async () => undefined),
    workspaceFileTarget: async () => ({
      path: '/workspace',
      relativePath: '',
      kind: 'directory' as const,
    }),
    workspaceFileApplications: async () => ({ available: false, applications: [] }),
    workspaceFileOpen: async () => {},
    memoryFileTarget: vi.fn(),
    memoryFileApplications: vi.fn(),
    memoryFileOpen: vi.fn(),
    memoryFileDownload: vi.fn(),
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
    updateBotProfile: vi.fn(async () => true),
    setBotAppearance: vi.fn(async () => true),
    loadPartLibrary: vi.fn(async () => []),
    addLibraryPart: vi.fn(async () => undefined),
    exportLibraryParts: vi.fn(async () => undefined),
    importLibraryParts: vi.fn(async () => ({ added: [], refused: 0 })),
    importLibraryImage: vi.fn(async () => ({ error: 'unavailable' })),
    profileUsage: vi.fn(),
    profileActivity: vi.fn(async () => ({
      slug: '',
      weeks: 26,
      since: '',
      today: '2026-09-29',
      events: [],
      memoryCommits: [],
      tokens: [],
      tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
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
    sections: [],
    topOrder: undefined,
    readOnly: false,
    ...patch,
  });
}

let prefs: BotModePrefsSnapshot = {
  motionPreference: 'system',
  botIcon: 'mascot' as const,
  autoAcceptGroupInvites: true,
  assignmentConcurrencyLimit: 3,
  developerMode: false,
  effectiveMotion: 'full',
  sortMode: 'updated',
  sortModes: {},
  mode: 'host',
  status: 'ready',
};
let setSortMode = vi.fn();
let setSectionSortMode = vi.fn();

function renderSidebar(wide = true): string {
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

function menuWithLabel(label: string): {
  open: boolean;
  items: readonly Record<string, unknown>[];
  selectedId?: string | undefined;
  onSelect?: (id: string) => void;
} {
  const found = captured.menus.find((menu) =>
    menu.items.some((item) => item['type'] === 'label' && item['text'] === label),
  );
  if (found === undefined) throw new Error(`menu with label ${label} not rendered`);
  return found;
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

beforeEach(() => {
  captured.menus.length = 0;
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  store.setConfig(config());
  store.setRoster([], []);
  store.setGit({ available: true, version: '2.47.1', source: 'system', ...NO_INSTALL });
  setRoster();
  prefs = {
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    autoAcceptGroupInvites: true,
    assignmentConcurrencyLimit: 3,
    developerMode: false,
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
  captured.menus.length = 0;
  store.setHumanInbox({ unreadCount: 0, hasAction: false });
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  store.setConfig(config());
  store.setRoster([], []);
  setRoster();
});

describe('bot sidebar rows', () => {
  it('shows only the latest message time at the right of DM and Group titles', () => {
    const latestAt = '2026-10-10T14:25:00.000Z';
    const latestMessage = {
      id: 'latest',
      at: latestAt,
      author: { kind: 'human' as const },
      body: '最新消息',
    };
    store.setRoster(
      [BOT],
      [{ ...DM_CHANNEL, latestMessage }, { ...SECTION_CHANNEL, latestMessage }, FLAT_CHANNEL],
    );
    const container = document.createElement('div');
    container.innerHTML = renderSidebar();
    for (const channelId of [DM_CHANNEL.id, SECTION_CHANNEL.id]) {
      const titleRow = container.querySelector(`[data-channel-id="${channelId}"] .bh-top`)!;
      const time = titleRow.querySelector('time')!;
      expect(time.getAttribute('datetime')).toBe(latestAt);
      expect(time.textContent).toBe(
        new Date(latestAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      );
      expect(titleRow.lastElementChild).toBe(time);
      expect(time.getAttribute('title')).toBe(new Date(latestAt).toLocaleString());
    }
    expect(container.querySelector(`[data-channel-id="${FLAT_CHANNEL.id}"] time`)).toBeNull();
  });

  it('leaves the title time blank for invalid message dates', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: { id: 'invalid', at: 'invalid', author: { kind: 'human' }, body: '消息' },
        },
      ],
    );
    expect(renderSidebar()).not.toContain('bh-channel-message-time');
  });
  it('selects and removes a companion through the real DM context menu without changing Channel pins', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.setRoster([BOT], [DM_CHANNEL]);
    const actions = stubActions();
    const source = vi.fn(() => ({ addEventListener() {}, close() {} }));
    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'sidebar-qa' }),
      source,
      update: async () => {},
    });
    await companion.start();
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() =>
        root.render(
          createElement(BotSidebar, {
            wide: true,
            actions,
            companion,
            useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
              selector(prefs)) as never,
            setSortMode,
            setSectionSortMode,
            t: zhTranslate,
          }),
        ),
      );
      const open = () =>
        node
          .querySelector('[data-channel-id="dm-atlas"]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await act(open);
      expect(
        menuWithItem('companion').items.find((item) => item['id'] === 'companion')?.['label'],
      ).toBe(zhTranslate('companion.show'));
      await act(() => menuWithItem('companion').onSelect!('companion'));
      expect(companion.get('atlas')?.getSnapshot().selection?.botId).toBe('atlas');
      expect(actions.setChannelPinned).not.toHaveBeenCalled();
      expect(source).toHaveBeenCalledOnce();
      captured.menus.length = 0;
      await act(open);
      expect(
        menuWithItem('companion').items.find((item) => item['id'] === 'companion')?.['label'],
      ).toBe(zhTranslate('companion.remove'));
      await act(() => menuWithItem('companion').onSelect!('companion'));
      expect(companion.get('atlas')).toBeUndefined();
      expect(actions.setChannelPinned).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      companion.dispose();
    }
  });

  it('keeps Activity Center out of the Channel roster in both layouts', () => {
    store.select({ kind: 'inbox' });
    expect(renderSidebar()).not.toContain('bh-human-inbox-entry');
    expect(renderSidebar(false)).not.toContain('bh-human-inbox-entry');
  });

  it('renders the glyph-free section header anatomy', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-section-head');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('IconTriangleRightFill14');
    expect(markup).not.toContain('bh-arrow');
    expect(markup).not.toContain('bh-row-slot');
    expect(markup).toContain('bh-section-name');
    expect(markup).toContain('data-icon="IconChevronDownOutlineRegular"');
    expect(markup).toContain('bh-section-chevron');
    expect(markup).not.toContain('bh-chevron-collapsed');
    expect(markup).toContain('bh-row-actions');
    expect(markup).toContain('aria-label="「工作流」排序方式"');
    expect(markup).toContain('aria-label="在「工作流」中新建"');
    expect(markup.match(/class="bh-row-action"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/class="bh-row-action"[^>]*disabled/);
    const createMenu = captured.menus.find(
      (menu) =>
        menu.items.some((item) => item['id'] === 'bot') &&
        menu.items.some((item) => item['id'] === 'channel') &&
        !menu.items.some((item) => item['id'] === 'section'),
    );
    expect(createMenu?.items.map((item) => item['label'])).toEqual(['创建 Bot', '创建频道']);
  });

  it('renders Group conversations with the same two-line anatomy as DMs', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster(
      [BOT],
      [
        {
          ...SECTION_CHANNEL,
          latestMessage: {
            id: 'group-latest',
            at: AT,
            author: { kind: 'bot', slug: 'atlas' },
            body: '完成第一版\n请查看',
          },
        },
        FLAT_CHANNEL,
      ],
    );
    const markup = renderSidebar();

    expect(markup.match(/bh-channel-row/g)).toHaveLength(2);
    expect(markup).toContain('bh-channel-slot');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('bh-top');
    expect(markup).toContain('bh-name');
    expect(markup).toContain('bh-msg');
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('Atlas：完成第一版 请查看');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('暂无消息');
  });

  it('localizes system departure previews in the roster and collapsed rail', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...SECTION_CHANNEL,
          latestMessage: {
            id: 'left',
            at: AT,
            author: { kind: 'system' },
            body: 'Atlas left the Channel.',
            memberDeparture: {
              memberKind: 'bot',
              memberId: 'atlas',
              displayName: 'Atlas',
              departureType: 'left',
            },
          },
        },
        {
          ...FLAT_CHANNEL,
          latestMessage: {
            id: 'removed',
            at: AT,
            author: { kind: 'system' },
            body: 'Bea was removed from the Channel.',
            memberDeparture: {
              memberKind: 'bot',
              memberId: 'bea',
              displayName: 'Bea',
              departureType: 'removed',
            },
          },
        },
      ],
    );

    for (const wide of [true, false]) {
      const markup = renderSidebar(wide);
      expect(markup).toContain('Atlas 退出了频道');
      expect(markup).toContain('Bea 被移出了频道');
      expect(markup).not.toContain('undefined：');
    }
  });
  it('shows the latest DM message below the Bot name', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: { id: 'dm-latest', at: AT, author: { kind: 'human' }, body: '请继续' },
        },
      ],
    );
    const markup = renderSidebar();

    expect(markup).toContain('bh-contact');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('Atlas');
    expect(markup).toContain('你：请继续');
    expect(markup).not.toContain('文件研究助手');
  });

  it('shows recent activity for a bodyless latest DM message', () => {
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'dm-action',
            at: AT,
            author: { kind: 'human' },
            body: '',
            botDmAction: {
              channelId: 'dm-other',
              messageId: 'other-message',
              recipientBotSlug: 'other',
            },
          },
        },
      ],
    );

    expect(renderSidebar()).toContain('你：最新动态');
  });

  it('keeps an empty pin target collapsed before a drag begins', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-empty bh-pin-zone-hidden');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('拖到此处置顶');
    expect(markup.indexOf('bh-pin-zone')).toBeLessThan(markup.indexOf('bh-roster-list'));
  });

  it('renders pinned PersonaBot DMs as draggable cards inside the pin drop zone', () => {
    setRoster({ pins: [DM_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-grid');
    expect(markup).toMatch(/class="bh-pinned[^"]*"[^>]*draggable="true"/);
    expect(markup).not.toContain('拖到此处置顶');
    expect(markup).toContain('bh-unpin-zone bh-unpin-zone-hidden');
  });

  it('renders pinned group Channels with their hash glyph and removes their roster row', () => {
    setRoster({ pins: [FLAT_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-channel-icon');
    expect(markup).toContain('散装渠道');
    expect(markup.match(/bh-channel-row/g) ?? []).toHaveLength(0);
  });

  it('keeps a Group avatar in the roster, pinned grid, and both rail positions', () => {
    const group = { ...FLAT_CHANNEL, avatar: 'data:image/webp;base64,avatar' };
    store.setRoster([], [group]);

    const roster = renderSidebar();
    expect(roster).toContain('bh-channel-slot bh-group-channel-slot');
    expect(roster).toContain('<img class="bh-group-avatar-image"');

    const ordinaryRail = renderSidebar(false);
    expect(ordinaryRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(ordinaryRail.match(/<img class="bh-group-avatar-image"/g)).toHaveLength(2);

    setRoster({ pins: [group.id] });
    const pinned = renderSidebar();
    expect(pinned).toContain('bh-pinned-channel-icon bh-group-pinned-channel-icon');
    expect(pinned).toContain('<img class="bh-group-avatar-image"');

    const pinnedRail = renderSidebar(false);
    expect(pinnedRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(pinnedRail.match(/<img class="bh-group-avatar-image"/g)).toHaveLength(2);
  });

  it('stacks member faces for a Group without an avatar in the roster, pinned grid, and rail', () => {
    const group = { ...FLAT_CHANNEL, members: ['atlas'] };
    store.setRoster([BOT], [group]);

    const roster = renderSidebar();
    expect(roster).toContain('bh-channel-slot bh-group-channel-slot');
    expect(roster.match(/class="bh-group-avatar-stack" data-count="1"/g)).toHaveLength(1);

    const ordinaryRail = renderSidebar(false);
    expect(ordinaryRail).toContain('bh-rail-channel-icon bh-group-channel-icon');
    expect(ordinaryRail.match(/class="bh-group-avatar-stack"/g)).toHaveLength(2);

    setRoster({ pins: [group.id] });
    const pinned = renderSidebar();
    expect(pinned).toContain('bh-pinned-channel-icon bh-group-pinned-channel-icon');
    expect(pinned).toContain('class="bh-group-avatar-stack"');
    const stack = pinned.slice(pinned.indexOf('class="bh-group-avatar-stack"'));
    expect(stack).toMatch(/^[^]*?class="bh-persona-avatar"[^>]*data-state="idle"/);

    const pinnedRail = renderSidebar(false);
    expect(pinnedRail.match(/class="bh-group-avatar-stack"/g)).toHaveLength(2);
  });

  it('projects every ordered Channel into the collapsed rail with a pin divider and previews', () => {
    setRoster({
      pins: [DM_CHANNEL.id],
      sections: [section('s1', '工作流', [SECTION_CHANNEL.id])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: FLAT_CHANNEL.id },
      ],
    });
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'm1',
            at: AT,
            author: { kind: 'bot', slug: 'atlas' },
            body: '已完成调研',
          },
        },
        {
          ...SECTION_CHANNEL,
          latestMessage: { id: 'm2', at: AT, author: { kind: 'human' }, body: '继续处理' },
        },
        FLAT_CHANNEL,
      ],
    );

    const markup = renderSidebar(false);

    expect(markup).toContain('bh-region-rail');
    expect(markup.match(/class="bh-rail-channel(?: bh-selected)?"/g) ?? []).toHaveLength(3);
    expect(markup).toContain('bh-rail-divider');
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('bh-rail-divider'));
    expect(markup.indexOf('一级渠道')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup).toContain('Atlas：已完成调研');
    expect(markup).toContain('你：继续处理');
    expect(markup).toContain('暂无消息');
  });

  it('omits hidden group and DM Channels from the roster, pin grid, and collapsed rail', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    setRoster({
      pins: [DM_CHANNEL.id],
      hidden: [DM_CHANNEL.id, FLAT_CHANNEL.id],
      topOrder: [{ kind: 'channel', id: FLAT_CHANNEL.id }],
    });

    const wide = renderSidebar();
    expect(wide).not.toContain('Atlas');
    expect(wide).not.toContain('散装渠道');
    expect(wide).toContain(zh['hidden.all']);

    const rail = renderSidebar(false);
    expect(rail).not.toContain('Atlas');
    expect(rail).not.toContain('散装渠道');
  });

  it('renders a PersonaBot DM inside a section with the same channel drag lifecycle', () => {
    setRoster({ sections: [section('s1', '工作流', ['dm-atlas'])] });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup).toContain('bh-contact');
    expect(markup).toContain('data-channel-id="dm-atlas"');
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
  });

  it('places a loose PersonaBot DM between sections through topOrder', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'dm-atlas' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('研究'));
  });

  it('renders the read-only note after a roster write reported storage-unavailable', () => {
    setRoster();
    store.setRosterState({ readOnly: true });
    const markup = renderSidebar();

    expect(markup).toContain('名册存储不可用，陈列只读');
  });

  it('drops the channel run while a section is collapsed', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setConfig(config({ collapsed: { s1: true } }));
    store.setRoster([], [SECTION_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('bh-chevron-collapsed');
    expect(markup).not.toContain('一级渠道');
    expect(markup).toContain('bh-row-actions');
  });

  it('orders the header icons search, ellipsis, plus', () => {
    const markup = renderSidebar();
    const search = markup.indexOf('data-icon="IconSearchOutlineRegular"');
    const ellipsis = markup.indexOf('data-icon="IconEllipsisOutlineRegular"');
    const plus = markup.indexOf('data-icon="IconPlusOutlineRegular"');

    expect(search).toBeGreaterThan(-1);
    expect(ellipsis).toBeGreaterThan(search);
    expect(plus).toBeGreaterThan(ellipsis);
  });

  it('offers PersonaBot creation when channels already exist and from the create menu', () => {
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();
    const menu = menuWithItem('bot');

    expect(menu.items.map((item) => item['label'])).toEqual([
      '创建 Bot',
      '创建频道',
      '创建频道分组',
      'Bot 市场',
    ]);
    expect(menu.items[0]?.['disabled']).toBeUndefined();
    expect(
      (menu.items[0]?.['submenu'] as Array<Record<string, unknown>>).map((item) => [
        item['id'],
        item['label'],
      ]),
    ).toEqual([
      ['bot:empty', '从零创建'],
      ['bot:git', '从 GitHub 导入'],
      ['bot:zip', '从 zip 导入'],
    ]);
    expect(markup).toContain('还没有 Bot');
    expect(markup).toContain('创建第一个 Bot');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('placeholder="搜索 Bot 或频道"');
  });

  it('blocks Bot creation and explains why while Host Git is unusable', () => {
    store.setGit({ available: false, reason: 'too-old', version: '2.20.1', ...NO_INSTALL });
    const markup = renderSidebar();
    const submenu = menuWithItem('bot').items[0]?.['submenu'] as Array<Record<string, unknown>>;

    expect(markup).toContain('data-git-unavailable="too-old"');
    expect(markup).toContain('需要 Git 才能创建 Bot');
    expect(markup).toContain('Git 2.20.1 版本太旧，需要 2.28 或更新版本。');
    expect(markup).toContain('href="https://botharness.ai/zh/docs/installation/#git"');
    expect(markup).toMatch(/<button disabled="">创建第一个 Bot<\/button>/);
    expect(submenu.map((item) => [item['id'], item['disabled']])).toEqual([
      ['bot:empty', true],
      ['bot:git', true],
      ['bot:zip', true],
    ]);
  });

  it('names a missing Git and a Git that cannot run differently', () => {
    store.setGit({ available: false, reason: 'missing', ...NO_INSTALL });
    expect(renderSidebar()).toContain('这台电脑上没有找到 Git。');
    store.setGit({ available: false, reason: 'unrunnable', ...NO_INSTALL });
    expect(renderSidebar()).toContain('macOS 需要先安装命令行开发者工具');
  });

  it('offers a one-step Managed Git install and shows its progress and failures', () => {
    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'idle' },
    });
    let markup = renderSidebar();
    expect(markup).toContain('data-git-install="idle"');
    expect(markup).toMatch(/<button[^>]*>安装 Git<\/button>/);
    expect(markup).toContain('不需要管理员权限');
    expect(markup).toContain('重新检测');

    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'downloading', received: 12 * 1024 * 1024, total: 62 * 1024 * 1024 },
    });
    markup = renderSidebar();
    expect(markup).toContain('正在下载 Git… 12.0 / 62.0 MB');
    expect(markup).toMatch(/<progress[^>]*max="65011712"/);
    expect(markup).toMatch(/<button disabled="">正在安装…<\/button>/);
    expect(markup).not.toContain('重新检测');

    store.setGit({
      available: false,
      reason: 'missing',
      installable: true,
      install: { phase: 'failed', reason: 'network', detail: 'ENOTFOUND' },
    });
    markup = renderSidebar();
    expect(markup).toContain('下载失败，请检查网络后重试。');
    expect(markup).toMatch(/<button[^>]*>重试安装<\/button>/);
  });

  it('leaves out the install button where no pinned build exists', () => {
    store.setGit({ available: false, reason: 'missing', ...NO_INSTALL });
    const markup = renderSidebar();
    expect(markup).not.toContain('安装 Git</button>');
    expect(markup).toContain('安装或升级后重启 DeepSeek Harness');
  });

  it('shows no Git notice once Host Git is usable', () => {
    const markup = renderSidebar();
    const submenu = menuWithItem('bot').items[0]?.['submenu'] as Array<Record<string, unknown>>;

    expect(markup).not.toContain('data-git-unavailable');
    expect(submenu.every((item) => item['disabled'] === false)).toBe(true);
  });

  it('sorts the pinned grid independently and offers a pinned sort menu', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'pin-old',
      name: '旧置顶',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'pin-new',
      name: '新置顶',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ pins: [older.id, newer.id] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新置顶')).toBeLessThan(auto.indexOf('旧置顶'));
    expect(auto).toContain('aria-label="置顶排序"');
    const menu = menuWithLabel('置顶排序');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pinned-sort-label',
      'updated',
      'manual',
      'inherit',
    ]);
    expect(menu.selectedId).toBe('inherit');
    menu.onSelect?.('manual');
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, 'manual');
    prefs = { ...prefs, sortModes: { [PINNED_SORT_SCOPE_ID]: 'manual' } };
    captured.menus.length = 0;
    const manual = renderSidebar();
    expect(manual.indexOf('旧置顶')).toBeLessThan(manual.indexOf('新置顶'));
    expect(menuWithLabel('置顶排序').selectedId).toBe('manual');
    menu.onSelect?.('inherit');
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, undefined);
  });

  it('renders the global sort menu from the shared policy store', () => {
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    renderSidebar();

    const menu = menuWithLabel('排序方式');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'sort-label',
      'updated',
      'manual',
      'roster-separator',
      'hidden',
      'channel-history',
    ]);
    expect(menu.items[0]?.['type']).toBe('label');
    expect(menu.items.slice(1).every((item) => item['danger'] === undefined)).toBe(true);
    expect(
      menu.items.filter((item) => item['label'] !== undefined).map((item) => item['label']),
    ).toEqual(['最近更新', '手动排序', '隐藏的频道与 Bot 私聊', '已结束会话的历史']);
    expect(menu.selectedId).toBe('manual');
  });

  it('writes the shared policy store when the global sort menu picks a mode', () => {
    renderSidebar();

    const onSelect = menuWithLabel('排序方式')['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    onSelect('unrelated');
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('renders the section menu in native order with the mode checked and danger last', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    store.setRoster([], [SECTION_CHANNEL]);
    renderSidebar();

    const menu = menuWithItem('rename');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'sort-label',
      'updated',
      'manual',
      'inherit',
      'section-separator',
      'move-up',
      'move-down',
      'section-action-separator',
      'rename',
      'delete',
    ]);
    expect(menu.items.slice(1, 4).map((item) => item['label'])).toEqual([
      '最近更新',
      '手动排序',
      '恢复自动',
    ]);
    expect(menu.items[4]?.['type']).toBe('separator');
    expect(menu.items[5]).toMatchObject({ id: 'move-up', disabled: true });
    expect(menu.items[6]).toMatchObject({ id: 'move-down', disabled: true });
    expect(menu.items[8]).toMatchObject({ id: 'rename', label: '重命名' });
    expect(menu.items[9]).toMatchObject({ id: 'delete', label: '删除', danger: true });
    expect(menu.items.at(-1)?.['danger']).toBe(true);
    expect(menu.selectedId).toBe('manual');
  });

  it('checks inherit when a section has no stored mode', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    expect(menuWithItem('rename').selectedId).toBe('inherit');
  });

  it('writes section modes through the shared policy and clears with inherit', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    const onSelect = menuWithItem('rename')['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', 'manual');

    setSectionSortMode.mockClear();
    onSelect('inherit');
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', undefined);

    setSectionSortMode.mockClear();
    onSelect('unrelated');
    expect(setSectionSortMode).not.toHaveBeenCalled();
  });

  it('orders a section by its resolved mode: manual override, else the global default', () => {
    const older = {
      ...SECTION_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...SECTION_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ sections: [section('s1', '工作流', ['c-old', 'c-new'])] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新频道')).toBeLessThan(auto.indexOf('旧频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const inherited = renderSidebar();
    expect(inherited.indexOf('旧频道')).toBeLessThan(inherited.indexOf('新频道'));
  });

  it('renders loose channels in flat order under every sort mode (never auto-sorted)', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    store.setRoster([], [older, newer]);

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const auto = renderSidebar();
    expect(auto).not.toContain('未分组');
    expect(auto.indexOf('旧频道')).toBeLessThan(auto.indexOf('新频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));
  });

  it('renders a loose channel between sections at its flat position', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'c-flat' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup.indexOf('散装渠道')).toBeLessThan(markup.indexOf('研究'));
    expect(markup).toContain('bh-loose');
  });

  it('wires drag on section and loose channels plus the section header', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.match(/draggable="true"/g)).toHaveLength(3);
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('散装渠道');
  });

  it('renders empty sections as bare headers with no layout-taking drop zone', () => {
    store.setConfig(config());
    setRoster({
      sections: [section('s1', '工作流', ['c-section']), section('s-empty', '空分组', [])],
    });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();
    expect(markup).toContain('空分组');
    expect(markup).not.toContain('bh-empty-drop');
    expect(markup).not.toContain('bh-drop-scope');
  });

  it('renders the 移动到 menu from every section plus 未分组 and maps picks to scopes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const onRename = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: 'c-section', x: 40, y: 80 },
        sections: [section('s1', '工作流', []), section('s2', '研究', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onPick,
        onRename,
        onCreateSection,
        onClose,
      }),
    );

    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('move menu not rendered');
    const items = menu.items as readonly { id: string; submenu?: readonly { id: string }[] }[];
    expect(items.map((item) => item.id)).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    expect(items[2]?.submenu?.map((item) => item.id)).toEqual([
      'new-section',
      's1',
      's2',
      UNGROUPED_MOVE_TARGET,
    ]);

    const onSelect = menu.onSelect as (id: string) => void;
    onSelect('s2');
    expect(onPick).toHaveBeenCalledWith('s2');
    onSelect(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    onSelect('rename');
    expect(onRename).toHaveBeenCalledWith('c-section');
    onSelect('new-section');
    expect(onCreateSection).toHaveBeenCalledWith('c-section');
  });

  it('uses a count-aware bulk menu and keeps destructive deletion unavailable', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    const onHide = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, SECTION_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        t: zhTranslate as never,
        onPick,
        onPin,
        onHide,
        onCreateSection,
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('置顶 2 个频道');
    expect(menu.items[2]?.['label']).toBe('将 2 个频道 移动到');
    expect(menu.items[4]?.['label']).toBe('隐藏 2 个频道');
    menu.onSelect?.('pin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(true);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
    menu.onSelect?.(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    menu.onSelect?.('new-section');
    expect(onCreateSection).toHaveBeenCalledOnce();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('offers bulk unpin and move for channels selected in the pin area', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, FLAT_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        allPinned: true,
        t: zhTranslate as never,
        onPick,
        onPin,
        onCreateSection: vi.fn(),
        onHide: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('取消置顶 2 个频道');
    menu.onSelect?.('unpin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(false);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
  });
  it('offers the same organization actions on ordinary and pinned Channel menus', () => {
    const onSetPinned = vi.fn();
    const onHide = vi.fn();
    const onPick = vi.fn();
    const onClose = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    let menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('pin');
    expect(onSetPinned).toHaveBeenCalledWith(DM_CHANNEL.id, true);
    expect(onPick).not.toHaveBeenCalled();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledWith(DM_CHANNEL.id);

    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, pinnedView: true, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        pinned: true,
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('unpin');
    expect(onSetPinned).toHaveBeenLastCalledWith(DM_CHANNEL.id, false);
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenLastCalledWith(DM_CHANNEL.id);
  });

  it('renders a deleted section channel as a loose channel with no bucket', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL]);
    const before = renderSidebar();
    expect(before).toContain('一级渠道');
    expect(before.indexOf('工作流')).toBeLessThan(before.indexOf('一级渠道'));

    setRoster({ sections: [] });
    const after = renderSidebar();
    expect(after).not.toContain('工作流');
    expect(after).not.toContain('未分组');
    expect(after).toContain('一级渠道');
  });
});

it('announces pending approvals in the Rail button while preserving working execution', () => {
  store.setRoster([BOT], [DM_CHANNEL]);
  store.applyActivity({
    generation: 'approval-rail-host',
    revision: 1,
    bots: [{ slug: BOT.slug, state: 'working', attention: { approvalCount: 2 } }],
  });
  try {
    const markup = renderSidebar(false);
    expect(markup).toContain('aria-label="Atlas · 正在工作 · 2 个工具待审批"');
    expect(markup).toContain('data-state="working"');
    expect(markup).toContain('data-approval-count="2"');
  } finally {
    store.applyActivity({ generation: 'approval-rail-host', revision: 2, bots: [] });
  }
});

it('shows the contact row status beside the name instead of on the avatar', () => {
  store.setRoster([BOT], [DM_CHANNEL]);
  store.applyActivity({
    generation: 'row-status-host',
    revision: 1,
    bots: [{ slug: BOT.slug, state: 'working', attention: { approvalCount: 3 } }],
  });
  try {
    const markup = renderSidebar();
    const row = markup.slice(markup.indexOf('class="bh-contact'));
    const avatar = row.slice(0, row.indexOf('class="bh-body"'));
    const top = row.slice(row.indexOf('class="bh-top"'), row.indexOf('class="bh-msg"'));
    expect(avatar).not.toContain('bh-avatar-attention');
    expect(avatar).not.toContain('bh-avatar-botui');
    expect(top).toContain('class="bh-row-status" data-state="working"');
    expect(top).toContain('data-approval-count="3"');
    expect(top).toContain('bh-avatar-botui');
  } finally {
    store.applyActivity({ generation: 'row-status-host', revision: 2, bots: [] });
  }
});
