import type { HostExternalRole } from '@botharness/host-protocol/external-roles';
import type { DatabaseSync } from 'node:sqlite';
import { readMessagingIdentity, type MessagingIdentity } from '../identity.js';
import type { PairingRequest } from '../pairing.js';
import { platformPeople } from './people.js';
import { readExternalRoleForBot } from './roles.js';

type ContactRole = { pairing: PairingRequest; role: HostExternalRole };

export function externalContactRoles(
  db: DatabaseSync,
  target: MessagingIdentity,
  actorId: string,
  local: PairingRequest | undefined,
): ContactRole[] {
  if (!target.enabled || target.revokedAt || !platformPeople(target.platform)?.roles) return [];
  const localRole = readExternalRoleForBot(db, target.botSlug, local?.roleId);
  const roles = local && localRole ? [{ pairing: local, role: localRole }] : [];
  if (target.platform !== 'slack' || !target.contactWorkspaceId) return roles;
  const rows = db
    .prepare(`SELECT p.body FROM messaging_pairings p
    JOIN messaging_bindings b ON b.id = p.binding_id AND b.bot_slug = p.bot_slug
    WHERE p.actor_id = ? AND p.purpose = 'conversation' AND p.status = 'approved'
      AND b.provider_id = ? AND b.platform = ? AND b.contact_workspace_id = ?
      AND b.bot_slug <> ? AND b.revoked_at IS NULL
    ORDER BY p.rowid`)
    .all(
      actorId,
      target.providerId,
      target.platform,
      target.contactWorkspaceId,
      target.botSlug,
    ) as { body: string }[];
  const seen = new Set(roles.map(({ role }) => role.id));
  for (const row of rows) {
    const pairing = JSON.parse(row.body) as PairingRequest;
    const role = readExternalRoleForBot(db, target.botSlug, pairing.roleId);
    if (!role || seen.has(role.id) || !readMessagingIdentity(db, pairing.bindingId).enabled)
      continue;
    seen.add(role.id);
    roles.push({ pairing, role });
  }
  return roles;
}

export function approvedConversationPairing(
  db: DatabaseSync,
  botSlug: string,
  bindingId: string,
  actorId: string,
): PairingRequest | undefined {
  const row = db
    .prepare(`SELECT body FROM messaging_pairings
    WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND purpose = 'conversation' AND status = 'approved'`)
    .get(botSlug, bindingId, actorId) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as PairingRequest) : undefined;
}

export function contactRoleAppliesToEvent(
  { pairing }: ContactRole,
  event: { at: string; messageId: string; bindingId: string },
): boolean {
  return (
    !!pairing.reviewedAt &&
    Date.parse(event.at) >= Date.parse(pairing.reviewedAt) &&
    (pairing.bindingId !== event.bindingId || !pairing.messageIds?.includes(event.messageId))
  );
}
