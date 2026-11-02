import { expect, it, vi } from 'vitest';
import { prepareCloudCreation } from '../src/cloud/prepare-creation';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import type { CloudRow, Organization } from '../src/cloud/client';

function fixture() {
  const row: CloudRow = {
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
  };
  const org: Organization = {
    organizationId: 'org_a',
    name: 'A',
    description: '',
    version: 1,
    role: 'owner',
  };
  const port = {
    getSnapshot: () => ({ ready: true, busy: false, rows: [row] }),
    whoami: vi.fn(async () => ({
      instanceId: 'uat',
      userId: row.sessionUserId!,
      instanceRole: 'user' as const,
    })),
    useOrganization: vi.fn(async () => org),
  };
  const target = {
    scope: cloudViewScope(row),
    instanceId: 'uat',
    organizationId: org.organizationId,
    organizationName: org.name,
    server: row.config.server,
    guest: false,
  };
  return { row, org, port, target };
}
it('refreshes the captured source and organization owner before opening creation', async () => {
  const f = fixture();
  await prepareCloudCreation(f.port, f.target);
  expect(f.port.whoami).toHaveBeenCalledWith('uat');
  expect(f.port.useOrganization).toHaveBeenCalledWith('uat', 'org_a');
});
it('rejects a changed account before any organization selection', async () => {
  const f = fixture();
  f.row.sessionUserId = 'user_b';
  await expect(prepareCloudCreation(f.port, f.target)).rejects.toMatchObject({
    code: 'SOURCE_CHANGED',
  });
  expect(f.port.useOrganization).not.toHaveBeenCalled();
});
it('rejects an account change during verification instead of selecting under the replacement account', async () => {
  const f = fixture();
  f.port.whoami.mockImplementation(async () => {
    f.row.sessionUserId = 'user_b';
    return { instanceId: 'uat', userId: 'user_b', instanceRole: 'user' };
  });
  await expect(prepareCloudCreation(f.port, f.target)).rejects.toMatchObject({
    code: 'SOURCE_CHANGED',
  });
  expect(f.port.useOrganization).not.toHaveBeenCalled();
});
it('refuses a revoked owner role even if a cached menu still offered creation', async () => {
  const f = fixture();
  f.org.role = 'member';
  await expect(prepareCloudCreation(f.port, f.target)).rejects.toMatchObject({
    code: 'ORGANIZATION_OWNER_REQUIRED',
  });
});
