// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/resource-image', () => ({ ResourceImage: () => null }));

import type { MessageAttachment } from '../src/host/conversation';
import { MediaLongPress } from '../src/ui/chat/media-long-press';
import { MessageAlbum, MessageFiles } from '../src/ui/chat/message-attachments';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

const source = { uri: 'https://computer.example/a' };
const image = {
  key: 'i1',
  kind: 'image',
  name: 'photo.png',
  source,
} as unknown as MessageAttachment;
const file = {
  key: 'f1',
  kind: 'file',
  name: 'report.pdf',
  size: 2048,
  source,
} as unknown as MessageAttachment;

describe('holding media inside a bubble', () => {
  it('opens the message actions from an image or a file, not only from the bubble edge', async () => {
    const hold = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <MediaLongPress.Provider value={hold}>
          <MessageAlbum images={[image]} human={false} width={200} onOpenImage={() => undefined} />
          <MessageFiles files={[file]} human={false} onShare={async () => undefined} />
        </MediaLongPress.Provider>,
      ),
    );
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    for (const button of buttons)
      act(() => {
        button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      });
    expect(hold).toHaveBeenCalledTimes(2);
  });
});
