// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  fileSizeText: (size: number) => `${size} B`,
  IconCloseOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  ImageLightbox: ({
    src,
    alt,
    labels,
    onClose,
  }: {
    src: string;
    alt: string;
    labels: { dialog: string; close: string };
    onClose: () => void;
  }) =>
    createElement(
      'div',
      { role: 'dialog', 'aria-label': labels.dialog },
      createElement('img', { src, alt }),
      createElement('button', { type: 'button', 'aria-label': labels.close, onClick: onClose }),
    ),
}));

import { ChannelComposer } from '../src/client/channel-composer.js';

let container: HTMLDivElement;
let root: Root;
const empty = [] as const;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let createObjectURL: Mock<(value: Blob | MediaSource) => string>;
let revokeObjectURL: Mock<(url: string) => void>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  createObjectURL = vi.fn((value: Blob | MediaSource) =>
    value instanceof File ? `blob:${value.name}` : 'blob:media',
  );
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function paste(target: Element, files: File[], text = '', itemsOnly = false): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: itemsOnly ? [] : files,
      items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
  target.dispatchEvent(event);
  return event;
}

describe('Channel composer clipboard attachments', () => {
  it('queues a pasted image from the plain editor without sending it', async () => {
    const onAddFiles = vi.fn();
    const onSubmit = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit,
        }),
      ),
    );
    const file = new File(['image'], 'screenshot.png', { type: 'image/png' });
    const event = paste(container.querySelector('textarea')!, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file], { start: 0, end: 0 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('queues a pasted document from the rich editor', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelRefs: empty,
          channelCandidates: [{ id: 'g1', name: 'Group' } as never],
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    const event = paste(container.querySelector('[contenteditable="true"]')!, [file]);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file], undefined);
  });

  it('accepts a clipboard image exposed only through items', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['image'], 'capture.png', { type: 'image/png' });
    const event = paste(container.querySelector('textarea')!, [file], '', true);
    expect(event.defaultPrevented).toBe(true);
    expect(onAddFiles).toHaveBeenCalledWith([file], { start: 0, end: 0 });
  });

  it('queues the same clipboard file again on a repeated paste', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['image'], 'capture.png', { type: 'image/png' });
    const target = container.querySelector('textarea')!;
    paste(target, [file]);
    paste(target, [file]);
    expect(onAddFiles).toHaveBeenNthCalledWith(1, [file], { start: 0, end: 0 });
    expect(onAddFiles).toHaveBeenNthCalledWith(2, [file], { start: 0, end: 0 });
  });

  it('collects files from both clipboard lists once and stops shell paste handlers', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const file = new File(['document'], 'notes.txt', { type: 'text/plain' });
    const image = new File(['image'], 'capture.png', { type: 'image/png' });
    const shellPaste = vi.fn();
    container.addEventListener('paste', shellPaste);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [file],
        items: [file, image].map((item) => ({ kind: 'file', getAsFile: () => item })),
        getData: () => '',
      },
    });
    container.querySelector('textarea')!.dispatchEvent(event);
    expect(onAddFiles).toHaveBeenCalledWith([file, image], { start: 0, end: 0 });
    expect(event.defaultPrevented).toBe(true);
    expect(shellPaste).not.toHaveBeenCalled();
    const sameNameFile = new File(['different'], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
    paste(container.querySelector('textarea')!, [file, sameNameFile], '', true);
    expect(onAddFiles).toHaveBeenNthCalledWith(2, [file, sameNameFile], { start: 0, end: 0 });
    container.removeEventListener('paste', shellPaste);
  });

  it('opens and closes a full image preview while mixed files stay independent', async () => {
    const onRemoveAttachment = vi.fn();
    const image = new File(['image'], 'capture.png', { type: 'image/png' });
    const document = new File(['document'], 'a-very-long-project-report-name.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const render = async (includeImage: boolean): Promise<void> => {
      await act(async () =>
        root.render(
          createElement(ChannelComposer, {
            value: '',
            placeholder: 'Message',
            sending: false,
            mentionCandidates: empty,
            mentions: empty,
            channelCandidates: empty,
            channelRefs: empty,
            attachments: [
              ...(includeImage ? [{ id: 'image-1', file: image, status: 'ready' as const }] : []),
              { id: 'document-1', file: document, status: 'ready' as const },
            ],
            onRemoveAttachment,
            onChange: vi.fn(),
            onSubmit: vi.fn(),
          }),
        ),
      );
    };

    await render(true);
    expect(createObjectURL).toHaveBeenCalledWith(image);
    expect(container.querySelector('.bh-composer-image-attachment')).not.toBeNull();
    expect(container.querySelector('.bh-composer-file-attachment')).not.toBeNull();
    expect(container.querySelector('[data-file-type-icon$=".docx"]')).not.toBeNull();
    expect(container.querySelector('.bh-composer-image-reference')?.textContent).toBe('1');
    expect(container.querySelector('.bh-composer-file-reference')?.textContent).toBe('2');
    expect(container.querySelectorAll('.bh-composer-attachment-card')).toHaveLength(2);
    expect(
      container.querySelector('.bh-composer-image-attachment .bh-composer-attachment-name')
        ?.textContent,
    ).toBe('capture.png');
    expect(
      container.querySelector('.bh-composer-image-attachment .bh-composer-attachment-size')
        ?.textContent,
    ).toBe('5 B');

    await act(async () => {
      (container.querySelector('.bh-composer-image-preview') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      '预览 capture.png',
    );
    expect(container.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(
      'blob:capture.png',
    );

    await act(async () => {
      (container.querySelector('[role="dialog"] button') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const removeDocument = container.querySelector(
      '[aria-label="移除 a-very-long-project-report-name.docx"]',
    ) as HTMLButtonElement;
    removeDocument.click();
    expect(onRemoveAttachment).toHaveBeenCalledWith('document-1');

    await render(false);
    expect(container.querySelector('.bh-composer-file-reference')?.textContent).toBe('1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:capture.png');
  });

  it('leaves ordinary text paste to the plain editor', async () => {
    const onAddFiles = vi.fn();
    await act(async () =>
      root.render(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Message',
          sending: false,
          mentionCandidates: empty,
          mentions: empty,
          channelCandidates: empty,
          channelRefs: empty,
          onAddFiles,
          onChange: vi.fn(),
          onSubmit: vi.fn(),
        }),
      ),
    );
    const event = paste(container.querySelector('textarea')!, [], 'hello');
    expect(event.defaultPrevented).toBe(false);
    expect(onAddFiles).not.toHaveBeenCalled();
  });
});
