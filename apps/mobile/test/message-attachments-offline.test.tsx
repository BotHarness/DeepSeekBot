// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/resource-image', () => ({
  ResourceImage: ({ onError }: { onError?: () => void }) => (
    <button data-testid="broken-image" onClick={() => onError?.()} />
  ),
}));

import type { MessageAttachment } from '../src/host/conversation';
import { ChatOffline } from '../src/ui/chat/chat-offline';
import { MessageAlbum } from '../src/ui/chat/message-attachments';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

const image = {
  key: 'a1',
  kind: 'image',
  name: 'photo.png',
  source: { uri: 'https://computer.example/a1' },
} as unknown as MessageAttachment;

async function brokenImage(offline: boolean) {
  const view = await render(
    <ChatOffline value={offline}>
      <MessageAlbum images={[image]} human={false} width={200} onOpenImage={() => undefined} />
    </ChatOffline>,
  );
  await act(async () =>
    (view.querySelector('[data-testid="broken-image"]') as HTMLElement).click(),
  );
  return view;
}

describe('image attachments while offline', () => {
  it('says an image that is not on the phone needs a connection', async () => {
    const view = await brokenImage(true);
    expect(view.textContent).toContain(t.imageNeedsConnection);
    expect(view.textContent).not.toContain(t.imageUnavailable);
  });

  it('keeps the retry message while connected', async () => {
    const view = await brokenImage(false);
    expect(view.textContent).toContain(t.imageUnavailable);
  });

  it('labels an image with no source the way it reads, even offline', async () => {
    const view = await render(
      <ChatOffline value>
        <MessageAlbum
          images={[{ ...image, source: undefined } as unknown as MessageAttachment]}
          human={false}
          width={200}
          onOpenImage={() => undefined}
        />
      </ChatOffline>,
    );
    expect(view.textContent).toContain(t.attachmentElsewhere);
    expect(
      [...view.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label')),
    ).toContain(`photo.png, ${t.attachmentElsewhere}`);
  });
});
