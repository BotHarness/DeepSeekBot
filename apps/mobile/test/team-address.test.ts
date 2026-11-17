import { expect, it } from 'vitest';
import { fingerprintGroups, pinnedFingerprint, teamAddressRoute } from '../src/host/team-address';

it('reads a Team Host address as an HTTPS origin', () => {
  expect(teamAddressRoute(' studio.tail0000.ts.net ')).toBe('https://studio.tail0000.ts.net');
  expect(teamAddressRoute('https://studio.example:8443/path?x=1')).toBe(
    'https://studio.example:8443',
  );
  expect(teamAddressRoute('http://studio.example')).toBeUndefined();
  expect(teamAddressRoute('')).toBeUndefined();
});

it('pins a saved member fingerprint and groups fingerprints for reading aloud', () => {
  const host = {
    hostId: 'h',
    hostName: 'Studio',
    routes: [],
    deviceId: 'd',
    credential: 'c',
    member: {
      humanId: 'bob',
      displayName: 'Bob',
      username: 'bob',
      fingerprint: 'f'.repeat(64),
      mustChangePassword: false,
    },
  };
  expect(pinnedFingerprint([host], 'h')).toBe('f'.repeat(64));
  expect(pinnedFingerprint([host], 'other')).toBeUndefined();
  expect(fingerprintGroups('abcdef012345')).toBe('abcd ef01 2345');
  expect(fingerprintGroups('4c36 bf9e c059 2d')).toBe('4c36 bf9e c059 2d');
});
