import { resolveGrants } from '../kernel/grants.js';
import type { ChannelBotAudience } from '@botharness/host-protocol/channel-bots';
import { CHANNEL_ACTIONS, type ChannelAction, type ChannelPolicy } from './channel-contract.js';
import { TeamError } from './error.js';

type ChannelRole = 'owner' | 'admin' | 'member';
interface ChannelSettings {
  owner: string | null;
  policy: ChannelPolicy;
}
export interface ChannelAccessFacts {
  active(): boolean;
  joined(): boolean;
  group(): boolean;
  settings(): ChannelSettings;
  role(owner: string | null): ChannelRole;
  managesAll(): boolean;
  roleIds(): ReadonlySet<string>;
}

export function mergeChannelAction(
  policy: ChannelPolicy,
  roleIds: ReadonlySet<string>,
  action: ChannelAction,
): boolean {
  const effects = policy.overrides.filter((row) => roleIds.has(row.roleId));
  const { granted, denied } = resolveGrants(
    effects.map(({ actions }) => ({
      allow: actions[action] === 'allow' ? [action] : [],
      deny: actions[action] === 'deny' ? [action] : [],
    })),
    CHANNEL_ACTIONS,
  );
  return (
    !denied.includes(action) && (granted.includes(action) || policy.everyone[action] === 'allow')
  );
}

export function allowsGroupAction(
  action: ChannelAction,
  facts: ChannelAccessFacts,
  settings: ChannelSettings,
  joined?: boolean,
): boolean {
  if (action === 'wakeBot') {
    return (
      (joined ?? facts.joined()) &&
      allowsBotMention(
        settings.policy,
        { kind: 'everyone' },
        settings.policy.overrides.length ? facts.roleIds() : new Set(),
        facts.role(settings.owner) !== 'member',
      )
    );
  }
  const manages = facts.managesAll();
  if (action === 'addMembers' && manages) return true;
  if (!(joined ?? facts.joined())) return false;
  const { owner, policy } = settings;
  return (
    manages ||
    (policy.overrides.length === 0
      ? policy.everyone[action] === 'allow'
      : mergeChannelAction(policy, facts.roleIds(), action)) ||
    facts.role(owner) !== 'member'
  );
}

export function allowsBotMention(
  policy: ChannelPolicy,
  audience: ChannelBotAudience,
  roleIds: ReadonlySet<string>,
  admin: boolean,
): boolean {
  return (
    (admin || mergeChannelAction(policy, roleIds, 'wakeBot')) &&
    (audience.kind === 'everyone' ||
      (audience.kind === 'admins' ? admin : audience.roleIds.some((id) => roleIds.has(id))))
  );
}

export function allowsChannelAction(action: ChannelAction, facts: ChannelAccessFacts): boolean {
  return facts.active() && allowsGroupAction(action, facts, facts.settings());
}

export function requireChannelAccess(
  action: 'manage' | ChannelAction,
  facts: ChannelAccessFacts,
): void {
  if (action === 'manage') {
    if (!facts.active()) throw new TeamError('permission-required');
    const { owner } = facts.settings();
    if (facts.managesAll()) return;
    if (!facts.joined()) throw new TeamError('channel-not-found');
    if (facts.role(owner) === 'member') throw new TeamError('permission-required');
    return;
  }

  if (action === 'addMembers') {
    if (allowsChannelAction(action, facts)) return;
  } else {
    if (!facts.joined()) throw new TeamError('channel-not-found');
    if (!facts.group()) {
      if (action === 'post') return;
      throw new TeamError('channel-not-found');
    }
    if (allowsGroupAction(action, facts, facts.settings(), true)) return;
  }
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
