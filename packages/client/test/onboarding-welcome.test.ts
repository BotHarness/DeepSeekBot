// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { type OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import { type ModelCatalogEntryView } from '../src/client/bridge.js';
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

import { zhTranslate } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingWelcome } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';

const channel = {
  id: 'dm-ada',
  botSlug: 'ada',
  type: 'dm' as const,
  name: 'Ada',
  members: [],
  createdAt: '',
  updatedAt: '',
};
const bot = {
  slug: 'ada',
  displayName: 'DeepSeek Bot',
  roles: ['assistant'],
  aggregateState: 'idle' as const,
  workspaces: [],
  createdAt: '',
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setRoster([bot], [channel]);
  store.setConversation({ channel, sending: false });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  store.setRoster([], []);
});
function harness() {
  const actions = {
    onboarding: vi.fn(async (): Promise<OnboardingSnapshot> => ({
      profileId: 'welcome',
      completed: false,
      preparation: 'ready',
      tutorial: 'paused',
      channelId: 'dm-ada',
    })),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(
      async (): Promise<{
        default: { provider: string; model: string };
        models: ModelCatalogEntryView[];
      }> => ({
        default: { provider: 'deepseek', model: 'chat' },
        models: [
          {
            provider: 'deepseek',
            model: 'chat',
            providerName: 'DeepSeek',
            modelName: 'Chat',
            efforts: [],
          },
        ],
      }),
    ),
    modelPlanState: vi.fn(async () => ({ revision: 0 })),
    onboardingModel: vi.fn(async () => {}),
    send: vi.fn(async () => true),
  };
  const bridge = actions as unknown as BridgeActions;
  const render = async () => {
    await act(async () => {
      await onboardingFor(bridge).enter();
      root.render(
        createElement(OnboardingWelcome, { actions: bridge, channelId: 'dm-ada', t: zhTranslate }),
      );
    });
  };
  return { actions, bridge, render, controller: onboardingFor(bridge) };
}
it('presents the preset welcome as a letter from the PersonaBot', async () => {
  const { actions, render } = harness();
  await render();
  expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
  expect(container.textContent).toContain('DeepSeek Bot');
  expect(container.textContent).toContain(
    zhTranslate('onboarding.letter.greeting', { name: 'DeepSeek Bot' }),
  );
  expect(container.textContent).toContain(zhTranslate('onboarding.letter.body'));
  expect(container.textContent).toContain(zhTranslate('onboarding.letter.signature'));
  expect(container.textContent).toContain(zhTranslate('onboarding.letter.tag'));
  expect(container.textContent).toContain(zhTranslate('onboarding.productMessage'));
  expect(container.querySelector('[data-onboarding-welcome]')).not.toBeNull();
  expect(container.querySelector('.bh-welcome-banner')).not.toBeNull();
  expect(container.querySelector('.bh-welcome-name')?.textContent).toBe('DeepSeek Bot');
});
it('surfaces the retained unsent question from the welcome card', async () => {
  const { actions, bridge, controller } = harness();
  await act(async () => {
    await controller.enter();
  });
  actions.modelCatalog.mockResolvedValueOnce({
    default: { provider: 'deepseek', model: 'chat' },
    models: [
      {
        provider: 'deepseek',
        model: 'chat',
        providerName: 'DeepSeek',
        modelName: 'Chat',
        efforts: [],
        credential: 'missing',
      },
    ],
  });
  await act(async () => {
    await controller.prepareSend('dm-ada', 'ada', 'Keep this question');
  });
  await act(async () => {
    root.render(
      createElement(OnboardingWelcome, { actions: bridge, channelId: 'dm-ada', t: zhTranslate }),
    );
  });
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === zhTranslate('onboarding.unsent'),
  );
  if (button === undefined) throw new Error('Missing unsent question entry');
  await act(async () => button.click());
  expect(controller.getSnapshot()).toMatchObject({
    sendOpen: true,
    pending: { body: 'Keep this question' },
  });
});
