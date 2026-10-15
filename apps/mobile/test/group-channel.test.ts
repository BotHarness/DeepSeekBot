import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { groupActions, groupInfo } from '../src/host/group-channel';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const channelId = 'group-launch';

let client: HostClient | undefined;
afterEach(() => client?.stop());

const bot = (slug: string, displayName: string, paused = false) => ({
  slug,
  displayName,
  paused,
  aggregateState: 'idle',
});

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('list', () => ({
    bots: [
      bot('ada', 'Ada'),
      bot('bo', 'Bo'),
      bot('cy', 'Cy'),
      bot('di', 'Di'),
      bot('ed', 'Ed', true),
      bot('fay', 'Fay'),
    ],
  }));
  fake.methods.set('rosterGet', () => ({ sections: [], pins: [], hidden: [], sectionOrder: [] }));
  fake.methods.set('channels', () => ({
    channels: [
      {
        id: channelId,
        type: 'group',
        name: 'Launch',
        members: ['ada', 'bo'],
        ownerBotSlug: 'ada',
        avatar: 'data:image/jpeg;base64,/9j/AA==',
        invitations: [
          { id: 'inv-1', targetBotSlug: 'cy', status: 'pending' },
          { id: 'inv-0', targetBotSlug: 'fay', status: 'declined' },
        ],
        joinRequests: [
          { id: 'join-1', requesterBotSlug: 'di', status: 'pending' },
          { id: 'join-0', requesterBotSlug: 'fay', status: 'accepted' },
        ],
      },
    ],
  }));
  return fake;
}

async function connected(fake: FakeHost): Promise<HostClient> {
  client = createHostClient({
    routes: [ROUTE],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  for (let tries = 0; tries < 200; tries += 1) {
    const snapshot: HostSnapshot = client.getSnapshot();
    if (snapshot.connection.status === 'connected' && snapshot.roster !== undefined) return client;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Host client did not connect');
}

describe('Group Channel info', () => {
  it('reads members, pending invitations and join requests from the roster', async () => {
    const target = await connected(host());
    const info = groupInfo(target.getSnapshot().roster, channelId)!;

    expect(info.channel).toMatchObject({
      name: 'Launch',
      memberCount: 2,
      avatar: 'data:image/jpeg;base64,/9j/AA==',
      ownerBotSlug: 'ada',
    });
    expect(
      info.members.map((member) => [member.slug, member.bot?.displayName, member.owner]),
    ).toEqual([
      ['ada', 'Ada', true],
      ['bo', 'Bo', false],
    ]);
    expect(info.invites.map((invite) => [invite.id, invite.slug])).toEqual([['inv-1', 'cy']]);
    expect(info.joins.map((join) => [join.id, join.slug])).toEqual([['join-1', 'di']]);
    expect(info.candidates.map((candidate) => candidate.slug)).toEqual(['di', 'fay']);
    expect(groupInfo(target.getSnapshot().roster, 'missing')).toBeUndefined();
  });

  it('sends each change with the Host method and arguments the desktop uses, then refreshes', async () => {
    const fake = host();
    for (const method of [
      'channelGroupInvite',
      'channelGroupInviteCancel',
      'channelGroupJoinDecide',
      'channelGroupMemberRemove',
      'channelRename',
      'channelGroupAvatarSet',
    ])
      fake.methods.set(method, () => ({ channel: { id: channelId } }));
    fake.methods.set('channelGroupDelete', () => ({ deleted: true }));
    const actions = groupActions(await connected(fake), channelId);
    fake.calls.length = 0;

    await actions.invite('fay');
    await actions.cancelInvite('inv-1');
    await actions.decideJoin('join-1', true);
    await actions.decideJoin('join-1', false);
    await actions.removeMember('bo');
    await actions.rename('  Launch crew  ');
    await actions.setAvatar('data:image/jpeg;base64,/9j/AA==');
    await actions.setAvatar(null);
    await actions.disband();

    const changes = fake.calls.filter(
      (call) => !['list', 'channels', 'rosterGet'].includes(call.method),
    );
    expect(changes.map((call) => [call.method, call.args])).toEqual([
      ['channelGroupInvite', { channelId, botSlug: 'fay' }],
      ['channelGroupInviteCancel', { channelId, invitationId: 'inv-1' }],
      ['channelGroupJoinDecide', { channelId, requestId: 'join-1', accept: true }],
      ['channelGroupJoinDecide', { channelId, requestId: 'join-1', accept: false }],
      ['channelGroupMemberRemove', { channelId, botSlug: 'bo' }],
      ['channelRename', { channelId, name: 'Launch crew' }],
      ['channelGroupAvatarSet', { channelId, avatar: 'data:image/jpeg;base64,/9j/AA==' }],
      ['channelGroupAvatarSet', { channelId, avatar: null }],
      ['channelGroupDelete', { channelId }],
    ]);
    expect(fake.calls.filter((call) => call.method === 'channels').length).toBeGreaterThanOrEqual(
      changes.length,
    );
  });

  it('passes a Host refusal through and treats a disband that deleted nothing as failed', async () => {
    const fake = host();
    fake.methods.set('channelGroupInvite', () => {
      throw new Error('Bot is already invited');
    });
    fake.methods.set('channelGroupDelete', () => ({ deleted: false }));
    const actions = groupActions(await connected(fake), channelId);

    await expect(actions.invite('fay')).rejects.toThrow('Bot is already invited');
    await expect(actions.disband()).rejects.toThrow('not disbanded');
  });
});
