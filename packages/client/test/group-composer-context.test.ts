// @vitest-environment jsdom
import { act, createElement, type ReactNode, type InputHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  GroupComposerContextView,
  groupWorkspaceChip,
  useGroupComposerContext,
} from '../src/client/group-composer-context.js';
import { BridgeCallError, type WorkspaceGrantView } from '../src/client/bridge.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { BotSummary } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ComposerContext } from '../src/client/composer-shortcuts.js';

vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement('section', { role: 'dialog', 'aria-label': title }, children),
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  IconChevronDownOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  IconPlusOutlineRegular: () => null,
  IconTrashOutlineRegular: () => null,
}));

const ada: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '',
};
const bea: BotSummary = { ...ada, slug: 'bea', displayName: 'Bea' };
const bob: BotSummary = { ...ada, slug: 'bob', displayName: 'Bob' };
const grant: WorkspaceGrantView = {
  id: 'grant',
  botSlug: 'ada',
  workspaceId: 'project',
  workspacePath: '/project',
  workspaceTitle: 'Project',
  createdAt: '',
  path: '/project',
  title: 'Project',
  orchestratorWrite: false,
};

it('hides the Group workspace footer on mobile and restores its facts and action on desktop', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let mobile = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return mobile;
    },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const actions = {
    listWorkspaceGrants: async () => [grant],
    listWorkspaceOptions: async () => [],
  } as unknown as BridgeActions;
  const onOpen = vi.fn();
  try {
    await act(async () =>
      root.render(
        createElement(GroupComposerContextView, {
          channelId: 'group-mobile',
          members: [ada],
          actions,
          t: zhTranslate,
          open: false,
          onOpen,
          onClose() {},
        }),
      ),
    );
    expect(container.querySelector<HTMLElement>('[data-composer-context]')!.hidden).toBe(true);
    await act(async () => {
      mobile = false;
      for (const listener of listeners) listener();
    });
    expect(container.querySelector('[data-composer-context]')!.textContent).toBe('1 个工作区');
    expect(container.querySelector<HTMLElement>('[data-composer-context]')!.hidden).toBe(false);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-composer-context] button')!.click(),
    );
    expect(onOpen).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it('counts the union of member workspaces by DSH Workspace id without naming Bots', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const workspace = (botSlug: string, workspaceId: string): WorkspaceGrantView => ({
    ...grant,
    id: `${botSlug}-${workspaceId}`,
    botSlug,
    workspaceId,
    workspacePath: `/${workspaceId}`,
    path: `/${workspaceId}`,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const actions = {
    listWorkspaceGrants: async (slug: string) =>
      slug === 'ada'
        ? [workspace('ada', 'a'), workspace('ada', 'b')]
        : [workspace('bea', 'b'), workspace('bea', 'c')],
    listWorkspaceOptions: async () => [],
  } as unknown as BridgeActions;
  try {
    await act(async () =>
      root.render(
        createElement(GroupComposerContextView, {
          channelId: 'group-union',
          members: [ada, bea],
          actions,
          t: zhTranslate,
          open: false,
          onOpen() {},
          onClose() {},
        }),
      ),
    );
    const chip = container.querySelector('[data-composer-context]')!.textContent;
    expect(chip).toBe('3 个工作区');
    expect(chip).not.toContain('Ada');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(groupWorkspaceChip([[workspace('ada', 'a')], undefined], zhTranslate)).toBe(
    zhTranslate('composerContext.loading'),
  );
  expect(groupWorkspaceChip([[workspace('ada', 'a')], null], zhTranslate)).toBe(
    zhTranslate('composerContext.unavailable'),
  );
  expect(groupWorkspaceChip([[], []], zhTranslate)).toBe('0 个工作区');
});

it('defaults to all Bots, allows narrowing, and preserves independent partial results when membership changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let committed = false;
  const actions = {
    listWorkspaceGrants: vi.fn(async (slug: string) =>
      committed && slug === 'ada' ? [grant] : [],
    ),
    listWorkspaceOptions: vi.fn(async () => [
      { id: 'project', path: '/project', title: 'Project' },
    ]),
    listHostFolders: vi.fn(async () => ({
      path: '/project',
      entries: [],
      crumbs: [],
      truncated: false,
    })),
    resolveWorkspaceFolder: vi.fn(async () => ({
      id: 'project',
      path: '/project',
      title: 'Project',
    })),
    assignmentAccess: vi.fn(async (botSlug: string) => ({
      botSlug,
      mode: 'workspace-write',
      revision: 0,
    })),
    readGroupWorkspaceGrant: vi.fn(async (_channel: string, slug: string) =>
      committed && slug === 'ada' ? grant : undefined,
    ),
    authorizeGroupWorkspacePath: vi.fn(async (_channel: string, slug: string) => {
      if (slug === 'bea') throw new BridgeCallError('invalid-grant', 'Member departed');
      committed = true;
      return { grant, created: true };
    }),
    send: vi.fn(),
    setAssignmentAccess: vi.fn(),
    setWorkspaceGrantWrite: vi.fn(),
  } as unknown as BridgeActions;
  const render = (members: BotSummary[]) =>
    root.render(
      createElement(GroupComposerContextView, {
        channelId: 'group',
        members,
        actions,
        t: zhTranslate,
        open: true,
        onOpen() {},
        onClose() {},
      }),
    );
  const button = (text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (item) => item.textContent === text && !item.disabled,
    )!;
  try {
    await act(async () => render([ada, bea, bob]));
    expect(
      Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).every(
        (input) => input.checked,
      ),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (item) => item.textContent === zhTranslate('grant.addFolder'),
      )!.disabled,
    ).toBe(false);
    expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
    await act(async () =>
      container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!.click(),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-workspace-folder-toggle')!.click(),
    );
    await act(async () => button(zhTranslate('grant.authorize')).click());
    expect(
      container.querySelector(`[aria-label="${zhTranslate('groupGrant.confirm')}"]`),
    ).not.toBeNull();
    expect(container.textContent).toContain('/project');
    expect(container.querySelector('.bh-group-grant-members')).toBeNull();
    expect(container.querySelector('.bh-group-grant-directory')!.textContent).toBe('/project');
    expect(container.querySelectorAll('.bh-group-grant-results > .bh-card-row')).toHaveLength(3);
    expect(
      container
        .querySelector('.bh-group-grant-results .bh-workspace-folder-toggle')!
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(container.querySelector('.bh-workspace-grant-confirm')).toBeNull();
    await act(async () => render([ada, bea, bob, { ...ada, slug: 'late', displayName: 'Late' }]));
    expect(container.querySelectorAll('.bh-group-grant-results > .bh-card-row')).toHaveLength(3);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('.bh-group-grant-results .bh-workspace-folder-toggle')!
        .click(),
    );
    expect(container.querySelector('.bh-group-grant-directory')).toBeNull();
    expect(container.textContent).toContain('Ada');
    expect(container.textContent).toContain('Bea');
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('.bh-group-grant-results .bh-workspace-folder-toggle')!
        .click(),
    );
    expect(container.querySelector('.bh-group-grant-directory')!.textContent).toBe('/project');
    expect(container.querySelector('.bh-group-grant-policy')!.hasAttribute('open')).toBe(false);
    expect(container.textContent).toContain(zhTranslate('groupGrant.unselected'));
    expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('grant.authorize')).click());
    expect(container.textContent).toContain(zhTranslate('groupGrant.created'));
    expect(container.textContent).toContain(zhTranslate('groupGrant.failed'));
    expect(actions.authorizeGroupWorkspacePath).toHaveBeenCalledTimes(2);
    await act(async () => render([ada, bob]));
    expect(container.textContent).toContain(zhTranslate('groupGrant.created'));
    await act(async () => button(zhTranslate('groupGrant.retry')).click());
    expect(actions.authorizeGroupWorkspacePath).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(actions.authorizeGroupWorkspacePath).mock.calls.map((call) => call[1]),
    ).toEqual(['ada', 'bea', 'bea']);
    expect(
      vi
        .mocked(actions.readGroupWorkspaceGrant)
        .mock.calls.every((call) => call[1] !== 'bob' && call[1] !== 'late'),
    ).toBe(true);
    expect(actions.send).not.toHaveBeenCalled();
    expect(actions.setAssignmentAccess).not.toHaveBeenCalled();
    expect(actions.setWorkspaceGrantWrite).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('defaults loaded eligible Bots without writing, and preserves a custom empty selection and later joiner exclusion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  let members: BotSummary[] = [];
  let context: ComposerContext | undefined;
  const actions = {
    listWorkspaceGrants: vi.fn(async () => []),
    listWorkspaceOptions: vi.fn(async () => []),
    authorizeGroupWorkspacePath: vi.fn(),
  } as unknown as BridgeActions;
  function Harness() {
    context = useGroupComposerContext({
      channel: {
        id: 'group',
        name: 'Group',
        type: 'group',
        members: ['ada', 'bea', 'bob'],
        createdAt: '',
        updatedAt: '',
      },
      members,
      actions,
      t: zhTranslate,
    });
    return context?.content;
  }
  const checks = () =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => context!.shortcuts[0]!.run());
    expect(checks()).toHaveLength(0);
    members = [ada, bea, { ...bob, paused: true }, { ...ada, slug: 'deleted', deleted: true }];
    await act(async () => root.render(createElement(Harness)));
    expect(checks().map((input) => input.checked)).toEqual([true, true]);
    expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
    await act(async () => checks()[1]!.click());
    members = [ada, bea, bob];
    await act(async () => root.render(createElement(Harness)));
    expect(checks().map((input) => input.checked)).toEqual([true, false, false]);
    await act(async () => checks()[0]!.click());
    expect(checks().map((input) => input.checked)).toEqual([false, false, false]);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === zhTranslate('grant.addFolder'),
      )!.disabled,
    ).toBe(true);
    await act(async () => root.render(createElement(Harness)));
    expect(checks().map((input) => input.checked)).toEqual([false, false, false]);
    expect(actions.authorizeGroupWorkspacePath).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

it('offers only the shared workspace shortcut in Group and resets scope on Channel switches', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  let id = 'one';
  let context: ComposerContext | undefined;
  const actions = {
    listWorkspaceGrants: vi.fn(async () => []),
    listWorkspaceOptions: vi.fn(async () => []),
  } as unknown as BridgeActions;
  function Harness() {
    context = useGroupComposerContext({
      channel: {
        id,
        name: id,
        type: 'group',
        members: ['ada'],
        createdAt: '',
        updatedAt: '',
      },
      members: [ada],
      actions,
      t: zhTranslate,
    });
    return context?.content;
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(context!.shortcuts.map((item) => item.id)).toEqual(['workspace']);
    await act(async () => context!.shortcuts[0]!.run());
    expect(container.querySelector('[role=dialog]')).not.toBeNull();
    id = 'two';
    await act(async () => root.render(createElement(Harness)));
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(context!.target).toBe('two');
  } finally {
    await act(async () => root.unmount());
  }
});
