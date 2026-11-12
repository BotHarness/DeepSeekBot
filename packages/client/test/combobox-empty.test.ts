// @vitest-environment jsdom
import { act, createElement, forwardRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconPlusOutlineRegular: () => null,
  Input: (props: Record<string, unknown>) => createElement('input', props),
  MenuSurface: forwardRef<HTMLDivElement, { children?: ReactNode; className?: string }>(
    function MockMenuSurface(props, ref) {
      return createElement(
        'div',
        { ref, role: 'listbox', className: 'bh-combobox-list mock-surface' },
        props.children,
      );
    },
  ),
  useDismissOnOutsidePointer: () => {},
}));

import { Combobox } from '../src/client/combobox.js';

afterEach(() => {
  document.body.replaceChildren();
});

async function mountCombobox(props: Parameters<typeof Combobox>[0]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Combobox, props));
  });
  return { host, root };
}

function comboboxInput(host: HTMLDivElement): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('.bh-combobox input');
  if (!input) throw new Error('combobox input missing');
  return input;
}

describe('Combobox empty state', () => {
  it('renders no floating list when there is nothing to pick and no empty message', async () => {
    const { host, root } = await mountCombobox({
      value: '',
      options: [],
      onSelect: () => {},
      label: 'Model',
      toggleLabel: 'Show models',
    });
    await act(async () => {
      comboboxInput(host).focus();
    });
    expect(document.body.querySelector('.bh-combobox-list')).toBeNull();
    await act(async () => root.unmount());
  });

  it('shows the empty message instead of an empty box when one is provided', async () => {
    const { host, root } = await mountCombobox({
      value: '',
      options: [],
      onSelect: () => {},
      label: 'Model',
      toggleLabel: 'Show models',
      emptyLabel: 'No matching models',
    });
    await act(async () => {
      comboboxInput(host).focus();
    });
    const list = document.body.querySelector('.bh-combobox-list');
    expect(list?.textContent).toContain('No matching models');
    await act(async () => root.unmount());
  });

  it('still opens the option list when options exist', async () => {
    const { host, root } = await mountCombobox({
      value: 'b',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
      onSelect: () => {},
      label: 'Model',
      toggleLabel: 'Show models',
      emptyLabel: 'No matching models',
    });
    await act(async () => {
      comboboxInput(host).focus();
    });
    const list = document.body.querySelector('.bh-combobox-list');
    expect(list?.textContent).toContain('Alpha');
    expect(list?.textContent).toContain('Beta');
    await act(async () => root.unmount());
  });
});
