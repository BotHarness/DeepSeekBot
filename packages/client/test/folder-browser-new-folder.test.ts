// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),
    ...dialogPrimitives(),
  };
});

import { createActions, type HostDirectoryListing } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { createStore } from '../src/client/store.js';
import { FolderBrowser } from '../src/client/workspace-grants-entry.js';
import { buttonNamed, fieldNamed, typeInto } from './primitive-mocks.js';
import { fakeTeamMode } from '../../host-client/test/reader-fixtures.js';

const t = zhTranslate;
const home: HostDirectoryListing = {
  path: '/home/ada',
  home: '/home/ada',
  crumbs: [{ name: 'ada', path: '/home/ada', hidden: false }],
  entries: [{ name: 'project', path: '/home/ada/project', hidden: false }],
  truncated: false,
};
const REPORTS = { id: 'ws-reports', path: '/home/ada/Reports', title: 'Reports' };

type Answer =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

function host({
  viewer = {},
  create = { ok: true, value: REPORTS },
}: {
  viewer?: Parameters<typeof fakeTeamMode>[0];
  create?: Answer;
} = {}) {
  const call = vi.fn(async (method: string, _input: Record<string, unknown>): Promise<Answer> => {
    if (method === 'teamMode') return { ok: true, value: fakeTeamMode(viewer) };
    if (method === 'folderCreate') return create;
    return { ok: true, value: home };
  });
  return { call, actions: createActions(call, createStore()) };
}

async function render(actions: ReturnType<typeof host>['actions'], onChoose = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(FolderBrowser, {
        initial: home,
        actions,
        onChoose,
        onCancel: vi.fn(),
        busy: false,
        t,
      }),
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return onChoose;
}

const newFolderButton = () => document.querySelector('[data-folder-browser-new]');
const creations = (call: ReturnType<typeof host>['call']) =>
  call.mock.calls
    .filter(([method]) => method === 'folderCreate')
    .map(([method, input]) => [method, input]);

describe('FolderBrowser New folder', () => {
  it('creates one folder in the browsed folder and chooses its registered path', async () => {
    const { call, actions } = host();
    const onChoose = await render(actions);
    await act(async () => buttonNamed(t('grant.newFolder')).click());
    expect(document.body.textContent).toContain(t('grant.newFolderIn', { path: home.path }));
    expect(buttonNamed(t('grant.authorize')).disabled).toBe(true);

    await typeInto(fieldNamed(t('grant.newFolderName')), '  Reports ');
    await act(async () => buttonNamed(t('grant.newFolderCreate')).click());

    expect(creations(call)).toEqual([['folderCreate', { parent: home.path, name: 'Reports' }]]);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(REPORTS.path);
  });

  it('refuses separators and traversal before calling the Host', async () => {
    const { call, actions } = host();
    await render(actions);
    await act(async () => buttonNamed(t('grant.newFolder')).click());
    for (const name of ['a/b', '..', 'a\\b']) {
      await typeInto(fieldNamed(t('grant.newFolderName')), name);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        t('grant.newFolder.segment'),
      );
      expect(buttonNamed(t('grant.newFolderCreate')).disabled).toBe(true);
    }
    expect(creations(call)).toEqual([]);
  });

  it.each([
    ['folder-create/already-exists', 'grant.newFolder.exists'],
    ['folder-create/outside-grant', 'grant.newFolder.outsideGrant'],
    ['folder-create/denied', 'grant.newFolder.denied'],
    ['permission-required', 'grant.newFolder.permission'],
  ] as const)('shows the Host refusal %s inline', async (code, key) => {
    const { actions } = host({
      create: { ok: false, error: { code, message: 'Host text', details: {} } },
    });
    const onChoose = await render(actions);
    await act(async () => buttonNamed(t('grant.newFolder')).click());
    await typeInto(fieldNamed(t('grant.newFolderName')), 'Reports');
    await act(async () => buttonNamed(t('grant.newFolderCreate')).click());
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(t(key));
    expect(fieldNamed(t('grant.newFolderName')).value).toBe('Reports');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('shows New folder to a member with the Host Permission', async () => {
    const { actions } = host({
      viewer: { kind: 'member', permissions: ['workspaces.createFolder'] },
    });
    await render(actions);
    expect(newFolderButton()).not.toBeNull();
  });

  it('hides New folder from a member without the Host Permission', async () => {
    const { actions } = host({ viewer: { kind: 'member', permissions: [] } });
    await render(actions);
    expect(newFolderButton()).toBeNull();
    expect(document.body.textContent).toContain('project');
  });

  it('cancels back to the folder list without creating anything', async () => {
    const { call, actions } = host();
    await render(actions);
    await act(async () => buttonNamed(t('grant.newFolder')).click());
    await act(async () => buttonNamed(t('common.cancel'), document.querySelector('form')!).click());
    expect(newFolderButton()).not.toBeNull();
    expect(creations(call)).toEqual([]);
  });
});
