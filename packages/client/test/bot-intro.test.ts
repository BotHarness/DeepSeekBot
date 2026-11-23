// @vitest-environment jsdom
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';
import { type MouseEvent, type PropsWithChildren } from 'react';
import { type Root } from 'react-dom/client';
import { type OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    open,
    title,
    children,
    className,
  }: PropsWithChildren<{ open: boolean; title: string; className?: string }>) =>
    open
      ? createElement('div', { role: 'dialog', 'aria-label': title, className }, children)
      : null,
}));
vi.mock('../src/client/model-picker.js', () => ({
  ModelPicker: ({
    title,
    choice,
    onChange,
    subscription,
    disabled,
  }: Parameters<typeof import('../src/client/model-picker.js').ModelPicker>[0]) =>
    createElement('button', {
      type: 'button',
      disabled,
      'data-picker': title,
      'data-choice': choice.key,
      'data-effort': choice.effort,
      'data-subscription-model': subscription?.choice?.model,
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        const model = event.currentTarget.dataset['selectSubscription'];
        if (model !== undefined) {
          if (subscription?.models.codex?.some(({ id }) => id === model))
            subscription.onChange({ engine: 'codex', model });
          return;
        }
        onChange({
          key: JSON.stringify(['p', 'task']),
          effort: event.currentTarget.dataset['selectEffort'] ?? '',
        });
      },
    }),
}));
vi.mock('../src/client/wallpaper-library.js', () => ({
  WallpaperLibrary: () => createElement('div', { 'data-wallpaper-settings': '' }),
}));
vi.mock('../src/client/appearance-material-settings.js', () => ({
  AppearanceMaterialSettings: () => createElement('div', { 'data-material-settings': '' }),
}));
vi.mock('../src/client/bot-icon.js', () => ({ BotIcon: () => null }));
vi.mock('../src/client/connections-dialog.js', () => ({
  ConnectionsDialog: ({
    call,
    quickConnect,
    onClose,
    onDevicePaired,
    onFeedRead,
  }: {
    call?: BridgeCall;
    quickConnect?: boolean;
    onClose(): void;
    onDevicePaired?(id: string): void;
    onFeedRead?(id: string): void;
  }) =>
    createElement(
      'div',
      {
        role: 'dialog',
        'data-phone-connection': '',
        'data-quick-connect': quickConnect,
        'data-address-setup': call !== undefined,
      },
      createElement('button', { onClick: onClose }, 'Close connection'),
      createElement('button', { onClick: () => onDevicePaired?.('phone-1') }, 'Approve phone'),
      createElement('button', { onClick: () => onFeedRead?.('phone-1') }, 'Read Feed'),
    ),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { Appearance } from '../src/client/appearance.js';
import { BotIntro } from '../src/client/bot-intro.js';
import type { BridgeCall, ModelCatalogView } from '../src/client/bridge.js';
import { cachedGithubStars, fetchGithubStars } from '../src/client/community-links.js';
import { receiveTobMessages, requestTobMessage } from '../src/client/tob-requests.js';
import { en, zh, zhTranslate } from '../src/client/locale.js';
import { ONBOARDING_PERSONAS, PERSONA_TEMPLATES } from '../src/client/onboarding-personas.js';
import { INTRO_STEPS, OnboardingController, onboardingFor } from '../src/client/onboarding.js';
import { setTeamModeSnapshot } from '../src/client/team-state.js';
import { resourceEvents } from './resource-events-fixture.js';

const fresh: OnboardingSnapshot = {
  profileId: 'intro',
  completed: false,
  preparation: 'ready',
  tutorial: 'not-started',
  journey: { version: 2, done: false },
};

function actionsFor(receipts: OnboardingSnapshot[] = [fresh]) {
  let index = 0;
  return {
    onboarding: vi.fn(async () => receipts[Math.min(index++, receipts.length - 1)]!),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(async () => ({ models: [] })),
    onboardingModel: vi.fn(async () => {}),
    telemetryEvent: vi.fn(),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

describe('intro controller', () => {
  it('opens only for a fresh journey and starts the tutorial once it closes', async () => {
    const actions = actionsFor([fresh, { ...fresh, tutorial: 'active' }]);
    const controller = new OnboardingController(actions as unknown as BridgeActions);
    await controller.enter();
    expect(controller.introPending()).toBe(true);
    controller.openIntro();
    controller.setIntroStep(3);
    expect(controller.getSnapshot().intro).toEqual({ step: 3, hidden: false });
    const workspace = document.createElement('div');
    workspace.dataset['workspaceEnabled'] = '';
    document.body.append(workspace);
    await controller.closeIntro();
    expect(controller.getSnapshot().intro).toBeUndefined();
    expect(actions.onboarding).toHaveBeenLastCalledWith(undefined, 'start');
    expect(localStorage.getItem('botharness/onboarding/intro-v1/intro')).toBe('1');
    expect(controller.introPending()).toBe(false);
  });

  it('stays closed for people who already started, finished or skipped the tutorial', async () => {
    for (const receipt of [
      { ...fresh, tutorial: 'active' as const },
      { ...fresh, journey: { version: 2 as const, done: true } },
      (({ journey: _journey, ...legacy }) => legacy)(fresh),
    ]) {
      const controller = new OnboardingController(
        actionsFor([receipt]) as unknown as BridgeActions,
      );
      await controller.enter();
      expect(controller.introPending()).toBe(false);
    }
  });

  it('reopens the intro when the tutorial restarts', async () => {
    const actions = actionsFor([fresh, { ...fresh, tutorial: 'active' }]);
    const controller = new OnboardingController(actions as unknown as BridgeActions);
    await controller.enter();
    await controller.refresh(undefined, 'restart');
    expect(controller.getSnapshot().intro).toEqual({ step: 0, hidden: false });
  });
});

describe('community links', () => {
  it('caches the live star count and falls back to it offline', async () => {
    const live = vi.fn(async () => Response.json({ stargazers_count: 1234 }));
    expect(await fetchGithubStars(new AbortController().signal, live as typeof fetch)).toBe(1234);
    expect(cachedGithubStars()).toBe(1234);
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(
      await fetchGithubStars(new AbortController().signal, offline as typeof fetch),
    ).toBeUndefined();
    expect(cachedGithubStars()).toBe(1234);
  });

  it('ignores rate-limited or malformed answers', async () => {
    const limited = vi.fn(async () => new Response('{}', { status: 403 }));
    expect(
      await fetchGithubStars(new AbortController().signal, limited as typeof fetch),
    ).toBeUndefined();
    const odd = vi.fn(async () => Response.json({ stargazers_count: 'many' }));
    expect(
      await fetchGithubStars(new AbortController().signal, odd as typeof fetch),
    ).toBeUndefined();
  });
});

describe('Tob requests', () => {
  it('holds a request until the workspace listens, then hands it over once', () => {
    requestTobMessage('hello Tob');
    const received: string[] = [];
    const stop = receiveTobMessages((body) => received.push(body));
    requestTobMessage('again');
    stop();
    expect(received).toEqual(['hello Tob', 'again']);
  });
});

describe('intro modal', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  const goModel = {
    provider: 'opencode-go',
    providerName: 'OpenCode Go',
    model: 'deepseek-v4.1-flash',
    modelName: 'DeepSeek V4.1 Flash',
    efforts: [],
  };

  const testModel = (id: string) => ({
    provider: 'p',
    providerName: 'P',
    model: id,
    modelName: id,
    efforts: [],
  });
  const ownerViewer = { humanId: 'owner', kind: 'owner', owner: true } as const;
  const step = () => container.querySelector('[data-intro-step]')?.getAttribute('data-intro-step');
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find(
      (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent) === name,
    );
  const click = async (name: string) => {
    const target = button(name);
    if (target === undefined) throw new Error(`No button named ${name}`);
    await act(async () => target.click());
  };
  const pickModel = async (key: 'onboarding.model' | 'modelPreset.assignment') => {
    const picker = container.querySelector<HTMLElement>(`[data-picker="${zhTranslate(key)}"]`);
    if (picker === null) throw new Error(`No picker named ${key}`);
    await act(async () => picker.click());
  };
  const providerKey = () =>
    container.querySelector<HTMLInputElement>('input[aria-label="API key"]');
  const fillProviderKey = async () => {
    const input = providerKey();
    if (input === null) throw new Error('No API key field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'test-key',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  async function mountModelStep(
    actions: BridgeActions,
    options: Partial<Pick<Parameters<typeof BotIntro>[0], 'call' | 'botSettings'>> = {},
  ) {
    const controller = onboardingFor(actions);
    await controller.enter();
    controller.openIntro();
    controller.setIntroStep(INTRO_STEPS.indexOf('model'));
    await act(async () =>
      root.render(createElement(BotIntro, { actions, ...options, t: zhTranslate })),
    );
  }

  async function openModelStep({
    configured = false,
    owner = true,
    models = [goModel],
    receipt = fresh,
    fetcher = vi.fn(async () =>
      Response.json({
        engines: [{ engine: 'codex', installed: true, available: false, reason: 'signed-out' }],
        selections: [],
      }),
    ),
  }: {
    configured?: boolean;
    owner?: boolean;
    models?: ModelCatalogView['models'];
    receipt?: OnboardingSnapshot;
    fetcher?: typeof fetch;
  } = {}) {
    vi.stubGlobal('fetch', fetcher);
    let connected = configured;
    const modelCatalog = vi.fn(async () => ({ models: connected ? models : [] }));
    const actions = {
      ...actionsFor([receipt]),
      modelCatalog,
    } as unknown as BridgeActions;
    const call = vi.fn<BridgeCall>(async (method) => {
      if (method === 'modelProviderAdd') {
        connected = true;
        return {
          ok: true,
          value: { id: 'opencode-go', keyStored: true, modelCount: 1, testReply: 'ok' },
        };
      }
      return { ok: true, value: { revision: 2, providers: [] } };
    });
    setTeamModeSnapshot(call, {
      enabled: !owner,
      ownerPasswordSet: false,
      insecureHttpAllowed: false,
      memberUrls: [],
      isolation: 'trial',
      viewer: {
        humanId: owner ? 'owner' : 'member',
        kind: owner ? 'owner' : 'member',
        displayName: owner ? 'Owner' : 'Member',
        mustChangePassword: false,
        owner,
        permissions: [],
        roleIds: [],
      },
    });
    let settingsOpen = false;
    const listeners = new Set<() => void>();
    const setSettingsOpen = (open: boolean) => {
      settingsOpen = open;
      for (const notify of listeners) notify();
    };
    const openProviders = vi.fn(() => setSettingsOpen(true));
    const botSettings = {
      open: openProviders,
      getSnapshot: () => ({ open: settingsOpen, sectionId: undefined }),
      subscribe: (notify: () => void) => {
        listeners.add(notify);
        return () => {
          listeners.delete(notify);
        };
      },
    };
    await mountModelStep(actions, { call, botSettings });
    return { actions, button, call, click, modelCatalog, openProviders, setSettingsOpen };
  }

  it('shows the picker and the connected providers row for a configured DSH route', async () => {
    const { button, click, openProviders } = await openModelStep({ configured: true });
    expect(
      container.querySelector(`[data-picker="${zhTranslate('onboarding.model')}"]`),
    ).toBeTruthy();
    const row = button('模型提供商');
    expect(row?.textContent ?? '').toContain('OpenCode Go');
    expect(row?.querySelector('[data-model-brand="opencode"]')).toBeTruthy();
    await click('模型提供商');
    expect(openProviders).toHaveBeenCalledWith('model-providers');
  });

  it('restores the model draft and revalidates its effort after Settings closes', async () => {
    const models = [
      testModel('main'),
      { ...testModel('task'), efforts: [{ id: 'high', name: 'High' }] },
    ];
    const { modelCatalog, setSettingsOpen } = await openModelStep({ configured: true, models });
    const picker = () =>
      container.querySelector<HTMLElement>(`[data-picker="${zhTranslate('onboarding.model')}"]`);
    picker()?.setAttribute('data-select-effort', 'high');
    await pickModel('onboarding.model');
    await click(zhTranslate('botSettings.section.modelProviders'));
    expect(picker()).toBeNull();
    const initialReads = modelCatalog.mock.calls.length;
    await act(async () => setSettingsOpen(false));
    expect(modelCatalog).toHaveBeenCalledTimes(initialReads + 1);
    expect(picker()?.dataset['choice']).toBe(JSON.stringify(['p', 'task']));
    expect(picker()?.dataset['effort']).toBe('high');
    await click(zhTranslate('botSettings.section.modelProviders'));
    modelCatalog.mockResolvedValueOnce({ models: [testModel('main'), testModel('task')] });
    await act(async () => setSettingsOpen(false));
    expect(modelCatalog).toHaveBeenCalledTimes(initialReads + 2);
    expect(picker()?.dataset['choice']).toBe(JSON.stringify(['p', 'task']));
    expect(picker()?.dataset['effort']).toBe('');
  });

  it('requires a new choice when the selected subscription model disappears in Settings', async () => {
    const savedModel = { id: 'saved', name: 'Saved', efforts: [] };
    let subscriptionModels = [savedModel, { id: 'selected', name: 'Selected', efforts: [] }];
    const { setSettingsOpen } = await openModelStep({
      configured: true,
      receipt: { ...fresh, defaultBotSlug: 'tob' },
      fetcher: async (_url, init) =>
        init?.method === 'POST'
          ? Response.json({ models: subscriptionModels })
          : Response.json({
              engines: [{ engine: 'codex', installed: true, available: true }],
              selections: [
                { botSlug: 'tob', role: 'orchestrator', engine: 'codex', model: 'saved' },
              ],
            }),
    });
    const picker = () =>
      container.querySelector<HTMLElement>(`[data-picker="${zhTranslate('onboarding.model')}"]`);
    expect(picker()?.dataset['subscriptionModel']).toBe('saved');
    picker()?.setAttribute('data-select-subscription', 'selected');
    await pickModel('onboarding.model');
    expect(picker()?.dataset['subscriptionModel']).toBe('selected');
    await click(zhTranslate('botSettings.section.modelProviders'));
    subscriptionModels = [savedModel];
    await act(async () => setSettingsOpen(false));
    expect(button(zhTranslate('intro.next'))?.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('intro.model.subscriptionUnavailable'),
    );
    expect(picker()?.dataset['subscriptionModel']).toBe('selected');
    picker()?.setAttribute('data-select-subscription', 'saved');
    await pickModel('onboarding.model');
    await click(zhTranslate('intro.next'));
    expect(step()).toBe('phone');
  });

  it.each([
    { configured: false, models: [] },
    { configured: true, models: [{ ...goModel, restingUntil: '2026-11-22T00:00:00Z' }] },
  ])(
    'offers a key or subscription with no usable model (configured: $configured)',
    async (setup) => {
      const { button } = await openModelStep(setup);
      expect(container.querySelector('[data-picker]')).toBeNull();
      expect(button('填 API key')).toBeTruthy();
      expect(button('登录订阅')).toBeTruthy();
    },
  );

  it('disables model edits and Model Providers during Next and restores them after a failed save', async () => {
    const { actions, openProviders } = await openModelStep({
      configured: true,
      receipt: { ...fresh, defaultBotSlug: 'tob' },
    });
    const modelSave = deferred<void>();
    vi.mocked(actions.onboardingModel).mockImplementationOnce(async () => {
      await modelSave.promise;
      throw new Error('Save failed');
    });
    const controls = () => [
      container.querySelector<HTMLButtonElement>(
        `[data-picker="${zhTranslate('onboarding.model')}"]`,
      ),
      container.querySelector<HTMLButtonElement>(
        `[data-picker="${zhTranslate('modelPreset.assignment')}"]`,
      ),
      button(zhTranslate('botSettings.section.modelProviders')),
    ];
    await click(zhTranslate('intro.next'));
    expect(controls().map((control) => control?.disabled)).toEqual([true, true, true]);
    await click(zhTranslate('botSettings.section.modelProviders'));
    expect(openProviders).not.toHaveBeenCalled();
    await act(async () => modelSave.resolve());
    expect(step()).toBe('model');
    expect(controls().map((control) => control?.disabled)).toEqual([false, false, false]);
  });

  it('keeps provider controls unavailable to a member without permission', async () => {
    const { button, call } = await openModelStep({ owner: false });
    expect(button('填 API key')).toBeUndefined();
    expect(button('登录订阅')).toBeUndefined();
    expect(container.textContent).toContain('所有者还没有连接模型。');
    expect(call).not.toHaveBeenCalledWith('modelProviders', expect.anything(), expect.anything());
  });

  it('continues to the picker in the same step after adding a key inline', async () => {
    const { click, call } = await openModelStep();
    await click('填 API key');
    await fillProviderKey();
    await click('保存');
    expect(call).toHaveBeenCalledWith(
      'modelProviderAdd',
      expect.objectContaining({ expectedRevision: 2 }),
      undefined,
    );
    expect(container.textContent).toContain('API key 已保存');
    expect(container.textContent).toContain('已列出 1 个模型');
    expect(container.textContent).toContain('测试回复成功');
    const receiptClose = [...container.querySelectorAll<HTMLButtonElement>('section button')].find(
      (button) => button.textContent === '关闭',
    );
    if (receiptClose === undefined) throw new Error('Receipt close action is missing');
    await act(async () => receiptClose.click());
    expect(container.querySelector('[data-intro-step="model"] [data-picker]')).toBeTruthy();
  });

  it('blocks navigation while the provider save is pending and shows its receipt', async () => {
    const { call } = await openModelStep();
    await click('填 API key');
    const save = deferred<Awaited<ReturnType<BridgeCall>>>();
    call.mockImplementationOnce(() => save.promise);
    await fillProviderKey();
    await click('保存');
    for (const key of ['intro.next', 'intro.back', 'intro.skip', 'common.close'] as const)
      expect(button(zhTranslate(key))?.disabled).toBe(true);
    expect(button(`1 ${zhTranslate('intro.step.welcome')}`)?.disabled).toBe(true);
    await click(zhTranslate('intro.next'));
    expect(step()).toBe('model');
    await act(async () => {
      save.resolve({
        ok: true,
        value: { id: 'opencode-go', keyStored: true, modelCount: 1, testReply: 'ok' },
      });
    });
    expect(container.textContent).toContain('测试回复成功');
    expect(button(zhTranslate('intro.next'))?.disabled).toBe(false);
  });

  it('keeps the inline draft and retries with the new revision after a conflict', async () => {
    const { call } = await openModelStep();
    await click('填 API key');
    await fillProviderKey();
    const refresh = deferred<Awaited<ReturnType<BridgeCall>>>();
    call
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'provider-conflict', message: 'Conflict', details: {} },
      })
      .mockImplementationOnce(() => refresh.promise);
    await click('保存');
    expect(button('保存')?.disabled).toBe(true);
    expect(providerKey()?.value).toBe('test-key');
    await act(async () => refresh.resolve({ ok: true, value: { revision: 3, providers: [] } }));
    await click('保存');
    expect(call).toHaveBeenLastCalledWith(
      'modelProviderAdd',
      expect.objectContaining({ expectedRevision: 3, key: 'test-key' }),
      undefined,
    );
  });

  it('retries a failed viewer lookup while keeping the draft and Skip available', async () => {
    const viewer = deferred<Awaited<ReturnType<BridgeCall>>>();
    const call = vi
      .fn<BridgeCall>(() => viewer.promise)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'unavailable', message: 'Unavailable', details: {} },
      });
    const base = actionsFor();
    const modelCatalog = vi.fn(async () => ({ models: [testModel('main'), testModel('task')] }));
    const actions = {
      ...base,
      modelCatalog,
    } as unknown as BridgeActions;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ engines: [], selections: [] })),
    );
    await mountModelStep(actions, { call });
    await pickModel('onboarding.model');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      zhTranslate('intro.model.viewerLoadFailed'),
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(button(zhTranslate('intro.next'))?.disabled).toBe(true);
    expect(button(zhTranslate('intro.skip'))?.disabled).toBe(false);
    await click(zhTranslate('intro.next'));
    expect(step()).toBe('model');
    expect(base.onboardingModel).not.toHaveBeenCalled();
    await click(zhTranslate('team.retry'));
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith('teamMode', {}, undefined);
    expect(modelCatalog).toHaveBeenCalledOnce();
    expect(button(zhTranslate('intro.next'))?.disabled).toBe(true);
    await act(async () => viewer.resolve({ ok: true, value: fakeTeamMode(ownerViewer) }));
    await click(zhTranslate('intro.next'));
    expect(base.onboardingModel).toHaveBeenCalledWith(
      undefined,
      0,
      { provider: 'p', model: 'task' },
      true,
    );
    expect(step()).toBe('phone');
  });

  it('rejects an Assignment draft removed by a catalog refresh before either write', async () => {
    const events = resourceEvents();
    try {
      const base = actionsFor([{ ...fresh, defaultBotSlug: 'tob' }]);
      const modelCatalog = vi.fn(async () => ({ models: [testModel('main'), testModel('task')] }));
      const setModelPlan = vi.fn(async () => ({}));
      const actions = {
        ...base,
        modelCatalog,
        modelPlanState: vi.fn(async () => ({ revision: 0 })),
        setModelPlan,
      } as unknown as BridgeActions;
      await mountModelStep(actions);
      const advanced = container.querySelector<HTMLDetailsElement>('[data-intro-model-advanced]')!;
      await act(async () => {
        advanced.open = true;
        advanced.dispatchEvent(new Event('toggle'));
      });
      await pickModel('modelPreset.assignment');
      modelCatalog.mockClear();
      modelCatalog.mockResolvedValue({ models: [testModel('main')] });
      await act(async () => {
        events.emit('model-providers');
        await vi.waitFor(() => expect(modelCatalog).toHaveBeenCalled());
      });
      await click(zhTranslate('intro.next'));
      expect(base.onboardingModel).not.toHaveBeenCalled();
      expect(setModelPlan).not.toHaveBeenCalled();
      expect(step()).toBe('model');
      await click(zhTranslate('intro.model.useMainForAssignment'));
      await click(zhTranslate('intro.next'));
      expect(base.onboardingModel).toHaveBeenCalledOnce();
      expect(setModelPlan).not.toHaveBeenCalled();
      expect(step()).toBe('phone');
    } finally {
      events.dispose();
    }
  });

  it('waits for a successful engine read before saving an explicit API choice', async () => {
    const read = deferred<Response>();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json({}) : read.promise,
    );
    vi.stubGlobal('fetch', fetcher);
    const base = actionsFor([{ ...fresh, defaultBotSlug: 'tob' }]);
    const actions = {
      ...base,
      modelCatalog: vi.fn(async () => ({
        models: [testModel('main'), testModel('task')],
        default: { provider: 'p', model: 'main' },
      })),
    } as unknown as BridgeActions;
    const call = vi.fn<BridgeCall>(async () => ({ ok: true, value: fakeTeamMode(ownerViewer) }));
    await mountModelStep(actions, { call });
    await pickModel('onboarding.model');
    await click(zhTranslate('intro.next'));
    expect(base.onboardingModel).not.toHaveBeenCalled();
    expect(step()).toBe('model');
    await act(async () => read.resolve(new Response(null, { status: 503 })));
    await click(zhTranslate('intro.next'));
    expect(base.onboardingModel).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(
      Response.json({
        engines: [],
        selections: [{ botSlug: 'tob', role: 'orchestrator', engine: 'codex' }],
      }),
    );
    await click(zhTranslate('engine.reload'));
    await click(zhTranslate('intro.next'));
    expect(base.onboardingModel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ action: 'use', bot: 'tob', role: 'orchestrator', engine: null }),
      }),
    );
    expect(step()).toBe('phone');
  });

  it('skips without connection work and returns from the shared dialog before explicit Continue', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ devices: [{ id: 'phone-1', feedReadAt: '2026-11-13T00:00:00Z' }] }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      const actions = actionsFor() as unknown as BridgeActions;
      const controller = onboardingFor(actions);
      await controller.enter();
      controller.openIntro();
      controller.setIntroStep(INTRO_STEPS.indexOf('phone'));
      const call = vi.fn<BridgeCall>(async () => ({ ok: true, value: fakeTeamMode(ownerViewer) }));
      await act(async () =>
        root.render(createElement(BotIntro, { actions, call, t: zhTranslate })),
      );
      const click = async (label: string) =>
        act(async () =>
          [...container.querySelectorAll('button')]
            .find((button) => button.textContent === label)!
            .click(),
        );
      expect(container.querySelector('[aria-label="4 手机"]')?.getAttribute('aria-current')).toBe(
        'step',
      );
      expect(fetcher).not.toHaveBeenCalled();
      expect(container.querySelector('[data-phone-connection]')).toBeNull();
      await click(zhTranslate('connections.quick'));
      expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(
        container.querySelector(
          '[data-phone-connection][data-quick-connect="true"][data-address-setup="true"]',
        ),
      ).not.toBeNull();
      await click('Close connection');
      expect(container.querySelector('[data-intro-step="phone"]')).not.toBeNull();
      await click(zhTranslate('connections.quick'));
      await click('Approve phone');
      expect(container.textContent).not.toContain('手机已读到这台电脑的内容。');
      await click('Read Feed');
      expect(container.querySelector('[data-intro-step="phone"]')).not.toBeNull();
      expect(container.textContent).toContain('手机已读到这台电脑的内容。');
      await click('下一步');
      expect(container.querySelector('[data-intro-step="community"]')).not.toBeNull();
      expect(container.querySelector('[data-phone-connection]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('walks the six steps and applies a theme choice right away', async () => {
    const actions = actionsFor() as unknown as BridgeActions;
    const controller = onboardingFor(actions);
    await controller.enter();
    controller.openIntro();
    const appearance = new Appearance(localStorage, () => 'light');
    await act(async () => {
      root.render(createElement(BotIntro, { actions, appearance, t: zhTranslate }));
    });
    const dialog = () => document.querySelector('[role="dialog"]')!;
    const step = () => dialog().querySelector('[data-intro-step]')!.getAttribute('data-intro-step');
    const click = async (name: string) => {
      const button = [...dialog().querySelectorAll('button')].find(
        (candidate) => candidate.textContent === name,
      )!;
      await act(async () => button.click());
    };
    expect(step()).toBe('welcome');
    expect(dialog().textContent).toContain('你好，我是托布');
    expect(dialog().querySelector('[data-founder-note]')).toBeNull();
    await click('下一步');
    expect(step()).toBe('theme');
    await act(async () =>
      dialog().querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]')!.click(),
    );
    expect(appearance.getSnapshot().config.preference).toBe('light');
    await act(async () =>
      [...dialog().querySelectorAll<HTMLButtonElement>('[role="radio"]')]
        .find((button) => button.textContent === zhTranslate('appearance.forestGreen'))!
        .click(),
    );
    expect(appearance.getSnapshot().config.modes.light.preset).toBe('forest-green');
    expect(appearance.getSnapshot().config.modes.dark.preset).toBe('forest-green');
    expect(dialog().querySelector('[data-wallpaper-settings]')).toBeNull();
    expect(dialog().querySelector('[data-layout-mode]')).toBeNull();
    const setMode = vi.fn();
    let detachLayout = () => {};
    await act(async () => {
      detachLayout = controller.attachLayout('simple', { setMode });
    });
    const layout = (mode: string) =>
      dialog().querySelector<HTMLButtonElement>(`[data-layout-mode="${mode}"]`)!;
    expect(layout('simple').getAttribute('aria-checked')).toBe('true');
    expect(dialog().textContent).toContain(zhTranslate('onboarding.short.layoutSimpleHint'));
    await act(async () => layout('advanced').click());
    expect(setMode).toHaveBeenCalledWith('advanced');
    await act(async () => {
      detachLayout();
      detachLayout = controller.attachLayout('advanced', { setMode });
    });
    expect(layout('advanced').getAttribute('aria-checked')).toBe('true');
    expect(dialog().textContent).toContain(zhTranslate('onboarding.short.layoutAdvancedHint'));
    await click('下一步');
    expect(step()).toBe('model');
    await click('下一步');
    expect(step()).toBe('phone');
    await click('暂时跳过');
    expect(step()).toBe('community');
    expect(dialog().querySelector('a[data-community="github"]')!.getAttribute('href')).toBe(
      'https://github.com/BotHarness/DeepSeekBot',
    );
    expect(dialog().textContent).toContain('1125565676');
    expect(dialog().querySelectorAll('[data-founder-note] p')).toHaveLength(5);
    expect(dialog().textContent).toContain('everything is plugin');
    expect(
      dialog()
        .querySelector('[data-user-reviews]')!
        .compareDocumentPosition(dialog().querySelector('[data-founder-note]')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(dialog().querySelectorAll('[data-user-reviews] blockquote')).toHaveLength(3);
    await click('下一步');
    expect(step()).toBe('start');
    expect(dialog().querySelectorAll('[data-persona]')).toHaveLength(4);
    expect(dialog().querySelector('[data-intro-interview]')).not.toBeNull();
    const tap = async (selector: string) =>
      act(async () => dialog().querySelector<HTMLButtonElement>(selector)!.click());
    expect(dialog().querySelector<HTMLButtonElement>('[data-intro-persona-next]')!.disabled).toBe(
      true,
    );
    await tap('[data-persona="creator"]');
    await tap('[data-persona="engineer"]');
    expect(dialog().querySelectorAll('[data-persona-details]')).toHaveLength(2);
    await tap('[data-persona-detail="video"]');
    await tap('[data-persona-detail="backend"]');
    await tap('[data-persona-detail="frontend"]');
    await tap('[data-persona-detail="frontend"]');
    expect(
      dialog().querySelector('[data-persona-detail="backend"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
    await click('上一步');
    await click('下一步');
    expect(dialog().querySelector('[data-persona="engineer"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    await tap('[data-intro-persona-next]');
    expect(dialog().querySelector('[data-intro-persona]')!.getAttribute('data-intro-persona')).toBe(
      'engineer creator',
    );
    expect(dialog().querySelectorAll('[data-persona-prompt]')).toHaveLength(6);
    expect(dialog().textContent).toContain(zhTranslate('intro.feature.browser'));
    const sent: string[] = [];
    const stop = receiveTobMessages((body) => sent.push(body));
    await tap('[data-persona-prompt="trends"]');
    stop();
    expect(sent).toEqual([
      '关于我：工程师（后端）、自媒体人（短视频）。' +
        zhTranslate('intro.persona.creator.trends.body'),
    ]);
    const events = (actions.telemetryEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(events[0]).toEqual(['onboarding:intro_view', undefined]);
    expect(events).toContainEqual(['onboarding:intro_step_view', { step: 'community' }]);
    expect(events).toContainEqual(['onboarding:theme_update', { setting: 'preset' }]);
    expect(events).toContainEqual(['onboarding:theme_update', { setting: 'layout' }]);
    detachLayout();
    expect(events).toContainEqual(['onboarding:persona_select', { persona: 'creator' }]);
    expect(events).toContainEqual([
      'onboarding:persona_detail_select',
      { persona: 'engineer', detail: 'backend' },
    ]);
    expect(events.filter(([name]) => name === 'onboarding:persona_detail_select')).toHaveLength(3);
    expect(events.at(-1)).toEqual([
      'onboarding:intro_complete',
      {
        starter: 'persona',
        persona: 'creator',
        feature: 'browser',
        is_engineer: true,
        is_creator: true,
        is_operator: false,
        is_learner: false,
        has_detail: true,
      },
    ]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('offers an interview, adds the time zone to schedules and keeps the persona on own', async () => {
    const actions = actionsFor() as unknown as BridgeActions;
    const events = (actions.telemetryEvent as ReturnType<typeof vi.fn>).mock.calls;
    const sent: string[] = [];
    const stop = receiveTobMessages((body) => sent.push(body));
    const open = async () => {
      const controller = onboardingFor(actions);
      await controller.enter();
      controller.openIntro();
      controller.setIntroStep(INTRO_STEPS.indexOf('start'));
      await act(async () => {
        root.render(createElement(BotIntro, { actions, t: zhTranslate }));
      });
    };
    const press = async (selector: string) =>
      act(async () => document.querySelector<HTMLButtonElement>(selector)!.click());
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await open();
    await press('[data-intro-interview]');
    expect(sent.at(-1)).toBe(
      zhTranslate('intro.interview.body') +
        zhTranslate('intro.interview.timeZone', { timeZone: zone }),
    );
    const nobody = { is_engineer: false, is_creator: false, is_operator: false, is_learner: false };
    expect(events.at(-1)).toEqual([
      'onboarding:intro_complete',
      { starter: 'interview', ...nobody, has_detail: false },
    ]);

    await open();
    await press('[data-persona="operator"]');
    await press('[data-intro-persona-next]');
    await press('[data-persona-prompt="weekly"]');
    expect(sent.at(-1)).toBe(
      '关于我：产品 / 运营。' +
        zhTranslate('intro.persona.operator.weekly.body') +
        zhTranslate('intro.persona.timeZone', { timeZone: zone }),
    );

    await open();
    await press('[data-persona="engineer"]');
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === zhTranslate('intro.start.own'))!
        .click(),
    );
    stop();
    expect(sent).toHaveLength(2);
    expect(events.at(-1)).toEqual([
      'onboarding:intro_complete',
      { starter: 'own', ...nobody, is_engineer: true, has_detail: false },
    ]);
  });

  it('has copy for every persona prompt in both languages', () => {
    for (const table of [zh, en] as Record<string, string>[])
      for (const persona of ONBOARDING_PERSONAS) {
        for (const suffix of ['name', 'hint'])
          expect(table[`intro.persona.${persona}.${suffix}`]).toBeTruthy();
        for (const prompt of PERSONA_TEMPLATES[persona].prompts)
          for (const suffix of ['title', 'body'])
            expect(table[`intro.persona.${persona}.${prompt.id}.${suffix}`]).toBeTruthy();
      }
  });

  it('keeps one model by default and splits Tob task model under Advanced', async () => {
    const model = (id: string) => ({
      provider: 'p',
      providerName: 'P',
      model: id,
      modelName: id,
      efforts: [],
    });
    const base = actionsFor([{ ...fresh, defaultBotSlug: 'tob' }]);
    const actions = {
      ...base,
      modelCatalog: vi.fn(async () => ({
        models: [model('main'), model('task')],
        default: { provider: 'p', model: 'main' },
      })),
      modelPlanState: vi.fn(async () => ({ revision: 0 })),
      setModelPlan: vi.fn(async () => ({})),
      inheritModel: vi.fn(async () => ({ revision: 1 })),
    } as unknown as BridgeActions;
    const controller = onboardingFor(actions);
    await controller.enter();
    controller.openIntro();
    controller.setIntroStep(2);
    await act(async () => {
      root.render(createElement(BotIntro, { actions, t: zhTranslate }));
    });
    const dialog = () => document.querySelector('[role="dialog"]')!;
    const next = async () =>
      act(async () =>
        [...dialog().querySelectorAll('button')]
          .find((button) => button.textContent === '下一步')!
          .click(),
      );
    const advanced = dialog().querySelector<HTMLDetailsElement>('[data-intro-model-advanced]')!;
    expect(advanced.open).toBe(false);
    expect(advanced.textContent).toContain('主模型和副模型相同');
    await act(async () => {
      advanced.open = true;
      advanced.dispatchEvent(new Event('toggle'));
    });
    await act(async () =>
      advanced
        .querySelector<HTMLElement>(`[data-picker="${zhTranslate('modelPreset.assignment')}"]`)!
        .click(),
    );
    expect(advanced.textContent).toContain('托布的副模型单独设置');
    await next();
    expect(actions.onboardingModel).not.toHaveBeenCalled();
    expect(actions.setModelPlan).toHaveBeenCalledWith(
      'tob',
      0,
      { provider: 'p', model: 'main' },
      { provider: 'p', model: 'task' },
      [{ provider: 'p', model: 'task', allowedEfforts: [''], defaultEffort: '' }],
    );
  });
});
