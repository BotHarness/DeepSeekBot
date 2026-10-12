import type { DatabaseSync } from 'node:sqlite';
import {
  behaviorConfigurationConflicts,
  type BehaviorGroup,
  type BehaviorMember,
  type BehaviorPermission,
} from './behavior-policy.js';
import { MessagingError } from './provider.js';
import { readMessagingIdentity } from './identity.js';

export function assertBehaviorCompatibility(
  db: DatabaseSync,
  botSlug: string,
  items: BehaviorPermission[],
  proposedGroups?: BehaviorGroup[],
): void {
  const groups =
    proposedGroups ??
    (
      db
        .prepare('SELECT body FROM messaging_permission_groups WHERE bot_slug = ?')
        .all(botSlug) as { body: string }[]
    ).map((row) => JSON.parse(row.body) as BehaviorGroup);
  const members = (
    db
      .prepare(
        "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND purpose = 'conversation' AND status = 'approved'",
      )
      .all(botSlug) as { body: string }[]
  )
    .map((row) => JSON.parse(row.body) as BehaviorMember)
    .filter((member) => {
      try {
        const binding = readMessagingIdentity(db, member.bindingId);
        return binding.botSlug === botSlug && !binding.revokedAt;
      } catch (error) {
        if (!(error instanceof MessagingError)) throw error;
        return false;
      }
    });
  if (behaviorConfigurationConflicts(items, groups, members).length)
    throw new MessagingError('behavior-permission-conflict');
}
