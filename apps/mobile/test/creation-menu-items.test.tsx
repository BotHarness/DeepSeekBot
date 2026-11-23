import { expect, it, vi } from 'vitest';
import { cloudEnvironmentKey, computerEnvironmentKey } from '../src/host/conversation-environments';
import { creationTargets } from '../src/host/creation-targets';
import { chatsCreationActions } from '../src/ui/shell/creation-menu-items';

const feature = vi.hoisted(() => ({ cloud: true }));
vi.mock('../src/cloud/available', () => ({
  get cloudAvailable() {
    return feature.cloud;
  },
}));

const computer = { hostId: 'mac', name: 'Mac' };
const scope = cloudEnvironmentKey('owner', 'org');
const workspace = {
  instanceId: 'tobs',
  organizationId: 'org',
  organizationName: 'Team',
  scope: 'owner',
  server: 'https://tobs.example.test',
  guest: false,
  role: 'owner' as const,
};

it('offers Join in All and reserves Invite for the selected eligible cloud workspace', () => {
  const targets = creationTargets(computer, [workspace]);
  expect(chatsCreationActions('all', targets)).toEqual({
    group: true,
    bot: true,
    join: true,
    invite: undefined,
  });
  expect(chatsCreationActions(computerEnvironmentKey('mac'), targets)).toEqual({
    group: true,
    bot: true,
    join: false,
    invite: undefined,
  });
  expect(chatsCreationActions(scope, targets)).toEqual({
    group: true,
    bot: false,
    join: false,
    invite: expect.objectContaining({ kind: 'cloud', workspace }),
  });
});

it.each([
  { ...workspace, guest: true },
  { ...workspace, role: 'member' as const },
])('hides Invite and group creation in an ineligible cloud workspace', (ineligible) => {
  expect(chatsCreationActions(scope, creationTargets(computer, [ineligible]))).toEqual({
    group: false,
    bot: false,
    join: false,
    invite: undefined,
  });
});

it('keeps group creation and hides Bot creation from ungranted Team members', () => {
  const targets = creationTargets(computer, []).map((target) => ({
    ...target,
    botCreation: false,
  }));
  expect(chatsCreationActions('all', targets)).toMatchObject({
    group: true,
    bot: false,
    join: true,
  });
  expect(chatsCreationActions(computerEnvironmentKey('mac'), targets)).toMatchObject({
    group: true,
    bot: false,
    join: false,
  });
});

it('hides both cloud actions without cloud support', () => {
  feature.cloud = false;
  try {
    const targets = creationTargets(computer, [workspace]);
    expect(chatsCreationActions('all', targets).join).toBe(false);
    expect(chatsCreationActions(scope, targets).invite).toBeUndefined();
  } finally {
    feature.cloud = true;
  }
});
