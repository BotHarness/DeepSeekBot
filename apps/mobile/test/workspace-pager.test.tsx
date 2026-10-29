// @vitest-environment jsdom
import { act, useContext, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  segments: ['(tabs)', '(home)'],
  reduced: false,
  selected: (_page: number) => {},
  scrollEnabled: false,
  pageLimit: 0,
  hasChat: false,
  setPage: vi.fn(),
  setPageWithoutAnimation: vi.fn(),
}));

vi.mock('expo-router', () => ({ useSegments: () => native.segments, useIsFocused: () => true }));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: [] }) }));
vi.mock('../src/ui/shell/recent-chats', () => ({
  useRecentChats: () => [],
  lastChat: () => undefined,
}));
vi.mock('../src/ui/chat/conversation-page-pair', () => ({
  useConversationPagePair: () => (native.hasChat ? { chat: null, profile: null } : undefined),
}));
vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  return {
    Keyboard: { dismiss: vi.fn() },
    View: ({
      children,
      accessibilityElementsHidden,
    }: {
      children?: ReactNode;
      accessibilityElementsHidden?: boolean;
    }) => createElement('div', { 'aria-hidden': accessibilityElementsHidden }, children),
  };
});
vi.mock('react-native-pager-view', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  return {
    default: forwardRef(
      (
        props: {
          children?: ReactNode;
          scrollEnabled: boolean;
          pageLimit: number;
          onPageSelected(event: { nativeEvent: { position: number } }): void;
        },
        ref,
      ) => {
        useImperativeHandle(ref, () => ({
          setPage: native.setPage,
          setPageWithoutAnimation: native.setPageWithoutAnimation,
        }));
        native.scrollEnabled = props.scrollEnabled;
        native.pageLimit = props.pageLimit;
        native.selected = (position) => props.onPageSelected({ nativeEvent: { position } });
        return createElement('div', null, props.children);
      },
    ),
  };
});
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ color: { base: 'Canvas' } }),
}));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => native.reduced,
}));
vi.mock('../src/ui/shell/host-drawer', async () => {
  const { createElement } = await import('react');
  return { WorkspacePanel: () => createElement('span', null, 'Workspaces') };
});

const { WorkspacePager } = await import('../src/ui/shell/workspace-pager.ios');
const { openWorkspacePage, closeWorkspacePage } = await import('../src/ui/shell/workspace-paging');

const { ChatsPagingContext } = await import('../src/ui/shell/chats-paging');
const { useMounted } = await import('../src/ui/mounted');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Chats() {
  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setPaging = useContext(ChatsPagingContext);
  const mount = useMounted<HTMLDivElement>(() => {
    setPaging?.(!searchOpen && !focused && draft === '');
  }, [draft, searchOpen, focused, setPaging]);
  return (
    <div ref={mount} data-testid="chat-list">
      <input
        ref={inputRef}
        aria-label="Search chats"
        onFocus={() => {
          setSearchOpen(true);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        value={draft}
        onInput={(e) => setDraft(e.currentTarget.value)}
      />
      <button
        onClick={() => {
          inputRef.current?.blur();
          setSearchOpen(false);
          setDraft('');
        }}
      >
        Close search
      </button>
      <span>Environment A</span>
      <nav>Chats / Activity / Settings</nav>
    </div>
  );
}

describe('retained iOS workspace pages', () => {
  let element: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    native.segments = ['(tabs)', '(home)'];
    native.reduced = false;
    native.hasChat = false;
    native.setPage.mockClear();
    native.setPageWithoutAnimation.mockClear();
    element = document.createElement('div');
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
  });

  const render = async () => {
    await act(async () =>
      root.render(
        <WorkspacePager>
          <Chats />
        </WorkspacePager>,
      ),
    );
  };

  it('keeps the Chats instance, input and reading position when visiting Workspaces', async () => {
    await render();
    const input = element.querySelector('input');
    const list = element.querySelector<HTMLElement>('[data-testid="chat-list"]');
    if (!input || !list) throw new Error('Chats did not mount');
    await act(async () => {
      input.value = 'retained search';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    list.scrollTop = 375;
    await act(async () => native.selected(0));
    expect(input.isConnected).toBe(true);
    expect(list.closest('[aria-hidden="true"]')).not.toBeNull();
    await act(async () => native.selected(1));
    expect(element.querySelector('input')).toBe(input);
    expect(input.value).toBe('retained search');
    expect(list.scrollTop).toBe(375);
    expect(list.closest('[aria-hidden="true"]')).toBeNull();
    expect(native.setPage).not.toHaveBeenCalled();
  });

  it('uses native page commands for button navigation and follows live Reduce Motion', async () => {
    await render();
    expect(openWorkspacePage()).toBe(true);
    expect(closeWorkspacePage()).toBe(true);
    expect(native.setPage.mock.calls).toEqual([[0], [1]]);
    native.reduced = true;
    await render();
    openWorkspacePage();
    closeWorkspacePage();
    expect(native.setPageWithoutAnimation.mock.calls).toEqual([[0], [1]]);
  });

  it('disables workspace paging on Activity without replacing the retained Chats view', async () => {
    await render();
    const input = element.querySelector('input');
    expect(native.scrollEnabled).toBe(true);
    native.segments = ['(tabs)', '(activity)'];
    await render();
    expect(native.scrollEnabled).toBe(false);
    expect(element.querySelector('input')).toBe(input);
  });

  it('keeps paging paused for an empty focused search until explicitly closed', async () => {
    native.hasChat = true;
    await render();
    const input = element.querySelector('input');
    if (!input) throw new Error('Search did not mount');
    expect(native.pageLimit).toBe(3);
    expect(native.scrollEnabled).toBe(true);
    await act(async () => input.focus());
    await act(async () => {
      input.value = 'Tob';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(native.pageLimit).toBe(3);
    expect(native.scrollEnabled).toBe(false);
    expect(document.activeElement).toBe(input);
    await act(async () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(native.pageLimit).toBe(3);
    expect(native.scrollEnabled).toBe(false);
    expect(document.activeElement).toBe(input);
    const close = element.querySelector('button');
    if (!close) throw new Error('Close search missing');
    await act(async () => close.click());
    expect(native.pageLimit).toBe(3);
    expect(native.scrollEnabled).toBe(true);
    expect(document.activeElement).not.toBe(input);
  });

  it('releases the native page controller when its shell unmounts', async () => {
    await render();
    await act(async () => root.render(null));
    expect(openWorkspacePage()).toBe(false);
    expect(closeWorkspacePage()).toBe(false);
  });
});
