import { afterEach, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { hostExternalRoles, readSenderPermissions } from '../src/messaging/permissions/index.js';
import { createTempRoot } from './helpers.js';
import { event, owners } from './support/bot-pairing.js';

afterEach(() => {
  for (const owner of owners.splice(0)) owner.close();
});

it('preserves each paired contact’s capabilities, behavior and role reference when equally named Bot roles move to the Host', () => {
  const dshHome = createTempRoot('bh-external-role-upgrade-');
  const generation = BOT_HARNESS_SCHEMA_PLAN.generationOf('host-external-roles');
  const priorPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < generation),
  );
  const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
  const old = attachOperationalModule(prior, 'messaging');
  const before = [
    {
      slug: 'ada',
      fingerprint: 'a'.repeat(64),
      behavior: 'Answer project questions.',
      allowed: ['approve', 'reject'],
      denied: ['approve'],
      exception: ['answer'],
      expected: ['reject', 'answer'],
      effect: 'allow',
    },
    {
      slug: 'bea',
      fingerprint: 'b'.repeat(64),
      behavior: 'Escalate project questions.',
      allowed: ['save-rules'],
      denied: ['answer'],
      exception: ['review-pairing'],
      expected: ['save-rules', 'review-pairing'],
      effect: 'deny',
    },
  ];
  const at = '2026-01-01T00:00:00.000Z';
  const originals = old.transaction((db) =>
    before.map((item) => {
      const roleId = `role-${item.slug}`;
      const pairingId = `pair-${item.slug}`;
      const body = JSON.stringify({
        id: pairingId,
        actorId: 'U12345',
        bindingId: item.slug,
        status: 'approved',
        purpose: 'conversation',
        reviewedAt: at,
        revision: 4,
        roleId,
        roleRevision: 5,
        permissionExceptions: { allow: item.exception, deny: item.denied },
      });
      db.prepare(`INSERT INTO messaging_bindings
        (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name)
        VALUES (?, ?, 'dsh-im/slack', 'slack', ?, ?, ?, ?)`).run(
        item.slug,
        item.slug,
        item.slug,
        item.fingerprint,
        at,
        item.slug,
      );
      db.prepare('INSERT INTO messaging_external_roles (id, bot_slug, body) VALUES (?, ?, ?)').run(
        roleId,
        item.slug,
        JSON.stringify({
          id: roleId,
          botSlug: item.slug,
          name: 'Support',
          behavior: item.behavior,
          capabilities: item.allowed,
          delegableCapabilities: ['reject'],
          revision: 5,
          createdAt: at,
        }),
      );
      db.prepare(`INSERT INTO messaging_pairings
        (id, bot_slug, binding_id, actor_id, purpose, status, body)
        VALUES (?, ?, ?, 'U12345', 'conversation', 'approved', ?)`).run(
        pairingId,
        item.slug,
        item.slug,
        body,
      );
      db.prepare(`INSERT INTO messaging_behavior_permissions (id, bot_slug, body)
        VALUES (?, ?, ?)`).run(
        roleId,
        item.slug,
        JSON.stringify({
          id: roleId,
          botSlug: item.slug,
          name: 'Internal notes',
          behavior: 'Share internal notes.',
          revision: 2,
          createdAt: at,
          updatedAt: at,
        }),
      );
      db.prepare(`INSERT INTO messaging_permission_groups (id, bot_slug, binding_id, body)
        VALUES (?, ?, ?, ?)`).run(
        roleId,
        item.slug,
        item.slug,
        JSON.stringify({
          id: roleId,
          name: 'Notes',
          revision: 2,
          bindingId: item.slug,
          memberIds: [pairingId],
          allow: [],
          deny: [],
          [item.effect === 'allow' ? 'behaviorAllow' : 'behaviorDeny']: [roleId],
        }),
      );
      return { id: pairingId, body };
    }),
  );
  prior.close();

  const owner = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  owners.push(owner);
  expect(owner.mode).toBe('ready');
  const database = attachOperationalModule(owner, 'messaging');
  database.transaction((db) =>
    db.prepare("UPDATE messaging_bindings SET contact_workspace_id = 'T12345'").run(),
  );
  database.read((db) => {
    expect(db.prepare('SELECT id, body FROM messaging_pairings ORDER BY rowid').all()).toEqual(
      originals,
    );
    expect(hostExternalRoles(db)).toMatchObject(
      before.map(({ slug, behavior }) => ({
        id: `role-${slug}`,
        name: 'Support',
        botScope: { kind: 'only', botSlugs: [slug] },
        behavior,
        policy: [],
        deniedCapabilities: [],
        revision: 5,
        createdAt: at,
      })),
    );
    for (const item of before) {
      const sender = readSenderPermissions(
        db,
        item.slug,
        {
          ...event('U12345'),
          channel: 'slack',
          botId: item.slug,
          fingerprint: item.fingerprint,
          conversation: { kind: 'dm', id: 'D12345' },
          reply: { messageId: 'message-1', actorId: 'U12345', conversationId: 'D12345' },
        },
        new Date(at),
      );
      expect(sender).toMatchObject({
        status: 'paired',
        role: { name: 'Support', behavior: item.behavior },
        effectivePermissions: {
          capabilities: item.expected,
          deniedCapabilities: item.denied,
          delegableCapabilities: ['reject'],
          behaviorPermissions: [{ name: 'Internal notes', effect: item.effect }],
        },
      });
      expect(sender.roles).toBeUndefined();
      expect(sender.effectivePermissions?.roleRules).toBeUndefined();
    }
  });
});
