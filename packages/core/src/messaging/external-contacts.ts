import type { DatabaseSync } from 'node:sqlite';
import type {
  ExternalContact,
  ExternalContactBlockChange,
  ExternalContactBot,
  ExternalContactList,
  ExternalContactListQuery,
} from '@botharness/host-protocol/external-contacts';
import { contactId, personBlocked } from './contact-identity.js';
import { readMessagingIdentity } from './identity.js';
import { approvedConversationPairing, externalContactRoles } from './permissions/contact-roles.js';
import { ownerActor, senderBlocked } from './permissions/sender-blocks.js';
import { externalContactAccess } from './permissions/senders.js';
import { MessagingError } from './provider.js';

type Observation = {
  binding_id: string;
  bot_slug: string;
  actor_id: string;
  name: string | null;
  pending: number;
};

function knownContacts(db: DatabaseSync, slugs: string[], now: string) {
  const rows = db
    .prepare(`
    WITH selected AS (SELECT value AS slug FROM json_each(?)),
    contacts AS (
      SELECT binding_id, bot_slug, actor_id, name, last_seen_at AS seen, 0 AS pending
      FROM messaging_contact_observations WHERE bot_slug IN (SELECT slug FROM selected)
      UNION ALL
      SELECT binding_id, bot_slug, actor_id, json_extract(body, '$.actorName'),
             COALESCE(json_extract(body, '$.updatedAt'), json_extract(body, '$.createdAt'), ''),
             status = 'pending' AND json_extract(body, '$.expiresAt') > ?
      FROM messaging_pairings WHERE bot_slug IN (SELECT slug FROM selected)
    )
    SELECT binding_id, bot_slug, actor_id, name, pending
    FROM contacts ORDER BY seen DESC, binding_id, actor_id
  `)
    .all(JSON.stringify(slugs), now) as Observation[];
  const identities = new Map<string, ReturnType<typeof readMessagingIdentity>>();
  const groups = new Map<
    string,
    {
      contact: ExternalContact;
      observations: Observation[];
    }
  >();
  for (const row of rows) {
    const identity = identities.get(row.binding_id) ?? readMessagingIdentity(db, row.binding_id);
    identities.set(row.binding_id, identity);
    const id = contactId(identity, row.actor_id);
    const group = groups.get(id);
    if (group) {
      group.observations.push(row);
      group.contact.name ??= row.name;
      continue;
    }
    groups.set(id, {
      contact: {
        id,
        platform: identity.platform,
        workspaceId: identity.contactWorkspaceId ?? null,
        actorId: row.actor_id,
        name: row.name,
        bots: [],
        accessibleBotSlugs: [],
      },
      observations: [row],
    });
  }
  return groups;
}

function contactBindings(db: DatabaseSync, slugs: string[], contact: ExternalContact) {
  const rows = db
    .prepare(`SELECT id FROM messaging_bindings
    WHERE bot_slug IN (SELECT value FROM json_each(?)) AND platform = ? AND revoked_at IS NULL
      AND contact_workspace_id IS ? ORDER BY id`)
    .all(JSON.stringify(slugs), contact.platform, contact.workspaceId);
  return rows
    .map((row) => readMessagingIdentity(db, String(row.id)))
    .filter((binding) => contactId(binding, contact.actorId) === contact.id);
}

export function listExternalContacts(
  db: DatabaseSync,
  slugs: string[],
  managedSlugs: string[],
  filter: ExternalContactListQuery['status'],
  now: string,
): ExternalContactList {
  const contacts: ExternalContact[] = [];
  for (const { contact, observations } of knownContacts(db, slugs, now).values()) {
    const byBot = new Map<
      string,
      Array<{
        binding: ReturnType<typeof readMessagingIdentity>;
        access: ReturnType<typeof externalContactAccess>;
      }>
    >();
    const accessible = new Set<string>();
    for (const binding of contactBindings(db, managedSlugs, contact)) {
      const slug = binding.botSlug;
      const access = externalContactAccess(db, slug, binding.id, contact.actorId);
      const apps = byBot.get(slug) ?? [];
      apps.push({ binding, access });
      byBot.set(slug, apps);
      if (access.canSpeak) accessible.add(slug);
    }
    contact.accessibleBotSlugs = [...accessible].sort();
    for (const slug of slugs) {
      const local = observations.filter((row) => row.bot_slug === slug);
      if (!local.length) continue;
      const apps = byBot.get(slug) ?? [];
      const blocked = personBlocked(db, slug, contact.id);
      const paired = apps.some(({ access }) => access.status === 'paired');
      const hasLegacyBlock = apps.some(({ binding }) =>
        senderBlocked(db, slug, {
          fingerprint: binding.fingerprint,
          actor: { kind: 'user', id: contact.actorId },
        }),
      );
      const status: ExternalContactBot['status'] =
        blocked || hasLegacyBlock
          ? 'blocked'
          : paired
            ? 'paired'
            : local.some(
                  (row) => row.pending && apps.some(({ binding }) => binding.id === row.binding_id),
                )
              ? 'requested'
              : 'unpaired';
      contact.bots.push({
        slug,
        status,
        personBlocked: blocked,
        hasLegacyBlock,
        roleIds: [
          ...new Set(
            apps.flatMap(({ binding, access }) =>
              access.status !== 'blocked'
                ? access.roleIds
                : externalContactRoles(
                    db,
                    binding,
                    contact.actorId,
                    approvedConversationPairing(db, slug, binding.id, contact.actorId),
                  ).map(({ role }) => role.id),
            ),
          ),
        ],
        canSpeak: accessible.has(slug),
      });
    }
    if (!filter || filter === 'all' || contact.bots.some((bot) => bot.status === filter))
      contacts.push(contact);
  }
  return { contacts };
}

export function changeExternalContactBlock(
  db: DatabaseSync,
  input: ExternalContactBlockChange,
  now: string,
): { blocked: boolean } {
  const { slug, contactId: id, blocked } = input;
  const group = knownContacts(db, [slug], now).get(id);
  if (!group) throw new MessagingError('contact-not-found');
  if (blocked) {
    if (
      contactBindings(db, [slug], group.contact).some((binding) =>
        ownerActor(db, slug, binding.fingerprint, group.contact.actorId),
      )
    )
      throw new MessagingError('sender-block-owner');
    db.prepare(`INSERT OR IGNORE INTO messaging_person_blocks
      (contact_id, bot_slug, scope_kind, blocked_at) VALUES (?, ?, 'bot', ?)`).run(id, slug, now);
  } else {
    db.prepare(`DELETE FROM messaging_person_blocks
      WHERE contact_id = ? AND bot_slug = ? AND scope_kind = 'bot' AND scope_id = ''`).run(
      id,
      slug,
    );
  }
  return { blocked };
}
