import { describe, expect, it } from 'vitest';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { BotHarnessTranslate } from '../src/client/locale.js';

import { memberStatus } from '../src/client/environment-member.js';

const t = ((key: string) => key) as BotHarnessTranslate;
const host: SavedHost = {
  hostId: 'team',
  hostName: 'Team',
  routes: ['https://team.example'],
  deviceId: 'grant',
  credential: `member.${'a'.repeat(43)}`,
  member: {
    humanId: 'frank',
    displayName: 'Frank',
    username: 'frank',
    fingerprint: 'a'.repeat(64),
    mustChangePassword: false,
  },
};

describe('memberStatus', () => {
  it('names why a Team Host refused this member instead of showing it offline', () => {
    expect(
      memberStatus(
        host,
        { status: 'refused', route: 'r', code: 'sign-in-required', reason: '' },
        t,
      ),
    ).toBe('environment.signInRequired');
    expect(
      memberStatus(
        host,
        { status: 'refused', route: 'r', code: 'member-suspended', reason: '' },
        t,
      ),
    ).toBe('environment.memberSuspended');
  });
  it('leaves other states and owner pairings to the usual status', () => {
    expect(memberStatus(host, { status: 'connecting', route: 'r' } as never, t)).toBeUndefined();
    const { member: _, ...owner } = host;
    expect(
      memberStatus(
        owner,
        { status: 'refused', route: 'r', code: 'sign-in-required', reason: '' },
        t,
      ),
    ).toBeUndefined();
  });
});
