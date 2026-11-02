// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import type { ApprovalRequest, DecisionResult, QuestionRequest } from '../src/host/requests';
import { ApprovalView, type ApprovalPort } from '../src/ui/approval-view';
import type { HumanAttentionItem } from '../src/host/wire';
import { JoinRequestView } from '../src/ui/attention-view';
import { ApprovalCard } from '../src/ui/chat/approval-card';
import { GrantRequestCard, type GrantRequestPort } from '../src/ui/chat/grant-request-card';
import { QuestionCard } from '../src/ui/chat/question-card';
import { QuestionView, type QuestionPort } from '../src/ui/question-view';
import { t } from '../src/ui/strings';
import { setHapticsEnabled } from '../src/ui/haptics';
import { played } from './expo-haptics-shim';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const approval: ApprovalRequest = {
  channelId: 'dm-ada',
  messageId: 'approval-1',
  botSlug: 'ada',
  toolName: 'bash',
  role: 'orchestrator',
  cwd: '/project',
  input: '{"command":"ls"}',
  allowAlways: true,
  status: 'pending',
};
const question: QuestionRequest = {
  channelId: 'dm-ada',
  messageId: 'question-1',
  botSlug: 'ada',
  status: 'pending',
  questions: [{ id: 'choice', question: 'Choose a folder', options: [{ label: 'Project' }] }],
};

function deferred() {
  let resolve!: (value: DecisionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<DecisionResult>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

let root: Root | undefined;
let container: HTMLElement;
afterEach(() => {
  setHapticsEnabled(true);
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  played.length = 0;
});

async function render(element: ReactElement) {
  if (root === undefined) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(element));
}

function button(label: string) {
  const target = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (target === null) throw new Error(`Missing button ${label}`);
  return target;
}

const approvalSurfaces = [
  {
    name: 'approval screen',
    element: (port: ApprovalPort) => createElement(ApprovalView, { port, botName: 'Ada' }),
  },
  { name: 'approval card', element: (port: ApprovalPort) => createElement(ApprovalCard, { port }) },
];

for (const surface of approvalSurfaces) {
  describe(surface.name, () => {
    it.each([t.allowOnce, t.alwaysAllow, t.reject])(
      'keeps %s functional with feedback off',
      async (label) => {
        setHapticsEnabled(false);
        const port = {
          load: vi.fn(async () => approval),
          decide: vi.fn(async () => 'accepted' as const),
        };
        await render(surface.element(port));
        await act(async () => button(label).click());
        expect(port.decide).toHaveBeenCalledTimes(1);
        expect(played).toEqual([]);
      },
    );

    for (const choice of [
      { label: t.allowOnce, outcome: 'allowed-once', feedback: 'notification:success' },
      { label: t.alwaysAllow, outcome: 'allowed-always-tool', feedback: 'notification:success' },
      { label: t.reject, outcome: 'rejected', feedback: 'notification:warning' },
    ]) {
      it(`acknowledges ${choice.label} only after acceptance and suppresses same-render duplicates`, async () => {
        const response = deferred();
        const port = { load: vi.fn(async () => approval), decide: vi.fn(() => response.promise) };
        await render(surface.element(port));
        const target = button(choice.label);
        await act(async () => {
          target.click();
          target.click();
          button(t.reject).click();
        });
        expect(port.decide).toHaveBeenCalledTimes(1);
        expect(port.decide).toHaveBeenCalledWith(choice.outcome);
        expect(target.disabled).toBe(true);
        expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
        expect(played).toEqual([]);
        await act(async () => response.resolve('accepted'));
        expect(played).toEqual([choice.feedback]);
      });
    }

    for (const result of ['decided', 'expired'] as const) {
      it(`does not acknowledge a ${result} refusal`, async () => {
        const response = deferred();
        const port = { load: vi.fn(async () => approval), decide: vi.fn(() => response.promise) };
        await render(surface.element(port));
        await act(async () => button(t.allowOnce).click());
        await act(async () => response.resolve(result));
        expect(played).toEqual([]);
        expect(container.textContent).toContain(
          result === 'expired'
            ? surface.name === 'approval screen'
              ? t.expired
              : t.cardExpired
            : surface.name === 'approval screen'
              ? t.alreadyDecided
              : t.cardDecided,
        );
      });
    }

    it('keeps failure visible and permits a single retry', async () => {
      const response = deferred();
      const port = { load: vi.fn(async () => approval), decide: vi.fn(() => response.promise) };
      await render(surface.element(port));
      await act(async () => button(t.allowOnce).click());
      await act(async () => response.reject(new Error('Connection lost')));
      expect(played).toEqual([]);
      expect(container.textContent).toContain('Connection lost');
      port.decide.mockImplementation(async () => 'accepted');
      await act(async () => {
        button(t.reject).click();
        button(t.reject).click();
      });
      expect(port.decide).toHaveBeenCalledTimes(2);
      expect(played).toEqual(['notification:warning']);
    });

    it.each(['accepted', 'decided', 'expired', 'failed'] as const)(
      'does not let a late %s decision settle another request',
      async (result) => {
        const response = deferred();
        const original = {
          load: vi.fn(async () => approval),
          decide: vi.fn(() => response.promise),
        };
        const next = {
          load: vi.fn(async () => ({ ...approval, messageId: 'approval-2', toolName: 'read' })),
          decide: vi.fn(async () => 'accepted' as const),
        };
        await render(surface.element(original));
        await act(async () => button(t.allowOnce).click());
        await render(surface.element(next));
        await act(async () => {
          if (result === 'failed') response.reject(new Error('Original request failed'));
          else response.resolve(result);
        });
        expect(played).toEqual([]);
        expect(button(t.allowOnce).disabled).toBe(false);
        await act(async () => button(t.allowOnce).click());
        expect(next.decide).toHaveBeenCalledTimes(1);
        expect(played).toEqual(['notification:success']);
      },
    );

    it('ignores acceptance after unmount', async () => {
      const response = deferred();
      await render(surface.element({ load: async () => approval, decide: () => response.promise }));
      await act(async () => button(t.allowOnce).click());
      act(() => root!.unmount());
      root = undefined;
      await act(async () => response.resolve('accepted'));
      expect(played).toEqual([]);
    });
  });
}

const questionSurfaces = [
  {
    name: 'question screen',
    element: (port: QuestionPort) => createElement(QuestionView, { port, botName: 'Ada' }),
    prepare: async () => {
      await act(async () => button('Project').click());
    },
    label: t.submit,
  },
  {
    name: 'question card',
    element: (port: QuestionPort) => createElement(QuestionCard, { port, botName: 'Ada' }),
    prepare: async () => undefined,
    label: t.option('A', 'Project'),
  },
];

for (const surface of questionSurfaces) {
  describe(surface.name, () => {
    for (const enabled of [true, false]) {
      it(`submits a custom answer once with haptics ${enabled ? 'on' : 'off'}`, async () => {
        setHapticsEnabled(enabled);
        const response = deferred();
        const port = { load: vi.fn(async () => question), answer: vi.fn(() => response.promise) };
        await render(surface.element(port));
        const field = container.querySelector<HTMLTextAreaElement>('textarea')!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
            field,
            'My own answer',
          );
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const target = button(surface.name === 'question card' ? t.submitChoice : t.submit);
        await act(async () => {
          target.click();
          target.click();
        });
        expect(port.answer).toHaveBeenCalledExactlyOnceWith({
          answers: [{ id: 'choice', selected: [], custom: 'My own answer' }],
        });
        expect(played).toEqual([]);
        await act(async () => response.resolve('accepted'));
        expect(played).toEqual(enabled ? ['impact:light'] : []);
      });
    }

    for (const result of ['accepted', 'decided', 'expired'] as const) {
      it(`waits for the ${result} response without duplicate answer submission`, async () => {
        const response = deferred();
        const port = { load: vi.fn(async () => question), answer: vi.fn(() => response.promise) };
        await render(surface.element(port));
        await surface.prepare();
        const target = button(surface.label);
        await act(async () => {
          target.click();
          target.click();
        });
        expect(port.answer).toHaveBeenCalledTimes(1);
        expect(target.disabled).toBe(true);
        expect(played).toEqual([]);
        expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
        await act(async () => response.resolve(result));
        expect(played).toEqual(result === 'accepted' ? ['impact:light'] : []);
      });
    }

    it('keeps failed answers retryable without confirming failure', async () => {
      const response = deferred();
      const port = { load: vi.fn(async () => question), answer: vi.fn(() => response.promise) };
      await render(surface.element(port));
      await surface.prepare();
      await act(async () => button(surface.label).click());
      await act(async () => response.reject(new Error('Connection lost')));
      expect(played).toEqual([]);
      expect(container.textContent).toContain('Connection lost');
      port.answer.mockImplementation(async () => 'accepted');
      await act(async () => {
        button(surface.label).click();
        button(surface.label).click();
      });
      expect(port.answer).toHaveBeenCalledTimes(2);
      expect(played).toEqual(['impact:light']);
    });

    it.each(['accepted', 'decided', 'expired', 'failed'] as const)(
      'ignores a late %s answer when the request changes',
      async (result) => {
        const response = deferred();
        const original = { load: async () => question, answer: () => response.promise };
        const next = {
          load: async () => ({ ...question, messageId: 'question-2' }),
          answer: vi.fn(async () => 'accepted' as const),
        };
        await render(surface.element(original));
        await surface.prepare();
        await act(async () => button(surface.label).click());
        await render(surface.element(next));
        await act(async () => {
          if (result === 'failed') response.reject(new Error('Original request failed'));
          else response.resolve(result);
        });
        expect(played).toEqual([]);
        await surface.prepare();
        await act(async () => button(surface.label).click());
        expect(next.answer).toHaveBeenCalledTimes(1);
        expect(played).toEqual(['impact:light']);
      },
    );

    it('ignores acceptance after unmount', async () => {
      const response = deferred();
      await render(surface.element({ load: async () => question, answer: () => response.promise }));
      await surface.prepare();
      await act(async () => button(surface.label).click());
      act(() => root!.unmount());
      root = undefined;
      await act(async () => response.resolve('accepted'));
      expect(played).toEqual([]);
    });
  });
}

const folder = { id: 'workspace-project', title: 'Project', path: '/project' };
function grantPort(answer: () => Promise<DecisionResult>): GrantRequestPort {
  return {
    load: async () => ({ ...approval, status: 'pending', reason: 'Write report' }),
    approve: vi.fn(answer),
    loadWorkspaceOptions: async () => [],
    listFolders: async () => ({
      path: folder.path,
      crumbs: [{ name: folder.title, path: folder.path, hidden: false }],
      entries: [],
      roots: [],
      truncated: false,
    }),
    resolveFolder: async () => folder,
  };
}

async function prepareGrant() {
  await act(async () => button(t.grantChoose).click());
  await act(async () => button(t.authorizeHere).click());
}

describe('folder grant feedback', () => {
  for (const result of ['accepted', 'decided', 'expired'] as const) {
    it(`waits for ${result} and submits only once`, async () => {
      const response = deferred();
      const port = grantPort(() => response.promise);
      await render(createElement(GrantRequestCard, { port, botName: 'Ada' }));
      await prepareGrant();
      const target = button(t.grantAllow);
      await act(async () => {
        target.click();
        target.click();
      });
      expect(port.approve).toHaveBeenCalledTimes(1);
      expect(target.disabled).toBe(true);
      expect(played).toEqual([]);
      await act(async () => response.resolve(result));
      expect(played).toEqual(result === 'accepted' ? ['notification:success'] : []);
    });
  }

  it('preserves picker errors and allows retry', async () => {
    const response = deferred();
    const port = grantPort(
      vi
        .fn()
        .mockImplementationOnce(() => response.promise)
        .mockResolvedValue('accepted'),
    );
    await render(createElement(GrantRequestCard, { port, botName: 'Ada' }));
    await prepareGrant();
    await act(async () => button(t.grantAllow).click());
    await act(async () => response.reject(new Error('Connection lost')));
    expect(container.textContent).toContain('Connection lost');
    expect(played).toEqual([]);
    await act(async () => button(t.grantAllow).click());
    expect(port.approve).toHaveBeenCalledTimes(2);
    expect(played).toEqual(['notification:success']);
  });

  it('does not settle a replacement grant from a late response', async () => {
    const response = deferred();
    const original = grantPort(() => response.promise);
    const next = grantPort(async () => 'accepted');
    await render(createElement(GrantRequestCard, { port: original, botName: 'Ada' }));
    await prepareGrant();
    await act(async () => button(t.grantAllow).click());
    await render(createElement(GrantRequestCard, { port: next, botName: 'Ada' }));
    await act(async () => response.resolve('accepted'));
    expect(played).toEqual([]);
    expect(button(t.grantChoose).disabled).toBe(false);
  });
});

const join: HumanAttentionItem = {
  id: 'join-1',
  category: 'action',
  kind: 'group-join-request',
  createdAt: '2026-10-23T00:00:00Z',
  botSlug: 'ada',
  summary: 'Join project',
  channelName: 'Project',
};

describe('attention decision feedback', () => {
  for (const accept of [true, false]) {
    it(`acknowledges ${accept ? 'accept' : 'decline'} only after the action succeeds`, async () => {
      const response = deferred();
      const port = {
        decide: vi.fn(async () => {
          await response.promise;
        }),
      };
      await render(createElement(JoinRequestView, { port, item: join, botName: 'Ada' }));
      const target = button(accept ? t.joinAccept : t.joinDecline);
      await act(async () => {
        target.click();
        target.click();
      });
      expect(port.decide).toHaveBeenCalledTimes(1);
      expect(port.decide).toHaveBeenCalledWith(accept);
      expect(target.disabled).toBe(true);
      expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
      expect(played).toEqual([]);
      await act(async () => response.resolve('accepted'));
      expect(played).toEqual([accept ? 'notification:success' : 'notification:warning']);
    });
  }

  it('does not acknowledge a failed decision and permits retry', async () => {
    const response = deferred();
    const port = {
      decide: vi.fn(async () => {
        await response.promise;
      }),
    };
    await render(createElement(JoinRequestView, { port, item: join, botName: 'Ada' }));
    await act(async () => button(t.joinAccept).click());
    await act(async () => response.reject(new Error('Connection lost')));
    expect(container.textContent).toContain('Connection lost');
    expect(played).toEqual([]);
    port.decide.mockImplementation(async () => undefined);
    await act(async () => button(t.joinDecline).click());
    expect(played).toEqual(['notification:warning']);
  });

  it('does not let a late result settle another attention item', async () => {
    const response = deferred();
    const after = vi.fn();
    const original = {
      decide: async () => {
        await response.promise;
      },
    };
    const next = { decide: vi.fn(async () => undefined) };
    await render(
      createElement(JoinRequestView, { port: original, item: join, botName: 'Ada', after }),
    );
    await act(async () => button(t.joinAccept).click());
    await render(
      createElement(JoinRequestView, {
        port: next,
        item: { ...join, id: 'join-2' },
        botName: 'Ada',
        after,
      }),
    );
    await act(async () => response.resolve('accepted'));
    expect(played).toEqual([]);
    expect(after).not.toHaveBeenCalled();
    await act(async () => button(t.joinDecline).click());
    expect(next.decide).toHaveBeenCalledTimes(1);
  });

  it('ignores completion after the attention item unmounts', async () => {
    const response = deferred();
    const after = vi.fn();
    const port = {
      decide: async () => {
        await response.promise;
      },
    };
    await render(createElement(JoinRequestView, { port, item: join, botName: 'Ada', after }));
    await act(async () => button(t.joinAccept).click());
    act(() => root!.unmount());
    root = undefined;
    await act(async () => response.resolve('accepted'));
    expect(after).not.toHaveBeenCalled();
    expect(played).toEqual([]);
  });
});
