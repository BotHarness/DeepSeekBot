// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CloudSnapshot } from '../src/cloud/client';
import { publicInstance, MOBILE_REDIRECT_URI, ClientError } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
const mocks = vi.hoisted(() => ({
  snapshot: undefined as CloudSnapshot | undefined,
  scope: '',
  prepare: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { replace: mocks.replace },
  useLocalSearchParams: () => ({
    instanceId: 'uat',
    organizationId: 'org_a',
    accountScope: mocks.scope,
  }),
}));
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => mocks.snapshot,
  cloudClient: { createChannel: mocks.create, getSnapshot: () => mocks.snapshot },
}));
vi.mock('../src/cloud/native-conversations', () => ({
  cloudConversations: { refresh: mocks.refresh },
}));
vi.mock('../src/cloud/prepare-creation', () => ({ prepareCloudCreation: mocks.prepare }));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}));
import { CloudCreateChannelScreen } from '../src/ui/cloud/create-channel-screen';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
async function render() {
  mocks.snapshot = {
    ready: true,
    busy: false,
    rows: [
      {
        config: publicInstance({
          instanceId: 'uat',
          environment: 'uat',
          server: 'https://uat.example.test',
          clientId: 'client_test',
          issuer: 'https://api.workos.com/user_management/client_test',
          authkitDomain: 'test-staging.authkit.app',
          mobileRedirectUri: MOBILE_REDIRECT_URI,
        }),
        hasSession: true,
        sessionUserId: 'user_a',
        organization: {
          organizationId: 'org_a',
          name: 'Workspace A',
          role: 'owner',
          description: '',
          version: 1,
        },
        pendingChannelAction: {
          kind: 'channel.create',
          organizationId: 'org_a',
          value: 'Keep my draft',
          operation: 'request_a',
          userId: 'user_a',
        },
      },
    ],
  };
  mocks.scope = cloudViewScope(mocks.snapshot.rows[0]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CloudCreateChannelScreen />));
}
it('keeps the same draft input mounted while owner refresh clears the selected organization', async () => {
  await render();
  const input = host.querySelector('textarea');
  expect(input).not.toBeNull();
  delete mocks.snapshot!.rows[0]!.organization;
  await act(async () => root.render(<CloudCreateChannelScreen />));
  expect(host.querySelector('textarea')).toBe(input);
  expect(host.textContent).toContain('Workspace A');
  expect(input?.value).toBe('Keep my draft');
});
it('removes the old account form instead of carrying its draft into a replacement login', async () => {
  await render();
  mocks.snapshot!.rows[0]!.sessionUserId = 'user_b';
  await act(async () => root.render(<CloudCreateChannelScreen />));
  expect(host.querySelector('textarea')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('does not create after the form is dismissed during permission preflight', async () => {
  let finish: () => void = () => {};
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  const button = host.querySelector('button');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  expect(mocks.prepare).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  await act(async () => finish());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('opens the created channel without starting a competing directory request', async () => {
  await render();
  mocks.create.mockResolvedValueOnce({ channelId: 'channel_created' });
  mocks.replace.mockImplementationOnce(() => {
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  await act(async () => host.querySelector('button')!.click());
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith('uat', 'org_a', 'Keep my draft');
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
    pathname: '/cloud-channels',
    params: {
      instanceId: 'uat',
      organizationId: 'org_a',
      accountScope: mocks.scope,
      channelId: 'channel_created',
    },
  });
});

it.each(['INSTANCE_ACCESS_DENIED', 'LOGIN_REQUIRED', 'ORGANIZATION_ACCESS_DENIED'])(
  'removes owner actions after %s instead of reviving captured authority',
  async (code) => {
    await render();
    mocks.prepare.mockImplementationOnce(async () => {
      delete mocks.snapshot!.rows[0]!.organization;
      throw new ClientError(code);
    });
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain(code);
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () => root.render(<CloudCreateChannelScreen />));
    expect(host.querySelector('button')).toBeNull();
  },
);

it('keeps the draft and retry available after a transient preflight failure', async () => {
  await render();
  mocks.prepare.mockImplementationOnce(async () => {
    delete mocks.snapshot!.rows[0]!.organization;
    throw new ClientError('NETWORK_UNAVAILABLE');
  });
  const input = host.querySelector('textarea');
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('textarea')).toBe(input);
  expect(input?.value).toBe('Keep my draft');
  expect(host.querySelector('button')?.disabled).toBe(false);
  expect(mocks.create).not.toHaveBeenCalled();
});

it('removes owner actions when access is revoked between preflight and the write', async () => {
  await render();
  mocks.prepare.mockResolvedValueOnce(undefined);
  mocks.create.mockImplementationOnce(async () => {
    delete mocks.snapshot!.rows[0]!.organization;
    throw new ClientError('ORGANIZATION_ACCESS_DENIED');
  });
  await act(async () => host.querySelector('button')!.click());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(host.querySelector('button')).toBeNull();
  expect(host.textContent).toContain('ORGANIZATION_ACCESS_DENIED');
  expect(mocks.replace).not.toHaveBeenCalled();
});
