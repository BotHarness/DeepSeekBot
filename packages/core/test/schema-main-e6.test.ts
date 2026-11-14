import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('appends account150 after published Team models148 and usage149 while preserving published Channel access, Team lifecycle, retries and grants', () => {
  const home = createTempRoot('schema-main-e6-');
  const previous = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 149),
      ),
    }),
  );
  expect(previous.mode).toBe('ready');
  expect(previous.generation).toBe(149);
  const database = attachOperationalModule(previous, 'migration-fixture');
  const key = 'ab'.repeat(32);
  const activeId = 'a'.repeat(32),
    retiredId = 'b'.repeat(32);
  const independentId = 'i'.repeat(32),
    derivedId = 'd'.repeat(32);
  const secret = 'existing-independent-and-derived-device-secret';
  database.transaction((db) => {
    db.exec(`INSERT INTO humans VALUES ('suspended', 'Suspended member', 'suspended', 'before');
      INSERT INTO team_mode_suspensions VALUES ('suspended', 'deactivated');
      INSERT INTO deleted_humans VALUES ('deleted-member', 'before')`);
    db.prepare(`INSERT INTO usage_daily
      (bot_slug,day,provider,model,purpose,human_id,legacy,total_tokens)
      VALUES ('existing-bot','2026-11-14','provider','model','orchestrator','suspended',0,13)`).run();
    db.prepare(`INSERT INTO usage_receipts(fingerprint,bot_slug,human_id)
      VALUES ('existing-receipt','existing-bot','suspended')`).run();
    for (const deviceId of [independentId, derivedId])
      db.prepare(
        'INSERT INTO paired_devices(device_id,name,secret_hash,paired_at) VALUES (?,?,?,?)',
      ).run(deviceId, deviceId, createHash('sha256').update(secret).digest('hex'), 'before');
    db.prepare(`INSERT INTO host_relationships
      (relationship_id,peer_host_id,peer_name,peer_key,peer_routes,direction,state,expires_at,created_at,updated_at,
       peer_revocation_pending,revocation_attempts,revocation_retry_at,automatic_enrollment_suppressed)
      VALUES (?,?,?,?,?,'incoming','active',9999999999999,'before','before',0,0,NULL,0)`).run(
      activeId,
      'active-peer',
      'Peer',
      key,
      '["https://existing.ts.net"]',
    );
    db.prepare(`INSERT INTO host_relationships
      (relationship_id,peer_host_id,peer_name,peer_key,peer_routes,direction,state,expires_at,created_at,updated_at,
       peer_revocation_pending,revocation_attempts,revocation_retry_at,automatic_enrollment_suppressed)
      VALUES (?,?,?,?,?,'outgoing','disconnected',9999999999999,'before','before',1,3,12345,1)`).run(
      retiredId,
      'retired-peer',
      'Retired peer',
      key,
      '[]',
    );
    db.prepare('INSERT INTO relationship_device_grants VALUES (?,?)').run(derivedId, activeId);
    db.prepare(`INSERT INTO channel_records(channel_id,record_json,visibility_json,owner_human_id)
      VALUES (?,?,?,?)`).run(
      'retained-channel',
      JSON.stringify({
        id: 'retained-channel',
        type: 'group',
        name: 'Retained Channel',
        members: [],
        createdAt: 'before',
        updatedAt: 'before',
      }),
      '{"kind":"public"}',
      'suspended',
    );
    db.prepare('INSERT INTO channel_admins(channel_id,human_id) VALUES (?,?)').run(
      'retained-channel',
      'suspended',
    );
  });
  const tables = [
    'paired_devices',
    'relationship_device_grants',
    'humans',
    'team_mode_suspensions',
    'deleted_humans',
    'channel_records',
    'channel_admins',
    'host_roles',
    'usage_daily',
    'usage_receipts',
  ];
  const before = database.read((db) =>
    Object.fromEntries(
      tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
    ),
  );
  previous.close();

  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  expect(owner.mode).toBe('ready');
  expect(owner.generation).toBe(150);
  const current = attachOperationalModule(owner, 'migration-fixture');
  expect(
    current.read((db) =>
      Object.fromEntries(
        tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
      ),
    ),
  ).toEqual(before);
  expect(
    current.read(
      (db) =>
        db.prepare('SELECT count(*) AS count FROM relationship_client_enrollments').get()?.count,
    ),
  ).toBe(0);
  expect(
    current.read((db) =>
      db.prepare('SELECT account_origin FROM host_relationships ORDER BY relationship_id').all(),
    ),
  ).toEqual([{ account_origin: null }, { account_origin: null }]);
  const pairing = createDevicePairing({ database: current, hostName: 'Existing Host' });
  expect(pairing.admit(`Device ${independentId}.${secret}`).ok).toBe(true);
  const derived = pairing.admit(`Device ${derivedId}.${secret}`);
  expect(derived.ok, derived.ok ? 'derived grant admitted' : derived.code).toBe(true);
  const relationships = createHostRelationships({ database: current, pairing });
  expect(relationships.read(activeId)).toMatchObject({
    state: 'active',
    peer: { id: 'active-peer', publicKey: key, routes: ['https://existing.ts.net'] },
    automaticEnrollmentSuppressed: false,
  });
  expect(relationships.read(retiredId)).toMatchObject({
    state: 'disconnected',
    peerRevocationPending: true,
    revocationAttempts: 3,
    revocationRetryAt: 12345,
    automaticEnrollmentSuppressed: true,
  });
});
