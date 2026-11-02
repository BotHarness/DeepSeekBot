import { describe, expect, it } from 'vitest';
import { createCloudConversations } from '../src/cloud/conversations';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import type { CloudRow } from '../src/cloud/client';
const row: CloudRow = {
  config: publicInstance({
    instanceId: 'uat-one',
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
const channel = {
  channelId: 'ch_' + 'a'.repeat(64),
  name: 'General',
  creatorId: 'user_a',
  creatorType: 'human' as const,
  createdAt: '2026-10-18T00:00:00Z',
};
const organization = {
  organizationId: 'org_a',
  name: 'A',
  description: '',
  version: 1,
  role: 'member' as const,
};
describe('cloud conversation directory', () => {
  it('retains rows on network failure, removes them on logout, and rejects late reads from the previous account', async () => {
    let offline = false;
    let release: (() => void) | undefined;
    let gate: Promise<void> | undefined;
    const directory = createCloudConversations({
      listOrganizations: async () => {
        if (offline) throw Error('offline');
        await gate;
        return { organizations: [organization], nextCursor: null };
      },
      listConversationChannels: async (_id, _org, _after, guest) => ({
        channels: guest ? [] : [channel],
        nextCursor: null,
      }),
    });
    directory.enroll([row]);
    await directory.refresh();
    expect(directory.getSnapshot().rows.map((r) => r.channel.name)).toEqual(['General']);
    offline = true;
    await directory.refresh();
    expect(directory.getSnapshot().rows).toHaveLength(1);
    expect(directory.getSnapshot().errors).toHaveLength(1);
    offline = false;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = directory.refresh();
    directory.enroll([{ ...row, sessionUserId: 'user_b' }]);
    expect(directory.getSnapshot().rows).toHaveLength(0);
    expect(directory.getSnapshot().workspaces).toEqual([]);
    release?.();
    await pending;
    expect(directory.getSnapshot().rows).toHaveLength(0);
    directory.enroll([{ ...row, hasSession: false }]);
    await directory.refresh();
    expect(directory.getSnapshot().rows).toHaveLength(0);
  });
  it('keeps guest grants scoped and deduplicates the same channel when also visible through membership', async () => {
    const directory = createCloudConversations({
      listOrganizations: async () => ({ organizations: [organization], nextCursor: null }),
      listConversationChannels: async (_id, _org, _after, guest) => ({
        channels: guest
          ? [
              { ...channel, organizationId: 'org_a', organizationName: 'A' },
              {
                ...channel,
                channelId: 'ch_' + 'b'.repeat(64),
                organizationId: 'org_guest',
                organizationName: 'Guest',
              },
            ]
          : [channel],
        nextCursor: null,
      }),
    });
    directory.enroll([row]);
    await directory.refresh();
    expect(directory.getSnapshot().rows.map((r) => [r.organizationId, r.guest])).toEqual([
      ['org_a', false],
      ['org_guest', true],
    ]);
  });
  it('lists empty member Organizations before guest-only Organizations without deriving tabs from messages', async () => {
    const directory = createCloudConversations({
      listOrganizations: async () => ({
        organizations: [organization, { ...organization, organizationId: 'empty', name: 'Empty' }],
        nextCursor: null,
      }),
      listConversationChannels: async (_id, org, _after, guest) => ({
        channels: guest
          ? [{ ...channel, organizationId: 'guest', organizationName: 'A' }]
          : org === 'empty'
            ? []
            : [channel],
        nextCursor: null,
      }),
    });
    directory.enroll([row]);
    await directory.refresh();
    expect(directory.getSnapshot().ready).toBe(true);
    expect(directory.getSnapshot().workspaces.map((w) => [w.organizationId, w.guest])).toEqual([
      ['org_a', false],
      ['empty', false],
      ['guest', true],
    ]);
    directory.enroll([{ ...row, hasSession: false }]);
    expect(directory.getSnapshot().workspaces).toEqual([]);
  });
});
