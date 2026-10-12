// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { BotSummary } from '../src/client/store.js';
import type { WorkspaceGrantView } from '../src/client/bridge.js';
import { useDmComposerContext } from '../src/client/dm-composer-context.js';
import { WindowCompanions } from '../src/client/window-companions.js';
import { CompanionPin } from '../src/client/window-companions-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { rememberModelPlan } from '../src/client/model-plan-store.js';
import { publishWorkspaceGrantChange } from '../src/client/workspace-grant-events.js';

vi.mock('../src/client/profile-cards-builtins.js', () => ({ PROFILE_ACTIVITY_WEEKS: 26 }));
vi.mock('../src/client/model-preset-profile.js', () => ({
  ModelPresetProfile: ({ slug }: { slug: string }) => createElement('div', null, `model:${slug}`),
}));
vi.mock('../src/client/workspace-grants-entry.js', () => ({
  WorkspaceGrantsEntry: ({ botSlug }: { botSlug: string }) =>
    createElement('div', null, `workspace:${botSlug}`),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconPinFillRegular: () => null,
  IconPinOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  Modal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('div', { role: 'dialog', 'aria-label': title }, children),
}));

const ada: BotSummary = {
  slug: 'composer-ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
};
const grace = { ...ada, slug: 'composer-grace', displayName: 'Grace' };

it('shares header pin, restores preferences, rejects unavailable and old targets, and bounds chip queries', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const createOwner = () =>
    new WindowCompanions({
      storage,
      context: async () => ({ profileId: 'composer-test' }),
      source: () => ({ addEventListener() {}, close() {} }),
      update: async () => {},
    });
  const companion = createOwner();
  const modelPlanState = vi.fn(async () => ({ plan: undefined }));
  const listWorkspaceGrants = vi.fn(async () => [] as WorkspaceGrantView[]);
  const actions = {
    modelPlanState,
    listWorkspaceGrants,
    modelCatalog: vi.fn(async () => ({ models: [] })),
    profileSessionUsage: vi.fn(async () => ({
      slug: ada.slug,
      weeks: 26,
      since: ada.createdAt,
      rows: [],
    })),
  } as unknown as BridgeActions;
  let bot = ada;
  let enabled = true;
  const usage = vi.fn();
  function Harness() {
    const context = useDmComposerContext({
      bot,
      channelId: `dm-${bot.slug}`,
      actions,
      companion: enabled ? companion : undefined,
      activity: undefined,
      loading: true,
      t: zhTranslate,
      onUsage: usage,
    });
    return createElement(
      'div',
      null,
      createElement(CompanionPin, {
        companion,
        botId: bot.slug,
        name: bot.displayName,
        t: zhTranslate,
      }),
      context?.shortcuts.map((shortcut) =>
        createElement(
          'button',
          {
            key: shortcut.id,
            'data-action': shortcut.id,
            disabled: shortcut.disabled,
            onClick: shortcut.run,
          },
          shortcut.label,
        ),
      ),
      context?.content,
    );
  }
  const render = () => act(async () => root.render(createElement(Harness)));
  const click = (selector: string) =>
    act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
  try {
    await render();
    expect(host.querySelector<HTMLButtonElement>('[data-action="companion"]')!.disabled).toBe(true);
    await act(async () => companion.start());
    await click('[data-action="companion"]');
    expect(host.querySelector('[data-companion-pin]')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      companion.select(ada.slug);
      companion.select(ada.slug);
    });
    expect(companion.getSnapshot().companions).toHaveLength(1);
    await click('[data-companion-pin]');
    expect(host.querySelector('[data-action="companion"]')!.textContent).toContain('显示');
    await click('[data-action="companion"]');
    const restored = createOwner();
    await restored.start();
    expect(restored.get(ada.slug)).toBeDefined();
    restored.dispose();
    await render();
    await render();
    expect(listWorkspaceGrants).toHaveBeenCalledTimes(1);
    await act(async () =>
      rememberModelPlan(ada.slug, {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { provider: 'qa', model: 'qa-selected' },
        assignmentDefault: { provider: 'qa', model: 'qa-selected' },
        assignmentModels: [],
        appliedAt: '',
      }),
    );
    expect(host.textContent).toContain('qa-selected');
    expect(modelPlanState).toHaveBeenCalledTimes(2);
    await click('[data-action="model"]');
    expect(host.querySelector('[role="dialog"]')!.textContent).toContain(ada.slug);
    bot = grace;
    await render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toContain('qa-selected');
    await click('[data-action="companion"]');
    expect(companion.get(grace.slug)).toBeDefined();
    expect(companion.get(ada.slug)).toBeDefined();
    enabled = false;
    await render();
    expect(host.querySelector<HTMLButtonElement>('[data-action="companion"]')!.disabled).toBe(true);
    let resolve!: (rows: WorkspaceGrantView[]) => void;
    listWorkspaceGrants.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => publishWorkspaceGrantChange(grace.slug));
    bot = ada;
    await render();
    await act(async () =>
      resolve([
        {
          id: 'late',
          botSlug: grace.slug,
          workspaceId: 'late',
          workspacePath: '/late',
          workspaceTitle: 'Late Grace grant',
          path: '/late',
          title: 'Late Grace grant',
          createdAt: '',
        },
      ]),
    );
    expect(host.textContent).not.toContain('Late Grace grant');
    await click('.bh-composer-usage');
    expect(usage).not.toHaveBeenCalled();
    expect(document.body.querySelector('.bh-composer-usage-popover')).not.toBeNull();
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('.bh-composer-usage-details')!.click(),
    );
    expect(usage).toHaveBeenCalledOnce();
    expect(host.querySelector('.bh-composer-usage')!.getAttribute('aria-label')).toContain(
      'Ada · 近 26 周',
    );
    await click('[data-action="companion"]');
    expect(companion.get(ada.slug)).toBeDefined();
  } finally {
    await act(async () => root.unmount());
    companion.dispose();
    host.remove();
  }
});

it('uses compact icon labels and a left context/right usage split, with keyboard dismissal and stale Bot fences', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let bot = ada;
  let resolve!: (value: unknown) => void;
  const profileSessionUsage = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const actions = {
    modelPlanState: async () => ({}),
    modelCatalog: async () => ({ models: [] }),
    listWorkspaceGrants: async () => [],
    profileSessionUsage,
  } as unknown as BridgeActions;
  const details = vi.fn();
  function Harness() {
    return useDmComposerContext({
      bot,
      channelId: `dm-${bot.slug}`,
      actions,
      companion: undefined,
      activity: {
        slug: bot.slug,
        weeks: 26,
        since: '2026-04-13T00:00:00.000Z',
        today: '2026-10-12',
        events: [],
        memoryCommits: [],
        tokens: [],
        tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        modelUsageStatus: 'ready',
        modelUsageRows: [
          {
            day: '2026-10-12',
            purpose: 'orchestrator',
            provider: 'deepseek',
            model: 'flash',
            inputTokens: 1_000_000,
            outputTokens: 250_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 1_250_000,
          },
        ],
      },
      loading: false,
      t: zhTranslate,
      onUsage: details,
    })?.content;
  }
  const render = () => act(async () => root.render(createElement(Harness)));
  const clickUsage = () =>
    act(async () => host.querySelector<HTMLButtonElement>('.bh-composer-usage')!.click());
  try {
    await render();
    expect(host.querySelectorAll('.bh-composer-context-left button')).toHaveLength(2);
    expect(host.querySelector('.bh-composer-context-left')!.textContent).toContain('0 个工作区');
    expect(host.querySelector('.bh-composer-usage')!.textContent).toBe('1.3M tokens');
    expect(host.querySelectorAll('.bh-composer-context button svg')).toHaveLength(3);
    await clickUsage();
    expect(details).not.toHaveBeenCalled();
    await act(async () =>
      resolve({
        slug: ada.slug,
        weeks: 26,
        since: '2026-04-01T00:00:00.000Z',
        rows: [
          {
            sessionId: 'orch',
            role: 'orchestrator',
            label: 'orchestrator',
            updatedAt: '',
            totalTokens: 1500,
            status: 'ready',
          },
          {
            sessionId: 'assignment',
            role: 'assignment',
            label: 'Synthetic task',
            updatedAt: '',
            totalTokens: null,
            status: 'unknown',
          },
          {
            sessionId: 'known-assignment',
            role: 'assignment',
            label: 'Known task',
            updatedAt: '',
            totalTokens: 500,
            status: 'partial',
          },
        ],
      }),
    );
    const popover = document.body.querySelector('.bh-composer-usage-popover')!;
    expect(popover.textContent).toContain('1.5K');
    expect(popover.textContent).toContain('Synthetic task');
    expect(popover.textContent).toContain('未知');
    expect(
      [...popover.querySelectorAll('[role="meter"]')].map((meter) =>
        meter.getAttribute('aria-valuenow'),
      ),
    ).toEqual(['75', '25']);
    expect(popover.querySelectorAll('.bh-composer-usage-caption')).toHaveLength(0);
    expect(popover.querySelector('.bh-composer-usage-footer > button')?.textContent).toContain(
      '查看详细用量',
    );
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
    );
    expect(document.body.querySelector('.bh-composer-usage-popover')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('.bh-composer-usage'));
    await clickUsage();
    await act(async () =>
      resolve({
        slug: ada.slug,
        weeks: 26,
        since: '2026-04-01T00:00:00.000Z',
        rows: [
          {
            sessionId: 'zero',
            role: 'orchestrator',
            label: 'orchestrator',
            updatedAt: '',
            totalTokens: 0,
            status: 'ready',
          },
        ],
      }),
    );
    expect(
      document.body.querySelectorAll('.bh-composer-usage-popover [role="meter"]'),
    ).toHaveLength(0);
    bot = grace;
    await render();
    await act(async () => resolve({ slug: ada.slug, weeks: 26, since: '', rows: [] }));
    expect(document.body.querySelector('.bh-composer-usage-popover')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
