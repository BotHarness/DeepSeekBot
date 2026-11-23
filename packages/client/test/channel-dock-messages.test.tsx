// @vitest-environment jsdom
import { act, createElement, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHANNEL_BODY_PANEL, readChannelDock } from '../src/client/channel-dock-layout.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import { ComposerContextPlacementContext } from '../src/client/composer-context-placement.js';
import { createDockPanelRegistry, type DockPanelChannel } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  createChannelDockFixture,
  entry,
  entryProps,
  mountChannelDock,
  settle,
  unmountChannelDock,
} from './support/channel-dock.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/channel-dock-primitives.js')).mockChannelDockPrimitives(),
);

let root: Root;
let host: HTMLDivElement;
let values: Map<string, string>;
const { click, panels, storage } = createChannelDockFixture(() => ({ root, host, values }));

beforeEach(() => {
  ({ root, host, values } = mountChannelDock());
});

afterEach(() => unmountChannelDock(root, host));

function PlacementProbe(): ReactNode {
  return ` · ${useContext(ComposerContextPlacementContext)}`;
}

it('opens group members inside Messages and preserves the split preference across remounts', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry(entry('members', 'channel'));
  const workspace = { rail: () => createElement('nav') };
  const view = (group = true) =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        channel: { id: 'test', type: group ? 'group' : 'dm', botSlug: undefined },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  act(() => registry.open('members'));
  await settle();
  expect(host.querySelector('.bh-message-members [data-body="members"]')).not.toBeNull();
  expect(host.querySelector('[data-dock-panel="members"]')).toBeNull();
  expect(registry.isOpen('members')).toBe(true);
  const divider = host.querySelector('[role="separator"][aria-label="成员"]')!;
  act(() => {
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  await settle();
  expect(readChannelDock(storage)?.members?.ratio).toBeCloseTo(0.32);
  act(() => root.render(null));
  await settle();
  act(() => root.render(view()));
  await settle();
  expect(host.querySelector('.bh-message-members')).not.toBeNull();
  act(() => registry.close('members'));
  await settle();
  expect(host.querySelector('.bh-message-members')).toBeNull();
  act(() => root.render(view(false)));
  await settle();
  act(() => registry.open('members'));
  await settle();
  expect(host.querySelector('.bh-message-members')).toBeNull();
});

it('opens Channel files inside Messages for DMs and Groups and switches with Members', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry(entry('members', 'channel'));
  const workspace = { rail: () => createElement('nav') };
  let open = false;
  let group = false;
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        files: {
          open,
          setOpen: (next: boolean) => {
            open = next;
            root.render(view());
          },
          content: createElement(
            'section',
            { 'data-channel-files': '' },
            group ? 'group file' : 'DM file',
          ),
        },
        panels: registry.panels(),
        registry,
        channel: { id: group ? 'group' : 'dm', type: group ? 'group' : 'dm', botSlug: undefined },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const toggle = () =>
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-dock-header] button[aria-label="频道文件"]')!
        .click(),
    );
  expect(host.querySelector('[data-channel-files]')).toBeNull();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'unsent';
  toggle();
  await settle();
  expect(host.querySelector('aside [data-channel-files]')?.textContent).toBe('DM file');
  expect(host.querySelector('[data-dock-panel="generated-files"]')).toBeNull();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  toggle();
  await settle();
  expect(host.querySelector('[data-channel-files]')).toBeNull();
  group = true;
  act(() => root.render(view()));
  await settle();
  act(() => registry.open('members'));
  await settle();
  expect(host.querySelector('aside [data-body="members"]')).not.toBeNull();
  toggle();
  await settle();
  expect(host.querySelector('aside [data-channel-files]')?.textContent).toBe('group file');
  expect(host.querySelector('aside [data-body="members"]')).toBeNull();
  expect(registry.isOpen('members')).toBe(false);
  act(() => registry.open('members'));
  await settle();
  expect(host.querySelector('[data-channel-files]')).toBeNull();
  expect(host.querySelector('aside [data-body="members"]')).not.toBeNull();
  expect(draft.value).toBe('unsent');
});

it('opens Bot Inbox only inside DM Messages, supports registry navigation and switches with files', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry(entry('bot-inbox'));
  registry.registerEntry(entry('sessions'));
  let detail: 'inbox' | 'files' | undefined;
  let group = false;
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        inbox: group
          ? undefined
          : {
              open: detail === 'inbox',
              setOpen: (open: boolean) => {
                detail = open ? 'inbox' : undefined;
                root.render(view());
              },
            },
        files: {
          open: detail === 'files',
          setOpen: (open: boolean) => {
            detail = open ? 'files' : undefined;
            root.render(view());
          },
          content: createElement('div', { 'data-files': '' }),
        },
        panels: registry.panels(),
        registry,
        channel: {
          id: group ? 'group' : 'dm',
          type: group ? 'group' : 'dm',
          botSlug: group ? undefined : 'ada',
        },
        entryProps,
        shows: () => !group,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'unsent';
  expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
  await click('[data-dock-header] button[aria-label="Bot 收件箱"]');
  expect(host.querySelector('aside [data-body="bot-inbox"]')).not.toBeNull();
  expect(Object.keys(panels())).not.toContain('bot-inbox');
  expect(registry.isOpen('bot-inbox')).toBe(true);
  await click('[data-dock-header] button[aria-label="频道文件"]');
  expect(host.querySelector('aside [data-files]')).not.toBeNull();
  expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
  expect(registry.isOpen('bot-inbox')).toBe(false);
  act(() => registry.open('bot-inbox'));
  await settle();
  expect(host.querySelector('aside [data-body="bot-inbox"]')).not.toBeNull();
  expect(host.querySelector('[data-files]')).toBeNull();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(draft.value).toBe('unsent');
  act(() => registry.close('bot-inbox'));
  await settle();
  expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
  group = true;
  act(() => root.render(view()));
  await settle();
  expect(host.querySelector('button[aria-label="Bot 收件箱"]')).toBeNull();
  act(() => registry.open('bot-inbox'));
  await settle();
  expect(Object.keys(panels())).not.toContain('bot-inbox');
});

it('updates the Messages Channel title and trailing actions without replacing its draft', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  const settings = vi.fn();
  const profile = vi.fn();
  const view = (title: string) =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        header: {
          title,
          info: createElement(PlacementProbe),
          actions: createElement(
            'span',
            null,
            createElement('button', { onClick: profile, 'aria-label': 'Profile' }, 'Profile'),
            createElement(
              'button',
              { onClick: settings, 'aria-label': 'Channel settings' },
              'Settings',
            ),
          ),
        },
        panels: registry.panels(),
        registry,
        channel: { id: 'dm', type: 'dm', botSlug: 'ada' },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view('Ada')));
  await settle();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'Keep';
  const header = host.querySelector('[data-dock-header="bh:channel-body"]')!;
  expect(header.textContent).toContain('MessagesAda');
  const titleHandle = header.querySelector<HTMLElement>('[data-panel-hide]')!;
  const channelContext = header.querySelector<HTMLElement>('[data-panel-context]')!;
  expect(titleHandle.textContent).toBe('Messages');
  expect(channelContext.textContent).toBe('Ada · header');
  expect(channelContext.querySelector('[data-channel-header-info]')?.textContent).toBe(' · header');
  act(() => channelContext.click());
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  for (const target of [
    header,
    channelContext,
    header.closest('.dv-tab')!,
    header.closest('.dv-tabs-and-actions-container')!,
  ]) {
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    act(() => {
      target.dispatchEvent(drag);
    });
    expect(drag.defaultPrevented).toBe(true);
  }

  const titleDrag = new Event('dragstart', { bubbles: true, cancelable: true });
  act(() => {
    titleHandle.dispatchEvent(titleDrag);
  });
  expect(titleDrag.defaultPrevented).toBe(false);
  act(() => {
    titleHandle.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  await act(async () =>
    header.querySelector<HTMLButtonElement>('[aria-label="Channel settings"]')!.click(),
  );
  await act(async () => header.querySelector<HTMLButtonElement>('[aria-label="Profile"]')!.click());
  expect(settings).toHaveBeenCalledOnce();
  expect(profile).toHaveBeenCalledOnce();
  act(() => root.render(view('Design group')));
  await settle();
  expect(header.textContent).toContain('Design group');
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(draft.value).toBe('Keep');
});

it('opens Profile from the Messages header identity and keeps the subpanel toggle last', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  const { writeLayoutMode, readLayoutMode } = await import('../src/client/layout-mode.js');
  values = new Map();
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
  ])
    registry.register({ id: id!, title: title!, scope: 'global', component: () => null });
  registry.registerEntry(entry('sessions'));
  const profile = vi.fn();
  const view = (withProfile: boolean) =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        body: createElement('div'),
        header: {
          title: 'Tob',
          icon: createElement('img', { alt: '' }),
          ...(withProfile ? { profile: { label: "Open Tob's Profile", open: profile } } : {}),
          actions: createElement('button', { 'aria-label': 'Channel settings' }, 'Settings'),
        },
        panels: registry.panels(),
        registry,
        channel: { id: 'dm', type: 'dm', botSlug: 'tob' },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view(true)));
  await settle();
  const header = () => host.querySelector<HTMLElement>('[data-dock-header="bh:channel-body"]')!;
  const identity = header().querySelector<HTMLButtonElement>('[data-channel-header-profile]')!;
  expect(identity.tagName).toBe('BUTTON');
  expect(identity.type).toBe('button');
  expect(identity.getAttribute('aria-label')).toBe("Open Tob's Profile");
  expect(identity.querySelector('[data-channel-header-icon]')).not.toBeNull();
  expect(identity.textContent).toBe('Tob');
  act(() => identity.click());
  expect(profile).toHaveBeenCalledOnce();

  const controls = [...header().querySelectorAll<HTMLButtonElement>('[data-panel-actions] button')];
  expect(controls.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Channel settings',
    zhTranslate('workspace.subpanelColumn'),
  ]);
  expect(controls.at(-1)!.hasAttribute('data-subpanel-column-toggle')).toBe(true);
  expect(header().querySelector('[aria-label="查看资料"]')).toBeNull();

  act(() => root.render(view(false)));
  await settle();
  expect(header().querySelector('[data-channel-header-profile]')).toBeNull();
  expect(header().textContent).toContain('Tob');

  writeLayoutMode({ ...readLayoutMode(storage), mode: 'advanced' }, storage);
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(view(true)));
  await settle();
  const advanced = [
    ...header().querySelectorAll<HTMLButtonElement>('[data-panel-actions] button'),
  ].map((button) => button.getAttribute('aria-label'));
  expect(advanced[0]).toBe('Channel settings');
  expect(header().querySelector('[data-subpanel-column-toggle]')).toBeNull();
  expect(header().querySelector('[data-channel-header-profile]')).not.toBeNull();
});

it('keeps panel chrome still when only the Messages body and header slots change', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  const renders = { header: 0, body: 0 };
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.register({
    id: 'notes',
    title: 'Notes',
    scope: 'global',
    defaultPosition: { zone: 'right' },
    component: () => {
      renders.body += 1;
      return createElement('div', { 'data-notes': '' });
    },
    headerAction: () => {
      renders.header += 1;
      return null;
    },
  });
  const workspace = { rail: () => createElement('nav') };
  const channel: DockPanelChannel = { id: 'dm', type: 'dm', botSlug: 'ada' };
  const view = (frame: number) =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('p', { 'data-stream': '' }, 'x'.repeat(frame)),
        header: { title: 'Ada', actions: createElement('span', null, `frame ${frame}`) },
        panels: registry.panels(),
        registry,
        channel,
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view(1)));
  await settle();
  act(() => registry.open('notes'));
  await settle();
  expect(host.querySelector('[data-notes]')).not.toBeNull();
  const before = { ...renders };
  expect(before.header).toBeGreaterThan(0);
  for (let frame = 2; frame <= 6; frame += 1) act(() => root.render(view(frame)));
  await settle();
  expect(host.querySelector('[data-stream]')!.textContent).toBe('xxxxxx');
  expect(host.querySelector('[data-dock-header="bh:channel-body"]')!.textContent).toContain(
    'frame 6',
  );
  expect(renders).toEqual(before);
});
