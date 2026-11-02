import { describe, expect, it } from 'vitest';
import {
  conversationEnvironments,
  includesComputerActivity,
  cloudEnvironmentKey,
  computerEnvironmentKey,
} from '../src/host/conversation-environments';
import type { ConversationWorkspace } from '../src/cloud/conversations';

const workspace = (
  scope: string,
  organizationId: string,
  guest = false,
): ConversationWorkspace => ({
  scope,
  organizationId,
  instanceId: 'instance',
  server: `https://${scope}.example.test`,
  organizationName: 'Same name',
  guest,
});
describe('Chats environment scope', () => {
  it('keeps All first then source order, independent of completion/message order', () => {
    const computer = { hostId: 'one', name: 'Same name' };
    const a = workspace('account-a', 'same');
    const b = workspace('account-b', 'same', true);
    const expected = [
      'all',
      computerEnvironmentKey('one'),
      cloudEnvironmentKey('account-a', 'same'),
      cloudEnvironmentKey('account-b', 'same'),
    ];
    expect(
      conversationEnvironments(computer, ['account-a', 'account-b'], [b, a], 'All').map(
        (x) => x.key,
      ),
    ).toEqual(expected);
    expect(
      conversationEnvironments(computer, ['account-a', 'account-b'], [a, b], 'All').map(
        (x) => x.key,
      ),
    ).toEqual(expected);
  });
  it('does not resurrect detached account namespaces or duplicate guest membership', () => {
    const own = workspace('active', 'same');
    expect(
      conversationEnvironments(
        undefined,
        ['active'],
        [workspace('signed-out', 'same'), own, { ...own, guest: true }],
        'All',
      ).map((x) => x.key),
    ).toEqual(['all', cloudEnvironmentKey('active', 'same')]);
  });
  it('does not borrow a Computer feed/badge for an Organization or replaced Computer', () => {
    expect(includesComputerActivity('all', 'one')).toBe(true);
    expect(includesComputerActivity(computerEnvironmentKey('one'), 'one')).toBe(true);
    expect(includesComputerActivity(computerEnvironmentKey('other'), 'one')).toBe(false);
    expect(includesComputerActivity(cloudEnvironmentKey('one', 'org'), 'one')).toBe(false);
    expect(includesComputerActivity('all', undefined)).toBe(false);
    expect(includesComputerActivity('corrupt choice', 'one')).toBe(false);
  });
});

it('distinguishes same-name Organizations without changing source routing or order', () => {
  const a = workspace('a', 'org_A12345678');
  const b = { ...workspace('a', 'org_B12345678'), server: a.server };
  const c = workspace('b', 'org_A12345678');
  const routes = conversationEnvironments(undefined, ['a', 'b'], [a, b, c], 'All');
  expect(new Set(routes.map((r) => r.accessibilityLabel ?? r.title)).size).toBe(4);
  expect(new Set(routes.slice(1).map((r) => r.detail)).size).toBe(3);
  expect(routes[1]?.key).toBe(cloudEnvironmentKey('a', a.organizationId));
  expect(conversationEnvironments(undefined, ['a'], [a], 'All')[1]?.detail).toBeUndefined();
});
