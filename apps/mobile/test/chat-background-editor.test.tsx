// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  PanResponder: { create: () => ({ panHandlers: {} }) },
}));
vi.mock('expo-image', () => ({ Image: () => null }));
import { createChatBackgrounds } from '../src/host/chat-background';
import { ChatBackgroundEditor } from '../src/ui/chat/chat-background-editor';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('previews a picked image and only persists it when Done succeeds', async () => {
  let stored: unknown;
  const backgrounds = createChatBackgrounds({
    read: async () => stored,
    write: async (value) => {
      stored = structuredClone(value);
    },
    importImage: async () => ({ id: 'scene.jpg', width: 800, height: 1200 }),
    listImages: async () => [],
    removeImage: async () => {},
  });
  await backgrounds.ready;
  const scope = { hostId: 'host', channelId: 'dm' };
  const edit = backgrounds.edit(scope);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const done = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ChatBackgroundEditor
          edit={edit}
          inherited={backgrounds.resolve()}
          imageUri={(id) => `file:///${id}`}
          onPickImage={async () => ({ uri: 'picker://temporary', width: 800, height: 1200 })}
          onDone={done}
          onCancel={() => {}}
        />,
      ),
    );
    const click = async (label: string) =>
      act(async () => {
        const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
        expect(button).not.toBeNull();
        button!.click();
      });
    await click(t.chatBackground.chooseImage);
    expect(host.textContent).toContain('60%');
    expect(backgrounds.resolve(scope)).toEqual({ kind: 'default' });
    await click(t.done);
    expect(backgrounds.resolve(scope)).toMatchObject({ kind: 'image', id: 'scene.jpg' });
    expect(done).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    await edit.cancel();
    host.remove();
  }
});

it('keeps an inherited image read-only and follows a later device default after Done', async () => {
  const backgrounds = createChatBackgrounds({
    read: async () => undefined,
    write: async () => {},
    importImage: async () => ({ id: 'global.jpg', width: 800, height: 1200 }),
    listImages: async () => [],
    removeImage: async () => {},
  });
  await backgrounds.ready;
  const global = backgrounds.edit();
  await global.pick('global');
  await global.save();
  const scope = { hostId: 'host', channelId: 'chat' };
  const edit = backgrounds.edit(scope);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ChatBackgroundEditor
          scoped
          edit={edit}
          inherited={backgrounds.resolve()}
          imageUri={(id) => id}
          onPickImage={async () => undefined}
          onDone={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    expect(host.textContent).toContain(t.chatBackground.inherited(t.chatBackground.image));
    expect(host.querySelector(`[aria-label="${t.chatBackground.fit}"]`)).toBeNull();
    expect(host.querySelector(`[aria-label="${t.chatBackground.fade}"]`)).toBeNull();
    expect(host.querySelector(`[aria-label="${t.chatBackground.center}"]`)).toBeNull();
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${t.done}"]`)!.click(),
    );
    const nextGlobal = backgrounds.edit();
    nextGlobal.choose({ kind: 'color', color: '#abcdef' });
    await nextGlobal.save();
    expect(backgrounds.resolve(scope)).toEqual({ kind: 'color', color: '#abcdef' });
  } finally {
    await act(async () => root.unmount());
    await edit.cancel();
  }
});

it('lets one chat return to the theme canvas while the device default is a color', async () => {
  const backgrounds = createChatBackgrounds({
    read: async () => ({
      version: 1,
      default: { kind: 'color', color: '#ede2ef' },
      overrides: {},
    }),
    write: async () => {},
    importImage: async () => ({ id: 'x.jpg', width: 1, height: 1 }),
    listImages: async () => [],
    removeImage: async () => {},
  });
  await backgrounds.ready;
  const scope = { hostId: 'host', channelId: 'chat' };
  const edit = backgrounds.edit(scope);
  const host = document.createElement('div');
  const root = createRoot(host);
  const tab = (label: string) =>
    host.querySelector<HTMLButtonElement>(`[role="tab"][aria-label="${label}"]`)!;
  try {
    await act(async () =>
      root.render(
        <ChatBackgroundEditor
          scoped
          edit={edit}
          inherited={backgrounds.resolve()}
          imageUri={(id) => id}
          onPickImage={async () => undefined}
          onDone={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    expect(host.textContent).toContain(t.chatBackground.inherited(t.chatBackground.solid));
    expect(tab(t.chatBackground.useDefault).getAttribute('aria-selected')).toBe('true');
    await act(async () => tab(t.chatBackground.theme).click());
    expect(tab(t.chatBackground.theme).getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).toContain(t.chatBackground.override);
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${t.done}"]`)!.click(),
    );
    expect(backgrounds.resolve(scope)).toEqual({ kind: 'default' });
    expect(backgrounds.resolve()).toEqual({ kind: 'color', color: '#ede2ef' });
  } finally {
    await act(async () => root.unmount());
    await edit.cancel();
  }
});

it('keeps a retryable draft on save failure and discards preview appearance and restoration on cancel', async () => {
  let fail = false;
  const backgrounds = createChatBackgrounds({
    read: async () => undefined,
    write: async () => {
      if (fail) throw Error('full disk');
    },
    importImage: async () => ({ id: 'photo.jpg', width: 300, height: 500 }),
    listImages: async () => [],
    removeImage: async () => {},
  });
  await backgrounds.ready;
  const scope = { hostId: 'host', channelId: 'chat' };
  const first = backgrounds.edit(scope);
  await first.pick('photo');
  await first.save();
  const edit = backgrounds.edit(scope);
  const host = document.createElement('div');
  const root = createRoot(host);
  const done = vi.fn();
  const cancel = vi.fn(() => {
    void edit.cancel();
  });
  const click = async (label: string) =>
    act(async () => {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button).not.toBeNull();
      button!.click();
    });
  try {
    await act(async () =>
      root.render(
        <ChatBackgroundEditor
          scoped
          edit={edit}
          inherited={backgrounds.resolve()}
          imageUri={(id) => id}
          onPickImage={async () => undefined}
          onDone={done}
          onCancel={cancel}
        />,
      ),
    );
    await click(t.chatBackground.dark);
    await click(t.chatBackground.useDefault);
    expect(backgrounds.resolve(scope)).toMatchObject({ kind: 'image' });
    fail = true;
    await click(t.done);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(t.chatBackground.failed);
    expect(done).not.toHaveBeenCalled();
    expect(backgrounds.resolve(scope)).toMatchObject({ kind: 'image' });
    await click(t.cancel);
    expect(cancel).toHaveBeenCalledOnce();
    expect(backgrounds.resolve(scope)).toMatchObject({ kind: 'image' });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
