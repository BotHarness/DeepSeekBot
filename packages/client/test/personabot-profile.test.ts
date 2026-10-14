// @vitest-environment jsdom
import { act, createElement, type InputHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: ({
      children,
      onClick,
      disabled,
      type = 'button',
      form,
    }: PropsWithChildren<{
      onClick?: () => void;
      disabled?: boolean;
      type?: 'button' | 'submit';
      form?: string;
    }>) => createElement('button', { type, form, onClick, disabled }, children),
    HoverCard: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseFillRegular: stub,
    IconCloseOutlineRegular: stub,
    IconCopyOutlineRegular: stub,
    IconEditOutlineRegular: stub,
    IconInfoOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: ({ className: _className, ...props }: InputHTMLAttributes<HTMLInputElement>) =>
      createElement('input', props),
    MarkdownText: stub,
    Menu: stub,
    MenuItemButton: stub,
    Modal: ({
      open,
      title,
      children,
      footer,
    }: PropsWithChildren<{ open: boolean; title: string; footer?: unknown }>) =>
      open
        ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer as never)
        : null,
    SegmentedControl: stub,
    StateDot: stub,
    Switch: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { UsageFilter } from '../src/client/bridge.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { zhTranslate, en, type BotHarnessTranslate } from '../src/client/locale.js';
import { createGroupProfileCards } from '../src/client/group-profile.js';
import { loadGroupProfileActivity, type GroupProfileActivity } from '../src/client/bridge.js';
import { createProfileCardBuiltins } from '../src/client/profile-cards-builtins.js';
import { createProfileCardRegistry } from '../src/client/profile-cards.js';
import { ProfilePopover } from '../src/client/personabot-profile.js';
import { store } from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';
import { fieldNamed } from './primitive-mocks.js';

function sidebarRegistry() {
  const registry = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
  return registry;
}

function profileCardRegistry() {
  const registry = createProfileCardRegistry();
  for (const card of createProfileCardBuiltins(zhTranslate)) registry.register(card);
  return registry;
}

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function click(container: HTMLElement, selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('PersonaBot Profile surface', () => {
  it('opens from the DM avatar, expands into the Channel body, and edits the profile', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot();
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究员'],
      description: '与你一起发布研究。',
      avatar: '/api/botharness/bot-avatar?slug=ada&v=abcd',
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'bot-ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      sending: false,
    });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const renameChannel = vi.fn(async () => true);
    const updateBotProfile = vi.fn(async () => true);
    const setBotAvatar = vi.fn(async () => true);
    const profileActivity = vi.fn(async () => ({
      slug: 'ada',
      weeks: 26,
      since: '2026-04-01T00:00:00.000Z',
      events: [] as { day: string; reason: string; count: number }[],
      memoryCommits: [] as { day: string; count: number }[],
      tokens: [] as {
        day: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
      }[],
      tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }));
    const actions = {
      listWorkspaceGrants: vi.fn(async () => []),
      modelCatalog: vi.fn(async () => ({ models: [] })),
      modelPresets: vi.fn(async () => []),
      modelPlanState: vi.fn(async () => ({
        plan: {
          revision: 3,
          sourcePresetId: 'preset-1',
          sourcePresetName: '节省成本',
          orchestrator: {
            provider: 'deepseek-official',
            model: 'deepseek-flash',
            reasoningEffort: 'low',
          },
          assignmentDefault: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
          appliedAt: '2026-09-21T00:00:00.000Z',
        },
      })),
      channelBridges: vi.fn(async () => ({
        channelId: 'dm-ada',
        canTargetInbox: true,
        sources: [],
        bridges: [],
      })),
      channelBridge: vi.fn(async () => undefined),
      renameChannel,
      updateBotProfile,
      setBotAvatar,
      profileActivity,
      profileUsage: vi.fn(async (_channelId: string, filter: UsageFilter) => ({
        filter,
        rows: [],
        periodTotal: 0,
        allTimeTotal: 0,
        periodRecords: 0,
        allTimeRecords: 0,
        models: [],
        providers: [],
        facetsTruncated: false,
        truncated: false,
        freshness: 'ready',
        readAt: new Date().toISOString(),
        reconciledAt: null,
        legacyBaseline: false,
      })),
      botSourcePolicies: vi.fn(async () => [
        {
          sourceClass: 'human-dm',
          admission: 'admit',
          wake: 'immediate',
          revision: 1,
          lastActor: { kind: 'built-in' },
          changedAt: '2026-09-21T00:00:00.000Z',
        },
      ]),
      refreshBotInbox: vi.fn(async () => undefined),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (): void => {
      root.render(
        createElement(BotMain, {
          actions,
          channelSidebar: sidebarRegistry(),
          profileCards: profileCardRegistry(),
          t: zhTranslate,
        }),
      );
    };
    try {
      await act(async () => render());
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
      expect(container.querySelector('.bh-chat-body')).not.toBeNull();

      await act(async () => click(container, '.bh-channel-island'));
      const popover = container.querySelector('.bh-profile-popover');
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain('Ada');
      expect(popover?.textContent).toContain('研究员');
      expect(popover?.textContent).toContain('与你一起发布研究。');
      expect(popover?.textContent).toContain('查看详细');
      expect(popover?.textContent).toContain('Token 用量');
      expect(popover?.textContent).toContain('事件活跃');
      expect(popover?.textContent).not.toContain('Memory 提交');
      expect(popover?.textContent).toContain('该时间段暂无记录');
      expect(container.querySelector('.bh-channel-sidebar')).not.toBeNull();

      await act(async () => click(container, '.bh-profile-expand'));
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
      expect(container.querySelector('.bh-profile-view')).not.toBeNull();
      expect(container.querySelector<HTMLElement>('.bh-topbar')?.dataset['channelDetail']).toBe(
        'true',
      );
      expect(container.querySelector<HTMLElement>('.bh-chat-top-fade')?.style.display).toBe('none');
      const sections = container.querySelectorAll('.bh-profile-view > .bh-profile-section');
      expect([...sections].map((section) => section.getAttribute('aria-label'))).toEqual([
        '活动概览',
      ]);
      const header = container.querySelector('.bh-profile-header');
      expect(header?.querySelector('.bh-profile-banner')).not.toBeNull();
      expect(
        [...(header?.querySelectorAll('.bh-profile-header-actions > button') ?? [])].map(
          (button) => button.textContent,
        ),
      ).toEqual(['分享', '编辑资料']);
      expect(header?.textContent).toContain('研究员');
      expect(header?.textContent).toContain('与你一起发布研究。');
      expect(container.querySelector('.bh-profile-view')?.textContent).not.toContain('删除 Bot');
      expect(container.querySelector('.bh-profile-view .bh-model-entry')).toBeNull();
      expect(container.querySelector('.bh-profile-view .bh-wake-policy-entry')).toBeNull();
      expect(container.querySelector('.bh-profile-view')?.textContent).not.toContain('模型预设');
      expect(container.querySelector('.bh-profile-view')?.textContent).not.toContain('普通群消息');
      expect(container.querySelector('.bh-chat-body')).toBeNull();
      expect(container.querySelector('.bh-memory-chat-composer')).toBeNull();
      expect(container.querySelector('.bh-profile-view-name')?.textContent).toBe('Ada');
      expect(container.querySelectorAll('.bh-profile-heat-grid').length).toBe(2);
      expect(container.querySelectorAll('.bh-profile-bar-chart').length).toBe(0);
      expect(container.querySelector('.bh-model-usage')?.textContent).toContain(
        '所选时间范围内暂无模型调用记录。',
      );
      expect(container.querySelectorAll('.bh-profile-avatar-button').length).toBe(1);
      expect(container.querySelectorAll('.bh-profile-card').length).toBe(3);
      const sidebarLabels = [...container.querySelectorAll('.bh-channel-sidebar [role="tab"]')].map(
        (tab) => tab.getAttribute('aria-label') ?? tab.textContent,
      );
      expect(sidebarLabels).not.toContain('模型');
      expect(sidebarLabels).not.toContain('唤醒策略');
      expect(sidebarLabels).not.toContain('外部身份');
      expect(sidebarLabels).not.toContain('外部连接器');
      expect(container.querySelectorAll('.bh-profile-pin[aria-pressed="true"]').length).toBe(2);

      const headerButton = (label: string) =>
        [...container.querySelectorAll<HTMLButtonElement>('.bh-profile-header button')].find(
          (button) => button.textContent === label,
        )!;
      await act(async () => headerButton('编辑资料').click());
      const editor = container.querySelector('[role="dialog"][aria-label="编辑资料"]')!;
      const input = fieldNamed('名称', editor);
      expect(input.value).toBe('Ada');
      const saveButton = () =>
        [...editor.querySelectorAll<HTMLButtonElement>('button')].find(
          (button) => button.textContent === '保存',
        )!;
      await act(async () => setNativeValue(input, '  '));
      expect(saveButton().disabled).toBe(true);
      const bioLabel = [...editor.querySelectorAll('label')].find(
        (label) => label.textContent === '简介',
      )!;
      const bio = document.getElementById(bioLabel.htmlFor) as HTMLTextAreaElement;
      expect(bio.value).toBe('与你一起发布研究。');
      await act(async () => setNativeValue(bio, 'x'.repeat(161)));
      await act(async () => setNativeValue(input, 'Bea'));
      expect(saveButton().disabled).toBe(true);
      expect(editor.textContent).toContain('161/160');
      expect(bio.getAttribute('aria-invalid')).toBe('true');
      await act(async () => setNativeValue(bio, '帮你找资料'));
      await act(async () => saveButton().click());
      expect(renameChannel).toHaveBeenCalledWith('dm-ada', 'Bea');
      expect(updateBotProfile).toHaveBeenCalledWith('ada', {
        roles: ['研究员'],
        description: '帮你找资料',
      });
      expect(container.querySelector('[role="dialog"][aria-label="编辑资料"]')).toBeNull();

      const heatCell = container.querySelector<HTMLElement>(
        '.bh-profile-heat-cell:not([data-level="future"])',
      );
      await act(async () => {
        heatCell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-heat-tip')?.textContent).toContain('次');
      await act(async () => {
        heatCell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-heat-tip')).toBeNull();
      await act(async () => {
        heatCell?.focus();
      });
      expect(container.querySelector('.bh-profile-heat-tip')?.textContent).toContain('次');
      await act(async () => {
        heatCell?.blur();
      });
      expect(container.querySelector('.bh-profile-heat-tip')).toBeNull();

      await act(async () => click(container, '.bh-profile-avatar-button'));
      const avatarDialog = container.querySelector('[role="dialog"][aria-label="头像"]');
      const avatarMethods = avatarDialog?.querySelectorAll('.bh-avatar-methods > .bh-card-row');
      expect(avatarMethods?.length).toBe(2);
      expect(avatarMethods?.[0]?.textContent).toContain('设计像素头像');
      expect(avatarMethods?.[1]?.textContent).toContain('上传图片');
      expect(avatarMethods?.[1]?.getAttribute('data-state')).toBe('current');
      expect(avatarMethods?.[1]?.textContent).toContain('使用中');
      await act(async () => click(container, '[data-avatar-remove]'));
      expect(setBotAvatar).toHaveBeenCalledWith('dm-ada', null);
      expect(avatarDialog?.querySelector('input[type="file"]')).not.toBeNull();

      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      document.body.append(dialog);
      try {
        await act(async () => {
          dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(container.querySelector('.bh-profile-view')).not.toBeNull();
      } finally {
        dialog.remove();
      }

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-view')).toBeNull();
      expect(
        container.querySelector<HTMLElement>('.bh-topbar')?.dataset['channelDetail'],
      ).toBeUndefined();
      expect(container.querySelector('.bh-chat-body')).not.toBeNull();

      await act(async () => click(container, '.bh-channel-island'));
      expect(container.querySelector('.bh-profile-popover')).not.toBeNull();
      await act(async () => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
    }
  });

  it('keeps the group header island as the Group Profile trigger', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-design',
      type: 'group' as const,
      name: '设计组',
      members: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({ status: 'ready', channel, messages: [], sending: false });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(BotMain, {
            actions: {
              allBotPreview: vi.fn(async () => ({ revision: '0'.repeat(64), recipients: [] })),
              channelAssignments: vi.fn(async () => []),
              ...inertSubmissionActions,
            } as unknown as BridgeActions,
            channelSidebar: sidebarRegistry(),
            t: zhTranslate,
          }),
        );
      });
      const island = container.querySelector('[data-group-channel-name]');
      expect(island?.tagName).toBe('BUTTON');
      expect(island?.getAttribute('aria-label')).toBe('打开 设计组 的群聊 Profile');
      expect(island?.getAttribute('aria-haspopup')).toBe('dialog');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
    }
  });
});

describe('Profile activity windows', () => {
  it('keeps entirely unreported usage unknown in the token card', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const props = {
      bot: {
        slug: 'ada',
        displayName: 'Ada',
        roles: [],
        aggregateState: 'idle',
        createdAt: '2026-09-30T00:00:00Z',
        workspaces: [],
      },
      activity: {
        slug: 'ada',
        weeks: 26,
        since: '2026-04-01T00:00:00Z',
        today: '2026-09-30',
        events: [],
        memoryCommits: [],
        tokens: [],
        tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        modelUsageStatus: 'ready' as const,
        modelUsageRows: [
          {
            day: '2026-09-30',
            purpose: 'orchestrator',
            provider: 'actual',
            model: 'unknown-report',
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            totalTokens: null,
          },
        ],
      },
      compact: false,
      t: zhTranslate,
    };
    try {
      const cards = createProfileCardBuiltins(zhTranslate);
      await act(async () =>
        root.render(
          createElement(
            'div',
            null,
            cards.find((card) => card.id === 'token-usage')!.render(props),
          ),
        ),
      );
      expect(container.querySelector('.bh-profile-card-total')?.textContent).toContain('未知');
      expect(container.querySelector('.bh-profile-empty')).toBeNull();
      expect(container.querySelector('.bh-profile-token-shares')).toBeNull();
      expect(container.querySelector('.bh-model-usage')?.textContent).toContain(
        '所选时间范围：未知',
      );
      const partial = {
        ...props,
        activity: {
          ...props.activity,
          tokens: [
            {
              day: '2026-09-30',
              inputTokens: 100,
              outputTokens: 40,
              cacheReadTokens: 10,
              cacheWriteTokens: 0,
            },
          ],
          modelUsageRows: [
            {
              ...props.activity.modelUsageRows[0]!,
              inputTokens: 100,
              outputTokens: 40,
              cacheReadTokens: 10,
              totalTokens: 155,
            },
          ],
        },
      };
      await act(async () =>
        root.render(
          createElement(
            'div',
            null,
            cards.find((card) => card.id === 'token-usage')!.render(partial),
          ),
        ),
      );
      expect(container.querySelector('.bh-profile-card-total')?.textContent).toContain(
        '155 tokens',
      );
      const totalOnly = {
        ...props,
        activity: {
          ...props.activity,
          modelUsageRows: [{ ...props.activity.modelUsageRows[0]!, totalTokens: 155 }],
        },
      };
      await act(async () =>
        root.render(
          createElement(
            'div',
            null,
            cards.find((card) => card.id === 'token-usage')!.render(totalOnly),
          ),
        ),
      );
      expect(container.querySelector('.bh-profile-card-total')?.textContent).toContain(
        '155 tokens',
      );
      expect(container.querySelector('.bh-model-usage')?.textContent).toContain(
        '所选时间范围：155',
      );
      const tokenCard = cards.find((card) => card.id === 'token-usage')!;
      expect(tokenCard.help?.(props)).toBe(zhTranslate('profile.usage.partial'));
      expect(tokenCard.help?.(partial)).toBe(zhTranslate('profile.usage.partial'));
      expect(container.querySelector('.bh-profile-card-body > .bh-note')).toBeNull();
      const registry = createProfileCardRegistry();
      registry.register(tokenCard);
      const popoverProps = {
        bot: props.bot,
        activity: partial.activity,
        cards: registry,
        pinned: ['token-usage'],
        t: zhTranslate,
        onExpand: vi.fn(),
      };
      await act(async () => root.render(createElement(ProfilePopover, popoverProps)));
      const label = container.querySelector('.bh-profile-card-label');
      expect(label?.textContent).toBe(tokenCard.label);
      expect(label?.querySelector('button')?.getAttribute('aria-label')).toBe(
        zhTranslate('im.infoFor', { title: tokenCard.label }),
      );
      expect(container.textContent).not.toContain(zhTranslate('profile.usage.partial'));
      const completeActivity = {
        ...partial.activity,
        modelUsageRows: partial.activity.modelUsageRows.map((row) => ({
          ...row,
          cacheWriteTokens: 5,
        })),
      };
      expect(tokenCard.help?.({ ...props, activity: completeActivity })).toBeUndefined();
      expect(tokenCard.help?.({ ...props, activity: undefined })).toBeUndefined();
      await act(async () =>
        root.render(createElement(ProfilePopover, { ...popoverProps, activity: completeActivity })),
      );
      expect(container.querySelector('.bh-profile-card-label button')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('anchors the token sparkline and heatmaps to the Host calendar day', async () => {
    const { trailingProfileDays } = await import('../src/client/profile-cards-builtins.js');
    expect(trailingProfileDays('2026-09-29', 3)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
    expect(trailingProfileDays('2026-01-02', 3)).toEqual([
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(trailingProfileDays(undefined, 3)).toHaveLength(3);
  });
});

describe('Token chart', () => {
  it('computes cached read and output shares', async () => {
    const { tokenShares, formatTokenCount } =
      await import('../src/client/profile-cards-builtins.js');
    expect(tokenShares({ cached: 97, uncached: 3, output: 25 })).toEqual({
      read: 100,
      output: 25,
      cachedPercent: 97,
      outputPercent: 20,
    });
    expect(tokenShares({ cached: 0, uncached: 0, output: 0 })).toEqual({
      read: 0,
      output: 0,
      cachedPercent: 0,
      outputPercent: 0,
    });
    expect(formatTokenCount(254_316)).toBe('254.3K');
  });
});

const enTranslate: BotHarnessTranslate = (key, params) => {
  const value: unknown = Reflect.get(en, key);
  const text = typeof value === 'string' ? value : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
};

describe('Group member source labels', () => {
  it.each([
    [zhTranslate, '外部来源：Lark/飞书 Source A', false],
    [zhTranslate, '外部来源：Lark/飞书 Source A', true],
    [enTranslate, 'External source: Lark/Feishu Source A', false],
    [enTranslate, 'External source: Lark/Feishu Source A', true],
  ] as const)(
    'renders friendly source names and distinct source rows (%s, compact %s)',
    async (t, label, compact) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const activity: GroupProfileActivity = {
        channelId: 'group-sources',
        weeks: 26,
        since: '2026-04-01',
        today: '2026-10-04',
        days: [],
        authors: [
          {
            author: { kind: 'bridged', source: 'raw-sender' },
            bridgeOrigin: {
              platform: 'feishu',
              conversationId: 'source-a',
              conversationName: 'Source A',
            },
            total: 4,
            days: [],
          },
          {
            author: { kind: 'bridged', source: 'raw-sender' },
            bridgeOrigin: {
              platform: 'feishu',
              conversationId: 'source-b',
              conversationName: 'Source B',
            },
            total: 2,
            days: [],
          },
          { author: { kind: 'bot', slug: 'ada' }, total: 1, days: [] },
        ],
      };
      const loaded = await loadGroupProfileActivity(
        async () => ({ ok: true, value: activity }),
        'group-sources',
      );
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const card = createGroupProfileCards(t).find((card) => card.id === 'group-members')!;
        await act(async () =>
          root.render(
            card.render({
              channel: {
                id: 'group-sources',
                type: 'group',
                name: 'Sources',
                members: ['ada'],
                createdAt: '',
                updatedAt: '',
              },
              activity: loaded,
              t,
              compact,
              botNames: new Map([['ada', 'Ada']]),
            }),
          ),
        );
        expect(container.querySelectorAll('li')).toHaveLength(3);
        expect(container.textContent).toContain(label);
        expect(container.textContent).toContain('Source B');
        expect(container.textContent).toContain('Ada');
        expect(container.textContent).not.toContain('raw-sender');
        expect(
          [...container.querySelectorAll('.bh-profile-reason-count')].map(
            (element) => element.textContent,
          ),
        ).toEqual(['4', '2', '1']);
        expect(errors).not.toHaveBeenCalled();
      } finally {
        await act(async () => root.unmount());
        container.remove();
        errors.mockRestore();
      }
    },
  );

  it('accepts legacy activity and rejects malformed source metadata at the Client boundary', async () => {
    const legacy = {
      channelId: 'group-old',
      weeks: 26,
      since: '',
      today: '',
      days: [],
      authors: [{ author: { kind: 'bridged', source: 'legacy' }, total: 1, days: [] }],
    };
    expect(
      await loadGroupProfileActivity(async () => ({ ok: true, value: legacy }), 'group-old'),
    ).toEqual(legacy);
    await expect(
      loadGroupProfileActivity(
        async () => ({
          ok: true,
          value: {
            ...legacy,
            authors: [
              {
                ...legacy.authors[0],
                bridgeOrigin: {
                  platform: 'feishu',
                  conversationId: null,
                  conversationName: 'Source',
                },
              },
            ],
          },
        }),
        'group-old',
      ),
    ).rejects.toThrow('invalid Group Profile activity');
  });
});
