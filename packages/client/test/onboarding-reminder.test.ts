// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { type BotHarnessKey } from '../src/client/locale.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/onboarding-memory.js', () => ({ OnboardingMemory: () => null }));
vi.mock('../src/client/onboarding-binding.js', () => ({ OnboardingAppBinding: () => null }));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettings: vi.fn() }));
import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate, en } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingWelcome } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';
const enTranslate = (key: BotHarnessKey | string, args: Record<string, unknown> = {}): string =>
  ((en as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (match, name) =>
    String(args[name] ?? match),
  );
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setConversation({
    channel: {
      id: 'dm-ada',
      botSlug: 'ada',
      type: 'dm',
      name: 'Ada',
      members: [],
      createdAt: '',
      updatedAt: '',
    },
    sending: false,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function render(
  configured = true,
  t = zhTranslate,
  option: BotHarnessKey = 'onboarding.testRequest',
  newsAvailable = false,
) {
  const submitted = vi.fn(async (_body: string) => true);
  const actions = {
    onboarding: vi.fn(async () => ({
      profileId: 'reminder',
      newsAvailable,
      completed: false,
      preparation: 'ready',
      tutorial: 'not-started',
      channelId: 'dm-ada',
    })),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(async () => ({
      default: { provider: 'deepseek', model: 'chat' },
      models: [
        { provider: 'deepseek', model: 'chat', ...(configured ? {} : { credential: 'missing' }) },
      ],
    })),
    modelPlanState: vi.fn(async () => ({ revision: 0 })),
    onboardingModel: vi.fn(async () => {}),
    send: vi.fn(async (body: string) => {
      if (!(await controller.prepareSend('dm-ada', 'ada', body))) return false;
      const sent = await submitted(body);
      if (sent) controller.markSubmitted('dm-ada', body);
      return sent;
    }),
  };
  const bridge = actions as unknown as BridgeActions;
  const controller = onboardingFor(bridge);
  await act(async () => {
    await controller.enter();
    root.render(createElement(OnboardingWelcome, { actions: bridge, channelId: 'dm-ada', t }));
  });
  const button = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(t(option)),
  );
  if (!button) throw Error('Missing reminder option');
  return { button, submitted, actions, controller };
}
it('shows the client time zone before sending a one-time request to the current DM', async () => {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
  } as Intl.DateTimeFormat);
  const { button, submitted } = await render();
  expect(button.textContent).toContain('只提醒一次 · 当前私聊 · Pacific/Auckland');
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => button.click());
  expect(submitted).toHaveBeenCalledExactlyOnceWith(
    zhTranslate('onboarding.reminderBody', { timeZone: 'Pacific/Auckland' }),
  );
});
it('keeps the full reminder intent unsent through model setup and requires explicit send', async () => {
  const { button, submitted, actions, controller } = await render(false);
  await act(async () => button.click());
  const body = controller.getSnapshot().pending?.body;
  expect(body).toContain('10 分钟后只提醒我一次');
  expect(body).toContain('当前私聊');
  expect(controller.getSnapshot().modelOpen).toBe(true);
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0));
  expect(submitted).not.toHaveBeenCalled();
  expect(controller.getSnapshot().sendOpen).toBe(true);
  actions.modelCatalog.mockResolvedValue({
    default: { provider: 'deepseek', model: 'chat' },
    models: [{ provider: 'deepseek', model: 'chat' }],
  });
  await act(async () => controller.sendPending());
  expect(submitted).toHaveBeenCalledExactlyOnceWith(body);
  expect(controller.getSnapshot().pending).toBeUndefined();
});
it.each(['empty', 'throws'])(
  'asks for a time zone instead of guessing when detection %s',
  async (mode) => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      if (mode === 'throws') throw Error('Time zone unavailable');
      return { resolvedOptions: () => ({ timeZone: '' }) } as Intl.DateTimeFormat;
    });
    const { button, submitted } = await render(true, enTranslate);
    expect(button.textContent).toContain('Time zone unavailable; confirm it before scheduling');
    await act(async () => button.click());
    expect(submitted).toHaveBeenCalledExactlyOnceWith(
      enTranslate('onboarding.reminderUnknownBody'),
    );
  },
);
it('admits only one request for rapid repeated selection', async () => {
  const { button, submitted } = await render();
  await act(async () => {
    button.click();
    button.click();
  });
  expect(submitted).toHaveBeenCalledTimes(1);
});

it.each([zhTranslate, enTranslate])(
  'shows the daily evening time and submits its explicit zone and DM only after selection',
  async (t) => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as Intl.DateTimeFormat);
    const { button, submitted } = await render(true, t, 'onboarding.dailyRequest');
    expect(button.textContent).toContain('21:00');
    expect(button.textContent).toContain('America/New_York');
    expect(submitted).not.toHaveBeenCalled();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(submitted).toHaveBeenCalledExactlyOnceWith(
      t('onboarding.dailyBody', { timeZone: 'America/New_York' }),
    );
    const body = submitted.mock.calls[0]![0];
    expect(body).toContain('21:00');
    expect(body).toContain('America/New_York');
    expect(body).not.toContain('{timeZone}');
  },
);
it('retains the entire daily request through model setup without automatically sending', async () => {
  const { button, submitted, actions, controller } = await render(
    false,
    zhTranslate,
    'onboarding.dailyRequest',
  );
  await act(async () => button.click());
  const body = controller.getSnapshot().pending?.body;
  expect(body).toContain('每天 21:00');
  expect(body).toContain('当前私聊');
  expect(controller.getSnapshot().modelOpen).toBe(true);
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0));
  expect(submitted).not.toHaveBeenCalled();
  expect(controller.getSnapshot().sendOpen).toBe(true);
  actions.modelCatalog.mockResolvedValue({
    default: { provider: 'deepseek', model: 'chat' },
    models: [{ provider: 'deepseek', model: 'chat' }],
  });
  await act(async () => controller.sendPending());
  expect(submitted).toHaveBeenCalledExactlyOnceWith(body);
});
it.each(['empty', 'throws'])(
  'asks for the daily time zone before creation when detection %s',
  async (mode) => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      if (mode === 'throws') throw Error('Time zone unavailable');
      return { resolvedOptions: () => ({ timeZone: '' }) } as Intl.DateTimeFormat;
    });
    const { button, submitted } = await render(true, enTranslate, 'onboarding.dailyRequest');
    expect(button.textContent).toContain('Time zone unavailable; confirm it before scheduling');
    await act(async () => button.click());
    expect(submitted).toHaveBeenCalledExactlyOnceWith(enTranslate('onboarding.dailyUnknownBody'));
  },
);

it.each([zhTranslate, enTranslate])(
  'offers sourced news only when the Host confirms search, using normal send guards',
  async (t) => {
    const { button, submitted } = await render(true, t, 'onboarding.newsRequest', true);
    expect(container.textContent).not.toContain(t('onboarding.exampleRequest'));
    expect(submitted).not.toHaveBeenCalled();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(submitted).toHaveBeenCalledExactlyOnceWith(t('onboarding.newsBody'));
  },
);
it('offers a general request even with a configured chat model when search is unavailable', async () => {
  const { button, submitted } = await render(true, zhTranslate, 'onboarding.exampleRequest');
  expect(container.textContent).not.toContain(zhTranslate('onboarding.newsRequest'));
  await act(async () => button.click());
  expect(submitted).toHaveBeenCalledExactlyOnceWith(zhTranslate('onboarding.exampleRequest'));
});
it('keeps the full sourced-news intent through model setup without automatic sending', async () => {
  const { button, submitted, controller, actions } = await render(
    false,
    zhTranslate,
    'onboarding.newsRequest',
    true,
  );
  await act(async () => button.click());
  expect(controller.getSnapshot().pending?.body).toBe(zhTranslate('onboarding.newsBody'));
  await act(async () => controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0));
  expect(submitted).not.toHaveBeenCalled();
  actions.modelCatalog.mockResolvedValue({
    default: { provider: 'deepseek', model: 'chat' },
    models: [{ provider: 'deepseek', model: 'chat' }],
  });
  await act(async () => controller.sendPending());
  expect(submitted).toHaveBeenCalledExactlyOnceWith(zhTranslate('onboarding.newsBody'));
});

it('refreshes search choices after configuration changes without submitting a request', async () => {
  const { actions, controller, submitted } = await render(
    true,
    zhTranslate,
    'onboarding.exampleRequest',
  );
  actions.onboarding.mockResolvedValue({
    profileId: 'reminder',
    preparation: 'ready',
    tutorial: 'not-started',
    completed: false,
    channelId: 'dm-ada',
    newsAvailable: true,
  });
  await act(async () => controller.refresh('ada'));
  expect(container.textContent).toContain(zhTranslate('onboarding.newsRequest'));
  expect(container.textContent).not.toContain(zhTranslate('onboarding.exampleRequest'));
  actions.onboarding.mockResolvedValue({
    profileId: 'reminder',
    preparation: 'ready',
    tutorial: 'not-started',
    completed: false,
    channelId: 'dm-ada',
    newsAvailable: false,
  });
  await act(async () => controller.refresh('ada'));
  expect(container.textContent).toContain(zhTranslate('onboarding.exampleRequest'));
  expect(container.textContent).not.toContain(zhTranslate('onboarding.newsRequest'));
  expect(submitted).not.toHaveBeenCalled();
});
