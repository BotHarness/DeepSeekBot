// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import { Checkbox } from '../src/client/ds/checkbox.js';
import { SegmentedControl } from '../src/client/ds/segmented.js';
import { PillButton } from '../src/client/ds/pill-button.js';
import { Tag } from '../src/client/ds/tag.js';
import { Icon } from '../src/client/ds/icon.js';
import { buttonNamed } from './primitive-mocks.js';

import { EmptyState } from '../src/client/ds/empty-state.js';
import { NumberStepper } from '../src/client/ds/number-stepper.js';
import { Select } from '../src/client/ds/select.js';
import { SettingsRow, SettingsSection } from '../src/client/ds/settings-row.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function render(node: ReactNode): void {
  act(() => {
    root.render(node);
  });
}

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(input: HTMLInputElement, name: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  });
}

describe('SettingsRow', () => {
  it('names the row by its title and describes it by its one-line description', () => {
    render(
      createElement(SettingsSection, {
        title: 'Window',
        children: createElement(SettingsRow, {
          title: 'Speech sound',
          description: 'Plays a soft chirp.',
          control: createElement('button', { type: 'button' }, 'toggle'),
        }),
      }),
    );
    const section = host.querySelector('section')!;
    expect(document.getElementById(section.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Window',
    );
    const row = host.querySelector<HTMLElement>('[role="group"]')!;
    expect(document.getElementById(row.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Speech sound',
    );
    expect(document.getElementById(row.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Plays a soft chirp.',
    );
    expect(row.querySelector('button')?.textContent).toBe('toggle');
  });

  it('leaves out the description reference when there is none', () => {
    render(createElement(SettingsRow, { title: 'Git' }));
    expect(host.querySelector('[role="group"]')?.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Select', () => {
  it('shows the current choice and reports only a different pick', () => {
    const onChange = vi.fn();
    const props = {
      label: 'Sort',
      value: 'updated' as 'updated' | 'manual',
      options: [
        { value: 'updated' as const, label: 'Recently updated' },
        { value: 'manual' as const, label: 'Manual' },
      ],
      onChange,
    };
    render(createElement(Select<'updated' | 'manual'>, props));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Sort"]')!;
    expect(trigger.textContent).toBe('Recently updated');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['true', null]);
    act(() => options[0]!.click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => trigger.click());
    act(() => document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1]!.click());
    expect(onChange).toHaveBeenCalledWith('manual');
  });

  it('does not open while disabled', () => {
    render(
      createElement(Select<'a'>, {
        label: 'Locked',
        value: 'a',
        options: [{ value: 'a', label: 'A' }],
        onChange: () => undefined,
        disabled: true,
      }),
    );
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Locked"]')!;
    expect(trigger.disabled).toBe(true);
    expect(host.querySelector('[role="menuitem"]')).toBeNull();
  });
});

describe('NumberStepper', () => {
  function stepper(value: number, onChange: (next: number) => void) {
    render(
      createElement(NumberStepper, {
        label: 'Retention',
        value,
        min: 1,
        max: 10,
        unit: 'msgs',
        decreaseLabel: 'Decrease',
        increaseLabel: 'Increase',
        onChange,
      }),
    );
    return {
      input: host.querySelector<HTMLInputElement>('input[role="spinbutton"]')!,
      decrease: host.querySelector<HTMLButtonElement>('button[aria-label="Decrease"]')!,
      increase: host.querySelector<HTMLButtonElement>('button[aria-label="Increase"]')!,
    };
  }

  it('exposes its range and disables the step that would leave it', () => {
    const ui = stepper(10, () => undefined);
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Retention');
    expect(ui.input.getAttribute('aria-valuenow')).toBe('10');
    expect(ui.input.getAttribute('aria-valuemax')).toBe('10');
    expect(ui.increase.disabled).toBe(true);
    expect(ui.decrease.disabled).toBe(false);
    expect(host.textContent).toContain('msgs');
  });

  it('commits steps, arrow keys and typed values, clamped and rounded', () => {
    const onChange = vi.fn();
    const ui = stepper(5, onChange);
    act(() => ui.increase.click());
    act(() => ui.decrease.click());
    key(ui.input, 'ArrowUp');
    key(ui.input, 'ArrowDown');
    type(ui.input, '42');
    key(ui.input, 'Enter');
    type(ui.input, '2.6');
    act(() => {
      ui.input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([6, 4, 6, 4, 10, 3]);
  });

  it('drops a draft that is not a number, or one cancelled with Escape', () => {
    const onChange = vi.fn();
    const ui = stepper(5, onChange);
    type(ui.input, 'many');
    key(ui.input, 'Enter');
    expect(ui.input.value).toBe('5');
    type(ui.input, '7');
    key(ui.input, 'Escape');
    expect(ui.input.value).toBe('5');
    type(ui.input, '5');
    key(ui.input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('says what is missing and offers at most the one action it is given', () => {
    render(
      createElement(EmptyState, {
        title: 'No apps yet',
        description: 'Create one to start.',
        action: createElement('button', { type: 'button' }, 'Create app'),
      }),
    );
    expect(host.textContent).toBe('No apps yetCreate one to start.Create app');
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });
});

describe('Tobs control semantics', () => {
  it('keeps checkbox labels, toggling and disabled behavior', () => {
    const change = vi.fn();
    render(createElement(Checkbox, { label: 'Allow replies', checked: false, onChange: change }));
    const input = host.querySelector<HTMLInputElement>('input')!;
    expect(input.labels?.[0]?.textContent).toBe('Allow replies');
    act(() => input.click());
    expect(change).toHaveBeenLastCalledWith(true);
    render(
      createElement(Checkbox, {
        label: 'Allow replies',
        checked: true,
        disabled: true,
        onChange: change,
      }),
    );
    change.mockClear();
    act(() => input.click());
    expect(change).not.toHaveBeenCalled();
  });

  it('preserves rich tab labels, panel relationships and keyboard selection across disabled tabs', () => {
    const change = vi.fn();
    const options = [
      {
        value: 'first',
        label: createElement('strong', null, 'First'),
        id: 'custom-first',
        panelId: 'first-panel',
      },
      { value: 'disabled', label: 'Disabled', disabled: true },
      { value: 'last', label: 'Last', id: 'custom-last', panelId: 'last-panel' },
    ];
    const props = {
      id: 'tabs',
      label: 'History',
      value: 'first',
      options,
      controlsPanel: true,
      onChange: change,
    };
    render(createElement(SegmentedControl, props));
    const first = buttonNamed('First', host);
    expect(first.id).toBe('custom-first');
    expect(first.getAttribute('aria-controls')).toBe('first-panel');
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.tabIndex).toBe(0);
    expect(buttonNamed('Last', host).hasAttribute('aria-controls')).toBe(false);
    act(() => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(change).toHaveBeenLastCalledWith('last');
    expect(document.activeElement).toBe(buttonNamed('Last', host));
    render(createElement(SegmentedControl, { ...props, value: 'last' }));
    expect(buttonNamed('Last', host).getAttribute('aria-controls')).toBe('last-panel');
    act(() => {
      buttonNamed('Last', host).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      );
    });
    expect(change).toHaveBeenLastCalledWith('first');
    act(() => first.click());
    expect(change).toHaveBeenLastCalledWith('first');
  });

  it('exposes pill selection and leaves status pills non-interactive', () => {
    const click = vi.fn();
    render(createElement(PillButton, { active: true, onClick: click, children: 'Pinned' }));
    const pill = buttonNamed('Pinned', host);
    expect(pill.type).toBe('button');
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    act(() => pill.click());
    expect(click).toHaveBeenCalledOnce();
    render(
      createElement(PillButton, { as: 'span', className: 'status-pill', children: 'Working' }),
    );
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('.status-pill')?.textContent).toBe('Working');
  });

  it('keeps Tag tones and escaped content', () => {
    render(createElement(Tag, { tone: 'warning', className: 'status', children: '<unsafe>' }));
    expect(host.querySelector('.status')?.getAttribute('data-tone')).toBe('warning');
    expect(host.querySelector('.status')?.textContent).toBe('<unsafe>');
    expect(host.querySelector('unsafe')).toBeNull();
  });

  it('keeps explicit icon sizes, decorative semantics and filled stop and pin states', () => {
    render(createElement(Icon, { name: 'square', size: 14, filled: true, className: 'stop' }));
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('height')).toBe('14');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('class')).toBe('stop');
    render(createElement(Icon, { name: 'pin', size: 18, filled: false }));
    expect(host.querySelector('svg')?.getAttribute('fill')).toBe('none');
    render(createElement(Icon, { name: 'pin', size: 18, filled: true }));
    expect(host.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  });
});
