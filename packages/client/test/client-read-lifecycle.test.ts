// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  Switch: () => null,
  Modal: () => null,
  Input: (props: import('react').InputHTMLAttributes<HTMLInputElement>) =>
    createElement('span', null, createElement('input', props)),
  MenuSurface: (await import('react')).forwardRef<
    HTMLDivElement,
    import('react').HTMLAttributes<HTMLDivElement> & { compact?: boolean }
  >(({ compact: _compact, ...props }, ref) => createElement('div', { ...props, ref })),
  useAnchoredPosition: () => ({ top: 0, left: 0 }),
  useDismissOnOutsidePointer: () => undefined,
  IconChevronDownOutlineRegular: () => null,
  IconChevronLeftOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  IconEditOutlineRegular: () => null,
  IconInfoOutlineRegular: () => null,
  IconPinFillRegular: () => null,
  IconPinOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  Menu: ({ anchor }: { anchor: ReactNode }) => anchor,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconCloseOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

vi.mock('../src/client/modal.js', () => ({
  Modal: ({
    children,
    footer,
    open,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    open?: boolean;
  }) => (open === false ? null : createElement('section', null, children, footer)),
}));

vi.mock('../src/client/avatar.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/client/avatar.js')>()),
  PersonaBotAvatar: () => createElement('span', null),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryFileView } from '../src/client/memory-current-view.js';
import { GroupAvatarCropModal } from '../src/client/group-avatar-crop.js';
import { PersonaBotAvatarCropModal } from '../src/client/personabot-avatar-crop.js';
import { ProfileView } from '../src/client/personabot-profile.js';
import { SourcePolicyDetails } from '../src/client/source-policy.js';
import { WakePolicyBadge, WakePolicyEntry } from '../src/client/wake-policy-entry.js';
import { createProfileCardBuiltins } from '../src/client/profile-cards-builtins.js';
import type { ProfileCardRegistry, ProfileCardViewProps } from '../src/client/profile-cards.js';
import { useMountedResource } from '../src/client/mounted-resource.js';
import { WorkspaceGrantsEntry } from '../src/client/workspace-grants-entry.js';
import { publishWorkspaceGrantChange } from '../src/client/workspace-grant-events.js';
import type { BotSourcePolicyView } from '../src/client/bridge.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';
import { buttonNamed, fieldNamed, typeInto } from './primitive-mocks.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function Owner({ scope, record }: { scope: string; record: (value: string) => void }) {
  const mount = useMountedResource<HTMLDivElement>(() => {
    record('start:' + scope);
    return () => record('stop:' + scope);
  }, [scope, record]);
  return createElement('div', { ref: mount });
}

describe('mounted request ownership', () => {
  it('starts once per scope and cleans up before replacement and unmount', async () => {
    const events: string[] = [];
    const record = (event: string): void => {
      events.push(event);
    };
    await act(async () => root.render(createElement(Owner, { scope: 'ada', record })));
    await act(async () => root.render(createElement(Owner, { scope: 'ada', record })));
    await act(async () => root.render(createElement(Owner, { scope: 'bea', record })));
    await act(async () => root.render(null));
    expect(events).toEqual(['start:ada', 'stop:ada', 'start:bea', 'stop:bea']);
  });

  it('ignores a Memory file response from the previous Channel', async () => {
    const ada = deferred<{ path: string; body: string; head: string }>();
    const bea = deferred<{ path: string; body: string; head: string }>();
    const actions = {
      memoryFile: vi.fn((channelId: string) =>
        channelId === 'dm-ada' ? ada.promise : bea.promise,
      ),
    } as unknown as BridgeActions;
    const render = (channelId: string) =>
      createElement(MemoryFileView, {
        actions,
        channelId,
        path: 'PERSONA.md',
        onClose: () => {},
        t: zhTranslate,
      });
    await act(async () => root.render(render('dm-ada')));
    await act(async () => root.render(render('dm-bea')));
    await act(async () => ada.resolve({ path: 'PERSONA.md', body: 'Ada secret', head: 'a' }));
    expect(host.textContent).not.toContain('Ada secret');
    await act(async () => bea.resolve({ path: 'PERSONA.md', body: 'Bea memory', head: 'b' }));
    expect(host.textContent).toContain('Bea memory');
  });

  it('shows only the current PersonaBot Grants after rapid switching', async () => {
    const ada = deferred<Awaited<ReturnType<BridgeActions['listWorkspaceGrants']>>>();
    const bea = deferred<Awaited<ReturnType<BridgeActions['listWorkspaceGrants']>>>();
    const actions = {
      listWorkspaceGrants: vi.fn((slug: string) => (slug === 'ada' ? ada.promise : bea.promise)),
      listWorkspaceOptions: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
    } as unknown as BridgeActions;
    const render = (botSlug: string) =>
      createElement(WorkspaceGrantsEntry, {
        scope: 'personabot' as const,
        channelId: 'dm-' + botSlug,
        botSlug,
        actions,
        t: zhTranslate,
      });
    await act(async () => root.render(render('ada')));
    await act(async () => root.render(render('bea')));
    await act(async () =>
      ada.resolve([
        {
          id: 'ada',
          botSlug: 'ada',
          workspaceId: 'ada',
          workspacePath: '/tmp/ada',
          workspaceTitle: 'Ada project',
          path: '/tmp/ada',
          title: 'Ada project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
    );
    expect(host.textContent).not.toContain('Ada project');
    await act(async () =>
      bea.resolve([
        {
          id: 'bea',
          botSlug: 'bea',
          workspaceId: 'bea',
          workspacePath: '/tmp/bea',
          workspaceTitle: 'Bea project',
          path: '/tmp/bea',
          title: 'Bea project',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ]),
    );
    expect(host.textContent).toContain('Bea project');
    expect(host.textContent).not.toContain('Ada project');
    await act(async () => publishWorkspaceGrantChange('bea'));
    expect(actions.listWorkspaceGrants).toHaveBeenCalledTimes(3);
    await act(async () => root.render(null));
    await act(async () => publishWorkspaceGrantChange('bea'));
    expect(actions.listWorkspaceGrants).toHaveBeenCalledTimes(3);
  });

  it('keeps a completed revoke scoped to its original PersonaBot', async () => {
    const revoke = deferred<Awaited<ReturnType<BridgeActions['revokeWorkspaceGrant']>>>();
    const grant = (slug: string) => ({
      id: slug,
      botSlug: slug,
      workspaceId: slug,
      workspacePath: '/tmp/' + slug,
      workspaceTitle: slug + ' project',
      path: '/tmp/' + slug,
      title: slug + ' project',
      createdAt: '2026-09-25T00:00:00.000Z',
    });
    const actions = {
      listWorkspaceGrants: vi.fn(async (slug: string) => [grant(slug)]),
      listWorkspaceOptions: vi.fn(async () => []),
      memoryDirectory: vi.fn(async () => '/tmp/memory'),
      listToolApprovalRules: vi.fn(async () => []),
      assignmentAccess: vi.fn(async () => ({ mode: 'workspace-write' })),
      revokeWorkspaceGrant: vi.fn(() => revoke.promise),
    } as unknown as BridgeActions;
    const render = (botSlug: string) =>
      createElement(WorkspaceGrantsEntry, {
        scope: 'personabot' as const,
        channelId: 'dm-' + botSlug,
        botSlug,
        actions,
        t: zhTranslate,
      });
    await act(async () => root.render(render('ada')));
    const revokeButton = host.querySelector<HTMLButtonElement>('button[aria-label*="ada project"]');
    expect(revokeButton).not.toBeNull();
    await act(async () => revokeButton!.click());
    expect(actions.revokeWorkspaceGrant).toHaveBeenCalledWith('ada', 'ada');
    await act(async () => root.render(render('bea')));
    await act(async () =>
      revoke.resolve({ ...grant('ada'), revokedAt: '2026-09-29T00:00:00.000Z' }),
    );
    expect(host.textContent).toContain('bea project');
    expect(host.textContent).not.toContain('ada project');
  });

  it('keeps the new PersonaBot policy editor open through an old A-B-A save', async () => {
    const save = deferred<void>();
    const policy = (): BotSourcePolicyView => ({
      sourceClass: 'assignment-report',
      admission: 'admit',
      wake: 'conditional',
      delivery: 'steer',
      revision: 1,
      lastActor: { kind: 'built-in' },
      changedAt: '2026-09-25T00:00:00.000Z',
      overrideActive: false,
      recentWakeCount: 0,
    });
    const actions = {
      botSourcePolicies: vi.fn(async () => [policy()]),
      setBotSourcePolicy: vi.fn(() => save.promise),
    } as unknown as BridgeActions;
    const render = (slug: string) =>
      createElement(WakePolicyEntry, {
        scope: 'personabot' as const,
        channelId: 'dm-' + slug,
        botSlug: slug,
        actions,
        t: zhTranslate,
      });
    const edit = () =>
      host.querySelector<HTMLButtonElement>('.bh-wake-policy-entry button.bh-card-main');
    const saveButton = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === zhTranslate('profile.save'),
      );
    await act(async () => root.render(render('ada')));
    await act(async () => edit()?.click());
    await act(async () => saveButton()?.click());
    expect(actions.setBotSourcePolicy).toHaveBeenCalledWith('ada', {
      sourceClass: 'assignment-report',
      wake: 'conditional',
    });
    expect(saveButton()?.disabled).toBe(true);
    await act(async () => root.render(render('bea')));
    await act(async () => edit()?.click());
    expect(saveButton()?.disabled).toBe(false);
    await act(async () => root.render(render('ada')));
    await act(async () => edit()?.click());
    expect(saveButton()?.disabled).toBe(false);
    await act(async () => save.resolve());
    expect(saveButton()).toBeDefined();
    expect(saveButton()?.disabled).toBe(false);
  });

  it('edits ordinary Group digest from the Wake policy entry and updates its header summary', async () => {
    let ordinary: BotSourcePolicyView = {
      sourceClass: 'group-ordinary',
      admission: 'admit',
      wake: 'digest',
      delivery: 'steer',
      digestCount: 5,
      digestIntervalSeconds: 30,
      revision: 1,
      lastActor: { kind: 'built-in' },
      changedAt: '2026-10-07T00:00:00.000Z',
      overrideActive: false,
      recentWakeCount: 2,
    };
    const actions = {
      botSourcePolicies: vi.fn(async () => [ordinary]),
      setBotSourcePolicy: vi.fn(async (_slug: string, edit: Partial<BotSourcePolicyView>) => {
        ordinary = { ...ordinary, ...edit, revision: 2, overrideActive: true };
      }),
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-cora',
      botSlug: 'cora',
      actions,
      t: zhTranslate,
    };
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(WakePolicyBadge, props),
          createElement(WakePolicyEntry, props),
        ),
      ),
    );
    expect(host.querySelector('.bh-channel-sidebar-summary')?.textContent).toBe(
      '群聊 · 汇总 · 5 条 / 30 秒',
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.bh-wake-policy-entry button.bh-card-main')?.click(),
    );
    expect(fieldNamed(zhTranslate('sourcePolicy.digestCount')).value).toBe('5');
    expect(fieldNamed(zhTranslate('sourcePolicy.digestInterval')).value).toBe('30');
    await typeInto(fieldNamed(zhTranslate('sourcePolicy.digestCount')), '8');
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === zhTranslate('profile.save'))
        ?.click(),
    );
    expect(actions.setBotSourcePolicy).toHaveBeenCalledWith('cora', {
      sourceClass: 'group-ordinary',
      wake: 'digest',
      digestCount: 8,
      digestIntervalSeconds: 30,
    });
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('.bh-wake-policy-entry')?.textContent).toContain('已修改');
    expect(host.querySelector('.bh-channel-sidebar-summary')?.textContent).toBe(
      '群聊 · 汇总 · 8 条 / 30 秒',
    );
  });

  it('rejects an out-of-range digest and restores the default from the Wake policy dialog', async () => {
    const ordinary: BotSourcePolicyView = {
      sourceClass: 'group-ordinary',
      admission: 'admit',
      wake: 'digest',
      delivery: 'steer',
      digestCount: 5,
      digestIntervalSeconds: 30,
      revision: 2,
      lastActor: { kind: 'human' },
      changedAt: '2026-10-07T00:00:00.000Z',
      overrideActive: true,
      recentWakeCount: 0,
    };
    const actions = {
      botSourcePolicies: vi.fn(async () => [ordinary]),
      setBotSourcePolicy: vi.fn(async () => undefined),
      resetBotSourcePolicy: vi.fn(async () => undefined),
    } as unknown as BridgeActions;
    await act(async () =>
      root.render(
        createElement(WakePolicyEntry, {
          scope: 'personabot' as const,
          channelId: 'dm-dora',
          botSlug: 'dora',
          actions,
          t: zhTranslate,
        }),
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.bh-wake-policy-entry button.bh-card-main')?.click(),
    );
    await typeInto(fieldNamed(zhTranslate('sourcePolicy.digestInterval')), '0');
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(actions.setBotSourcePolicy).not.toHaveBeenCalled();
    expect(host.querySelector('form [role="alert"]')?.textContent).toBe(
      zhTranslate('sourcePolicy.saveFailed'),
    );
    await act(async () => buttonNamed(zhTranslate('sourcePolicy.reset'), host).click());
    expect(actions.resetBotSourcePolicy).toHaveBeenCalledWith('dora', 'group-ordinary');
    expect(host.querySelector('form')).toBeNull();
  });

  it.each<BotSourcePolicyView['lastActor']>([
    { kind: 'built-in' },
    { kind: 'template' },
    { kind: 'human' },
    { kind: 'bot', botSlug: 'ada' },
  ])('distinguishes restored audit state from $kind initialization', async (lastActor) => {
    const policy: BotSourcePolicyView = {
      sourceClass: 'human-dm',
      admission: 'admit',
      wake: 'immediate',
      delivery: 'steer',
      revision: 2,
      lastActor,
      changedAt: '2026-10-01T00:00:00.000Z',
      overrideActive: false,
      recentWakeCount: 0,
    };
    await act(async () =>
      root.render(
        createElement(SourcePolicyDetails, {
          policy,
          t: zhTranslate,
          onClose: () => {},
        }),
      ),
    );
    const audit = document.querySelector('.bh-source-policy-audit');
    expect(audit).not.toBeNull();
    expect(audit?.textContent?.includes('已恢复')).toBe(
      lastActor.kind === 'human' || lastActor.kind === 'bot',
    );
  });

  it.each([GroupAvatarCropModal, PersonaBotAvatarCropModal])(
    'releases preview URLs when the crop file changes and unmounts',
    async (CropModal) => {
      const create = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
      const revoke = vi.fn();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
      const first = new File(['first'], 'first.png', { type: 'image/png' });
      const second = new File(['second'], 'second.png', { type: 'image/png' });
      const render = (file: File) =>
        createElement(CropModal, {
          file,
          t: zhTranslate,
          onClose: () => {},
          onSave: async () => true,
        });
      await act(async () => root.render(render(first)));
      expect(create).toHaveBeenCalledWith(first);
      await act(async () => root.render(render(second)));
      expect(revoke).toHaveBeenCalledWith('blob:first');
      await act(async () => root.render(null));
      expect(revoke).toHaveBeenCalledWith('blob:second');
    },
  );

  it('shares a stable chart theme observer and disconnects on unmount', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    class ThemeObserver {
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('MutationObserver', ThemeObserver);
    const card = createProfileCardBuiltins(zhTranslate).find((entry) => entry.id === 'token-usage');
    expect(card).toBeDefined();
    const props = {
      bot: { slug: 'ada' } as ProfileCardViewProps['bot'],
      activity: undefined,
      t: zhTranslate,
      compact: false,
    };
    await act(async () => root.render(card?.render(props)));
    expect(observe).toHaveBeenCalledTimes(2);
    expect(disconnect).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
