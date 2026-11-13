// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { shareAsync } from 'expo-sharing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { MessageAttachment } from '../src/host/conversation';

const native = vi.hoisted(() => ({
  disk: new Map<string, Uint8Array>(),
  share: vi.fn<typeof shareAsync>(),
}));

vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/resource-image', () => ({ ResourceImage: () => null }));
vi.mock('expo-sharing', () => ({ shareAsync: native.share }));
vi.mock('expo-file-system', () => {
  class Directory {
    constructor(
      readonly path: string,
      readonly name: string,
      readonly key: string,
    ) {}
    create() {}
  }
  class File {
    readonly uri: string;
    constructor(folder: Directory, name: string) {
      this.uri = `${folder.path}/${folder.name}/${folder.key}/${name}`;
    }
    get exists() {
      return native.disk.has(this.uri);
    }
    get size() {
      return native.disk.get(this.uri)?.byteLength ?? 0;
    }
    async write(bytes: Uint8Array) {
      native.disk.set(this.uri, bytes);
    }
  }
  return { Directory, File, Paths: { cache: 'file:///cache' } };
});

const { MessageFiles } = await import('../src/ui/chat/message-attachments');
const { shareAttachment } = await import('../src/host/share-attachment');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement;
let pending: Promise<void>[];
let errors: unknown[];

beforeEach(() => {
  native.disk.clear();
  native.share.mockReset();
  native.share.mockResolvedValue(undefined);
  pending = [];
  errors = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

function fixture(index: number, name = 'report.txt') {
  const bytes = new TextEncoder().encode(`MULTI_FILE_${index}\n`);
  const read = vi.fn(async () => ({ bytes, mime: 'text/plain' }));
  const attachment: MessageAttachment = {
    key: `same-message:${index}`,
    kind: 'file',
    name,
    mime: 'text/plain',
    local: false,
    source: {
      uri: `private-resource:${index}`,
      headers: {},
      cacheKey: `computer/file-${index}:v1`,
      read,
    },
  };
  return { attachment, bytes, read };
}

function render(files: MessageAttachment[]) {
  act(() =>
    root?.render(
      <MessageFiles
        files={files}
        human={false}
        onShare={(attachment) => {
          const work = shareAttachment(attachment).catch((error: unknown) => {
            errors.push(error);
          });
          pending.push(work);
          return work;
        }}
      />,
    ),
  );
  return [...host.querySelectorAll('button')];
}

async function tap(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await pending.at(-1);
  });
}

function buttonAt(index: number): HTMLButtonElement {
  const button = host.querySelectorAll('button')[index];
  if (button === undefined) throw new Error(`Missing attachment row ${index}`);
  return button;
}

function lastShared() {
  const call = native.share.mock.lastCall;
  if (call === undefined) throw new Error('No native share request');
  return call;
}

it('downloads the chosen second, third and first file with isolated same-name bytes', async () => {
  const first = fixture(0);
  const second = fixture(1);
  const third = fixture(2);
  const files = [first, second, third];
  const buttons = render(files.map((file) => file.attachment));
  expect(buttons).toHaveLength(3);
  for (const { index, file } of [
    { index: 1, file: second },
    { index: 2, file: third },
    { index: 0, file: first },
  ]) {
    await tap(buttonAt(index));
    const [uri, options] = lastShared();
    expect(native.disk.get(uri)).toEqual(file.bytes);
    expect(options).toMatchObject({ dialogTitle: 'report.txt', mimeType: 'text/plain' });
  }
  expect(new Set(native.share.mock.calls.map(([uri]) => uri)).size).toBe(3);
  expect(files.map((file) => file.read.mock.calls.length)).toEqual([1, 1, 1]);
  await tap(buttonAt(1));
  expect(second.read).toHaveBeenCalledTimes(1);
  expect(native.share.mock.lastCall?.[0]).toBe(native.share.mock.calls[0]?.[0]);
  expect(errors).toEqual([]);
});

it('only marks the selected file busy and suppresses repeat taps while sharing', async () => {
  const first = fixture(0);
  const second = fixture(1);
  const files = [first, second];
  const sharing = Promise.withResolvers<void>();
  native.share.mockReturnValue(sharing.promise);
  const buttons = render(files.map((file) => file.attachment));
  await act(async () => {
    buttonAt(1).click();
  });
  expect(buttons.map((button) => button.disabled)).toEqual([false, true]);
  buttonAt(1).click();
  expect(first.read).not.toHaveBeenCalled();
  expect(second.read).toHaveBeenCalledTimes(1);
  await act(async () => {
    sharing.resolve();
    await pending.at(-1);
  });
  expect(buttonAt(1).disabled).toBe(false);
  expect(native.share).toHaveBeenCalledTimes(1);
});

it('lets a failed second download retry without downloading another attachment', async () => {
  const first = fixture(0);
  const second = fixture(1);
  second.read.mockRejectedValueOnce(new Error('synthetic-download-failed'));
  render([first.attachment, second.attachment]);
  await tap(buttonAt(1));
  expect(errors).toHaveLength(1);
  expect(native.share).not.toHaveBeenCalled();
  expect(buttonAt(1).disabled).toBe(false);
  await tap(buttonAt(1));
  expect(first.read).not.toHaveBeenCalled();
  expect(second.read).toHaveBeenCalledTimes(2);
  expect(native.disk.get(lastShared()[0])).toEqual(second.bytes);
});
