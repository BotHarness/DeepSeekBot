import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const e4SchemaPlan = defineSchemaPlan(
  BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 146),
);

it.each([144, 145])(
  'upgrades published generation %i to E4 revocation146 without losing Human, Team or independent device data',
  (generation) => {
    const home = createTempRoot('schema-main-e4-');
    const previous = trackTestOwner(
      mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
            (migration) => migration.generation <= generation,
          ),
        ),
      }),
    );
    expect(previous.mode).toBe('ready');
    const database = attachOperationalModule(previous, 'migration-fixture');
    const deviceId = 'independent-device';
    const secret = 'independent-device-private-secret-1234567890';
    database.transaction((db) => {
      db.prepare(
        'INSERT INTO paired_devices(device_id, name, secret_hash, paired_at) VALUES (?, ?, ?, ?)',
      ).run(
        deviceId,
        'Independent Client',
        createHash('sha256').update(secret).digest('hex'),
        'before',
      );
      db.exec(`INSERT INTO source_events
      (source_event_id, source_kind, bot_slug, body, created_at, human_id)
      VALUES ('human', 'human-message', 'ada', 'Existing', '2026-11-14T00:00:00Z', 'human-other');
      INSERT INTO human_attention_decisions VALUES ('human-other', 'human', 'ignored', 'before');
      INSERT INTO humans VALUES ('human-other', 'Existing member', 'active', 'before');
      INSERT INTO member_grants VALUES ('member-grant', 'member-token-hash', 'human-other', 'before', 'before', NULL);
      INSERT INTO human_roles VALUES ('human-other', 'member');
      INSERT INTO persona_bots(slug, body, owner_human_id)
      VALUES ('member-bot', '{"slug":"member-bot","ownerHumanId":"human-other"}', 'human-other');
      INSERT INTO tob_identity VALUES ('human-other', 'member-bot')`);
      if (generation === 145)
        db.exec(`INSERT INTO humans VALUES ('suspended-member', 'Suspended', 'suspended', 'before');
      INSERT INTO team_mode_suspensions VALUES ('suspended-member', 'deactivated');
      INSERT INTO deleted_humans VALUES ('deleted-member', 'before')`);
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
        mountOperationalDatabase({ dshHome: home, schemaPlan: e4SchemaPlan }),
      );
      expect(owner.mode).toBe('ready');
      expect(owner.generation).toBe(146);
      const current = attachOperationalModule(owner, 'migration-fixture');
      const reopened = createDevicePairing({ database: current, hostName: 'Existing' });
      expect(reopened.admit(`Device ${deviceId}.${secret}`).ok).toBe(true);
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
        expect(db.prepare('SELECT human_id FROM source_events').get()?.human_id).toBe(
          'human-other',
        );
        expect(db.prepare('SELECT human_id FROM human_attention_decisions').all()).toEqual([
          { human_id: 'human-other' },
        ]);
        expect(
          db.prepare("SELECT status FROM humans WHERE human_id = 'human-other'").get(),
        ).toEqual({
          status: 'active',
        });
        expect(
          db
            .prepare(
              "SELECT human_id, revoked_at FROM member_grants WHERE grant_id = 'member-grant'",
            )
            .get(),
        ).toEqual({ human_id: 'human-other', revoked_at: null });
        expect(
          db.prepare("SELECT role_id FROM human_roles WHERE human_id = 'human-other'").get(),
        ).toEqual({ role_id: 'member' });
        expect(
          db
            .prepare("SELECT owner_human_id, body FROM persona_bots WHERE slug = 'member-bot'")
            .get(),
        ).toEqual({
          owner_human_id: 'human-other',
          body: '{"slug":"member-bot","ownerHumanId":"human-other"}',
        });
        expect(
          db.prepare("SELECT bot_slug FROM tob_identity WHERE human_id = 'human-other'").get(),
        ).toEqual({ bot_slug: 'member-bot' });
        if (generation === 145) {
          expect(
            db.prepare("SELECT status FROM humans WHERE human_id = 'suspended-member'").get(),
          ).toEqual({ status: 'suspended' });
          expect(db.prepare('SELECT * FROM team_mode_suspensions').all()).toEqual([
            { human_id: 'suspended-member', previous_status: 'deactivated' },
          ]);
          expect(db.prepare('SELECT * FROM deleted_humans').all()).toEqual([
            { human_id: 'deleted-member', deleted_at: 'before' },
          ]);
        }
      });
      owner.close();
    }
  },
);
