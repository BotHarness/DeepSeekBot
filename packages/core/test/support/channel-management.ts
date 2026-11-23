import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { vi, type Mock } from 'vitest';
import { createChannelManagement } from '../../src/channels/management.js';
import { createCore } from '../../src/plugin.js';
import { attachOperationalModule } from '../../src/database/owner.js';
import { createTempRoot } from '../helpers.js';

export const cleanup: Array<() => Promise<void> | void> = [];

type ChannelManagement = ReturnType<typeof createChannelManagement>;
type ManagementOptions = Parameters<typeof createChannelManagement>[0];

interface ChannelManagementFixture {
  home: string;
  core: ReturnType<typeof createCore>;
  database: ReturnType<typeof attachOperationalModule>;
  owner: ChannelManagement;
  admitted: Mock<NonNullable<ManagementOptions['onInvitation']>>;
  joinDecided: Mock<NonNullable<ManagementOptions['onJoinDecision']>>;
  close: () => Promise<void>;
  policy: (value: boolean) => void;
}

interface InvitationFixture extends ChannelManagementFixture {
  created: ReturnType<ChannelManagement['create']>;
  invite: {
    channelId: string;
    botSlug: string;
    expectedChannel: ReturnType<ChannelManagement['create']>['channelFingerprint'];
  };
}

export function fixture(home = createTempRoot('channel-management-')): ChannelManagementFixture {
  let autoAccept = false;
  const core = createCore({
    dshHome: home,
    autoAcceptGroupInvitations: () => autoAccept,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  const database = attachOperationalModule(core.operationalDatabase, 'channel-management-test');
  const admitted = vi.fn();
  const joinDecided = vi.fn();
  const owner = createChannelManagement({
    database,
    registry: core.registry,
    channels: core.channels,
    isProtectedBot: (slug) => slug === 'tob',
    autoAcceptGroupInvitations: () => autoAccept,
    onInvitation: admitted,
    onJoinDecision: joinDecided,
  });
  for (const slug of ['ada', 'bob'])
    if (!core.registry.get(slug)) core.registry.create({ slug, displayName: slug });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  cleanup.push(close);
  return {
    home,
    core,
    database,
    owner,
    admitted,
    joinDecided,
    close,
    policy(value: boolean) {
      autoAccept = value;
    },
  };
}

export const key: string = 'group-operation-001';

export const input: { name: string; members: string[] } = { name: 'Research', members: ['ada'] };

export function inviteFixture(): InvitationFixture {
  const f = fixture();
  const created = f.owner.create(OWNER_HUMAN_CONTEXT, input, key);
  const invite = {
    channelId: created.channel.id,
    botSlug: 'bob',
    expectedChannel: created.channelFingerprint,
  };
  return { ...f, created, invite };
}
