// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  IconChevronDownOutlineRegular: () => null,
}));
import { createUserGuidePanel } from '../src/client/user-guide.js';
import { createHelpService } from '../src/client/help-service.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
it('opens the answer inline and supports collapsing the same question', () => {
  const help = createHelpService(() => () => {});
  help.register({
    id: 'test:help',
    topics: [
      {
        id: 'test:topic',
        title: { en: 'Models' },
        overview: { en: 'Models' },
        questions: [
          { id: 'test:model', title: { en: 'Change model?' }, answer: { en: 'Real picker' } },
        ],
      },
    ],
  });
  const panel = createUserGuidePanel(help, createDockPanelRegistry(), zhTranslate);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(panel.component, { channel: undefined })));
    const trigger = host.querySelector<HTMLButtonElement>('.bh-guide-question')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.bh-guide-answer')?.textContent).toContain('Real picker');
    act(() => trigger.click());
    expect(host.querySelector('.bh-guide-answer')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
