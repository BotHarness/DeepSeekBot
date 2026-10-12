// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import { OnboardingController } from '../src/client/onboarding.js';
import { store } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';

const receipt: OnboardingSnapshot = {
  profileId: 'qa',
  completed: false,
  preparation: 'ready',
  tutorial: 'not-started',
  channelId: 'dm-ada',
};
function harness(configured = false) {
  const actions = {
    onboarding: vi.fn(async () => receipt),
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
    send: vi.fn(async () => true),
  };
  return { actions, controller: new OnboardingController(actions as unknown as BridgeActions) };
}
beforeEach(() => {
  sessionStorage.clear();
  store.setConversation({ sending: false });
});
it('preserves missing-key intent locally across refresh and only sends on explicit final confirmation', async () => {
  const first = harness();
  await first.controller.enter();
  expect(await first.controller.prepareSend('dm-ada', 'ada', 'My own request')).toBe(false);
  first.controller.closeModel();
  const restored = harness();
  await restored.controller.enter();
  expect(restored.controller.getSnapshot()).toMatchObject({
    modelOpen: false,
    pending: { body: 'My own request' },
  });
  expect(restored.actions.send).not.toHaveBeenCalled();
  restored.controller.reviewPending();
  expect(restored.controller.getSnapshot().sendOpen).toBe(true);
  restored.controller.chooseModel('dm-ada', 'ada');
  await restored.controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0);
  expect(restored.actions.onboardingModel).toHaveBeenCalledWith(
    'ada',
    0,
    { provider: 'deepseek', model: 'chat' },
    true,
  );
  expect(restored.actions.send).not.toHaveBeenCalled();
  expect(restored.controller.getSnapshot()).toMatchObject({
    modelOpen: false,
    sendOpen: true,
    pending: { body: 'My own request' },
  });
  await restored.controller.sendPending();
  expect(restored.actions.send).toHaveBeenCalledExactlyOnceWith('My own request');
  expect(restored.controller.getSnapshot().pending).toBeUndefined();
  expect(sessionStorage.length).toBe(0);
});
it('reuses a usable native selection and does not navigate again during progress reconciliation', async () => {
  const { actions, controller } = harness(true);
  await controller.enter();
  actions.openChannel.mockClear();
  actions.load.mockClear();
  expect(await controller.prepareSend('dm-ada', 'ada', 'Hello')).toBe(true);
  expect(controller.getSnapshot().modelOpen).toBe(false);
  await controller.refresh('ada');
  expect(actions.load).not.toHaveBeenCalled();
  expect(actions.openChannel).not.toHaveBeenCalled();
});
it('retains unsent content and surfaces a failed global save without submitting', async () => {
  const { actions, controller } = harness();
  await controller.enter();
  await controller.prepareSend('dm-ada', 'ada', 'Hello');
  actions.onboardingModel.mockRejectedValueOnce(new Error('default-model-not-saved'));
  await expect(
    controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0),
  ).rejects.toThrow('default-model-not-saved');
  expect(actions.send).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    modelOpen: true,
    pending: { body: 'Hello' },
    busy: false,
  });
});
it('does not carry another client draft and guards concurrent welcome clicks', async () => {
  const first = harness();
  await first.controller.enter();
  await first.controller.prepareSend('dm-ada', 'ada', 'Private draft');
  sessionStorage.clear();
  const another = harness(true);
  await another.controller.enter();
  expect(another.controller.getSnapshot().pending).toBeUndefined();
  let release!: () => void;
  another.actions.send.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = () => resolve(true);
      }),
  );
  const pending = another.controller.request('dm-ada', 'Hello');
  await Promise.resolve();
  await another.controller.request('dm-ada', 'Hello');
  expect(another.actions.send).toHaveBeenCalledTimes(1);
  release();
  await pending;
});
it('initializes the local companion only once and respects its later removal across clients', async () => {
  const saved = new Map<string, string>();
  const dependencies = {
    storage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    },
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ readyState: 1, addEventListener() {}, close() {} }),
    update: async () => {},
  };
  const first = new WindowCompanions(dependencies);
  await first.start();
  first.initializeDefault('ada');
  expect(first.get('ada')).toBeDefined();
  first.remove('ada');
  first.initializeDefault('ada');
  expect(first.get('ada')).toBeUndefined();
  first.dispose();
  const restored = new WindowCompanions(dependencies);
  await restored.start();
  restored.initializeDefault('ada');
  expect(restored.get('ada')).toBeUndefined();
  restored.dispose();
  saved.clear();
  const other = new WindowCompanions(dependencies);
  await other.start();
  other.initializeDefault('ada');
  expect(other.get('ada')).toBeDefined();
  other.dispose();
});

it('shares active tutorial progress without reopening the checklist in another client', async () => {
  const { actions, controller } = harness();
  actions.onboarding.mockResolvedValue({
    ...receipt,
    tutorial: 'active',
  });
  await controller.enter();
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: false,
    checklistOpen: false,
    receipt: { tutorial: 'active' },
  });
  await controller.refresh(undefined, 'continue');
  expect(controller.getSnapshot()).toMatchObject({ checklistOpen: true, guideOpen: false });
  controller.closeChecklist();
  expect(controller.getSnapshot().checklistOpen).toBe(false);
  expect(actions.onboarding).toHaveBeenLastCalledWith(undefined, 'pause');
});

it('retains an unsent question and surfaces a failed readiness lookup without submitting', async () => {
  const { actions, controller } = harness();
  await controller.enter();
  actions.modelCatalog.mockRejectedValueOnce(new Error('catalog unavailable'));
  await expect(controller.prepareSend('dm-ada', 'ada', 'Keep this question')).resolves.toBe(false);
  expect(controller.getSnapshot()).toMatchObject({
    error: 'catalog unavailable',
    pending: { body: 'Keep this question' },
  });
  expect(actions.send).not.toHaveBeenCalled();
});
it('keeps a confirmed draft when sending stops before allocating a message', async () => {
  const { actions, controller } = harness();
  await controller.enter();
  controller.chooseModel('dm-ada', 'ada', 'Keep this question');
  actions.send.mockResolvedValueOnce(false);
  await controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0);
  await controller.sendPending();
  expect(controller.getSnapshot()).toMatchObject({
    sendOpen: true,
    pending: { body: 'Keep this question' },
  });
});

it('saves a model without inventing a question or sending a message from the standalone model entry', async () => {
  const { actions, controller } = harness();
  await controller.enter();
  controller.chooseModel('dm-ada', 'ada');
  expect(controller.getSnapshot().pending).toBeUndefined();
  await controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0);
  expect(actions.onboardingModel).toHaveBeenCalledOnce();
  expect(actions.send).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({ modelOpen: false, sendOpen: false });
  expect(sessionStorage.length).toBe(0);
});
it('retains the question when the separate send step is closed after saving the model', async () => {
  const { actions, controller } = harness();
  await controller.enter();
  await controller.prepareSend('dm-ada', 'ada', 'Review before sending');
  await controller.saveModel({ provider: 'deepseek', model: 'chat' }, true, 0);
  controller.closeSend();
  expect(actions.send).not.toHaveBeenCalled();
  const restored = harness();
  await restored.controller.enter();
  restored.controller.reviewPending();
  expect(restored.controller.getSnapshot()).toMatchObject({
    sendOpen: true,
    modelOpen: false,
    pending: { body: 'Review before sending' },
  });
});

it('does not pause a shared tutorial when an observing client leaves Bot mode or configures a model', async () => {
  const first = harness(true);
  const observer = harness(true);
  let shared: OnboardingSnapshot = { ...receipt };
  const onboarding = vi.fn(async (_slug?: string, action?: string) => {
    if (action === 'start' || action === 'continue') shared = { ...shared, tutorial: 'active' };
    if (action === 'pause') shared = { ...shared, tutorial: 'paused' };
    return shared;
  });
  first.actions.onboarding.mockImplementation(onboarding);
  observer.actions.onboarding.mockImplementation(onboarding);
  await first.controller.enter();
  await first.controller.refresh(undefined, 'start');
  await observer.controller.enter();
  expect(observer.controller.getSnapshot()).toMatchObject({
    guideOpen: false,
    checklistOpen: false,
  });
  onboarding.mockClear();
  observer.controller.pauseGuide();
  observer.controller.closeChecklist();
  observer.controller.chooseModel('dm-ada', 'ada');
  expect(await observer.controller.prepareSend('dm-ada', 'ada', 'Hello')).toBe(true);
  expect(onboarding).not.toHaveBeenCalled();
  await first.controller.refresh();
  expect(first.controller.getSnapshot()).toMatchObject({
    checklistOpen: true,
    receipt: { tutorial: 'active' },
  });
  onboarding.mockClear();
  first.controller.closeChecklist();
  first.controller.closeChecklist();
  expect(onboarding).toHaveBeenCalledExactlyOnceWith(undefined, 'pause');
});

it('closes a local highlight when another client explicitly skips the shared tutorial', async () => {
  const { actions, controller } = harness();
  actions.onboarding.mockResolvedValue({ ...receipt, tutorial: 'active' });
  await controller.enter();
  await controller.refresh(undefined, 'continue');
  actions.onboarding.mockResolvedValue({ ...receipt, tutorial: 'skipped' });
  await controller.refresh();
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: false,
    receipt: { tutorial: 'skipped' },
  });
});

it('allows explicit tutorial replay after completion without reopening it in a new client', async () => {
  const { actions, controller } = harness();
  actions.onboarding.mockResolvedValue({ ...receipt, completed: true, tutorial: 'active' });
  await controller.enter();
  expect(controller.getSnapshot().checklistOpen).toBe(false);
  await controller.refresh(undefined, 'restart');
  expect(controller.getSnapshot()).toMatchObject({
    checklistOpen: true,
    receipt: { completed: true },
  });
  await controller.refresh();
  expect(controller.getSnapshot().checklistOpen).toBe(true);
  controller.closeChecklist();
  expect(controller.getSnapshot().checklistOpen).toBe(false);
  expect(actions.onboarding).toHaveBeenLastCalledWith(undefined, 'pause');
});

it('ends the active highlight when the first real reply completes onboarding', async () => {
  const { actions, controller } = harness();
  actions.onboarding.mockResolvedValue({ ...receipt, tutorial: 'active' });
  await controller.enter();
  await controller.refresh(undefined, 'continue');
  actions.onboarding.mockResolvedValue({ ...receipt, completed: true, tutorial: 'active' });
  await controller.refresh();
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: false,
    receipt: { completed: true },
  });
});
