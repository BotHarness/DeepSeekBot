import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('upgrades canonical Human140/E1 141 pending retirement and preserves Human data and independent access', () => {
  const home = createTempRoot('schema-main-e4-');
  const previous = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 141),
      ),
    }),
  );
  expect(previous.mode).toBe('ready');
  const database = attachOperationalModule(previous, 'migration-fixture');
  const pairing = createDevicePairing({ database, hostName: 'Existing' });
  const independent = pairing.redeem({
    offer: pairing.createOffer().offer,
    name: 'Independent Client',
  });
  if (!independent.ok) throw new Error(independent.code);
  database.transaction((db) => {
    db.exec(`INSERT INTO source_events
      (source_event_id, source_kind, bot_slug, body, created_at, human_id)
      VALUES ('human', 'human-message', 'ada', 'Existing', '2026-11-14T00:00:00Z', 'human-other');
      INSERT INTO human_attention_decisions VALUES ('human-other', 'human', 'ignored', 'before')`);
    db.prepare(`INSERT INTO host_relationships
      (relationship_id, peer_host_id, peer_name, peer_key, peer_routes, direction, state,
       expires_at, created_at, updated_at, peer_revocation_pending)
      VALUES ('legacy-pending', 'peer', 'Peer', ?, '[]', 'outgoing', 'disconnected',
       0, 'before', 'before', 1)`).run('ab'.repeat(32));
  });
  previous.close();
  let retryAt: number | null = null;
  for (let restart = 0; restart < 2; restart++) {
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 142),
        ),
      }),
    );
    expect(owner.mode).toBe('ready');
    expect(owner.generation).toBe(142);
    const current = attachOperationalModule(owner, 'migration-fixture');
    const reopened = createDevicePairing({ database: current, hostName: 'Existing' });
    expect(reopened.admit('Device ' + independent.credential).ok).toBe(true);
    const relationships = createHostRelationships({
      database: current,
      pairing: reopened,
      now: () => 1000,
    });
    const pending = relationships.read('legacy-pending');
    expect(pending).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: true,
      automaticEnrollmentSuppressed: true,
      revocationAttempts: restart,
      revocationRetryAt: restart ? retryAt : 0,
    });
    if (restart === 0)
      retryAt = relationships.beginRevocationAttempt('legacy-pending').revocationRetryAt;
    current.read((db) => {
      expect(db.prepare('SELECT human_id FROM source_events').get()?.human_id).toBe('human-other');
      expect(db.prepare('SELECT human_id FROM human_attention_decisions').all()).toEqual([
        { human_id: 'human-other' },
      ]);
    });
    owner.close();
  }
});
