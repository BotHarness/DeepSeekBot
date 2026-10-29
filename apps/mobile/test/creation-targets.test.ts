import { describe, expect, it } from 'vitest';
import { creationActions, creationTargets, targetsFor } from '../src/host/creation-targets';
import { cloudEnvironmentKey, computerEnvironmentKey } from '../src/host/conversation-environments';
import type { ConversationWorkspace } from '../src/cloud/conversations';

const workspace = (
  id: string,
  role?: 'owner' | 'member',
  guest = false,
): ConversationWorkspace => ({
  organizationId: id,
  organizationName: 'Shared name',
  instanceId: 'uat',
  scope: 'alice',
  server: 'https://uat.example.test',
  guest,
  ...(role ? { role } : {}),
});
describe('source-bound creation choices', () => {
  const workspaces = [
    workspace('org_a', 'owner'),
    workspace('org_b', 'member'),
    workspace('org_c', undefined, true),
  ];
  const targets = creationTargets({ hostId: 'mac', name: 'Mac' }, workspaces);
  it('keeps All explicit and offers no cloud Bot creation', () => {
    expect(creationActions('all', targets)).toEqual([
      'bot',
      'zip',
      'git',
      'channel',
      'marketplace',
      'join',
    ]);
    expect(targetsFor('channel', 'all', targets).map((t) => t.kind)).toEqual(['computer', 'cloud']);
    expect(targetsFor('bot', 'all', targets).map((t) => t.kind)).toEqual(['computer']);
    expect(creationActions(cloudEnvironmentKey('alice', 'org_a'), targets)).toEqual([
      'channel',
      'invite',
    ]);
    expect(creationActions(computerEnvironmentKey('mac'), targets)).toEqual([
      'bot',
      'zip',
      'git',
      'channel',
      'marketplace',
    ]);
  });
  it('does not fall back to All for a removed source, member or channel-only guest', () => {
    for (const scope of [
      cloudEnvironmentKey('alice', 'org_b'),
      cloudEnvironmentKey('alice', 'org_c'),
      cloudEnvironmentKey('bob', 'org_a'),
      computerEnvironmentKey('other'),
    ])
      expect(creationActions(scope, targets)).toEqual([]);
    expect(creationActions('all', [])).toEqual(['bot', 'zip', 'git', 'marketplace', 'join']);
  });
  it('distinguishes same-name targets without granting access through their labels', () => {
    const list = creationTargets(undefined, [
      workspace('org_aaaaaaaa', 'owner'),
      workspace('org_bbbbbbbb', 'owner'),
    ]);
    expect(new Set(list.map((t) => t.name)).size).toBe(2);
    expect(targetsFor('channel', 'Shared name', list)).toEqual([]);
  });
});
