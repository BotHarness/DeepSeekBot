import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceDirectory, cloudViewScope } from '../src/cloud/workspace-directory';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import type { CloudRow } from '../src/cloud/client';

const row = (instanceId = 'uat-one', hasSession = true): CloudRow => ({
  config: publicInstance({
    instanceId,
    environment: 'uat',
    server: `https://${instanceId}.example.test`,
    clientId: 'client_test',
    issuer: 'https://api.workos.com/user_management/client_test',
    authkitDomain: 'test-staging.authkit.app',
    mobileRedirectUri: MOBILE_REDIRECT_URI,
  }),
  hasSession,
});
const member = (organizationId: string) => ({
  organizationId,
  name: 'Member workspace',
  description: '',
  role: 'owner' as const,
  version: 1,
});
const guest = (organizationId: string) => ({
  organizationId,
  organizationName: 'Guest workspace',
  channelId: 'ch_' + 'a'.repeat(64),
  name: 'Shared channel',
  creatorId: 'user_a',
  creatorType: 'human' as const,
  createdAt: '2026-10-18T00:00:00Z',
});

describe('workspace directory authority and lifecycle', () => {
  it('discards view state across accounts, logout and trust replacement while preserving ordinary refreshes', () => {
    const accountA: CloudRow = {
      ...row(),
      sessionUserId: 'user_a',
      identity: { userId: 'user_a', instanceId: 'uat-one', instanceRole: 'user' },
    };
    const accountB: CloudRow = {
      ...accountA,
      sessionUserId: 'user_b',
      identity: { userId: 'user_b', instanceId: 'uat-one', instanceRole: 'user' },
    };
    expect(cloudViewScope(accountA)).not.toBe(cloudViewScope(accountB));
    expect(cloudViewScope(accountA)).not.toBe(cloudViewScope(row('uat-one', false)));
    expect(cloudViewScope(accountA)).not.toBe(cloudViewScope(row()));
    expect(cloudViewScope(accountA)).not.toBe(
      cloudViewScope({
        ...accountA,
        config: { ...accountA.config, server: 'https://replacement.example.test' },
      }),
    );
    expect(cloudViewScope(accountA)).toBe(
      cloudViewScope({
        ...accountA,
        identity: { ...accountA.identity! },
        organization: member('org_other'),
      }),
    );
  });

  it('keeps instances separate, deduplicates guest channels and prefers organization membership', async () => {
    const directory = createWorkspaceDirectory({
      listOrganizations: async () => ({ organizations: [member('org_member')], nextCursor: null }),
      listChannels: async (_id, org, _after, guests) => {
        expect(org).toBe('');
        expect(guests).toBe(true);
        return {
          channels: [guest('org_member'), guest('org_guest'), guest('org_guest')],
          nextCursor: null,
        };
      },
    });
    await directory.refresh([row(), row('uat-two')]);
    expect(
      directory
        .getSnapshot()
        .entries.map((entry) =>
          entry.workspaces.map((w) => [w.instanceId, w.organizationId, w.role]),
        ),
    ).toEqual([
      [
        ['uat-one', 'org_member', 'owner'],
        ['uat-one', 'org_guest', 'guest'],
      ],
      [
        ['uat-two', 'org_member', 'owner'],
        ['uat-two', 'org_guest', 'guest'],
      ],
    ]);
  });

  it('continues empty guest pages and upgrades a guest row when later membership pages arrive', async () => {
    const members = vi.fn(async (_id: string, after?: string) => ({
      organizations: after ? [member('org_shared')] : [],
      nextCursor: after ? null : 'om_next',
    }));
    const guests = vi.fn(async (_id: string, _org: string, after?: string) => ({
      channels: after ? [guest('org_shared')] : [],
      nextCursor: after ? null : 'ci_next',
    }));
    const directory = createWorkspaceDirectory({
      listOrganizations: members,
      listChannels: guests,
    });
    await directory.refresh([row()]);
    expect(directory.getSnapshot().entries[0]?.workspaces).toEqual([]);
    expect(directory.getSnapshot().entries[0]?.guestsAfter).toBe('ci_next');
    await directory.more('uat-one');
    expect(directory.getSnapshot().entries[0]?.workspaces[0]?.role).toBe('owner');
    expect(guests).toHaveBeenLastCalledWith('uat-one', '', 'ci_next', true);
  });

  it('refresh removes revoked guest workspaces and never fetches logged-out accounts', async () => {
    let revoked = false;
    const guests = vi.fn(async () => ({
      channels: revoked ? [] : [guest('org_external')],
      nextCursor: null,
    }));
    const members = vi.fn(async () => ({ organizations: [], nextCursor: null }));
    const directory = createWorkspaceDirectory({
      listOrganizations: members,
      listChannels: guests,
    });
    await directory.refresh([row()]);
    expect(directory.getSnapshot().entries[0]?.workspaces).toHaveLength(1);
    revoked = true;
    await directory.refresh([row()]);
    expect(directory.getSnapshot().entries[0]?.workspaces).toEqual([]);
    await directory.refresh([row('uat-one', false)]);
    expect(members).toHaveBeenCalledTimes(2);
    expect(guests).toHaveBeenCalledTimes(2);
  });

  it('ignores in-flight results after closing and serializes the next refresh', async () => {
    let finish: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const members = vi.fn(async () => {
      await blocked;
      return { organizations: [member('org_old')], nextCursor: null };
    });
    const guests = vi.fn(async () => ({ channels: [], nextCursor: null }));
    const directory = createWorkspaceDirectory({
      listOrganizations: members,
      listChannels: guests,
    });
    const loading = directory.refresh([row()]);
    await Promise.resolve();
    directory.clear();
    const next = directory.refresh([row('uat-two', false)]);
    finish?.();
    await loading;
    await next;
    expect(guests).not.toHaveBeenCalled();
    expect(directory.getSnapshot()).toMatchObject({
      busy: false,
      entries: [{ instanceId: 'uat-two', workspaces: [] }],
    });
  });

  it('offers retry without replacing other instances with failed or unverified names', async () => {
    let failure = true;
    const directory = createWorkspaceDirectory({
      listOrganizations: async (id) => {
        if (id === 'uat-one' && failure) throw Error('offline');
        return { organizations: [member('org_member')], nextCursor: null };
      },
      listChannels: async () => ({ channels: [], nextCursor: null }),
    });
    await directory.refresh([row(), row('uat-two')]);
    expect(directory.getSnapshot().entries[0]).toMatchObject({
      error: 'CLOUD_UNAVAILABLE',
      workspaces: [],
    });
    expect(directory.getSnapshot().entries[1]?.workspaces).toHaveLength(1);
    failure = false;
    await directory.more('uat-one');
    expect(directory.getSnapshot().entries[0]?.workspaces).toHaveLength(1);
    expect(directory.getSnapshot().entries[0]?.error).toBeUndefined();
  });
});
