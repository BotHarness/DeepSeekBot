// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconPaperclipOutlineRegular: () => null,
}));

import {
  ConversationFileDropOverlay,
  useConversationFileDrop,
} from '../src/client/conversation-file-drop.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function drag(type: string, files: File[], types = files.length > 0 ? ['Files'] : ['text/plain']) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types, files, dropEffect: 'none' },
  });
  return event;
}

function Pane({ enabled, onFiles }: { enabled: boolean; onFiles(files: File[]): void }) {
  const drop = useConversationFileDrop(enabled, onFiles);
  return createElement(
    'section',
    drop.handlers,
    createElement('div', { className: 'child' }),
    drop.active ? createElement(ConversationFileDropOverlay, { label: 'Drop', hint: 'Max' }) : null,
  );
}

describe('conversation file drop', () => {
  it('shows the drop target while files hover and hands dropped files to the composer', async () => {
    const onFiles = vi.fn();
    await act(async () => root.render(createElement(Pane, { enabled: true, onFiles })));
    const pane = host.querySelector('section')!;
    const child = host.querySelector('.child')!;
    const file = new File(['x'], 'notes.txt');

    await act(async () => pane.dispatchEvent(drag('dragenter', [file])));
    await act(async () => child.dispatchEvent(drag('dragenter', [file])));
    await act(async () => child.dispatchEvent(drag('dragleave', [file])));
    expect(host.textContent).toContain('Drop');

    const over = drag('dragover', [file]);
    await act(async () => child.dispatchEvent(over));
    expect(over.defaultPrevented).toBe(true);

    const dropped = drag('drop', [file]);
    await act(async () => child.dispatchEvent(dropped));
    expect(dropped.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(host.textContent).not.toContain('Drop');
  });

  it('ignores text drags and stays inert while disabled', async () => {
    const onFiles = vi.fn();
    await act(async () => root.render(createElement(Pane, { enabled: true, onFiles })));
    const pane = host.querySelector('section')!;
    await act(async () => pane.dispatchEvent(drag('dragenter', [])));
    expect(host.textContent).not.toContain('Drop');

    await act(async () => root.render(createElement(Pane, { enabled: false, onFiles })));
    const file = new File(['x'], 'notes.txt');
    await act(async () => pane.dispatchEvent(drag('dragenter', [file])));
    const dropped = drag('drop', [file]);
    await act(async () => pane.dispatchEvent(dropped));
    expect(host.textContent).not.toContain('Drop');
    expect(dropped.defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
