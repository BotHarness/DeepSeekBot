// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: Array<(event: { contentTypes: string[] }) => void> = [];
let hasImage = false;
let pasteButton: { onPress(data: { type: string; data?: string }): void } | undefined;

const appState: Array<(state: string) => void> = [];

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      appState.push(listener);
      return { remove: () => appState.splice(appState.indexOf(listener), 1) };
    },
  },
  Platform: { OS: 'ios' },
  View: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-document-picker', () => ({}));
const written: Array<{ uri: string; content: string; encoding?: string; deleted: boolean }> = [];
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    readonly entry: (typeof written)[number];
    constructor(directory: string, name: string) {
      this.entry = { uri: `${directory}/${name}`, content: '', deleted: false };
      written.push(this.entry);
    }
    get uri() {
      return this.entry.uri;
    }
    async write(content: string, options?: { encoding?: string }) {
      this.entry.content = content;
      if (options?.encoding !== undefined) this.entry.encoding = options.encoding;
    }
    delete() {
      this.entry.deleted = true;
    }
  },
}));
vi.mock('expo-clipboard', () => ({
  ContentType: { IMAGE: 'image', PLAIN_TEXT: 'plain-text' },
  isPasteButtonAvailable: true,
  hasImageAsync: async () => hasImage,
  addClipboardListener: (listener: (event: { contentTypes: string[] }) => void) => {
    listeners.push(listener);
    return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
  },
  ClipboardPasteButton: (props: NonNullable<typeof pasteButton>) => {
    pasteButton = props;
    return null;
  },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ color: {}, type: { body: {} }, layer: { sheet: {} }, touch: 44 }),
}));
vi.mock('../src/ui/primitives/text', () => ({ Text: () => null }));
vi.mock('../src/ui/primitives/button', () => ({ Button: () => null }));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => false }));
vi.mock('../src/ui/chat/composer-chrome', () => ({ ComposerFieldMaterial: () => null }));
vi.mock('../src/ui/shell/icons', () => ({ PhotoIcon: () => null }));

const { ClipboardImageOffer, useClipboardImage } = await import('../src/ui/chat/clipboard-image');
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

  it('offers an image copied in another app when the app comes back', async () => {
    const view = mount(true);
    await act(async () => {});
    copy(['image']);
    act(() => view.current.used());
    expect(view.current.offered).toBe(false);
    hasImage = true;
    await act(async () => {
      for (const listener of [...appState]) listener('active');
    });
    expect(view.current.offered).toBe(true);
    view.unmount();
    expect(appState).toEqual([]);
  });

  it('gives up the offer when the copied image can no longer be read', () => {
    const onPaste = vi.fn();
    const onUnreadable = vi.fn();
    act(() =>
      createRoot(document.createElement('div')).render(
        <ClipboardImageOffer onPaste={onPaste} onUnreadable={onUnreadable} />,
      ),
    );
    act(() => pasteButton!.onPress({ type: 'text', data: '' }));
    expect(onUnreadable).toHaveBeenCalledTimes(1);
    act(() => pasteButton!.onPress({ type: 'image', data: 'data:image/jpeg;base64,AAAA' }));
    expect(onPaste).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
  });

  it('attaches the pasted image as a picked image with a matching name', () => {
    const file = fromClipboardImage('data:image/jpeg;base64,AAAA');
    expect(file).toMatchObject({ kind: 'image', uri: 'data:image/jpeg;base64,AAAA' });
    expect(file.name).toMatch(/^pasted-\d+\.jpg$/u);
  });

  it('reads a pasted image from a cache file because Android fetch cannot open data: URIs', async () => {
    const fetched: string[] = [];
    const image = new Blob(['jpeg'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', async (uri: string) => {
      fetched.push(uri);
      return { blob: async () => image };
    });
    try {
      const file = fromClipboardImage('data:image/jpeg;base64,AAAA');
      expect(await file.read()).toBe(image);
      expect(written.at(-1)).toMatchObject({ content: 'AAAA', encoding: 'base64', deleted: true });
      expect(fetched).toEqual([written.at(-1)!.uri]);
      expect(fetched[0]).toMatch(/^file:\/\/\/cache\/\d+-pasted-\d+\.jpg$/u);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
