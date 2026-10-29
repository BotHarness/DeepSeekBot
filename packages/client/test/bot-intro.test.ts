// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props),
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

import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import { Appearance } from '../src/client/appearance.js';
import { BotIntro } from '../src/client/bot-intro.js';
import { cachedGithubStars, fetchGithubStars } from '../src/client/community-links.js';
import { receiveTobMessages, requestTobMessage } from '../src/client/tob-requests.js';
import { en, zh, zhTranslate } from '../src/client/locale.js';
import { ONBOARDING_PERSONAS, PERSONA_TEMPLATES } from '../src/client/onboarding-personas.js';
import { INTRO_STEPS, OnboardingController, onboardingFor } from '../src/client/onboarding.js';

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
  });

  it('walks the five steps and applies a theme choice right away', async () => {
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
    expect(advanced.textContent).toContain('主模型和执行模型相同');
    await act(async () => {
      advanced.open = true;
      advanced.dispatchEvent(new Event('toggle'));
    });
    await act(async () =>
      advanced
        .querySelector<HTMLElement>(`[data-picker="${zhTranslate('modelPreset.assignment')}"]`)!
        .click(),
    );
    expect(advanced.textContent).toContain('托布的执行模型单独设置');
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
