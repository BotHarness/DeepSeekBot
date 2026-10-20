// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { createHostClient, type HostClient } from '../src/host/client';
import { grantRequestPort, loadGrantRequest, type RequestRef } from '../src/host/requests';
import { GrantRequestCard } from '../src/ui/chat/grant-request-card';
import { t } from '../src/ui/strings';
import { played } from './expo-haptics-shim';
import { FakeHost } from './fake-host';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ROUTE = 'https://studio.tailnet-example.ts.net';
const REF: RequestRef = { channelId: 'dm-ada', messageId: 'grant-1', botSlug: 'ada' };
const REASON = 'I need to write the report into your project folder.';
const PROJECT = { id: 'ws-project', path: '/Users/qa/Project', title: 'Project' };

function request(extra: Record<string, unknown> = {}) {
  return {
    id: REF.messageId,
    at: '2026-10-20T00:00:00.000Z',
    author: { kind: 'bot', slug: REF.botSlug },
    body: REASON,
    grantRequest: true,
    ...extra,
  };
}

function grant(orchestratorWrite = true) {
  return {
    id: 'grant-9',
    workspaceId: PROJECT.id,
    workspacePath: PROJECT.path,
    workspaceTitle: PROJECT.title,
    orchestratorWrite,
  };
}

let client: HostClient | undefined;
let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  played.length = 0;
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  client?.stop();
});

function host(entries: unknown[] = [request()]): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('channelTimeline', () => ({ page: { entries } }));
  fake.methods.set('directoryPicker/list', (args) => {
    const path = typeof args['path'] === 'string' ? args['path'] : '/Users/qa';
    return {
      path,
      crumbs:
        path === PROJECT.path
          ? [
              { name: 'qa', path: '/Users/qa' },
              { name: 'Project', path: PROJECT.path },
            ]
          : [{ name: 'qa', path: '/Users/qa' }],
      entries: path === PROJECT.path ? [] : [{ name: 'Project', path: PROJECT.path }],
    };
  });
  fake.methods.set('workspaceOptions', () => ({ workspaces: [PROJECT] }));
  fake.methods.set('workspace/create', () => ({ workspace: { workspaceId: PROJECT.id } }));
  fake.methods.set('grantRequestApprove', () => ({ grant: grant(), message: {} }));
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

async function settle(): Promise<void> {
  for (let tries = 0; tries < 20; tries += 1)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function render(element: ReactElement): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await settle();
  return container;
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

const line = (view: HTMLElement) =>
  view.querySelector('[data-testid="card-line"]')?.getAttribute('aria-label');
const category = t.kind['workspace-grant-request']!;
const approvals = (fake: FakeHost) =>
  fake.calls.filter((call) => call.method === 'grantRequestApprove');

function card(target: HostClient, extra: Record<string, unknown> = {}) {
  return createElement(GrantRequestCard, {
    port: grantRequestPort(target, REF),
    botName: 'Ada',
    ...extra,
  });
}

describe('Folder request card', () => {
  it('chooses a folder on the computer and allows read/write through the Owner command', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    expect(view.textContent).toContain(t.grantTitle);
    expect(view.textContent).toContain(REASON);
    expect(view.textContent).toContain(t.grantScopeNote);

    await press(button(view, t.grantChoose));
    await press(button(view, 'Project'));
    await press(button(view, t.authorizeHere));
    expect(view.textContent).toContain(t.grantConfirm('Ada'));
    expect(approvals(fake)).toEqual([]);

    await press(button(view, t.grantAllow));
    expect(approvals(fake)).toEqual([
      {
        method: 'grantRequestApprove',
        args: {
          slug: 'ada',
          channelId: 'dm-ada',
          requestMessageId: 'grant-1',
          workspaceId: PROJECT.id,
          acknowledgeReadWrite: true,
        },
      },
    ]);
    expect(played).toEqual(['notification:success']);
    expect(line(view)).toBe(t.cardLine(category, `${t.grantAllowed} · Project`));
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });

  it('names the open folder it will authorize after backing out of a registered pick', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    await press(button(view, t.grantChoose));
    const registered = [...view.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(
      (node) => node.getAttribute('aria-label')!.includes(PROJECT.path),
    )!;
    await press(registered);
    expect(view.textContent).toContain(t.grantConfirm('Ada'));
    await press(button(view, t.back));
    expect(view.textContent).toContain(t.authorizeTarget('/Users/qa'));
    expect(view.textContent).not.toContain(t.authorizeTarget(PROJECT.path));
    expect(approvals(fake)).toEqual([]);
  });

  it('sends nothing when the picker is cancelled', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    await press(button(view, t.grantChoose));
    await press(button(view, t.cancel));
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    expect(button(view, t.grantChoose).disabled).toBe(false);
    expect(approvals(fake)).toEqual([]);
  });

  it('browses through BotHarness when the computer opens its own folder chooser', async () => {
    const fake = host();
    const listed = fake.methods.get('directoryPicker/list')!;
    fake.methods.delete('directoryPicker/list');
    fake.answers.set('directoryPicker/list', () => ({
      ok: false,
      error: { code: 'directory-picker/unavailable', message: 'native chooser' },
    }));
    fake.methods.set('folderBrowse', (args) => ({
      ...(listed(args) as object),
      roots: [
        { name: 'qa', path: '/Users/qa' },
        { name: 'D:\\', path: 'D:\\' },
      ],
    }));
    const view = await render(card(connect(fake)));
    await press(button(view, t.grantChoose));
    expect(view.textContent).not.toContain(t.browseUnavailableTypePath);
    expect(view.textContent).toContain(t.browseLocations);
    expect(view.querySelector(`[aria-label="${t.folderPath}"]`)).toBeNull();
    await press(button(view, 'Project'));
    await press(button(view, t.authorizeHere));
    expect(fake.calls.filter((call) => call.method === 'workspace/create')).toEqual([
      { method: 'workspace/create', args: { request: { path: PROJECT.path } } },
    ]);
    expect(fake.calls.filter((call) => call.method === 'folderBrowse')).toEqual([
      { method: 'folderBrowse', args: {} },
      { method: 'folderBrowse', args: { path: PROJECT.path } },
    ]);
  });

  it('takes a typed folder path when an older computer cannot list folders', async () => {
    const fake = host();
    fake.methods.delete('directoryPicker/list');
    fake.answers.set('directoryPicker/list', () => ({
      ok: false,
      error: { code: 'directory-picker/unavailable', message: 'native chooser' },
    }));
    fake.answers.set('folderBrowse', () => ({
      ok: false,
      error: { code: 'unknown-method', message: 'folderBrowse is not a method' },
    }));
    const view = await render(card(connect(fake)));
    await press(button(view, t.grantChoose));
    expect(view.textContent).toContain(t.browseUnavailableTypePath);
    expect(button(view, t.authorizeHere).disabled).toBe(true);
    const input = view.querySelector<HTMLInputElement>(`[aria-label="${t.folderPath}"]`)!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input) as object,
        'value',
      )!.set!;
      setter.call(input, ` ${PROJECT.path} `);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await press(button(view, t.authorizeHere));
    expect(fake.calls.filter((call) => call.method === 'workspace/create')).toEqual([
      { method: 'workspace/create', args: { request: { path: PROJECT.path } } },
    ]);
    await press(button(view, t.grantAllow));
    expect(approvals(fake)).toHaveLength(1);
    expect(line(view)).toBe(t.cardLine(category, `${t.grantAllowed} · Project`));
  });

  it('keeps the request open when the computer does not confirm write access', async () => {
    const fake = host();
    fake.methods.set('grantRequestApprove', () => ({ grant: grant(false), message: {} }));
    const view = await render(card(connect(fake)));
    await press(button(view, t.grantChoose));
    await press(button(view, t.authorizeHere));
    await press(button(view, t.grantAllow));
    expect(view.querySelector('[role="dialog"]')?.textContent).toContain(t.decideFailed);
    expect(button(view, t.grantAllow).disabled).toBe(false);
    expect(line(view)).toBeUndefined();
  });

  it('says so when another device answered first', async () => {
    const fake = host();
    const view = await render(card(connect(fake)));
    fake.methods.set('grantRequestApprove', () => {
      throw new Error('Workspace request is no longer available for this Bot');
    });
    fake.methods.set('channelTimeline', () => ({
      page: { entries: [request({ grantRequestResolved: true })] },
    }));
    await press(button(view, t.grantChoose));
    await press(button(view, t.authorizeHere));
    await press(button(view, t.grantAllow));
    expect(line(view)).toBe(t.cardLine(category, t.elsewhere(t.cardDecided)));
  });

  it('collapses an answered request without asking the Host', async () => {
    const fake = host();
    const view = await render(card(connect(fake), { resolved: true }));
    expect(line(view)).toBe(t.cardLine(category, t.cardDecided));
    expect(
      fake.calls.filter((call) => ['channelTimeline', 'grantRequestApprove'].includes(call.method)),
    ).toEqual([]);
  });
});

describe('Folder request on the wire', () => {
  it('reads an answered request from the resolution that follows it', async () => {
    const fake = host([
      request(),
      {
        id: 'grant-resolution-grant-1',
        at: '2026-10-20T00:01:00.000Z',
        author: { kind: 'human' },
        body: 'I authorized workspace “Project” for read/write. Continue the original task.',
        replyTo: REF.messageId,
        grantRequestResolution: { requestMessageId: REF.messageId, grantId: 'grant-9' },
      },
    ]);
    expect(await loadGrantRequest(connect(fake), REF)).toEqual({
      ...REF,
      reason: REASON,
      status: 'decided',
    });
  });

  it('refuses a message from another Bot', async () => {
    const fake = host([request({ author: { kind: 'bot', slug: 'bob' } })]);
    await expect(loadGrantRequest(connect(fake), REF)).rejects.toThrow('not a folder request');
  });
});
