import { describe, expect, it } from 'vitest';
import { CloudClient } from '../src/cloud/client';

import { config, fixture, organizationsFixture } from './cloud-client-fixtures';

describe('cloud organizations', () => {
  it.each([true, false])(
    'lists another organization and cold-restores the selected workspace (has selection: %s)',
    async (selected) => {
      const f = organizationsFixture();
      const original = f.rt.request;
      f.rt.request = async (url, init) => {
        if (url.endsWith('/org_b/access') && !f.state.denied)
          return Response.json({ organizationId: 'org_b', role: 'member' });
        if (url.endsWith('/org_b/channels')) {
          expect(f.state.selected).toBe('org_b');
          return Response.json({
            channels: [
              {
                channelId: 'ch_' + 'b'.repeat(64),
                name: 'Elsewhere',
                creatorId: 'user_test',
                creatorType: 'human',
                createdAt: '2026-10-18T00:00:00Z',
              },
            ],
            nextCursor: null,
          });
        }
        return original(url, init);
      };
      const client = new CloudClient(f.rt);
      await client.importConfig(JSON.stringify(config));
      await client.login(config.instanceId);
      if (selected) await client.useOrganization(config.instanceId, 'org_a');
      const page = await client.listConversationChannels(config.instanceId, 'org_b');
      expect(page.channels[0]?.name).toBe('Elsewhere');
      expect(client.getSnapshot().rows[0]?.organization?.organizationId).toBe(
        selected ? 'org_a' : undefined,
      );
      if (selected) expect(f.state.selected).toBe('org_a');
      const restored = new CloudClient(f.rt);
      await restored.load();
      expect(restored.getSnapshot().ready).toBe(true);
      await restored.whoami(config.instanceId);
      expect(JSON.stringify(page)).not.toContain('secret-refresh');
      f.state.denied = true;
      await expect(
        client.listConversationChannels(config.instanceId, 'org_b'),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_ACCESS_DENIED' });
    },
  );

  it('creates, selects through WorkOS refresh, updates, and revalidates the same organization after restart', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    expect(await client.createOrganization(config.instanceId, 'Mobile project')).toBe('org_a');
    expect((await client.listOrganizations(config.instanceId)).organizations[0]?.role).toBe(
      'owner',
    );
    await client.useOrganization(config.instanceId, 'org_a');
    expect(f.state.selected).toBe('org_a');
    await client.updateOrganization(config.instanceId, 'Shared note', 1);
    await expect(client.updateOrganization(config.instanceId, 'Stale', 1)).rejects.toMatchObject({
      code: 'ORGANIZATION_VERSION_CONFLICT',
    });
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    expect(restarted.getSnapshot().rows[0]?.organization).toBeUndefined();
    await restarted.whoami(config.instanceId);
    expect(restarted.getSnapshot().rows[0]?.organization).toMatchObject({
      organizationId: 'org_a',
      description: 'Shared note',
      version: 2,
    });
    await restarted.logout(config.instanceId);
    expect(restarted.getSnapshot().rows[0]?.organization).toBeUndefined();
  });
  it('retains the original creation operation across response loss, restart and unchanged import', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    f.state.loseCreate = true;
    await expect(
      client.createOrganization(config.instanceId, 'Mobile project'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    await restarted.importConfig(JSON.stringify(config));
    expect(restarted.getSnapshot().rows[0]?.pendingCreate?.name).toBe('Mobile project');
    await expect(restarted.createOrganization(config.instanceId, 'Other')).rejects.toMatchObject({
      code: 'PENDING_ORGANIZATION_CREATE',
    });
    await restarted.createOrganization(config.instanceId, 'Mobile project');
    expect(f.operations).toHaveLength(2);
    expect(f.operations[0]).toBe(f.operations[1]);
    expect(restarted.getSnapshot().rows[0]?.pendingCreate).toBeUndefined();
  });
  it('replays a lost channel creation and message response after restart with the same durable operation', async () => {
    const f = organizationsFixture();
    const baseRequest = f.rt.request;
    const channel = {
      channelId: 'ch_' + 'a'.repeat(64),
      organizationId: 'org_a',
      name: 'general',
      creatorId: 'user_test',
      creatorType: 'human',
      createdAt: '2026-10-18T00:00:00Z',
    };
    const operations: string[] = [];
    let lose = true;
    let storedMessage: Record<string, unknown> | undefined;
    f.rt.request = async (url, init) => {
      if (!url.includes('/channels')) return baseRequest(url, init);
      if (init?.method === 'POST') {
        const operation = new Headers(init.headers).get('Idempotency-Key')!;
        operations.push(operation);
        const body = JSON.parse(String(init.body));
        if (body.text)
          storedMessage = {
            sequence: 1,
            authorId: 'user_test',
            authorType: 'human',
            operationId: operation,
            text: body.text,
            createdAt: '2026-10-18T00:00:00Z',
          };
        if (lose) {
          lose = false;
          throw new Error('lost response');
        }
        return Response.json(body.text ? { message: storedMessage, replayed: true } : channel);
      }
      if (url.includes('/messages'))
        return Response.json({
          messages: storedMessage ? [storedMessage] : [],
          nextCursor: storedMessage ? 1 : 0,
          hasMore: false,
        });
      return Response.json({ channels: [channel], nextCursor: null });
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(client.createChannel(config.instanceId, 'org_a', 'general')).rejects.toMatchObject(
      { code: 'NETWORK_UNAVAILABLE' },
    );
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction?.value).toBe('general');
    await expect(
      client.createChannel(config.instanceId, 'org_a', 'different'),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    await client.createChannel(config.instanceId, 'org_a', 'general');
    expect(operations[0]).toBe(operations[1]);
    expect((await client.listChannels(config.instanceId, 'org_a')).channels[0]?.channelId).toBe(
      channel.channelId,
    );
    lose = true;
    await expect(
      client.sendMessage(config.instanceId, 'org_a', channel.channelId, 'Durable text'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendMessage(config.instanceId, 'org_a', 'ch_' + 'b'.repeat(64), 'Durable text'),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    expect(
      (await client.sendMessage(config.instanceId, 'org_a', channel.channelId, 'Durable text'))
        .sequence,
    ).toBe(1);
    expect(operations[2]).toBe(operations[3]);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    expect(
      (await client.readMessages(config.instanceId, 'org_a', channel.channelId)).messages,
    ).toHaveLength(1);
    await expect(
      client.readMessages(config.instanceId, 'org_other', channel.channelId),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_TOKEN_REQUIRED' });
  });
  it('keeps pending channel work private to the signed-in identity and clears it on logout', async () => {
    const f = organizationsFixture();
    const old = f.rt.request;
    f.rt.request = async (url, init) =>
      url.includes('/channels') ? Promise.reject(new Error('offline')) : old(url, init);
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(client.createChannel(config.instanceId, 'org_a', 'general')).rejects.toMatchObject(
      { code: 'NETWORK_UNAVAILABLE' },
    );
    expect(client.getSnapshot().rows[0]?.pendingChannelAction?.userId).toBe('user_test');
    await client.logout(config.instanceId);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    expect(f.stored()).not.toContain('channel.create');
  });
  it('persists invitation issuance before I/O, retries the same operation after restart and rejects another scope', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    const operations: string[] = [];
    let lose = true;
    const invitation = {
      invitationId: 'invitation_test',
      organizationId: 'org_a',
      email: 'b@example.test',
      role: 'member',
      state: 'pending',
      expiresAt: '2030-01-01T00:00:00Z',
      token: 'provider-secret',
    };
    f.rt.request = async (url, init) => {
      if (url.endsWith('/invitations')) {
        if (init?.method === 'POST') {
          operations.push(new Headers(init.headers).get('Idempotency-Key')!);
          expect(f.stored()).toContain('pendingInvitation');
          if (lose) {
            lose = false;
            throw Error('response lost');
          }
          return Response.json(invitation);
        }
        return Response.json({ invitations: [invitation], nextCursor: null });
      }
      return original(url, init);
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'other@example.test'),
    ).rejects.toMatchObject({ code: 'PENDING_INVITATION' });
    const sent = await client.sendInvitation(config.instanceId, 'org_a', 'b@example.test');
    expect(sent.invitationId).toBe('invitation_test');
    expect(sent).not.toHaveProperty('token');
    expect(operations[0]).toBe(operations[1]);
    expect(operations).toHaveLength(2);
    expect(client.getSnapshot().rows[0]?.pendingInvitation).toBeUndefined();
    const page = await client.listInvitations(config.instanceId, 'org_a');
    expect(page.invitations[0]).not.toHaveProperty('token');
    await expect(client.listInvitations(config.instanceId, 'org_other')).rejects.toMatchObject({
      code: 'ORGANIZATION_TOKEN_REQUIRED',
    });
    lose = true;
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    await client.logout(config.instanceId);
    expect(f.stored()).not.toContain('pendingInvitation');
  });
  it('recipient can read inbox/accept before organization selection and malformed acceptance never reports success', async () => {
    const f = fixture(),
      original = f.rt.request;
    let accepted = false,
      wrongId = false,
      denied = false;
    f.rt.request = async (url, init) => {
      if (url.includes('/api/invitations')) {
        if (denied)
          return Response.json({ error: { code: 'INVITATION_ACCESS_DENIED' } }, { status: 403 });
        const row = {
          invitationId: wrongId ? 'invitation_other' : 'invitation_test',
          organizationId: 'org_a',
          organizationName: 'Shared project',
          email: 'b@example.test',
          role: 'member',
          state: accepted ? 'accepted' : 'pending',
          expiresAt: '2030-01-01T00:00:00Z',
        };
        if (init?.method === 'POST') {
          accepted = true;
          return Response.json({ ...row, state: 'accepted', accepted: true });
        }
        return Response.json({ invitations: [row], nextCursor: null });
      }
      return original(url, init);
    };
    await f.client.importConfig(JSON.stringify(config));
    await f.client.login(config.instanceId);
    expect(
      (await f.client.listInvitations(config.instanceId)).invitations[0]?.organizationName,
    ).toBe('Shared project');
    expect(await f.client.acceptInvitation(config.instanceId, 'invitation_test')).toMatchObject({
      state: 'accepted',
      role: 'member',
    });
    expect(f.client.getSnapshot().rows[0]?.organization).toBeUndefined();
    wrongId = true;
    await expect(
      f.client.acceptInvitation(config.instanceId, 'invitation_test'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    denied = true;
    await expect(
      f.client.acceptInvitation(config.instanceId, 'invitation_test'),
    ).rejects.toMatchObject({ code: 'INVITATION_ACCESS_DENIED' });
  });
  it('keeps direct channel grants independent of organization selection and retries guest writes after restart', async () => {
    const f = fixture(),
      original = f.rt.request;
    const channelId = 'ch_' + 'b'.repeat(64),
      invitationId = 'ci_' + 'c'.repeat(64);
    const invitation = {
      invitationId,
      channelId,
      channelName: 'External project',
      organizationId: 'org_external',
      email: 'b@example.test',
      role: 'guest',
      state: 'pending',
      expiresAt: '2030-01-01T00:00:00Z',
    };
    const channel = {
      channelId,
      organizationId: 'org_external',
      organizationName: 'External workspace',
      name: 'External project',
      creatorId: 'user_a',
      creatorType: 'human',
      createdAt: '2026-10-18T00:00:00Z',
      access: 'guest',
    };
    const operations: string[] = [];
    let lose = true,
      denied = false,
      wrongScope = false;
    f.rt.request = async (url, init) => {
      if (url.includes('/api/channel-invitations'))
        return Response.json(
          init?.method === 'POST'
            ? { ...invitation, accepted: true, state: 'accepted' }
            : { invitations: [invitation], nextCursor: null },
        );
      if (url.includes('/api/guest-channels')) {
        const requestedOrg = new URL(url).searchParams.get('organizationId');
        if (requestedOrg) expect(requestedOrg).toBe('org_external');
        if (denied)
          return Response.json({ error: { code: 'CHANNEL_ACCESS_DENIED' } }, { status: 403 });
        if (url.includes('/messages')) {
          if (init?.method === 'POST') {
            const operation = new Headers(init.headers).get('Idempotency-Key')!;
            operations.push(operation);
            expect(f.stored()).toContain('guest.send');
            if (lose) {
              lose = false;
              throw Error('response lost');
            }
            return Response.json({
              message: {
                sequence: 8,
                authorId: 'user_test',
                authorType: 'human',
                operationId: operation,
                text: 'Guest reply',
                createdAt: '2026-10-18T00:00:00Z',
              },
            });
          }
          return Response.json({ messages: [], nextCursor: 7, hasMore: false });
        }
        return Response.json({
          channels: [{ ...channel, access: wrongScope ? 'member' : 'guest' }],
          nextCursor: invitationId,
        });
      }
      return original(url, init);
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    expect(
      (await client.listInvitations(config.instanceId, undefined, undefined, true)).invitations[0]
        ?.role,
    ).toBe('guest');
    await client.acceptInvitation(config.instanceId, invitationId, true);
    expect(client.getSnapshot().rows[0]?.organization).toBeUndefined();
    expect((await client.listChannels(config.instanceId, '', undefined, true)).nextCursor).toBe(
      invitationId,
    );
    expect(
      (await client.listChannels(config.instanceId, 'org_external', undefined, true)).channels[0]
        ?.organizationName,
    ).toBe('External workspace');
    expect((await client.readMessages(config.instanceId, '', channelId, 0, true)).nextCursor).toBe(
      7,
    );
    await expect(client.acceptInvitation(config.instanceId, invitationId)).rejects.toMatchObject({
      code: 'INVALID_INVITATION',
    });
    await expect(
      client.sendMessage(config.instanceId, 'org_external', channelId, 'Guest reply', true),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendMessage(
        config.instanceId,
        'org_external',
        'ch_' + 'd'.repeat(64),
        'Guest reply',
        true,
      ),
    ).rejects.toMatchObject({ code: 'PENDING_CHANNEL_ACTION' });
    expect(
      (await client.sendMessage(config.instanceId, 'org_external', channelId, 'Guest reply', true))
        .sequence,
    ).toBe(8);
    expect(operations[0]).toBe(operations[1]);
    expect(client.getSnapshot().rows[0]?.pendingChannelAction).toBeUndefined();
    wrongScope = true;
    await expect(client.listChannels(config.instanceId, '', undefined, true)).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
    denied = true;
    await expect(
      client.readMessages(config.instanceId, '', channelId, 0, true),
    ).rejects.toMatchObject({ code: 'CHANNEL_ACCESS_DENIED' });
    expect(
      f.calls.some((c) => new URLSearchParams(String(c.init?.body)).has('organization_id')),
    ).toBe(false);
  });
  it('binds pending channel invitations to their channel and preserves the key across restart', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    const channelId = 'ch_' + 'a'.repeat(64),
      invitationId = 'ci_' + 'b'.repeat(64);
    const operations: string[] = [];
    let lose = true;
    f.rt.request = async (url, init) => {
      if (!url.includes('/guest-invitations')) return original(url, init);
      const row = {
        invitationId,
        channelId,
        channelName: 'Guest project',
        organizationId: 'org_a',
        email: 'b@example.test',
        role: 'guest',
        state: url.endsWith('/revoke') ? 'revoked' : 'pending',
        expiresAt: '2030-01-01T00:00:00Z',
      };
      if (url.endsWith('/revoke')) return Response.json(row);
      if (init?.method === 'POST') {
        operations.push(new Headers(init.headers).get('Idempotency-Key')!);
        if (lose) {
          lose = false;
          throw Error('response lost');
        }
        return Response.json(row);
      }
      return Response.json({ invitations: [row], nextCursor: null });
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test', channelId),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.sendInvitation(config.instanceId, 'org_a', 'b@example.test'),
    ).rejects.toMatchObject({ code: 'PENDING_INVITATION' });
    expect(
      (await client.sendInvitation(config.instanceId, 'org_a', 'b@example.test', channelId)).role,
    ).toBe('guest');
    expect(operations[0]).toBe(operations[1]);
    expect(
      (await client.listInvitations(config.instanceId, 'org_a', undefined, channelId))
        .invitations[0]?.channelId,
    ).toBe(channelId);
    expect(
      (await client.revokeInvitation(config.instanceId, 'org_a', invitationId, channelId)).state,
    ).toBe('revoked');
  });
  it('never treats stale owner UI or a mismatched selection response as organization authorization', async () => {
    const f = organizationsFixture();
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    f.state.role = 'member';
    await expect(client.updateOrganization(config.instanceId, 'Denied', 1)).rejects.toMatchObject({
      code: 'ORGANIZATION_OWNER_REQUIRED',
    });
    expect(f.state.description).toBe('');
    await client.whoami(config.instanceId);
    expect(client.getSnapshot().rows[0]?.organization?.role).toBe('member');
    f.state.denied = true;
    await expect(client.useOrganization(config.instanceId, 'org_a')).rejects.toMatchObject({
      code: 'ORGANIZATION_ACCESS_DENIED',
    });
    expect(client.getSnapshot().rows[0]?.organization).toBeUndefined();
    f.state.denied = false;
    f.state.mismatch = true;
    await expect(client.useOrganization(config.instanceId, 'org_a')).rejects.toMatchObject({
      code: 'ORGANIZATION_TOKEN_MISMATCH',
    });
  });
});
