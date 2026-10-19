// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: Array<(event: { contentTypes: string[] }) => void> = [];
let hasImage = false;

vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, View: () => null }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-clipboard', () => ({
  ContentType: { IMAGE: 'image', PLAIN_TEXT: 'plain-text' },
  isPasteButtonAvailable: true,
  hasImageAsync: async () => hasImage,
  addClipboardListener: (listener: (event: { contentTypes: string[] }) => void) => {
    listeners.push(listener);
    return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
  },
  ClipboardPasteButton: () => null,
}));
vi.mock('../src/ui/design/theme', () => ({ useDesignTheme: () => ({}) }));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/shell/icons', () => ({ PhotoIcon: () => null }));

const { useClipboardImage } = await import('../src/ui/chat/clipboard-image');
const { fromClipboardImage } = await import('../src/host/pick-files');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(watching: boolean) {
  const probe: { current?: ReturnType<typeof useClipboardImage> } = {};
  function Probe({ on }: { on: boolean }) {
    probe.current = useClipboardImage(on);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe on={watching} />));
  return {
    get current() {
      return probe.current!;
    },
    rerender: (on: boolean) => act(() => root.render(<Probe on={on} />)),
    unmount: () => act(() => root.unmount()),
  };
}

const copy = (contentTypes: string[]) =>
  act(() => {
    for (const listener of [...listeners]) listener({ contentTypes });
  });

beforeEach(() => {
  hasImage = false;
});

describe('clipboard image offer', () => {
  it('offers an image already on the clipboard once the field is focused', async () => {
    hasImage = true;
    const view = mount(true);
    await act(async () => {});
    expect(view.current.offered).toBe(true);
    view.unmount();
  });

  it('does not watch the clipboard while the field is not focused', () => {
    const view = mount(false);
    expect(listeners).toHaveLength(0);
    expect(view.current.offered).toBe(false);
    view.unmount();
  });

  it('hides after pasting until something new is copied', async () => {
    const view = mount(true);
    await act(async () => {});
    copy(['image']);
    expect(view.current.offered).toBe(true);
    act(() => view.current.used());
    expect(view.current.offered).toBe(false);
    copy(['image']);
    expect(view.current.offered).toBe(true);
    copy(['plain-text']);
    expect(view.current.offered).toBe(false);
    view.unmount();
  });

  it('attaches the pasted image as a picked image with a matching name', () => {
    const file = fromClipboardImage('data:image/jpeg;base64,AAAA');
    expect(file).toMatchObject({ kind: 'image', uri: 'data:image/jpeg;base64,AAAA' });
    expect(file.name).toMatch(/^pasted-\d+\.jpg$/u);
  });
});
