import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('adds account enrollment143 to canonical Human140/relationship141/offline142 without replacing existing Humans, manual grants or pending retirement', () => {
  const home = createTempRoot('schema-main-e6-');
  const previous = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 142),
      ),
    }),
  );
  expect(previous.mode).toBe('ready');
  const database = attachOperationalModule(previous, 'migration-fixture');
  const pairing = createDevicePairing({ database, hostName: 'Existing' });
  const issue = (name: string) => {
    const result = pairing.redeem({ offer: pairing.createOffer().offer, name });
    if (!result.ok) throw new Error(result.code);
    return result;
  };
  const independent = issue('Independent');
  const derived = issue('Existing relationship Client');
  database.transaction((db) => {
    db.exec(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, human_id)
      VALUES ('human', 'human-message', 'ada', 'Existing', '2026-11-14T00:00:00Z', 'human-other');
      INSERT INTO human_attention_decisions VALUES ('human-other', 'human', 'ignored', 'before')`);
    const insert = db.prepare(`INSERT INTO host_relationships
      (relationship_id, peer_host_id, peer_name, peer_key, peer_routes, direction, state, expires_at, created_at, updated_at, peer_revocation_pending, automatic_enrollment_suppressed, revocation_attempts, revocation_retry_at)
      VALUES (?, ?, 'Peer', ?, '[]', 'outgoing', ?, 0, 'before', 'before', ?, ?, ?, ?)`);
    insert.run('manual-active', 'manual-peer', 'ab'.repeat(32), 'active', 0, 0, 0, null);
    insert.run(
      'pending-retirement',
      'retired-peer',
      'cd'.repeat(32),
      'disconnected',
      1,
      1,
      2,
      2000,
    );
    db.prepare(
      'INSERT INTO relationship_device_grants (relationship_id, device_id) VALUES (?, ?)',
    ).run('manual-active', derived.device.id);
  });
  previous.close();
  for (let restart = 0; restart < 2; restart++) {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    expect(owner.mode).toBe('ready');
    expect(owner.generation).toBe(143);
    const current = attachOperationalModule(owner, 'migration-fixture');
    const devices = createDevicePairing({ database: current, hostName: 'Existing' });
    expect(devices.admit('Device ' + independent.credential).ok).toBe(true);
    expect(devices.admit('Device ' + derived.credential).ok).toBe(true);
    const relationships = createHostRelationships({ database: current, pairing: devices });
    expect(relationships.read('manual-active')).toMatchObject({
      state: 'active',
      accountOrigin: null,
    });
    expect(relationships.read('pending-retirement')).toMatchObject({
      state: 'disconnected',
      accountOrigin: null,
      peerRevocationPending: true,
      automaticEnrollmentSuppressed: true,
      revocationAttempts: 2,
      revocationRetryAt: 2000,
    });
    current.read((db) => {
      expect(db.prepare('SELECT human_id FROM source_events').get()?.human_id).toBe('human-other');
      expect(db.prepare('SELECT human_id FROM human_attention_decisions').all()).toEqual([
        { human_id: 'human-other' },
      ]);
      expect(db.prepare('SELECT * FROM relationship_client_enrollments').all()).toEqual([]);
      expect(db.prepare('SELECT device_id FROM relationship_device_grants').all()).toEqual([
        { device_id: derived.device.id },
      ]);
    });
    owner.close();
  }
});
