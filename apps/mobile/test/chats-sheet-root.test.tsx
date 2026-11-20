// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { EndSheetProps } from '../src/ui/primitives/end-sheet';
const state = vi.hoisted(() => ({ routeFocused: true }));
vi.mock('expo-router', () => ({ useIsFocused: () => state.routeFocused }));
vi.mock('react-native', () => ({ Keyboard: { dismiss: vi.fn() } }));
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
    place,
  }: {
    place: { slug: string };
    presentation: { active: boolean; onClose(): void; onNestedChange(value: boolean): void };
  }) => {
    const [draft, setDraft] = useState('');
    return (
      <article data-chat={place.slug} data-visible={String(presentation.active)}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
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
  function Home({ active, id }: { active: boolean; id: string }) {
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
    const navigation = container.querySelector('nav');
    expect(page?.getAttribute('data-visible')).toBe('false');
    expect(container.querySelector('[data-background] article')).toBeNull();
    expect(container.querySelector('[data-background] nav')).not.toBeNull();
    await click('Cancel drag');
    expect(page?.getAttribute('data-visible')).toBe('false');
    await click('Settle open');
    expect(page?.getAttribute('data-visible')).toBe('true');
    const input = container.querySelector('input')!;
    await act(async () => {
      input.value = 'unsent draft';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Open Profile');
    expect(container.querySelector('main')?.getAttribute('data-active')).toBe('false');
    state.routeFocused = false;
    await render(false, 'b');
    expect(container.querySelector('main')?.getAttribute('data-open')).toBe('true');
    expect(page?.getAttribute('data-visible')).toBe('false');
    state.routeFocused = true;
    await render(true, 'b');
    expect(container.querySelector('article')).toBe(page);
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('unsent draft');
    await click('Back to chat');
    expect(container.querySelector('main')?.getAttribute('data-active')).toBe('true');
    await render();
    await click('Back to Chats');
    await click('Settle open');
    expect(container.querySelector('article')).toBe(page);
    await click('Back to Chats');
    await render(true, 'b');
    expect(container.querySelector('main')?.getAttribute('data-open')).toBe('false');
    expect(container.querySelector('article')).not.toBe(page);
    expect(container.querySelector('nav')).toBe(navigation);
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps a closed preload unchanged while another route covers Chats, then prepares the latest chat on return', async () => {
  state.routeFocused = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (id: string) =>
    act(async () =>
      root.render(
        <ChatsSheetRoot>
          <ChatsSheetRegistration
            active={state.routeFocused}
            enabled
            chat={{ id, title: id, href: `/dm/${id}?hostId=h1` }}
          />
        </ChatsSheetRoot>,
      ),
    );
  try {
    await render('a');
    const prepared = container.querySelector('article');
    expect(prepared?.getAttribute('data-chat')).toBe('a');
    state.routeFocused = false;
    await render('b');
    expect(container.querySelector('article')).toBe(prepared);
    expect(container.querySelector('[data-chat="b"]')).toBeNull();
    await render('c');
    expect(container.querySelector('article')).toBe(prepared);
    state.routeFocused = true;
    await render('c');
    expect(container.querySelector('article')?.getAttribute('data-chat')).toBe('c');
    await act(async () =>
      [...container.querySelectorAll('button')]
        .find((n) => n.textContent === 'Settle open')!
        .click(),
    );
    expect(container.querySelector('article')?.getAttribute('data-visible')).toBe('true');
    expect(container.querySelector('article')?.getAttribute('data-chat')).toBe('c');
  } finally {
    state.routeFocused = true;
    await act(async () => root.unmount());
  }
});

it('does not prepare a hidden chat when Chats first mounts beneath another route', async () => {
  state.routeFocused = false;
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () =>
    act(async () =>
      root.render(
        <ChatsSheetRoot>
          <ChatsSheetRegistration
            active={state.routeFocused}
            enabled
            chat={{ id: 'a', title: 'a', href: '/dm/a?hostId=h1' }}
          />
        </ChatsSheetRoot>,
      ),
    );
  try {
    await render();
    expect(container.querySelector('article')).toBeNull();
    state.routeFocused = true;
    await render();
    expect(container.querySelector('article')?.getAttribute('data-chat')).toBe('a');
  } finally {
    state.routeFocused = true;
    await act(async () => root.unmount());
  }
});
