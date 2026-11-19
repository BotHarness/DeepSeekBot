// @vitest-environment jsdom
import { type PropsWithChildren } from 'react';
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
    onChange,
  }: {
    title: string;
    onChange(choice: { key: string; effort: string }): void;
  }) =>
    createElement('span', {
      'data-picker': title,
      onClick: () => onChange({ key: JSON.stringify(['p', 'task']), effort: '' }),
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
    onClose,
    onDevicePaired,
    onFeedRead,
  }: {
    onClose(): void;
    onDevicePaired?(id: string): void;
    onFeedRead?(id: string): void;
  }) =>
    createElement(
      'div',
      { role: 'dialog', 'data-phone-connection': '' },
      createElement('button', { onClick: onClose }, 'Close connection'),
      createElement('button', { onClick: () => onDevicePaired?.('phone-1') }, 'Approve phone'),
      createElement('button', { onClick: () => onFeedRead?.('phone-1') }, 'Read Feed'),
    ),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { Appearance } from '../src/client/appearance.js';
import { BotIntro } from '../src/client/bot-intro.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { cachedGithubStars, fetchGithubStars } from '../src/client/community-links.js';
import { receiveTobMessages, requestTobMessage } from '../src/client/tob-requests.js';
import { en, zh, zhTranslate } from '../src/client/locale.js';
import { ONBOARDING_PERSONAS, PERSONA_TEMPLATES } from '../src/client/onboarding-personas.js';
import { INTRO_STEPS, OnboardingController, onboardingFor } from '../src/client/onboarding.js';
import { setTeamModeSnapshot } from '../src/client/team-state.js';

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

  async function openModelStep({ configured = false, owner = true } = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          engines: [{ engine: 'codex', installed: true, available: false, reason: 'signed-out' }],
          selections: [],
        }),
      ),
    );
    let connected = configured;
    const actions = {
      ...actionsFor(),
      modelCatalog: vi.fn(async () => ({ models: connected ? [goModel] : [] })),
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
    const openProviders = vi.fn();
    const botSettings = {
      open: openProviders,
      getSnapshot: () => ({ open: false, sectionId: undefined }),
      subscribe: () => () => {},
    };
    const controller = onboardingFor(actions);
    await controller.enter();
    controller.openIntro();
    controller.setIntroStep(INTRO_STEPS.indexOf('model'));
    const props = { actions, call, botSettings, t: zhTranslate };
    await act(async () => root.render(createElement(BotIntro, props)));
    const button = (name: string) =>
      [...container.querySelectorAll('button')].find(
        (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent) === name,
      );
    const click = async (name: string) => {
      const target = button(name);
      if (target === undefined) throw new Error(`No button named ${name}`);
      await act(async () => target.click());
    };
    return { actions, button, call, click, openProviders };
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

  it('offers a key or subscription first when the Host has no usable model', async () => {
    const { button } = await openModelStep();
    expect(container.querySelector('[data-picker]')).toBeNull();
    expect(button('填 API key')).toBeTruthy();
    expect(button('登录订阅')).toBeTruthy();
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
    const input = container.querySelector('input[aria-label="API key"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'test-key',
      );
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
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
      await act(async () => root.render(createElement(BotIntro, { actions, t: zhTranslate })));
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
      await click('连接手机');
      expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      await click('Close connection');
      expect(container.querySelector('[data-intro-step="phone"]')).not.toBeNull();
      await click('连接手机');
      await click('Approve phone');
      expect(container.textContent).not.toContain('手机已读到这台电脑的内容。');
      await click('Read Feed');
      expect(container.querySelector('[data-intro-step="phone"]')).not.toBeNull();
      expect(container.textContent).toContain('手机已读到这台电脑的内容。');
      await click('下一步');
      expect(container.querySelector('[data-intro-step="community"]')).not.toBeNull();
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
