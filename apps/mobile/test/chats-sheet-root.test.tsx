// @vitest-environment jsdom
import { act, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EndSheetProps } from '../src/ui/primitives/end-sheet';
const state = vi.hoisted(() => ({ routeFocused: true, mounts: 0 }));
vi.mock('expo-router', () => ({ useIsFocused: () => state.routeFocused }));
vi.mock('react-native', () => ({ Keyboard: { dismiss: vi.fn() } }));
vi.mock('../src/ui/shell/scroll-chrome', () => ({
  ScrollChromeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/primitives/end-sheet', () => ({
  EndSheet: ({ children, panel, open, active, enabled, onOpenChange }: EndSheetProps) => (
    <main data-open={String(open)} data-active={String(active)} data-enabled={String(enabled)}>
      <section data-background>{children}</section>
      <aside>{panel}</aside>
      <button onClick={() => onOpenChange(true)}>Settle open</button>
      <button onClick={() => onOpenChange(false)}>Cancel drag</button>
    </main>
  ),
}));
vi.mock('../src/ui/chat/conversation-screen', () => ({
  ConversationScreen: ({
    presentation,
  }: {
    presentation: { active: boolean; onClose(): void; onNestedChange(value: boolean): void };
  }) => {
    const [draft, setDraft] = useState('');
    useEffect(() => {
      state.mounts++;
    }, []);
    return (
      <article data-visible={String(presentation.active)}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={presentation.onClose}>Back to Chats</button>
        <button onClick={() => presentation.onNestedChange(true)}>Open Profile</button>
        <button onClick={() => presentation.onNestedChange(false)}>Back to chat</button>
      </article>
    );
  },
}));
import { ChatsSheetRoot, ChatsSheetRegistration } from '../src/ui/shell/chats-sheet-root.android';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('preloads one retained real page above navigation/FAB and preserves it beneath child routes', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let homeMounts = 0;
  function Home({ active, id }: { active: boolean; id: string }) {
    useEffect(() => {
      homeMounts++;
    }, []);
    return (
      <>
        <ChatsSheetRegistration
          active={active}
          enabled
          chat={{ id, title: id, href: `/dm/${id}?hostId=h1` }}
        />
        <nav>Navigation</nav>
        <button>FAB</button>
      </>
    );
  }
  const render = (active = true, id = 'a') =>
    act(async () =>
      root.render(
        <ChatsSheetRoot>
          <Home active={active} id={id} />
        </ChatsSheetRoot>,
      ),
    );
  const click = (text: string) =>
    act(async () =>
      [...container.querySelectorAll('button')].find((n) => n.textContent === text)!.click(),
    );
  try {
    await render();
    const page = container.querySelector('article');
    expect(page?.getAttribute('data-visible')).toBe('false');
    expect(container.querySelector('[data-background] article')).toBeNull();
    expect(container.querySelector('[data-background] nav')).not.toBeNull();
    await click('Cancel drag');
    expect(page?.getAttribute('data-visible')).toBe('false');
    await click('Settle open');
    expect(page?.getAttribute('data-visible')).toBe('true');
    await click('Open Profile');
    expect(container.querySelector('main')?.getAttribute('data-active')).toBe('false');
    state.routeFocused = false;
    await render(false);
    expect(container.querySelector('main')?.getAttribute('data-open')).toBe('true');
    expect(page?.getAttribute('data-visible')).toBe('false');
    state.routeFocused = true;
    await render();
    await click('Back to chat');
    expect(container.querySelector('main')?.getAttribute('data-active')).toBe('true');
    await click('Back to Chats');
    await click('Settle open');
    expect(container.querySelector('article')).toBe(page);
    expect(state.mounts).toBe(1);
    await render(true, 'b');
    expect(container.querySelector('main')?.getAttribute('data-open')).toBe('false');
    expect(state.mounts).toBe(2);
    expect(homeMounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
  }
});
