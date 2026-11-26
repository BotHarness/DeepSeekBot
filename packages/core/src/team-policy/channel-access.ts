import type { ChannelPolicy } from './channel-contract.js';
import { TeamError } from './error.js';

type ChannelRole = 'owner' | 'admin' | 'member';
type ChannelAction = 'manage' | keyof ChannelPolicy;

export interface ChannelAccessFacts {
  active(): boolean;
  joined(): boolean;
  group(): boolean;
  groupPolicy(): ChannelPolicy;
  role(): ChannelRole;
  managesAll(): boolean;
}

export function requireChannelAccess(action: ChannelAction, facts: ChannelAccessFacts): void {
  if (action === 'manage') {
    if (!facts.active()) throw new TeamError('permission-required');
    facts.groupPolicy();
    if (facts.managesAll()) return;
    if (!facts.joined()) throw new TeamError('channel-not-found');
    if (facts.role() === 'member') throw new TeamError('permission-required');
    return;
  }

  if (action === 'addMembers') {
    const denied = () =>
      new TeamError('permission-required', undefined, { permission: 'addMembers' });
    if (!facts.active()) throw denied();
    const policy = facts.groupPolicy();
    if (facts.managesAll()) return;
    if (!facts.joined()) throw denied();
    if (policy.addMembers !== 'everyone' && facts.role() === 'member') throw denied();
    return;
  }

  if (!facts.joined()) throw new TeamError('channel-not-found');
  if (!facts.group()) {
    if (action === 'post') return;
    throw new TeamError('channel-not-found');
  }
  if (facts.managesAll() || facts.groupPolicy()[action] === 'everyone' || facts.role() !== 'member')
    return;
  throw new TeamError(
    action === 'post'
      ? 'channel-post-restricted'
      : action === 'mentionAll'
        ? 'channel-mention-restricted'
        : 'permission-required',
    undefined,
    { permission: action },
  );
}
