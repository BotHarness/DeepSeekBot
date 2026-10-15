// @vitest-environment jsdom
import { act, createElement, type InputHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { WorkspaceGrantsEntry } from '../src/client/workspace-grants-entry.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  Switch: ({
    checked,
    disabled,
    label,
    onChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange(value: boolean): void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      role: 'switch',
      checked,
      disabled,
      'aria-label': label,
      onChange: (event: { currentTarget: { checked: boolean } }) =>
        onChange(event.currentTarget.checked),
    }),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Modal: () => null,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconChevronDownOutlineRegular: ({ size }: { size?: number }) =>
    createElement('svg', { 'data-icon': 'sidebar-chevron', width: size, height: size }),
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  IconPlusOutlineRegular: () => null,
  IconTrashOutlineRegular: () => null,
}));

describe('Workspace Grant sidebar', () => {
  it('reuses the Channel sidebar summary row and chevron while keeping native disclosure', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const actions = {
      listWorkspaceGrants: vi.fn(async () => []),
      listWorkspaceOptions: vi.fn(async () => [
        { id: 'registered', title: 'Registered project', path: '/registered' },
      ]),
      memoryDirectory: vi.fn(async () => undefined),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      authorizeWorkspacePath: vi.fn(),
      createWorkspaceGrant: vi.fn(),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            botSlug: 'ada',
            channelId: 'dm-ada',
            actions,
            t: zhTranslate,
            composerOnly: true,
          }),
        ),
      );
      const summaries = container.querySelectorAll('details > summary');
      expect(summaries).toHaveLength(2);
      for (const summary of summaries) {
        expect(summary.classList.contains('bh-channel-sidebar-entry-head')).toBe(true);
        expect(summary.querySelector('.bh-channel-sidebar-entry-label')).not.toBeNull();
        const chevron = summary.querySelector('.bh-channel-sidebar-entry-chevron');
        expect(chevron?.getAttribute('aria-hidden')).toBe('true');
        expect(chevron?.querySelector('svg')?.getAttribute('width')).toBe('14');
      }
      const manual = summaries[0]!.parentElement as HTMLDetailsElement;
      expect(manual.open).toBe(false);
      await act(async () => (summaries[0] as HTMLElement).click());
      expect(manual.open).toBe(true);
      await act(async () => (summaries[0] as HTMLElement).click());
      expect(manual.open).toBe(false);
      expect(actions.authorizeWorkspacePath).not.toHaveBeenCalled();
      expect(actions.createWorkspaceGrant).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it.each(['manual', 'native'] as const)(
    'keeps the %s directory preview visible without publishing a Grant change',
    async (kind) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const listWorkspaceGrants = vi.fn(async () => []);
      const authorizeWorkspacePath = vi
        .fn()
        .mockRejectedValue(new Error('Result unknown; read back'));
      const actions = {
        listWorkspaceGrants,
        listWorkspaceOptions: vi.fn(async () => []),
        memoryDirectory: vi.fn(async () => undefined),
        listToolApprovalRules: vi.fn(async () => []),
        assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
        listHostFolders:
          kind === 'manual'
            ? vi.fn(async () => ({
                path: '/resolved/folder',
                entries: [],
                crumbs: [],
                home: '/',
                truncated: false,
              }))
            : vi.fn().mockRejectedValue({ rpcError: { code: 'directory-picker/unavailable' } }),
        pickWorkspaceFolder: vi.fn(async () => '/native/alias'),
        resolveWorkspaceFolder: vi.fn(async () => ({
          id: 'folder',
          path: '/resolved/folder',
          title: 'Folder',
        })),
        authorizeWorkspacePath,
      } as unknown as BridgeActions;
      try {
        await act(async () =>
          root.render(
            createElement(WorkspaceGrantsEntry, {
              scope: 'personabot',
              channelId: 'dm',
              botSlug: `preview-${kind}`,
              actions,
              t: zhTranslate,
              composerOnly: true,
            }),
          ),
        );
        if (kind === 'manual') {
          const input = container.querySelector('input')!;
          await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
              input,
              '/typed/alias',
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await act(async () =>
            Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
              .find((button) => button.textContent === zhTranslate('grant.authorize'))!
              .click(),
          );
          expect(actions.resolveWorkspaceFolder).toHaveBeenCalledWith('/typed/alias');
        } else {
          await act(async () =>
            Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
              .find((button) => button.textContent === zhTranslate('grant.addFolder'))!
              .click(),
          );
          expect(actions.pickWorkspaceFolder).toHaveBeenCalledOnce();
          expect(actions.resolveWorkspaceFolder).toHaveBeenCalledWith('/native/alias');
        }
        expect(container.querySelector('.bh-workspace-grant-confirm')!.textContent).toContain(
          '/resolved/folder',
        );
        expect(listWorkspaceGrants).toHaveBeenCalledTimes(1);
        expect(authorizeWorkspacePath).not.toHaveBeenCalled();
        await act(async () =>
          container.querySelector<HTMLButtonElement>('.bh-workspace-grant-confirm button')!.click(),
        );
        expect(authorizeWorkspacePath).toHaveBeenCalledExactlyOnceWith(
          `preview-${kind}`,
          '/resolved/folder',
        );
        expect(container.querySelector('[role="alert"]')!.textContent).toContain('Result unknown');
        expect(listWorkspaceGrants.mock.calls.length).toBeGreaterThan(1);
        expect(container.querySelector('.bh-assignment-access-row [role="switch"]')).toBeNull();
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    },
  );
  it('composer requires scoped confirmation, cancellation writes nothing and existing Grants are reused', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grants: Array<{
      id: string;
      botSlug: string;
      workspaceId: string;
      workspacePath: string;
      workspaceTitle: string;
      createdAt: string;
      orchestratorWrite?: boolean;
    }> = [];
    const createWorkspaceGrant = vi.fn(async () => {
      const grant = {
        id: 'composer-grant',
        botSlug: 'grant-composer',
        workspaceId: 'project',
        workspacePath: '/resolved/project',
        workspaceTitle: 'Project',
        createdAt: '',
      };
      grants.push(grant);
      return grant;
    });
    const actions = {
      listWorkspaceGrants: vi.fn(async () => grants.map((row) => ({ ...row }))),
      listWorkspaceOptions: vi.fn(async () => [
        { id: 'project', path: '/resolved/project', title: 'Project' },
      ]),
      listHostFolders: vi.fn(async () => ({
        path: '/resolved/project',
        crumbs: [],
        entries: [],
        truncated: false,
      })),
      resolveWorkspaceFolder: vi.fn(async () => ({
        id: 'project',
        path: '/resolved/project',
        title: 'Project',
      })),
      memoryDirectory: vi.fn(async () => undefined),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      createWorkspaceGrant,
      setAssignmentAccess: vi.fn(),
      setWorkspaceGrantWrite: vi.fn(async (_slug: string, id: string, enabled: boolean) => {
        const index = grants.findIndex((row) => row.id === id);
        grants[index] = { ...grants[index]!, orchestratorWrite: enabled };
        return grants[index];
      }),
    } as unknown as BridgeActions;
    const authorize = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => !button.disabled && button.textContent === zhTranslate('grant.authorize'),
      )!;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm',
            botSlug: 'grant-composer',
            botName: 'Composer Bot',
            actions,
            t: zhTranslate,
            composerOnly: true,
          }),
        ),
      );
      expect(container.querySelector('.bh-assignment-access-row [role="switch"]')).toBeNull();
      expect(container.querySelector('[data-assignment-access] [role="switch"]')).not.toBeNull();
      await act(async () =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('.bh-workspace-folder-toggle'))
          .at(-1)!
          .click(),
      );
      await act(async () => authorize().click());
      expect(container.textContent).toContain('确认授权给 Composer Bot');
      expect(container.textContent).toContain('已解析目录：/resolved/project');
      expect(createWorkspaceGrant).not.toHaveBeenCalled();
      await act(async () =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent === zhTranslate('approval.cancel'))!
          .click(),
      );
      expect(createWorkspaceGrant).not.toHaveBeenCalled();
      await act(async () => authorize().click());
      await act(async () =>
        container.querySelector<HTMLButtonElement>('.bh-workspace-grant-confirm button')!.click(),
      );
      expect(createWorkspaceGrant).toHaveBeenCalledExactlyOnceWith('grant-composer', 'project');
      expect(actions.setWorkspaceGrantWrite).toHaveBeenCalledExactlyOnceWith(
        'grant-composer',
        'composer-grant',
        true,
      );
      expect(container.querySelector('.bh-workspace-grant-confirm')).toBeNull();
      expect(
        container.querySelector<HTMLInputElement>(
          `input[aria-label="${zhTranslate('grant.orchestratorWrite')}: Project"]`,
        )!.checked,
      ).toBe(true);
      expect(
        Array.from(container.querySelectorAll('button')).filter(
          (button) => !button.disabled && button.textContent === zhTranslate('grant.authorize'),
        ),
      ).toHaveLength(0);
      expect(actions.setAssignmentAccess).not.toHaveBeenCalled();
      expect(actions.setWorkspaceGrantWrite).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('shows the write switch and open button in the composer folder row header', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let grant = {
      id: 'composer-write-grant',
      botSlug: 'composer-write',
      workspaceId: 'dsh',
      workspacePath: '/Users/me/.dsh',
      workspaceTitle: '.dsh',
      createdAt: '2026-10-01T00:00:00.000Z',
      orchestratorWrite: false,
      writeRevision: 0,
    };
    const setWorkspaceGrantWrite = vi.fn(async (_slug: string, _id: string, enabled: boolean) => {
      grant = { ...grant, orchestratorWrite: enabled, writeRevision: grant.writeRevision + 1 };
      return grant;
    });
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => [grant]),
      memoryDirectory: vi.fn(async () => undefined),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      setAssignmentAccess: vi.fn(),
      setWorkspaceGrantWrite,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-composer-write',
            botSlug: 'composer-write',
            botName: 'DeepSeek Bot',
            actions,
            t: zhTranslate,
            composerOnly: true,
          }),
        ),
      );
      const row = () =>
        Array.from(
          container.querySelectorAll<HTMLButtonElement>('button.bh-workspace-folder-toggle'),
        ).find((button) => button.querySelector('.bh-card-title')?.textContent === '.dsh')!;
      expect(row().getAttribute('aria-expanded')).toBe('false');
      const header = row().closest('.bh-card-line')!;
      const toggle = () =>
        container.querySelector<HTMLInputElement>(
          `input[aria-label="${zhTranslate('grant.orchestratorWrite')}: .dsh"]`,
        );
      expect(header.contains(toggle())).toBe(true);
      const deletes = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button.bh-workspace-folder-delete'),
      );
      expect(deletes.map((button) => [button.textContent, button.disabled])).toEqual([
        [zhTranslate('grant.delete'), true],
        [zhTranslate('grant.delete'), false],
      ]);
      const lastRow = container.querySelector('.bh-workspace-folder-table')!.lastElementChild!;
      expect(lastRow.querySelector('button.bh-workspace-folder-add')?.textContent).toBe(
        zhTranslate('grant.addFolder'),
      );
      expect(deletes[0]!.getAttribute('aria-label')).toBe(
        zhTranslate('grant.memoryDeleteUnavailable'),
      );
      expect(toggle()!.checked).toBe(false);
      await act(async () => toggle()!.click());
      expect(setWorkspaceGrantWrite).toHaveBeenCalledExactlyOnceWith(
        'composer-write',
        'composer-write-grant',
        true,
      );
      expect(toggle()!.checked).toBe(true);
      expect(row().getAttribute('aria-expanded')).toBe('false');
      expect(actions.setAssignmentAccess).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('keeps a newly added folder listed when turning on write access fails', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grant = {
      id: 'manual-grant',
      botSlug: 'manual-write',
      workspaceId: 'manual',
      workspacePath: '/tmp/manual',
      workspaceTitle: 'manual folder',
      createdAt: '2026-10-01T00:00:00.000Z',
      orchestratorWrite: false,
    };
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => undefined),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      authorizeWorkspacePath: vi.fn(async () => grant),
      setWorkspaceGrantWrite: vi.fn(async () => {
        throw new Error('Host rejected permission change');
      }),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-manual-write',
            botSlug: 'manual-write',
            actions,
            t: zhTranslate,
            developerMode: true,
          }),
        ),
      );
      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label="${zhTranslate('grant.pathLabel')}"]`,
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '/tmp/manual',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent === zhTranslate('grant.authorize'))!
          .click(),
      );
      expect(actions.setWorkspaceGrantWrite).toHaveBeenCalledWith(
        'manual-write',
        'manual-grant',
        true,
      );
      expect(container.textContent).toContain('manual folder');
      expect(container.textContent).toContain('Host rejected permission change');
      expect(
        container.querySelector<HTMLInputElement>(
          `input[aria-label="${zhTranslate('grant.orchestratorWrite')}: manual folder"]`,
        )!.checked,
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('keeps write permission off until the Host confirms and preserves it when revocation fails', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let grant = {
      id: 'write-grant',
      botSlug: 'write-test',
      workspaceId: 'write-workspace',
      workspacePath: '/tmp/write-project',
      workspaceTitle: 'write project',
      createdAt: '2026-10-01T00:00:00.000Z',
      orchestratorWrite: false,
      writeRevision: 0,
    };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setWorkspaceGrantWrite = vi
      .fn()
      .mockImplementationOnce(async () => {
        await pending;
        grant = { ...grant, orchestratorWrite: true, writeRevision: 1 };
        return grant;
      })
      .mockRejectedValueOnce(new Error('Host rejected permission change'));
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => [grant]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      setWorkspaceGrantWrite,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-write-test',
            botSlug: 'write-test',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const expand = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button.bh-workspace-folder-toggle'),
      ).find((button) => button.querySelector('.bh-card-title')?.textContent === 'write project')!;
      act(() => expand.click());
      const toggle = () =>
        container.querySelector('input[aria-label*="write project"]') as HTMLInputElement;
      expect(toggle().checked).toBe(false);
      await act(async () => toggle().click());
      expect(setWorkspaceGrantWrite).toHaveBeenCalledWith('write-test', 'write-grant', true);
      expect(toggle().checked).toBe(false);
      expect(toggle().disabled).toBe(true);
      await act(async () => {
        release();
        await pending;
      });
      expect(toggle().checked).toBe(true);
      expect(toggle().disabled).toBe(false);
      await act(async () => toggle().click());
      expect(setWorkspaceGrantWrite).toHaveBeenLastCalledWith('write-test', 'write-grant', false);
      expect(toggle().checked).toBe(true);
      expect(toggle().disabled).toBe(false);
      expect(container.textContent).toContain('Host rejected permission change');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('moves Memory to a chosen folder, or back to the default, from the Memory Repository row', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const moveMemoryLocation = vi
      .fn()
      .mockResolvedValueOnce('/srv/memory/ada')
      .mockResolvedValueOnce('/home/me/.deepseek/botharness/bots/ada/memory');
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      pickWorkspaceFolder: vi.fn(async () => '/srv/memory'),
      moveMemoryLocation,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const expand = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button.bh-workspace-folder-toggle'),
      ).find(
        (button) =>
          button.querySelector('.bh-card-title')?.textContent === zhTranslate('grant.memory'),
      )!;
      act(() => expand.click());
      const input = () =>
        container.querySelector<HTMLInputElement>(
          `input[aria-label="${zhTranslate('grant.memoryMove.label')}"]`,
        )!;
      const button = (key: string) =>
        Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
          (candidate) => candidate.textContent === zhTranslate(key),
        )!;
      expect(container.textContent).toContain(zhTranslate('grant.memoryMove.hint'));
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input(),
          'relative/folder',
        );
        input().dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain(zhTranslate('bot.create.memoryLocation.relative'));
      expect(button('grant.memoryMove.move').disabled).toBe(true);

      await act(async () => button('bot.create.memoryLocation.choose').click());
      expect(input().value).toBe('/srv/memory');
      await act(async () => button('grant.memoryMove.move').click());
      expect(moveMemoryLocation).toHaveBeenCalledWith('ada', '/srv/memory');
      expect(container.textContent).toContain('/srv/memory/ada');
      expect(input().value).toBe('');

      await act(async () => button('grant.memoryMove.default').click());
      expect(moveMemoryLocation).toHaveBeenLastCalledWith('ada', null);
      expect(container.textContent).toContain('/home/me/.deepseek/botharness/bots/ada/memory');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it('shows cached Grants immediately when returning to the same PersonaBot', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grant = {
      id: 'grant-cached',
      botSlug: 'ada',
      workspaceId: 'workspace-cached',
      workspacePath: '/tmp/cached',
      workspaceTitle: 'cached project',
      createdAt: '2026-09-25T00:00:00.000Z',
    };
    const actions = {
      listWorkspaceGrants: vi
        .fn()
        .mockResolvedValueOnce([grant])
        .mockImplementation(() => new Promise<never>(() => undefined)),
      listWorkspaceOptions: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-ada',
      botSlug: 'ada',
      actions,
      t: zhTranslate,
    };
    try {
      await act(async () => root.render(createElement(WorkspaceGrantsEntry, props)));
      expect(container.textContent).toContain('cached project');
      act(() => root.render(null));
      act(() => root.render(createElement(WorkspaceGrantsEntry, props)));
      expect(container.textContent).toContain('cached project');
      expect(container.querySelector('.bh-skeleton')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows active Grants while unrelated workspace data is still loading', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const actions = {
      listWorkspaceOptions: vi.fn(() => new Promise<never>(() => undefined)),
      listWorkspaceGrants: vi.fn(async () => [
        {
          id: 'grant-1',
          botSlug: 'ada',
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/project',
          workspaceTitle: 'project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      expect(
        container.querySelector('button.bh-workspace-folder-delete[aria-label*="project"]'),
      ).toBeTruthy();
      expect(container.textContent).not.toContain('正在加载工作区');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows a successful revoke immediately even when sidebar refresh stalls', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/project',
      workspaceTitle: 'project',
      createdAt: '2026-09-25T00:00:00.000Z',
    };
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi
        .fn()
        .mockResolvedValueOnce([grant])
        .mockResolvedValue([{ ...grant, revokedAt: '2026-09-25T00:01:00.000Z' }]),
      memoryDirectory: vi
        .fn()
        .mockResolvedValueOnce('/tmp/memory')
        .mockImplementation(() => new Promise<never>(() => undefined)),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      revokeWorkspaceGrant: vi.fn(async () => ({
        ...grant,
        revokedAt: '2026-09-25T00:01:00.000Z',
      })),
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const remove = container.querySelector(
        'button.bh-workspace-folder-delete[aria-label*="project"]',
      ) as HTMLButtonElement;
      expect(remove).toBeTruthy();
      vi.useFakeTimers();
      await act(async () => {
        remove.click();
        await Promise.resolve();
      });
      expect(
        container.querySelector('button.bh-workspace-folder-delete[aria-label*="project"]'),
      ).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(15_001);
        await Promise.resolve();
      });
      expect(container.textContent).not.toContain('操作等待超时');
    } finally {
      vi.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('shows progress and recovers if revocation never settles', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const revokeWorkspaceGrant = vi.fn(() => new Promise<never>(() => undefined));
    const actions = {
      listWorkspaceOptions: vi.fn(async () => []),
      listWorkspaceGrants: vi.fn(async () => [
        {
          id: 'grant-1',
          botSlug: 'ada',
          workspaceId: 'workspace-1',
          workspacePath: '/tmp/project',
          workspaceTitle: 'project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      revokeWorkspaceGrant,
    } as unknown as BridgeActions;
    try {
      await act(async () =>
        root.render(
          createElement(WorkspaceGrantsEntry, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions,
            t: zhTranslate,
          }),
        ),
      );
      const remove = container.querySelector(
        'button.bh-workspace-folder-delete[aria-label*="project"]',
      ) as HTMLButtonElement;
      expect(remove).toBeTruthy();
      vi.useFakeTimers();
      act(() => remove.click());
      expect(revokeWorkspaceGrant).toHaveBeenCalledWith('ada', 'grant-1');
      expect(container.textContent).toContain('正在处理工作区操作');
      expect(remove.disabled).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(15_001);
        await Promise.resolve();
      });
      expect(container.textContent).toContain('操作等待超时');
      expect(remove.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
