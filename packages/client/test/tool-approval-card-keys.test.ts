// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { approvalCountdown } from '../src/client/approval-countdown.js';
import {
  approvalFileChange,
  approvalShellCommand,
  diffLines,
} from '../src/client/approval-diff.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, variant: _variant, ...props }: { children: ReactNode; variant?: string }) =>
    createElement('button', props, children),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

const message = (toolName = 'bash', input = '{"command":"echo QA"}'): ChannelMessage =>
  ({
    id: 'request',
    at: '2026-10-14T08:00:00Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'Approve',
    toolApprovalRequest: {
      sessionId: 'session',
      callId: 'call',
      toolName,
      role: 'orchestrator',
      cwd: '/qa',
      input,
    },
  }) as ChannelMessage;

let root: Root;
let node: HTMLDivElement;
let decisions: string[];
let expiresAt: string | undefined;

const actions = (): BridgeActions =>
  ({
    toolApprovalStatus: async () => (decisions.length === 0 ? 'pending' : 'expired'),
    toolApprovalState: async () =>
      decisions.length === 0 ? { status: 'pending', expiresAt } : { status: 'expired' },
    decideToolApproval: async (_channel: string, _message: string, outcome: string) => {
      decisions.push(outcome);
    },
  }) as unknown as BridgeActions;

const render = async (value: ChannelMessage = message()): Promise<HTMLElement> => {
  await act(async () => {
    root.render(
      createElement(ToolApprovalCard, { message: value, actions: actions(), t: zhTranslate }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return node.querySelector<HTMLElement>('.bh-tool-approval-card')!;
};

const press = async (target: HTMLElement, key: string): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  store.select({ kind: 'inbox' });
  decisions = [];
  expiresAt = undefined;
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});

afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.useRealTimers();
});

describe('Tool approval card layout', () => {
  it('leads with the key phrase and keeps details, extra choices and key hints out of the way', async () => {
    const card = await render(
      message(
        'edit',
        JSON.stringify({ file_path: '/qa/notes.md', old_string: 'a', new_string: 'b' }),
      ),
    );
    expect(card.querySelector('.bh-request-category')?.textContent).toBe('文件');
    expect(card.querySelector('.bh-request-pill')?.textContent).toBe('需要你确认');
    expect(card.querySelector('.bh-tool-approval-sentence')?.textContent).toBe('修改文件');
    expect(card.querySelector('.bh-tool-approval-line')?.textContent).toBe('/qa/notes.md +1 −1');
    expect(card.querySelector('.bh-request-summary')?.getAttribute('aria-expanded')).toBe('false');
    expect(card.querySelector('.bh-tool-approval-details-body')).toBeNull();
    expect(card.querySelector('details')).toBeNull();
    expect(
      [...card.querySelectorAll('.bh-tool-approval-card > .bh-tool-approval-actions button')].map(
        (button) => button.textContent,
      ),
    ).toEqual(['仅批准这一次', '始终允许相同调用', '始终允许此范围全部不透明工具', '拒绝']);
    expect(card.querySelector('kbd')).toBeNull();
  });
  it('previews the new Bot on a bot_create card', async () => {
    const value = message(
      'bot_create',
      JSON.stringify({
        display_name: 'Tim',
        description: '翻译发布说明',
        tags: ['translator', 'zh-en'],
        soul: '# Tim\n冷静\n准确\n第四行',
        memory_location: '/data/bots',
      }),
    );
    value.toolApprovalRequest!.botCreatePreview = {
      memoryFolder: '/data/bots/<new-bot-id>',
      defaultLocation: false,
    };
    const card = await render(value);
    expect(card.querySelector('.bh-request-category')?.textContent).toBe('新 Bot');
    expect(card.querySelector('.bh-tool-approval-sentence')?.textContent).toBe('创建 Bot「Tim」');
    const preview = card.querySelector('.bh-bot-create-preview')!;
    expect(preview.querySelector('.bh-bot-create-name')?.textContent).toBe('Tim');
    expect(preview.querySelector('.bh-bot-create-bio')?.textContent).toBe('翻译发布说明');
    expect(preview.textContent).toContain('translator');
    expect(preview.textContent).toContain('zh-en');
    const excerpts = [...preview.querySelectorAll('.bh-bot-create-excerpt')];
    expect(excerpts.map((item) => item.textContent)).toEqual(['# Tim\n冷静\n准确\n…']);
    expect(preview.textContent).toContain('使用默认的核心记忆模板');
    expect(preview.querySelector('.bh-bot-create-path')?.textContent).toBe(
      '/data/bots/<new-bot-id>',
    );
  });

  it('opens and closes the details from anywhere on the card except its buttons', async () => {
    const card = await render();
    await act(async () => card.querySelector<HTMLElement>('.bh-request-head')!.click());
    expect(card.querySelector('.bh-tool-approval-details-body')?.textContent).toContain('/qa');
    expect(card.querySelector('.bh-request-summary')?.getAttribute('aria-expanded')).toBe('true');
    await act(async () =>
      card.querySelector<HTMLElement>('.bh-tool-approval-details-body .bh-note')!.click(),
    );
    expect(card.querySelector('.bh-tool-approval-details-body')).not.toBeNull();
    await act(async () => card.querySelector<HTMLButtonElement>('.bh-request-summary')!.click());
    expect(card.querySelector('.bh-tool-approval-details-body')).toBeNull();
    await act(async () =>
      card
        .querySelector<HTMLButtonElement>('.bh-tool-approval-actions .bh-request-secondary')!
        .click(),
    );
    expect(card.querySelector('.bh-tool-approval-details-body')).toBeNull();
  });
  it('collapses to the category and outcome once decided', async () => {
    const card = await render();
    await press(card, 'n');
    await act(async () => {
      await Promise.resolve();
    });
    expect(card.querySelector('.bh-tool-approval-sentence')).toBeNull();
    expect(card.querySelector('.bh-tool-approval-details-body')).toBeNull();
    expect(card.querySelector('button')).toBeNull();
    expect(card.textContent).toBe('终端 · 已拒绝');
  });
});

describe('Tool approval card keyboard', () => {
  it('focuses a new pending card and allows it once with Y or Enter', async () => {
    const card = await render();
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute('aria-keyshortcuts')).toContain('Y');
    await press(card, 'Enter');
    expect(decisions).toEqual(['allowed-once']);
  });

  it.each(['n', 'Escape'])('rejects with %s', async (key) => {
    const card = await render();
    await press(card, key);
    expect(decisions).toEqual(['rejected']);
  });

  it('keeps the risk confirmation behind A and backs out with Escape', async () => {
    const card = await render();
    await press(card, 'a');
    expect(decisions).toEqual([]);
    expect(card.querySelector('[role="group"]')?.textContent).toContain('确认始终允许');
    await press(card, 'Escape');
    expect(card.querySelector('[role="group"]')).toBeNull();
    expect(decisions).toEqual([]);
  });

  it('ignores keys with modifiers and keys typed into fields', async () => {
    const card = await render();
    await act(async () => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    });
    const input = document.createElement('input');
    card.append(input);
    await press(input, 'y');
    expect(decisions).toEqual([]);
  });

  it('does not take focus from a field the Human is typing in', async () => {
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    await render();
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});

describe('Tool approval countdown', () => {
  it('labels the time left and turns urgent in the last 15 minutes', () => {
    const now = Date.parse('2026-10-14T08:00:00Z');
    expect(approvalCountdown('2026-10-15T08:00:00Z', now)).toMatchObject({
      key: 'approval.expiresInHours',
      count: 24,
      urgent: false,
    });
    expect(approvalCountdown('2026-10-14T08:12:30Z', now)).toMatchObject({
      key: 'approval.expiresInMinutes',
      count: 12,
      urgent: true,
    });
    expect(approvalCountdown('2026-10-14T08:00:30Z', now)).toMatchObject({
      key: 'approval.expiresSoon',
    });
    expect(approvalCountdown('2026-10-14T07:59:00Z', now)).toBeUndefined();
  });

  it('shows the countdown on a pending card', async () => {
    expiresAt = new Date(Date.now() + 12 * 60 * 1000 + 30_000).toISOString();
    const card = await render();
    await act(async () => {
      await Promise.resolve();
    });
    const label = card.querySelector('.bh-request-pill');
    expect(label?.textContent).toBe('12 分钟后过期');
    expect(label?.hasAttribute('data-urgent')).toBe(true);
  });
});

describe('Tool approval shell command', () => {
  it('shows the command as shell text with its description and folds a long one', async () => {
    const command =
      "printf '%s\\n' " + Array.from({ length: 80 }, (_, i) => `'line ${i}'`).join(' ');
    const card = await render(
      message('bash', JSON.stringify({ command, description: 'Write notes' })),
    );
    expect(card.querySelector('.bh-tool-approval-sentence')?.textContent).toBe('Write notes');
    expect(card.querySelector('.bh-tool-approval-line')?.textContent).toBe(command);
    expect(card.querySelector('.bh-tool-approval-shell figcaption')).toBeNull();
    expect(card.querySelector('.bh-tool-approval-shell')).toBeNull();
    await act(async () => card.querySelector<HTMLButtonElement>('.bh-request-summary')!.click());
    const pre = card.querySelector('.bh-tool-approval-shell pre')!;
    expect(pre.textContent).toContain("printf '%s\\n'");
    expect(pre.textContent).not.toContain('"command"');
    expect(pre.textContent!.endsWith('…')).toBe(true);
    await act(async () => card.querySelector<HTMLButtonElement>('.bh-tool-approval-fold')!.click());
    expect(pre.textContent).toContain("'line 79'");
  });
});

describe('Tool approval file diff', () => {
  it('diffs an edit line by line', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'context', text: 'c' },
      { kind: 'add', text: 'd' },
    ]);
  });

  it('reads native write, edit and str_replace_editor inputs', () => {
    expect(
      approvalFileChange('write', JSON.stringify({ file_path: 'a.ts', content: 'x\ny\n' })),
    ).toMatchObject({ path: 'a.ts', added: 2, removed: 0 });
    expect(
      approvalFileChange(
        'edit',
        JSON.stringify({ file_path: 'b.ts', old_string: 'one', new_string: 'two' }),
      ),
    ).toMatchObject({ path: 'b.ts', added: 1, removed: 1 });
    expect(
      approvalFileChange(
        'str_replace_editor',
        JSON.stringify({ command: 'str_replace', path: 'c.ts', old_str: 'x', new_str: 'y' }),
      ),
    ).toMatchObject({ path: 'c.ts', added: 1, removed: 1 });
    expect(approvalFileChange('bash', '{"command":"ls"}')).toBeUndefined();
    expect(approvalShellCommand('bash', '{"command":"ls -la","description":"List"}')).toEqual({
      command: 'ls -la',
      description: 'List',
    });
    expect(approvalShellCommand('edit', '{"command":"ls"}')).toBeUndefined();
    expect(approvalFileChange('edit', 'not json')).toBeUndefined();
  });

  it('renders the diff and folds long input', async () => {
    const content = Array.from({ length: 30 }, (_, index) => 'line ' + index).join('\n');
    const card = await render(
      message('write', JSON.stringify({ file_path: '/qa/notes.md', content }, null, 2)),
    );
    await act(async () => card.querySelector<HTMLButtonElement>('.bh-request-summary')!.click());
    expect(card.querySelector('figcaption')?.textContent).toBe('/qa/notes.md+30−0');
    expect(card.querySelectorAll('.bh-tool-approval-diff-line')).toHaveLength(12);
    const toggle = card.querySelector<HTMLButtonElement>('.bh-tool-approval-fold')!;
    expect(toggle.textContent).toBe('展开全部');
    await act(async () => toggle.click());
    expect(card.querySelectorAll('.bh-tool-approval-diff-line')).toHaveLength(30);
  });
});
