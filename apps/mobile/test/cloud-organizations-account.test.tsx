// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { CloudSnapshot, Organization } from '../src/cloud/client';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { t } from '../src/ui/strings';
const mocks = vi.hoisted(() => ({
  snapshot: undefined as CloudSnapshot | undefined,
  list: vi.fn(),
  select: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
  useLocalSearchParams: () => ({ instanceId: 'uat' }),
}));
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => mocks.snapshot,
  cloudClient: { listOrganizations: mocks.list, useOrganization: mocks.select },
}));
import { CloudOrganizationsScreen } from '../src/ui/cloud/organizations-screen';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});
const organization: Organization = {
  organizationId: 'org_a',
  name: 'Only account A',
  role: 'owner',
  description: '',
  version: 1,
};
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
        identity: { userId: 'user_a', instanceId: 'uat', instanceRole: 'user' },
      },
    ],
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await rerender();
}
async function rerender() {
  await act(async () => root.render(<CloudOrganizationsScreen />));
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function replaceAccount() {
  const row = mocks.snapshot!.rows[0]!;
  row.sessionUserId = 'user_b';
  row.identity = { userId: 'user_b', instanceId: 'uat', instanceRole: 'user' };
  await rerender();
}
it('clears the old account organization rows and pagination before loading the replacement account', async () => {
  mocks.list.mockResolvedValue({ organizations: [organization], nextCursor: 'cursor_a' });
  await render();
  await click(t.cloudOrganizations.list);
  expect(host.textContent).toContain(organization.name);
  await replaceAccount();
  expect(host.textContent).not.toContain(organization.name);
  expect(host.textContent).not.toContain(t.cloudOrganizations.more);
  expect(mocks.select).not.toHaveBeenCalled();
});
it('does not revive old organization rows after logout followed by a new login', async () => {
  mocks.list.mockResolvedValue({ organizations: [organization], nextCursor: null });
  await render();
  await click(t.cloudOrganizations.list);
  const row = mocks.snapshot!.rows[0]!;
  row.hasSession = false;
  delete row.sessionUserId;
  delete row.identity;
  await rerender();
  expect(host.textContent).not.toContain(organization.name);
  row.hasSession = true;
  await replaceAccount();
  expect(host.textContent).not.toContain(organization.name);
});
it('ignores the previous account delayed organization response without blocking the new account', async () => {
  let finish!: (value: { organizations: Organization[]; nextCursor: string | null }) => void;
  mocks.list.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await click(t.cloudOrganizations.list);
  await replaceAccount();
  await act(async () => finish({ organizations: [organization], nextCursor: 'cursor_a' }));
  expect(host.textContent).not.toContain(organization.name);
  mocks.list.mockResolvedValueOnce({
    organizations: [{ ...organization, organizationId: 'org_b', name: 'Only account B' }],
    nextCursor: null,
  });
  await click(t.cloudOrganizations.list);
  expect(host.textContent).toContain('Only account B');
  expect(host.textContent).not.toContain(organization.name);
});

it('keeps the current account rows during identity revalidation', async () => {
  mocks.list.mockResolvedValue({ organizations: [organization], nextCursor: 'cursor_a' });
  await render();
  await click(t.cloudOrganizations.list);
  delete mocks.snapshot!.rows[0]!.identity;
  await rerender();
  mocks.snapshot!.rows[0]!.identity = {
    userId: 'user_a',
    instanceId: 'uat',
    instanceRole: 'user',
  };
  await rerender();
  expect(host.textContent).toContain(organization.name);
  expect(host.textContent).toContain(t.cloudOrganizations.more);
});
