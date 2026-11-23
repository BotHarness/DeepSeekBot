import { describe, expect, it } from 'vitest';
import { CloudClient } from '../src/cloud/client';
import { cloudNativeIntent } from '../src/cloud/native-intent';

import { config, fixture, loggedIn, organizationsFixture } from './cloud-client-fixtures';

describe('channel Agent private handoff', () => {
  it('persists before issuance, retries after restart, hides secrets and requires current owner before copy', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    const channelId = 'ch_' + 'a'.repeat(64);
    let lose = true,
      denied = false,
      revoked = false;
    const payloads: string[] = [];
    f.rt.request = async (url, init) => {
      if (!url.includes('/agents')) return original(url, init);
      if (denied)
        return Response.json({ error: { code: 'ORGANIZATION_OWNER_REQUIRED' } }, { status: 403 });
      const saved = JSON.parse(f.stored()!).entries[0].agentHandoff;
      const row = {
        actorId: saved.actorId,
        kind: 'agent',
        name: saved.name,
        ownerUserId: saved.ownerUserId,
        scopes: ['messages:read', 'messages:send'],
        state: revoked ? 'revoked' : 'active',
        historyAfter: 3,
        expiresAt: '2030-01-01T00:00:00Z',
      };
      if (url.endsWith('/revoke')) {
        revoked = true;
        return Response.json({ ...row, state: 'revoked' });
      }
      if (init?.method === 'POST') {
        const payload = String(init.body);
        payloads.push(payload);
        expect(payload).not.toContain(saved.secret);
        expect(JSON.parse(payload).secretHash).toBe(await f.rt.digest(saved.secret));
        if (lose) {
          lose = false;
          throw Error('response lost');
        }
        return Response.json(row);
      }
      return Response.json({ agents: [row], nextCursor: null });
    };
    let client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    await expect(
      client.createAgent(config.instanceId, 'org_a', channelId, 'Echo agent'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    const saved = JSON.parse(f.stored()!).entries[0].agentHandoff;
    expect(JSON.stringify(client.getSnapshot())).not.toContain(saved.secret);
    client = new CloudClient(f.rt);
    await client.load();
    await client.whoami(config.instanceId);
    await expect(
      client.createAgent(config.instanceId, 'org_a', 'ch_' + 'b'.repeat(64), 'Echo agent'),
    ).rejects.toMatchObject({ code: 'AGENT_HANDOFF_PENDING' });
    await client.createAgent(config.instanceId, 'org_a', channelId, 'Echo agent');
    expect(payloads[0]).toBe(payloads[1]);
    expect(
      (await client.listAgents(config.instanceId, 'org_a', channelId)).agents[0]?.actorId,
    ).toBe(saved.actorId);
    const exported = JSON.parse(
      await client.exportAgentCredential(config.instanceId, 'org_a', channelId, 'Echo agent'),
    );
    expect(exported.secret).toBe(saved.secret);
    expect(exported.config).toEqual(config);
    expect(exported.ready).toBeUndefined();
    denied = true;
    await expect(
      client.exportAgentCredential(config.instanceId, 'org_a', channelId, 'Echo agent'),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_OWNER_REQUIRED' });
    denied = false;
    await client.revokeAgent(config.instanceId, 'org_a', channelId, saved.actorId);
    expect(client.getSnapshot().rows[0]?.agentHandoff).toBeUndefined();
    expect(f.stored()).not.toContain(saved.secret);
  });
  it('never issues when secure persistence fails and clears saved handoff on logout', async () => {
    const f = organizationsFixture(),
      original = f.rt.request;
    let writes = 0;
    f.rt.request = async (url, init) => {
      if (url.includes('/agents')) {
        writes++;
        throw Error('response lost');
      }
      return original(url, init);
    };
    await f.client.importConfig(JSON.stringify(config));
    await f.client.login(config.instanceId);
    await f.client.useOrganization(config.instanceId, 'org_a');
    const save = f.rt.write;
    f.rt.write = async () => {
      throw Error('secure storage unavailable');
    };
    await expect(
      f.client.createAgent(config.instanceId, 'org_a', 'ch_' + 'a'.repeat(64), 'Echo'),
    ).rejects.toBeDefined();
    expect(writes).toBe(0);
    f.rt.write = save;
    await expect(
      f.client.createAgent(config.instanceId, 'org_a', 'ch_' + 'a'.repeat(64), 'Echo'),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
    const secret = JSON.parse(f.stored()!).entries[0].agentHandoff.secret;
    await f.client.logout(config.instanceId);
    expect(f.stored()).not.toContain(secret);
  });
});

describe('cloud health check requests', () => {
  async function setup() {
    const f = organizationsFixture();
    f.state.role = 'member';
    const client = new CloudClient(f.rt);
    await client.importConfig(JSON.stringify(config));
    await client.login(config.instanceId);
    await client.useOrganization(config.instanceId, 'org_a');
    const original = f.rt.request;
    let lose = true;
    const submissions: { operation: string; body: Record<string, string> }[] = [];
    const channelId = 'ch_' + 'a'.repeat(64),
      actorId = 'ag_' + 'b'.repeat(64);
    f.rt.request = async (url, init) => {
      if (!url.endsWith('/work-requests')) return original(url, init);
      const body = JSON.parse(String(init?.body));
      const operation = new Headers(init?.headers).get('Idempotency-Key')!;
      expect(JSON.parse(f.stored()!).entries[0].pendingWork.operation).toBe(operation);
      submissions.push({ operation, body });
      if (lose) {
        lose = false;
        throw Error('response lost');
      }
      return Response.json({
        message: {
          sequence: 1,
          authorType: 'human',
          authorId: 'user_test',
          operationId: operation,
          text: 'Health check requested',
          createdAt: new Date(f.rt.now()).toISOString(),
          kind: 'work_request',
          payload: {
            version: 1,
            requestId:
              'wr_' + (await f.rt.digest(JSON.stringify([channelId, 'user_test', operation]))),
            channelId,
            requesterUserId: 'user_test',
            targetActorId: actorId,
            capability: 'health-check',
            expiresAt: body.expiresAt,
          },
        },
      });
    };
    return { ...f, client, submissions, channelId, actorId };
  }
  it('allows members, persists before send and retries the same request after restart without extending expiry', async () => {
    const f = await setup();
    await expect(
      f.client.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId),
    ).rejects.toThrow();
    const saved = f.client.getSnapshot().rows[0]!.pendingWork!;
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    await restarted.whoami(config.instanceId);
    await expect(
      restarted.requestHealthCheck(config.instanceId, 'org_a', f.channelId, 'ag_' + 'c'.repeat(64)),
    ).rejects.toThrow('PENDING_WORK_REQUEST');
    f.rt.now = () => 2000000;
    await restarted.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId);
    expect(f.submissions).toHaveLength(2);
    expect(f.submissions[0]).toEqual(f.submissions[1]);
    expect(f.submissions[1]!.body.expiresAt).toBe(saved.expiresAt);
    expect(restarted.getSnapshot().rows[0]?.pendingWork).toBeUndefined();
  });
  it('does not send if secure persistence fails and clears the pending record on logout', async () => {
    const f = await setup();
    const write = f.rt.write;
    f.rt.write = async () => {
      throw Error('storage');
    };
    await expect(
      f.client.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId),
    ).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect(f.submissions).toHaveLength(0);
    f.rt.write = write;
    await expect(
      f.client.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId),
    ).rejects.toThrow();
    expect(f.client.getSnapshot().rows[0]?.pendingWork).toBeDefined();
    await f.client.logout(config.instanceId);
    expect(f.client.getSnapshot().rows[0]?.pendingWork).toBeUndefined();
    expect(f.stored()).not.toContain('pendingWork');
  });
  it('rejects a mismatched server target and preserves retry state; removing it sends no cancellation', async () => {
    const f = await setup();
    const original = f.rt.request;
    f.rt.request = async (url, init) => {
      const response = await original(url, init);
      if (!url.endsWith('/work-requests')) return response;
      const body = await response.json();
      body.message.payload.targetActorId = 'ag_' + 'c'.repeat(64);
      return Response.json(body);
    };
    await expect(
      f.client.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId),
    ).rejects.toThrow();
    await expect(
      f.client.requestHealthCheck(config.instanceId, 'org_a', f.channelId, f.actorId),
    ).rejects.toThrow('INVALID_RESPONSE');
    expect(f.client.getSnapshot().rows[0]?.pendingWork).toBeDefined();
    await f.client.clearPendingWork(config.instanceId);
    expect(f.submissions).toHaveLength(2);
    expect(f.client.getSnapshot().rows[0]?.pendingWork).toBeUndefined();
  });
});

describe('recipient-bound invitation journey', () => {
  const invitationId = 'ci_' + 'a'.repeat(64);
  const link = config.server + '/join?invitation=' + invitationId;
  it('preserves invitation intent separately from the OAuth callback', () => {
    expect(
      cloudNativeIntent(
        'ai.botharness.deepseekbot.dev:/cloud-join?link=' + encodeURIComponent(link),
      ),
    ).toBe('/cloud-join?link=' + encodeURIComponent(link));
    expect(
      cloudNativeIntent(
        'ai.botharness.deepseekbot.dev:/cloud-join?link=' +
          encodeURIComponent(link) +
          '&link=other',
      ),
    ).toBe('/cloud-services');
  });
  it('discovers an invitation service without sending credentials or importing trust', async () => {
    const f = fixture();
    expect(await f.client.inspectInvitationService(link)).toEqual(config);
    expect(f.stored()).toBeNull();
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.init?.headers).toBeUndefined();
    expect(f.calls[0]!.init?.credentials).toBe('omit');
    expect(f.calls[0]!.init?.redirect).toBe('error');
  });
  it('rejects malformed links before network access', async () => {
    const f = fixture();
    for (const raw of [
      link + '#secret',
      link + '&invitation=invitation_other',
      link.replace('https:', 'http:'),
      link.replace('/join?', '/join/../join?'),
      link + '&redirect=https://other.test',
    ])
      await expect(f.client.inspectInvitationService(raw)).rejects.toMatchObject({
        code: 'INVALID_INVITATION_LINK',
      });
    expect(f.calls).toHaveLength(0);
  });
  it('previews through the recipient API without accepting, and binds the response to the link', async () => {
    const f = await loggedIn();
    const original = f.rt.request;
    let accepted = false,
      forged = false;
    f.rt.request = async (url, init) => {
      if (url.endsWith('/accept')) accepted = true;
      if (url.endsWith('/api/channel-invitations/' + invitationId))
        return Response.json({
          invitationId: forged ? 'ci_' + 'b'.repeat(64) : invitationId,
          organizationId: 'org_invited',
          organizationName: 'Invited workspace',
          channelId: 'ch_' + 'c'.repeat(64),
          channelName: 'One channel',
          email: 'recipient@example.test',
          role: 'guest',
          state: 'pending',
          expiresAt: '2099-01-01T00:00:00Z',
        });
      return original(url, init);
    };
    expect(await f.client.previewInvitation(config.instanceId, link)).toMatchObject({
      state: 'pending',
      role: 'guest',
      organizationName: 'Invited workspace',
    });
    expect(accepted).toBe(false);
    forged = true;
    await expect(f.client.previewInvitation(config.instanceId, link)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const before = f.calls.length;
    await expect(
      f.client.previewInvitation(
        config.instanceId,
        link.replace(config.server, 'https://other.example'),
      ),
    ).rejects.toMatchObject({ code: 'INVITATION_TARGET_MISMATCH' });
    expect(f.calls).toHaveLength(before);
  });
  it('restores verified identity when opening a guest channel after a cold restart', async () => {
    const f = await loggedIn();
    const original = f.rt.request;
    const channelId = 'ch_' + 'c'.repeat(64);
    f.rt.request = async (url, init) =>
      url.endsWith('/api/guest-channels/' + channelId)
        ? Response.json({
            channelId,
            organizationId: 'org_invited',
            access: 'guest',
            name: 'Invited channel',
            creatorId: 'user_owner',
            creatorType: 'human',
            createdAt: '2026-01-01T00:00:00Z',
          })
        : original(url, init);
    const restarted = new CloudClient(f.rt);
    await restarted.load();
    expect(restarted.getSnapshot().rows[0]?.identity).toBeUndefined();
    await restarted.openChannel(config.instanceId, 'org_invited', channelId, true);
    expect(restarted.getSnapshot().rows[0]?.identity?.userId).toBe('user_test');
    expect(restarted.getSnapshot().rows[0]?.organization).toBeUndefined();
    expect(f.calls.some((call) => call.url.includes('/api/organizations/org_invited'))).toBe(false);
  });
  it('rejects discovery whose advertised origin differs from the invitation', async () => {
    const f = fixture();
    f.rt.request = async () => Response.json({ ...config, server: 'https://other.example' });
    await expect(f.client.inspectInvitationService(link)).rejects.toMatchObject({
      code: 'INVITATION_TARGET_MISMATCH',
    });
    expect(f.stored()).toBeNull();
  });
});
