// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    icon?: ReactNode;
    children: ReactNode;
  }) => createElement('button', props, icon, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  MarkdownText: () => null,
  StateDot: () => null,
  Tag: ({ children }: { children: ReactNode }) => createElement('span', {}, children),
  Modal: () => null,
  Switch: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconInfoOutlineRegular: () => null,
  IconCheckOutlineRegular: () => null,
  Tooltip: ({ children, label }: { children: ReactNode; label: string }) =>
    createElement('span', { 'data-help-text': label }, children),
  IconFolderOpenOutlineRegular: () => null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { ChannelMessageBody, MessageDeveloperMode } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';

const channel = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};
const message: ChannelMessage = {
  id: 'question-1',
  at: '2026-09-25T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Which branch?',
  userQuestionRequest: {
    sessionId: 'orchestrator-1',
    questions: [
      {
        id: 'memory-branch',
        question: 'Which Memory branch should I switch to?',
        options: [{ label: 'main' }, { label: 'history-qa' }],
      },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;
let previous: ReturnType<typeof store.getSnapshot>['conversation'];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  previous = store.getSnapshot().conversation;
  store.setConversation({ status: 'ready', channel, messages: [message], revision: 1 });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  store.setConversation(previous);
});

function render(
  actions: BridgeActions,
  resolution?: 'answered' | 'cancelled',
  card: ChannelMessage = message,
  developerMode = false,
) {
  root.render(
    createElement(
      MessageDeveloperMode.Provider,
      { value: developerMode },
      createElement(ChannelMessageBody, {
        message: card,
        actions,
        t: zhTranslate,
        userQuestionResolution: resolution,
      }),
    ),
  );
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((entry) =>
    entry.textContent?.includes(text),
  );
}

describe('private input card', () => {
  const card: ChannelMessage = {
    id: 'private-request',
    at: message.at,
    author: message.author,
    body: 'Authenticate the controlled service',
    privateInputRequest: {
      sessionId: 'orchestrator-1',
      account: 'controlled',
      purpose: 'Authenticate the controlled service',
      fields: [
        { id: 'key', label: 'API key', required: true },
        { id: 'secret', label: 'API secret', required: true },
      ],
    },
  };
  it('offers replacement and revocation without restoring inputs and ignores a stale configured poll after revocation', async () => {
    vi.useFakeTimers();
    try {
      let stale!: (value: { status: 'configured'; references: Record<string, string> }) => void;
      const actions = {
        privateInputStatus: vi.fn().mockResolvedValue('configured'),
        privateAccountStatus: vi
          .fn()
          .mockResolvedValueOnce({ status: 'configured', references: {} })
          .mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                stale = resolve;
              }),
          )
          .mockResolvedValue({ status: 'revoked', references: {} }),
        privateInputReplace: vi.fn().mockResolvedValue(undefined),
        privateAccountRevoke: vi
          .fn()
          .mockResolvedValue({ accepted: true, stopped: 1, completed: 0, uncertain: 0 }),
      } as unknown as BridgeActions;
      await act(async () => render(actions, undefined, card));
      expect(container.querySelector('input')).toBeNull();
      expect(button('替换')?.textContent).toBe('替换');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      await act(async () => button('撤销')?.click());
      await act(async () => stale({ status: 'configured', references: {} }));
      expect(button('替换')).toBeUndefined();
      expect(container.textContent).toContain('本地访问已撤销');
      expect(container.textContent).toContain('已停止 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('converges a duplicate-tab revocation refusal to the canonical terminal state', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValue('configured'),
      privateAccountStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: 'configured', references: {} })
        .mockResolvedValue({ status: 'revoked', references: {} }),
      privateAccountRevoke: vi.fn().mockRejectedValue(new Error('already changed')),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    await act(async () => button('撤销')?.click());
    expect(container.textContent).toContain('本地访问已撤销');
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(button('撤销')).toBeUndefined();
  });

  it('opens a blank replacement with the concise action without revoking the configured account', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValue('configured'),
      privateAccountStatus: vi.fn().mockResolvedValue({ status: 'configured', references: {} }),
      privateInputReplace: vi.fn().mockResolvedValue(undefined),
      privateAccountRevoke: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    expect(button('替换')?.textContent).toBe('替换');
    expect(button('撤销')?.textContent).toBe('撤销');
    await act(async () => button('替换')?.click());
    expect(actions.privateInputReplace).toHaveBeenCalledWith(channel.id, card.id);
    expect(actions.privateAccountRevoke).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  });

  it('keeps the account and state visible while supplementary details belong to an accessible help control', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValue('configured'),
      privateInputSubmit: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () =>
      render(actions, undefined, {
        ...card,
        privateInputRequest: {
          ...card.privateInputRequest!,
          expiresAt: '2026-10-11T08:30:00.000Z',
          replacesMessageId: 'previous-private-request',
        },
      }),
    );
    expect(container.textContent).toContain('controlled');
    expect(container.textContent).toContain('已提交');
    expect(container.textContent).not.toContain('仅 Host 保存原值');
    expect(container.textContent).not.toContain('旧值不会被取回');
    const help = container.querySelector<HTMLButtonElement>('button[aria-label="私密信息的说明"]');
    expect(help).not.toBeNull();
    expect(help?.getAttribute('type')).toBe('button');
    const details = help?.closest('[data-help-text]')?.getAttribute('data-help-text');
    expect(details).toContain('仅 Host 保存原值');
    expect(details).toContain('旧值不会被取回');
    expect(details).toContain('有效期至');
    await act(async () => help?.click());
    expect(actions.privateInputSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('已提交');
  });

  it('clears multiple private fields before awaiting the direct submission', async () => {
    let finish!: () => void;
    let submitted: Record<string, string> | undefined;
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValueOnce('pending').mockResolvedValue('configured'),
      privateInputSubmit: vi.fn((_channel, _message, values: Record<string, string>) => {
        submitted = { ...values };
        expect([...container.querySelectorAll('input')].every((input) => input.value === '')).toBe(
          true,
        );
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      }),
      answerUserQuestion: vi.fn(),
      send: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    const fields = [...container.querySelectorAll('input')];
    expect(fields.map((input) => input.type)).toEqual(['password', 'password']);
    fields[0]!.value = 'synthetic key';
    fields[1]!.value = '  synthetic secret  ';
    await act(async () => button('私密提交')?.click());
    expect(submitted).toEqual({ key: 'synthetic key', secret: '  synthetic secret  ' });
    expect(actions.answerUserQuestion).not.toHaveBeenCalled();
    expect(actions.send).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('已提交');
    expect(container.textContent).not.toContain('synthetic secret');
  });

  it('discards fields after a refused submit without displaying the remote error', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValue('pending'),
      privateInputSubmit: vi
        .fn()
        .mockRejectedValue(new Error('synthetic secret from unsafe upstream')),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    for (const input of container.querySelectorAll('input')) input.value = 'synthetic secret';
    await act(async () => button('私密提交')?.click());
    expect(actions.privateInputSubmit).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll('input')].every((input) => input.value === '')).toBe(
      true,
    );
    expect(container.textContent).toContain('未能完成请求');
    expect(container.textContent).not.toContain('synthetic secret');
  });

  it('converges a duplicate-tab refusal to configured without retaining an error', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValueOnce('pending').mockResolvedValue('configured'),
      privateInputSubmit: vi.fn().mockRejectedValue(new Error('Already settled')),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    for (const input of container.querySelectorAll('input')) input.value = 'synthetic secret';
    await act(async () => button('私密提交')?.click());
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('已提交');
    expect(container.textContent).not.toContain('未能完成请求');
    expect(container.textContent).not.toContain('synthetic secret');
  });

  it('keeps a committed terminal status when an older pending poll arrives later', async () => {
    vi.useFakeTimers();
    try {
      let stale!: (status: 'pending') => void;
      const actions = {
        privateInputStatus: vi
          .fn()
          .mockResolvedValueOnce('pending')
          .mockImplementationOnce(
            () =>
              new Promise<'pending'>((resolve) => {
                stale = resolve;
              }),
          )
          .mockResolvedValue('configured'),
        privateInputSubmit: vi.fn().mockResolvedValue(undefined),
      } as unknown as BridgeActions;
      await act(async () => render(actions, undefined, card));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      for (const input of container.querySelectorAll('input')) input.value = 'synthetic secret';
      await act(async () => button('私密提交')?.click());
      expect(container.textContent).toContain('已提交');
      await act(async () => stale('pending'));
      expect(container.querySelector('input')).toBeNull();
      expect(container.textContent).toContain('已提交');
      expect(container.textContent).not.toContain('synthetic secret');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores an old pending poll rejection after configured settlement', async () => {
    vi.useFakeTimers();
    try {
      let reject!: (error: Error) => void;
      const actions = {
        privateInputStatus: vi
          .fn()
          .mockResolvedValueOnce('pending')
          .mockImplementationOnce(
            () =>
              new Promise((_resolve, failure) => {
                reject = failure;
              }),
          )
          .mockResolvedValue('configured'),
        privateInputSubmit: vi.fn().mockResolvedValue(undefined),
      } as unknown as BridgeActions;
      await act(async () => render(actions, undefined, card));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      for (const input of container.querySelectorAll('input')) input.value = 'synthetic secret';
      await act(async () => button('私密提交')?.click());
      await act(async () => reject(new Error('Stale status failure')));
      expect(container.textContent).toContain('已提交');
      expect(container.textContent).not.toContain('未能完成请求');
      expect(container.querySelector('input')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a replacement form editable and does not let an old submit clear its fields', async () => {
    let finish!: () => void;
    const original = {
      privateInputStatus: vi.fn().mockResolvedValue('pending'),
      privateInputSubmit: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    } as unknown as BridgeActions;
    await act(async () => render(original, undefined, card));
    for (const input of container.querySelectorAll('input')) input.value = 'synthetic old secret';
    await act(async () => button('私密提交')?.click());
    const replacement = {
      privateInputStatus: vi.fn().mockResolvedValueOnce('pending').mockResolvedValue('configured'),
      privateInputSubmit: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    await act(async () => render(replacement, undefined, { ...card, id: 'replacement-card' }));
    expect(button('私密提交')?.disabled).toBe(false);
    const fields = [...container.querySelectorAll('input')];
    for (const input of fields) input.value = 'synthetic replacement secret';
    await act(async () => finish());
    expect(fields.every((input) => input.value === 'synthetic replacement secret')).toBe(true);
    await act(async () => button('私密提交')?.click());
    expect(replacement.privateInputSubmit).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('已提交');
    expect(fields.every((input) => input.value === '')).toBe(true);
  });

  it('clears cancelled fields and reloads an expired card as metadata only', async () => {
    const actions = {
      privateInputStatus: vi.fn().mockResolvedValueOnce('pending').mockResolvedValue('cancelled'),
      privateInputCancel: vi.fn().mockResolvedValue(undefined),
      privateInputSubmit: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => render(actions, undefined, card));
    const inputs = [...container.querySelectorAll('input')];
    for (const input of inputs) input.value = 'synthetic secret';
    await act(async () => button('取消')?.click());
    expect(actions.privateInputCancel).toHaveBeenCalledTimes(1);
    expect(inputs.every((input) => input.value === '')).toBe(true);
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('已取消');
    const expired = {
      privateInputStatus: vi.fn().mockResolvedValue('expired'),
    } as unknown as BridgeActions;
    await act(async () => render(expired, undefined, { ...card, id: 'lost-card' }));
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('已过期');
    expect(container.textContent).not.toContain('synthetic secret');
  });
});

describe('native question card interaction', () => {
  it('keeps a late answer submitted until the native Session admits it', async () => {
    vi.useFakeTimers();
    try {
      const actions = {
        userQuestionStatus: vi
          .fn()
          .mockResolvedValueOnce('pending')
          .mockResolvedValueOnce('submitted')
          .mockResolvedValue('answered'),
        answerUserQuestion: vi.fn().mockResolvedValue(undefined),
      } as unknown as BridgeActions;
      const card: ChannelMessage = {
        ...message,
        userQuestionRequest: { ...message.userQuestionRequest!, callId: 'original' },
      };
      await act(async () => render(actions, undefined, card));
      await act(async () => button('main')?.click());
      await act(async () => button('回答并继续')?.click());
      expect(container.textContent).toContain('已提交，等待会话接收');
      expect(container.textContent).not.toContain('已回答');
      expect(button('main')?.disabled).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(container.textContent).toContain('已回答');
      expect(actions.answerUserQuestion).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('submits the chosen branch and shows a durable answered state', async () => {
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    expect(actions.userQuestionStatus).toHaveBeenCalledWith('dm-ada', 'question-1');
    expect(container.querySelector('input[type=checkbox]')).toBeNull();
    await act(async () => button('main')?.click());
    await act(async () => button('history-qa')?.click());
    expect(button('main')?.getAttribute('aria-pressed')).toBe('false');
    expect(button('history-qa')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button('回答并继续')?.click());
    expect(actions.answerUserQuestion).toHaveBeenCalledWith('dm-ada', 'question-1', [
      { id: 'memory-branch', selected: ['history-qa'] },
    ]);
    expect(container.textContent).toContain('已回答');
    await act(async () => render(actions, 'answered'));
    expect(button('回答并继续')).toBeUndefined();
    expect(button('history-qa')?.disabled).toBe(true);
  });

  it('toggles multiple choices from the full label and submits only the checked answers', async () => {
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    const card: ChannelMessage = {
      ...message,
      userQuestionRequest: {
        sessionId: 'orchestrator-1',
        questions: [
          {
            id: 'topics',
            header: 'Digest',
            question: 'Which topics?',
            detail: 'Choose the topics you want to follow.',
            multiSelect: true,
            options: [
              { label: 'Science', description: 'Research and technology' },
              { label: 'Business', description: 'Companies and markets' },
              { label: 'Life' },
            ],
          },
        ],
      },
    };
    await act(async () => render(actions, undefined, card));
    const choices = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
    );
    const labels = Array.from(container.querySelectorAll<HTMLLabelElement>('label.bh-card-main'));
    expect(choices).toHaveLength(3);
    expect(container.querySelector('button input')).toBeNull();
    await act(async () => labels[0]?.click());
    await act(async () => labels[1]?.click());
    expect(choices.map((choice) => choice.checked)).toEqual([true, true, false]);
    await act(async () => labels[0]?.click());
    expect(choices.map((choice) => choice.checked)).toEqual([false, true, false]);
    const customInput = container.querySelector<HTMLInputElement>('input:not([type=checkbox])');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        customInput,
        'Design',
      );
      customInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.bh-question-source')).toBeNull();
    expect(container.textContent).not.toContain('Digest');
    expect(container.textContent).toContain('Choose the topics you want to follow.');
    expect(container.querySelector('.bh-question-custom')).toBeNull();
    expect(customInput?.getAttribute('aria-label')).toBe('其他回答');
    expect(customInput?.placeholder).toBe('其他回答（可选）');
    await act(async () => render(actions, undefined, card, true));
    expect(container.querySelector('.bh-question-source code')?.textContent).toBe('orchestrator-1');
    expect(container.textContent).toContain('Digest');
    await act(async () => render(actions, undefined, card, false));
    expect(container.querySelector('.bh-question-source')).toBeNull();
    expect(container.textContent).not.toContain('Digest');
    expect(customInput?.value).toBe('Design');
    expect(actions.userQuestionStatus).toHaveBeenCalledTimes(1);
    expect(choices[1]?.checked).toBe(true);
    await act(async () => button('回答并继续')?.click());
    expect(actions.answerUserQuestion).toHaveBeenCalledWith('dm-ada', 'question-1', [
      { id: 'topics', selected: ['Business'], custom: 'Design' },
    ]);
    expect(choices.every((choice) => choice.disabled)).toBe(true);
  });

  it('retries a failed status read without expiring a pending question', async () => {
    const actions = {
      userQuestionStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue('pending'),
      answerUserQuestion: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    expect(container.textContent).toContain('暂时无法确认提问状态');
    expect(button('回答并继续')).toBeUndefined();
    await act(async () => button('重试检查')?.click());
    expect(actions.userQuestionStatus).toHaveBeenCalledTimes(2);
    expect(button('回答并继续')).toBeDefined();
    expect(button('main')?.disabled).toBe(false);
  });

  it('accepts a custom branch answer and disables an expired question', async () => {
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      answerUserQuestion: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    await act(async () => render(actions));
    await act(async () => button('main')?.click());
    expect(button('main')?.getAttribute('aria-pressed')).toBe('true');
    const input = container.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'new-branch');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button('main')?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => button('回答并继续')?.click());
    expect(actions.answerUserQuestion).toHaveBeenCalledWith('dm-ada', 'question-1', [
      { id: 'memory-branch', selected: [], custom: 'new-branch' },
    ]);

    const expiredActions = {
      userQuestionStatus: vi.fn().mockResolvedValue('expired'),
      answerUserQuestion: vi.fn(),
    } as unknown as BridgeActions;
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => render(expiredActions));
    expect(container.textContent).toContain('此提问已失效');
    expect(button('回答并继续')).toBeUndefined();
    expect(button('main')?.disabled).toBe(true);
  });
});
