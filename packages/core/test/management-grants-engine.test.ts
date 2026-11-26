import { describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import {
  canManageGrants,
  grantAllManagement,
  managementGrantHolders,
} from '../src/tob/management-grants.js';
import { alice, bob, carol, fixture } from './team-bot-visibility-fixtures.js';

const LEGACY_AUTHORIZED = `SELECT 1 FROM team_settings s WHERE (?1 = s.owner_human_id OR (s.enabled = 1 AND EXISTS (
    SELECT 1 FROM humans h JOIN human_roles m ON m.human_id = h.human_id
    JOIN host_roles r ON r.role_id = m.role_id, json_each(r.permissions_json) p
    WHERE h.human_id = ?1 AND h.status = 'active' AND p.value = 'bots.manageGrants')))`;

const PEOPLE = [owner, alice, bob, carol].map((human) => human.humanId);

function snapshot(f: ReturnType<typeof fixture>) {
  return PEOPLE.map((humanId) => ({
    humanId,
    legacy: f.db.read((db) => db.prepare(LEGACY_AUTHORIZED).get(humanId) !== undefined),
    engine: canManageGrants(f.db, humanId),
  }));
}

function setup() {
  const f = fixture();
  const stewards = f.team.roles.create(owner, 'Stewards', ['bots.manageGrants']).role;
  f.team.roles.set(owner, alice.humanId, ['member', stewards.roleId]);
  f.team.roles.set(owner, bob.humanId, ['member', stewards.roleId]);
  f.db.transaction((db) => {
    for (const slug of ['alice-bot', 'bob-bot', 'owner-bot'])
      grantAllManagement(db, slug, '2026-11-26T00:00:00Z');
  });
  return { f, stewards };
}

function holders(f: ReturnType<typeof fixture>): string[] {
  return managementGrantHolders(f.db).map((holder) => holder.botSlug);
}

describe('bots.manageGrants through the permission engine', () => {
  it('authorizes the same people as the legacy predicate in every state', () => {
    const { f, stewards } = setup();
    const states: Array<[string, () => void]> = [
      ['initial', () => {}],
      [
        'suspended',
        () =>
          f.db.transaction((db) =>
            db
              .prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?")
              .run(bob.humanId),
          ),
      ],
      ['lost capability', () => f.team.roles.set(owner, alice.humanId, ['member'])],
      [
        'Team mode off',
        () => f.db.transaction((db) => db.prepare('UPDATE team_settings SET enabled = 0').run()),
      ],
      [
        'Team mode on again',
        () => f.db.transaction((db) => db.prepare('UPDATE team_settings SET enabled = 1').run()),
      ],
      ['role edited', () => f.team.roles.update(owner, stewards.roleId, { permissions: [] })],
    ];
    for (const [label, apply] of states) {
      apply();
      for (const row of snapshot(f))
        expect(row.engine, `${label}: ${row.humanId}`).toBe(row.legacy);
    }
  });

  it('withdraws grant holders when the member is suspended, loses the capability or Team mode is off', () => {
    const { f } = setup();
    expect(holders(f)).toEqual(['alice-bot', 'bob-bot', 'owner-bot']);
    f.db.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?").run(bob.humanId),
    );
    expect(holders(f)).toEqual(['alice-bot', 'owner-bot']);
    f.team.roles.set(owner, alice.humanId, ['member']);
    expect(holders(f)).toEqual(['owner-bot']);
    f.team.roles.set(owner, alice.humanId, ['member', 'admin']);
    expect(holders(f)).toEqual(['owner-bot']);
    f.db.transaction((db) => db.prepare('UPDATE team_settings SET enabled = 0').run());
    expect(holders(f)).toEqual(['owner-bot']);
    expect(canManageGrants(f.db, owner.humanId)).toBe(true);
  });
});
