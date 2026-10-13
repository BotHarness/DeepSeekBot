// @vitest-environment jsdom
import { act, createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return dialogPrimitives();
});

import { PanelDialog } from '../src/client/ds/panel-dialog.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

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

describe('PanelDialog', () => {
  it('names the dialog by its title and puts its content in one tagged body', () => {
    const body = createRef<HTMLDivElement>();
    render(
      createElement(
        PanelDialog,
        {
          title: 'Folders',
          description: 'Pick a folder',
          closeLabel: 'Close',
          onClose: () => undefined,
          data: { 'data-folder-browser': '' },
          bodyRef: body,
        },
        createElement('p', null, 'Row'),
      ),
    );
    expect(dialog().getAttribute('aria-label')).toBe('Folders');
    expect(dialog().textContent).toContain('Pick a folder');
    expect(body.current?.hasAttribute('data-folder-browser')).toBe(true);
    expect(body.current?.textContent).toBe('Row');
  });

  it('shows only the close control when it has no actions', () => {
    const onClose = vi.fn();
    render(createElement(PanelDialog, { title: 'Backups', closeLabel: 'Close', onClose }));
    expect(dialog().querySelectorAll('button')).toHaveLength(1);
    act(() => buttonNamed('Close').click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('puts the secondary action before the trailing actions', () => {
    render(
      createElement(PanelDialog, {
        title: 'Model',
        closeLabel: 'Close',
        onClose: () => undefined,
        secondary: createElement('button', { type: 'button' }, 'Save as'),
        actions: createElement('button', { type: 'button' }, 'Save'),
      }),
    );
    const names = [...dialog().querySelectorAll('button')].map((button) => button.textContent);
    expect(names.indexOf('Save as')).toBeLessThan(names.indexOf('Save'));
  });

  it('sizes the medium width between standard and wide', () => {
    const widthClass = (size: 'standard' | 'medium' | 'wide') => {
      render(
        createElement(PanelDialog, {
          title: size,
          size,
          closeLabel: 'Close',
          onClose: () => undefined,
        }),
      );
      return dialog().className;
    };
    const classes = new Set([widthClass('standard'), widthClass('medium'), widthClass('wide')]);
    expect(classes.size).toBe(3);
  });
});
