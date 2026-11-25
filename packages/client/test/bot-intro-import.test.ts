// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { OnboardingSnapshot } from '../../core/src/onboarding/types.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({ open, title, children }: PropsWithChildren<{ open: boolean; title: string }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children) : null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { BotIntro } from '../src/client/bot-intro.js';
import { zhTranslate } from '../src/client/locale.js';
import { INTRO_STEPS, onboardingFor } from '../src/client/onboarding.js';

const fresh: OnboardingSnapshot = {
  profileId: 'profile-import',
  completed: false,
  preparation: 'ready',
  tutorial: 'not-started',
  journey: { version: 2, done: false },
};

function actionsFor() {
  return {
    onboarding: vi.fn(async () => fresh),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(async () => ({ models: [] })),
    onboardingModel: vi.fn(async () => {}),
    telemetryEvent: vi.fn(),
  };
}

it('creates the planned Bots inside the intro, records the tool and moves on to Start', async () => {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const actions = {
    ...actionsFor(),
    importableSessions: vi.fn(async () => [
      {
        sessionId: 'codex:x1',
        source: { kind: 'native' },
        product: 'codex',
        folderName: 'w',
        cwd: '/w',
        workspacePath: '/w',
        running: false,
        lastPromptAt: 1,
        updatedAt: 1,
      },
    ]),
    addBotFromSessions: vi.fn(async () => ({})),
  } as unknown as BridgeActions;
  try {
    const controller = onboardingFor(actions);
    await controller.enter();
    controller.openIntro();
    await act(async () => root.render(createElement(BotIntro, { actions, t: zhTranslate })));
    await act(async () => controller.setIntroStep(INTRO_STEPS.indexOf('import')));
    await act(async () => {});
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('[data-import-source="codex"]')!.textContent).toContain(
      '找到 1 个会话',
    );
    await act(async () =>
      dialog.querySelector<HTMLButtonElement>('[data-import-source="codex"]')!.click(),
    );
    await act(async () =>
      dialog.querySelector<HTMLButtonElement>('[data-intro-import-create]')!.click(),
    );
    await act(async () => {});
    expect(actions.addBotFromSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'w',
        sessionIds: ['codex:x1'],
        workspacePaths: ['/w'],
      }),
    );
    expect(controller.getSnapshot().intro?.step).toBe(INTRO_STEPS.indexOf('start'));
    const events = (actions.telemetryEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(events).toContainEqual([
      'onboarding:import_source_select',
      { source: 'codex', detected: true },
    ]);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => controller.setIntroStep(INTRO_STEPS.indexOf('import')));
    await act(async () => {});
    expect(dialog.querySelector('[data-intro-import-plan]')).toBeNull();
    expect(dialog.querySelector('[data-intro-import-created]')!.textContent).toBe(
      '已创建 1 个 Bot，它们读完会话后会来自我介绍。',
    );
    expect(dialog.querySelector<HTMLButtonElement>('[data-import-source="codex"]')!.disabled).toBe(
      true,
    );
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
