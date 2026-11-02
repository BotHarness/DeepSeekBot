import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createLanBotMembership } from '../src/devices/bot-lan-membership.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('requires approval of the currently discovered Host key and retains revocation after restart', () => {
  const home = createTempRoot('bot-lan-membership-');
  const candidate = { hostId: 'studio', name: 'Studio', publicKey: '11'.repeat(32) };
  const open = () => {
    const database = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    return {
      database,
      membership: createLanBotMembership({
        database: attachOperationalModule(database, 'bot-lan'),
        candidate: (id) => (id === candidate.hostId ? candidate : undefined),
      }),
    };
  };
  let host = open();
  expect(host.membership.current(candidate.hostId, candidate.publicKey)).toBeUndefined();
  expect(() =>
    host.membership.admit({ hostId: candidate.hostId, publicKey: '22'.repeat(32) }),
  ).toThrow('network-identity-changed');
  const admission = host.membership.admit(candidate);
  expect(host.membership.current(candidate.hostId, candidate.publicKey)).toEqual(admission);
  expect(host.membership.current(candidate.hostId, '22'.repeat(32))).toBeUndefined();
  expect(host.membership.current('unrelated', candidate.publicKey)).toBeUndefined();
  host.database.close();
  host = open();
  expect(host.membership.current(candidate.hostId, candidate.publicKey)).toEqual(admission);
  host.membership.revoke(candidate.hostId);
  host.database.close();
  host = open();
  expect(host.membership.current(candidate.hostId, candidate.publicKey)).toBeUndefined();
  const readmitted = host.membership.admit(candidate);
  expect(readmitted.id).not.toBe(admission.id);
  host.database.close();
});
