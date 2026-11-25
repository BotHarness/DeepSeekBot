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
import { onCreationRequest } from '../src/client/create-request.js';
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

it('starts an import from the intro, records the tool and opens the Session picker for it', async () => {
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
        cwd: '/w',
        workspacePath: '/w',
        running: false,
        lastPromptAt: 1,
        updatedAt: 1,
      },
    ]),
  } as unknown as BridgeActions;
  const intents: unknown[] = [];
  const stop = onCreationRequest((intent) => intents.push(intent));
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
      dialog.querySelector<HTMLButtonElement>('[data-intro-import-start]')!.click(),
    );
    expect(intents).toEqual([{ kind: 'bot-sessions', product: 'codex' }]);
    const events = (actions.telemetryEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(events).toContainEqual([
      'onboarding:import_source_select',
      { source: 'codex', detected: true },
    ]);
    expect(events.at(-1)).toEqual([
      'onboarding:intro_complete',
      {
        starter: 'import',
        product: 'codex',
        is_engineer: false,
        is_creator: false,
        is_operator: false,
        is_learner: false,
        has_detail: false,
      },
    ]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    stop();
    await act(() => root.unmount());
    node.remove();
  }
});
