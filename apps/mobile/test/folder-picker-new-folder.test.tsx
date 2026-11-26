// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({ confirmDestructive: vi.fn() }));

import { botSettings, createHostFolder } from '@botharness/host-client/bot-settings';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { grantRequestPort, type RequestRef } from '@botharness/host-client/requests';
import { FolderPickerSheet, type PickedFolder } from '../src/ui/chat/folder-picker-sheet';
import { GrantRequestCard } from '../src/ui/chat/grant-request-card';
import { WorkspaceSheet } from '../src/ui/chat/workspace-sheet';
import { t } from '../src/ui/strings';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ROUTE = 'https://studio.tailnet-example.ts.net';
const HOME = '/Users/qa';
const REPORTS = { id: 'ws-reports', path: `${HOME}/Reports`, title: 'Reports' };
const REF: RequestRef = { channelId: 'dm-ada', messageId: 'grant-1', botSlug: 'ada' };

let client: HostClient | undefined;
let root: Root | undefined;
let view: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  view?.remove();
  root = undefined;
  client?.stop();
});

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('channelTimeline', () => ({
    revision: 1,
    page: {
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
      entries: [
        {
          id: REF.messageId,
          at: '2026-11-25T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'I need a folder for the report.',
          grantRequest: true,
        },
      ],
    },
  }));
  fake.methods.set('directoryPicker/list', () => ({
    path: HOME,
    crumbs: [{ name: 'qa', path: HOME }],
    entries: [{ name: 'Project', path: `${HOME}/Project` }],
  }));
  fake.methods.set('workspaceOptions', () => ({ workspaces: [] }));
  fake.methods.set('folderCreate', () => REPORTS);
  return fake;
}

function connect(fake: FakeHost): HostClient {
  client = createHostClient({
    routes: [ROUTE],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

const create = (target: HostClient) => (parent: string, name: string) =>
  createHostFolder(target, { parent, name });

async function settle(): Promise<void> {
  for (let tries = 0; tries < 20; tries += 1)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function render(element: ReactElement): Promise<HTMLElement> {
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
  await act(async () => root!.render(element));
  await settle();
  return view;
}

function button(label: string): HTMLButtonElement {
  const found = view!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(label: string): Promise<void> {
  const target = button(label);
  await act(async () => target.click());
  await settle();
}

async function typeName(name: string): Promise<void> {
  const field = view!.querySelector<HTMLTextAreaElement>(`[aria-label="${t.newFolderName}"]`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(field, name);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const creations = (fake: FakeHost) => fake.calls.filter((call) => call.method === 'folderCreate');

function picker(target: HostClient, onPick: (folder: PickedFolder) => void, allowed = true) {
  const port = grantRequestPort(target, REF);
  return (
    <FolderPickerSheet
      port={{ ...port, createFolder: allowed ? create(target) : undefined }}
      pick={{
        title: 'Folder',
        subtitle: 'Pick one',
        heading: 'Folders',
        target: (path) => `Use ${path}`,
        confirm: 'Use folder',
        onPick,
      }}
      onClose={() => {}}
    />
  );
}

describe('New folder in the shared folder picker', () => {
  it('creates one folder under the browsed folder and selects its Workspace for New Session', async () => {
    const fake = host();
    const picked = vi.fn();
    await render(picker(connect(fake), picked));
    await press(t.newFolder);
    expect(view!.textContent).toContain(HOME);
    expect(button(t.newFolderCreate).disabled).toBe(true);

    await typeName('Reports');
    await press(t.newFolderCreate);

    expect(creations(fake)).toEqual([
      { method: 'folderCreate', args: { parent: HOME, name: 'Reports' } },
    ]);
    expect(picked).toHaveBeenCalledExactlyOnceWith({
      path: REPORTS.path,
      title: REPORTS.title,
      workspaceId: REPORTS.id,
    });
  });

  it('refuses a name with a separator or traversal before asking the Host', async () => {
    const fake = host();
    await render(picker(connect(fake), vi.fn()));
    await press(t.newFolder);
    for (const name of ['a/b', '..', 'x\\y']) {
      await typeName(name);
      expect(view!.textContent).toContain(t.newFolderProblem.segment);
      expect(button(t.newFolderCreate).disabled).toBe(true);
    }
    expect(creations(fake)).toEqual([]);
  });

  it.each([
    ['folder-create/already-exists', t.newFolderRefusal.exists],
    ['folder-create/outside-grant', t.newFolderRefusal['outside-grant']],
    ['folder-create/denied', t.newFolderRefusal.denied],
    ['permission-required', t.newFolderRefusal.permission],
  ])('shows the Host refusal %s inline and keeps the name', async (code, message) => {
    const fake = host();
    fake.methods.delete('folderCreate');
    fake.answers.set('folderCreate', () => ({ ok: false, error: { code, message: 'Host text' } }));
    const picked = vi.fn();
    await render(picker(connect(fake), picked));
    await press(t.newFolder);
    await typeName('Reports');
    await press(t.newFolderCreate);

    expect(view!.textContent).toContain(message);
    expect(view!.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Reports');
    expect(picked).not.toHaveBeenCalled();
  });

  it('hides New folder without the Host Permission', async () => {
    await render(picker(connect(host()), vi.fn(), false));
    expect(view!.querySelector(`button[aria-label="${t.newFolder}"]`)).toBeNull();
    expect(view!.textContent).toContain('Project');
  });

  it('goes back to browsing without creating anything', async () => {
    const fake = host();
    await render(picker(connect(fake), vi.fn()));
    await press(t.newFolder);
    await press(t.back);
    expect(view!.textContent).toContain('Project');
    expect(creations(fake)).toEqual([]);
  });

  it('selects the new folder in a Bot folder-request card and asks to allow read/write', async () => {
    const fake = host();
    const target = connect(fake);
    await render(
      <GrantRequestCard
        port={{ ...grantRequestPort(target, REF), createFolder: create(target) }}
        botName="Ada"
      />,
    );
    await press(t.grantChoose);
    await press(t.newFolder);
    await typeName('Reports');
    await press(t.newFolderCreate);

    expect(view!.textContent).toContain(t.grantConfirm('Ada'));
    expect(view!.textContent).toContain(REPORTS.path);
  });

  it('selects the new folder in Bot Workspace grants and authorizes that Workspace', async () => {
    const fake = host();
    fake.methods.set('grantCreate', () => ({
      grant: {
        id: 'grant-1',
        botSlug: 'ada',
        createdAt: '2026-11-25T00:00:00Z',
        workspaceId: REPORTS.id,
        workspacePath: REPORTS.path,
        workspaceTitle: REPORTS.title,
        orchestratorWrite: false,
      },
    }));
    const target = connect(fake);
    const changed = vi.fn();
    await render(
      <WorkspaceSheet
        visible
        botName="Ada"
        settings={botSettings(target, 'ada')}
        grants={{ status: 'ready', value: [] }}
        access={{ status: 'ready', value: { mode: 'workspace-write', scope: 'chat', revision: 1 } }}
        templates={{ status: 'ready', value: { templates: [], selected: null } }}
        onRetryGrants={() => {}}
        onGrantsChanged={changed}
        onAccess={() => {}}
        onTemplates={() => {}}
        onClose={() => {}}
        createFolder={create(target)}
      />,
    );
    await press(t.addFolder);
    await press(t.newFolder);
    await typeName('Reports');
    await press(t.newFolderCreate);
    expect(view!.textContent).toContain(t.confirmGrant('Ada'));
    expect(view!.textContent).toContain(REPORTS.path);

    await press(t.authorize);
    expect(fake.calls.filter((call) => call.method === 'grantCreate')).toEqual([
      expect.objectContaining({ args: expect.objectContaining({ workspaceId: REPORTS.id }) }),
    ]);
    expect(changed).toHaveBeenCalledOnce();
  });
});
