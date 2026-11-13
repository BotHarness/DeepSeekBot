// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationMessage, MessageAttachment } from '../src/host/conversation';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    OS: 'android',
    select: (values: Record<string, unknown>) => values.android ?? values.default,
  },
}));
vi.mock('react-native-reanimated', async () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/chat/message-bubble', () => ({ BubbleBody: () => null }));
vi.mock('../src/ui/primitives/resource-image', () => ({ ResourceImage: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('../src/ui/shell/icons', () => ({
  ChevronRightIcon: () => null,
  CopyIcon: () => null,
  ShareIcon: () => null,
  FileIcon: () => null,
  PhotoIcon: () => null,
}));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/primitives/sheet-header', () => ({
  SheetHeader: ({ title, onClose }: { title: string; onClose(): void }) =>
    createElement(
      'header',
      null,
      title,
      createElement('button', { 'aria-label': 'Close chooser', onClick: onClose }, 'Close'),
    ),
}));
vi.mock('../src/ui/chat/sheet-frame', () => ({
  SheetFrame: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? createElement('section', { role: 'dialog' }, children) : null,
}));
const { MessageActions } = await import('../src/ui/chat/message-actions.android');
const { messageMenuActions } = await import('../src/ui/chat/message-sheet');
const { t } = await import('../src/ui/strings');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
const file = (index: number, name = 'report.txt'): MessageAttachment => ({
  key: 'file-' + index,
  local: false,
  kind: 'file',
  name,
  mime: 'text/plain',
  size: 13,
  source: { uri: 'https://qa.invalid/' + index, headers: {} },
});
const message = (attachments: MessageAttachment[]): ConversationMessage => ({
  id: 'multi',
  revision: 1,
  at: '2026-11-13T12:00:00Z',
  author: 'bot',
  body: 'Choose one file',
  attachments,
  delivery: 'committed',
});
function mount(files: MessageAttachment[], onShare = vi.fn()) {
  function Harness() {
    const [target, setTarget] = useState<Parameters<typeof MessageActions>[0]['target']>({
      message: message(files),
      anchor: { x: 16, y: 400, width: 200, height: 60 },
      group: { first: true, last: true },
    });
    return createElement(MessageActions, {
      target,
      onClose: () => setTarget(undefined),
      onReact: vi.fn(),
      onCopy: vi.fn(),
      onShareText: vi.fn(),
      onShareAttachment: onShare,
    });
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Harness)));
  return onShare;
}
const buttons = (label: string) =>
  [...(host?.querySelectorAll<HTMLElement>('[aria-label]') ?? [])].filter(
    (e) => e.getAttribute('aria-label') === label,
  );
const open = (count: number) => act(() => buttons(t.downloadAttachments(count))[0]?.click());

describe('Android attachment chooser', () => {
  it('keeps thirty downloads out of the main menu and makes the final original selectable', async () => {
    const files = Array.from({ length: 30 }, (_, i) => file(i, 'file-' + i + '.txt'));
    const share = mount(files);
    expect(buttons(t.downloadAttachments(30))).toHaveLength(1);
    expect(buttons(t.shareFile(files[29]!.name))).toHaveLength(0);
    open(30);
    expect(host?.querySelector('[data-testid="message-attachment-list"]')).not.toBeNull();
    expect(host?.textContent).toContain('30 / 30');
    await act(async () => buttons(t.shareFile(files[29]!.name))[0]?.click());
    expect(share).toHaveBeenCalledExactlyOnceWith(files[29]);
    expect(host?.querySelector('[data-testid="message-attachment-list"]')).toBeNull();
  });
  it('shares only the selected same-name attachment and blocks repeated pending taps', async () => {
    const files = [file(0), file(1), file(2)];
    let finish: () => void = () => {};
    const share = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    mount(files, share);
    open(3);
    await act(async () => {
      buttons(t.shareFile('report.txt'))[1]?.click();
      buttons(t.shareFile('report.txt'))[1]?.click();
    });
    expect(share).toHaveBeenCalledExactlyOnceWith(files[1]);
    await act(async () => finish());
    expect(host?.querySelector('[data-testid="message-attachment-list"]')).toBeNull();
  });
  it('cancels the chooser without downloading', () => {
    const share = mount([file(0), file(1)]);
    open(2);
    act(() => buttons('Close chooser')[0]?.click());
    expect(share).not.toHaveBeenCalled();
  });
  it('keeps the one-file action direct and excludes unavailable and cleared originals', async () => {
    const unavailable = file(1);
    delete unavailable.source;
    const files: MessageAttachment[] = [file(0), unavailable, { ...file(2), cleared: true }];
    const share = mount(files);
    expect(buttons(t.downloadAttachments(1))).toHaveLength(0);
    await act(async () => buttons(t.shareFile('report.txt'))[0]?.click());
    expect(share).toHaveBeenCalledExactlyOnceWith(files[0]);
  });
  it('preserves the existing iOS menu contract and includes voice originals in the Android count', () => {
    const m = { ...message([file(0), file(1)]), voice: { audio: file(2) } } as ConversationMessage;
    expect(messageMenuActions(m).filter((a) => a.key === 'download')).toHaveLength(3);
    const grouped = messageMenuActions(m, undefined, false, false, true).find(
      (a) => a.key === 'attachments',
    );
    expect(grouped?.key === 'attachments' ? grouped.attachments : []).toEqual([
      m.voice?.audio,
      ...m.attachments,
    ]);
  });
});
