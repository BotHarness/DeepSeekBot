// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props, children),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement('div', { role: 'dialog' }, children, footer),
}));

import type { PersonaBotDeletionPreview } from '../../core/src/bots/deletion.js';
import { createActions } from '../src/client/actions.js';
import { PersonaBotDeletionView } from '../src/client/personabot-deletion.js';
import { zhTranslate } from '../src/client/locale.js';
import { createStore } from '../src/client/store.js';

const preview: PersonaBotDeletionPreview = {
  slug: 'ada',
  displayName: 'Ada',
  memoryDir: '/managed/ada/memory',
  token: 'reviewed',
  eraseAvailable: true,
  dependencies: {
    sessions: ['native-session'],
    workspaces: [],
    grants: [],
    identities: [],
    channels: ['dm-ada'],
  },
};

async function fixture() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: {} }), createStore()),
    deletionPreview: vi.fn(async () => preview),
    deletionConfirm: vi.fn(async () => {
      throw new Error('Scope changed; review again');
    }),
    deletionFolderOpen: vi.fn(async () => undefined),
  };
  let root = createRoot(host);
  async function render() {
    await act(async () => {
      root.render(
        createElement(PersonaBotDeletionView, {
          slug: 'ada',
          actions,
          t: zhTranslate,
          onClose: vi.fn(),
        }),
      );
    });
  }
  async function unmount() {
    await act(async () => root.unmount());
  }
  await render();
  function checkbox() {
    const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (input === null) throw new Error('Memory choice missing');
    return input;
  }
  async function click(label: string) {
    const button = Array.from(host.querySelectorAll('button')).find(
      (item) => item.textContent === label,
    );
    if (button === undefined) throw new Error(`Button missing: ${label}`);
    await act(async () => button.click());
  }
  return {
    host,
    actions,
    checkbox,
    click,
    dispose: async () => {
      await unmount();
      host.remove();
    },
    reopen: async () => {
      await unmount();
      root = createRoot(host);
      await render();
    },
  };
}

describe('PersonaBot deletion Memory consent', () => {
  it('leads with what stops and lists each notice as its own card', async () => {
    const f = await fixture();
    try {
      expect(f.host.querySelector('.bh-bot-deletion-lead')?.textContent).toBe(
        '删除后，Ada 会永久停止运行，无法撤销。',
      );
      const titles = Array.from(f.host.querySelectorAll('.bh-bot-deletion-notice-title')).map(
        (node) => node.textContent,
      );
      expect(titles).toEqual(['密钥会立即删除', '运行和授权会停止', '历史会保留', '记忆文件']);
      expect(f.host.textContent).toContain('1 个会话停止运行，0 项授权与身份绑定被撤销。');
    } finally {
      await f.dispose();
    }
  });

  it('starts unchecked, opening the folder does not opt in, and reopening resets a previous choice', async () => {
    const f = await fixture();
    try {
      expect(f.checkbox().checked).toBe(false);
      await f.click('打开记忆文件夹');
      expect(f.actions.deletionFolderOpen).toHaveBeenCalledWith('ada');
      expect(f.checkbox().checked).toBe(false);
      await act(async () => f.checkbox().click());
      expect(f.checkbox().checked).toBe(true);
      await f.reopen();
      expect(f.checkbox().checked).toBe(false);
      expect(f.actions.deletionConfirm).not.toHaveBeenCalled();
    } finally {
      await f.dispose();
    }
  });

  it('sends the checked scope once and resets consent after a rejected confirmation', async () => {
    const f = await fixture();
    try {
      await act(async () => f.checkbox().click());
      await f.click('删除 Bot 和记忆文件');
      expect(f.actions.deletionConfirm).toHaveBeenCalledWith('ada', 'reviewed', true);
      expect(f.checkbox().checked).toBe(false);
      expect(f.host.querySelector('[role="alert"]')?.textContent).toBe(
        'Scope changed; review again',
      );
      await f.click('删除 Bot，保留记忆');
      expect(f.actions.deletionConfirm).toHaveBeenLastCalledWith('ada', 'reviewed', false);
    } finally {
      await f.dispose();
    }
  });
});
