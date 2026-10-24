// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  IconChevronDownOutlineRegular: () => null,
}));
vi.mock('../src/client/ds/select.js', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  }) =>
    createElement(
      'select',
      {
        'aria-label': label,
        value,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value),
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
}));
import type { HelpAvailability } from '../src/help-api.js';
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
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.bh-guide-topics button')];
    expect(chips.map((button) => button.textContent)).toEqual(['全部', 'Models']);
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    act(() => chips[1]!.click());
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true');
    act(() => chips[0]!.click());
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
    const trigger = host.querySelector<HTMLButtonElement>('.bh-guide-question')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.bh-guide-answer')?.textContent).toContain('Real picker');
    act(() => trigger.click());
    expect(host.querySelector('.bh-guide-answer')).toBeNull();
    act(() => help.show('test:model'));
    expect(host.querySelector('.bh-guide-answer')?.textContent).toContain('Real picker');
    act(() => host.querySelector<HTMLButtonElement>('.bh-guide-question')!.click());
    act(() => help.show('test:model'));
    expect(host.querySelector('.bh-guide-answer')?.textContent).toContain('Real picker');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('drops removed target choices and starts the remaining ready target', async () => {
  const help = createHelpService(() => () => {});
  let availability: HelpAvailability = {
    status: 'select',
    targets: [
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ],
  };
  let notify = () => {};
  const prepare = vi.fn(async () => ({ steps: [], dispose: () => {} }));
  help.register({
    id: 'test:help',
    topics: [
      {
        id: 'test:topic',
        title: { en: 'Panels' },
        overview: { en: 'Panels' },
        questions: [
          {
            id: 'test:panel',
            title: { en: 'Camera?' },
            answer: { en: 'Choose a camera' },
            guide: {
              availability: () => availability,
              subscribe(listener) {
                notify = listener;
                return () => {};
              },
              prepare,
            },
          },
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
    act(() => help.show('test:panel'));
    const choose = host.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      choose.value = 'second';
      choose.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(choose.value).toBe('second');
    act(() => {
      availability = {
        status: 'select',
        targets: [
          { id: 'first', label: 'First' },
          { id: 'third', label: 'Third' },
        ],
      };
      notify();
    });
    expect(choose.value).toBe('');
    expect(host.querySelector<HTMLButtonElement>('.bh-guide-actions button')!.disabled).toBe(true);
    act(() => {
      availability = { status: 'ready', target: { id: 'first', label: 'First' } };
      notify();
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.bh-guide-actions button')!.click(),
    );
    expect(prepare).toHaveBeenCalledWith('first', expect.any(AbortSignal));
    expect(help.state().phase).toBe('running');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
