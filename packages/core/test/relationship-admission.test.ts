import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import {
  createRelationshipAdmissions,
  type RelationshipCredentialProvider,
} from '../src/devices/relationship-admission.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('relationship-admission-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Local',
  });
  const relationships = createHostRelationships({
    database: attachOperationalModule(owner, 'host-relationships'),
    pairing,
  });
  const records = new Map<string, CredentialRecord>();
  const credentials: RelationshipCredentialProvider = {
    readRecord: async (key) => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key));
      if (next) records.set(key, next);
      else records.delete(key);
      return next;
    },
    deleteRecord: async (key) => {
      records.delete(key);
    },
  };
  const privateRelay = { origin: 'https://private.example', token: 'ab'.repeat(32) };
  const peer = {
    id: 'peer',
    name: 'Peer',
    publicKey: 'cd'.repeat(32),
    routes: [privateRelay.origin],
    privateRelay,
  };
  const relationship = relationships.propose({ peer, direction: 'incoming' });
  relationships.approve(relationship.id, peer.publicKey);
  relationships.activate(relationship.id, peer.publicKey);
  const admissions = createRelationshipAdmissions({
    relationships,
    credentials: () => credentials,
  });
  return { owner, relationships, records, credentials, peer, relationship, admissions };
}

it('retains only a protected relationship reference until peer acknowledgement and preserves shared route credentials', async () => {
  const test = fixture();
  const shared = credentialKey('botharness-core', 'private-tunnel');
  test.records.set(shared, { kind: 'grant', payload: { retained: true } });
  await test.admissions.remember(test.relationship.id, test.peer);
  expect(JSON.stringify(test.relationships.list())).not.toContain(test.peer.privateRelay.token);
  expect(await test.admissions.read(test.relationship.id)).toEqual(test.peer.privateRelay);
  await expect(
    test.admissions.remember(test.relationship.id, { ...test.peer, publicKey: 'ef'.repeat(32) }),
  ).rejects.toThrow('relationship-identity-mismatch');
  test.relationships.disconnect(test.relationship.id);
  await expect(test.admissions.forget(test.relationship.id)).rejects.toThrow(
    'relationship-revocation-pending',
  );
  expect(await test.admissions.read(test.relationship.id)).toEqual(test.peer.privateRelay);
  test.relationships.acknowledgeDisconnect(test.relationship.id, test.peer.publicKey);
  await test.admissions.forget(test.relationship.id);
  expect([...test.records.keys()]).toEqual([shared]);
});

it.each([true, false])(
  'disconnect wins a delayed protected update (peer pending: %s)',
  async (pending) => {
    const test = fixture();
    await test.admissions.remember(test.relationship.id, test.peer);
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const blocked = new Promise<void>((done) => {
      release = done;
    });
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const original = test.credentials.modifyRecord;
    vi.spyOn(test.credentials, 'modifyRecord').mockImplementationOnce(async (key, mutate) => {
      const next = await mutate(test.records.get(key));
      entered!();
      await blocked;
      if (next) test.records.set(key, next);
      else test.records.delete(key);
      return next;
    });
    const late = test.admissions.remember(test.relationship.id, {
      ...test.peer,
      privateRelay: { ...test.peer.privateRelay, token: 'ff'.repeat(32) },
    });
    const refused = expect(late).rejects.toThrow('relationship-disconnected');
    await started;
    test.relationships.disconnect(test.relationship.id, pending ? undefined : test.peer.publicKey);
    const cleanup = pending ? undefined : test.admissions.forget(test.relationship.id);
    release!();
    await refused;
    await cleanup;
    test.credentials.modifyRecord = original;
    if (pending)
      expect(await test.admissions.read(test.relationship.id)).toEqual(test.peer.privateRelay);
    else expect(test.records.size).toBe(0);
  },
);

it('fails closed with a stable code when the protected store cannot be read', async () => {
  const test = fixture();
  await test.admissions.remember(test.relationship.id, test.peer);
  vi.spyOn(test.credentials, 'readRecord').mockRejectedValue(new Error('private storage failed'));
  await expect(test.admissions.read(test.relationship.id)).rejects.toThrow(
    'relationship-route-secret-unavailable',
  );
});

it('rolls back a late credential write after owner shutdown without reading the disposed database', async () => {
  const test = fixture();
  let open = true;
  const admissions = createRelationshipAdmissions({
    relationships: test.relationships,
    credentials: () => test.credentials,
    isOpen: () => open,
  });
  await admissions.remember(test.relationship.id, test.peer);
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const blocked = new Promise<void>((done) => {
    release = done;
  });
  const started = new Promise<void>((done) => {
    entered = done;
  });
  vi.spyOn(test.credentials, 'modifyRecord').mockImplementationOnce(async (key, mutate) => {
    const next = await mutate(test.records.get(key));
    entered!();
    await blocked;
    if (next) test.records.set(key, next);
    return next;
  });
  const late = admissions.remember(test.relationship.id, {
    ...test.peer,
    privateRelay: { ...test.peer.privateRelay, token: 'ff'.repeat(32) },
  });
  const refused = expect(late).rejects.toThrow('relationship-owner-closed');
  await started;
  open = false;
  test.owner.close();
  release!();
  await refused;
  expect(JSON.stringify([...test.records.values()])).toContain(test.peer.privateRelay.token);
  expect(JSON.stringify([...test.records.values()])).not.toContain('ff'.repeat(32));
  await expect(admissions.forget(test.relationship.id)).rejects.toThrow(
    'relationship-owner-closed',
  );
});
