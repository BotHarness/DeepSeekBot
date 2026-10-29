import { describe, expect, it } from 'vitest';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { tobPull } from '../src/ui/design/tokens';
import { tobModeHref, tobModeHostId } from '../src/ui/shell/tob-mode-model';
import {
  tobPullArmed,
  tobPullCanStart,
  tobPullOutcome,
  tobPullProgress,
} from '../src/ui/shell/tob-pull-model';

const computers = [
  { hostId: 'a', tob: 'tob-a' },
  { hostId: 'b', tob: 'tob-b' },
];
const href = tobModeHref('a', computers);

describe('Chats pull opens Tob only on a qualified release', () => {
  it('shows bounded progress and arms at the distance threshold', () => {
    expect(tobPullProgress(-5)).toBe(0);
    expect(tobPullProgress(tobPull.commit / 2)).toBe(0.5);
    expect(tobPullProgress(tobPull.commit * 2)).toBe(1);
    expect(tobPullArmed(tobPull.commit - 1)).toBe(false);
    expect(tobPullArmed(tobPull.commit)).toBe(true);
  });
  it('opens on release at the threshold without a hold timer', () => {
    expect(tobPullOutcome({ distance: tobPull.commit, href, hostId: 'a' })).toBe('tob');
  });
  it('does nothing below the threshold, including after retreating from it', () => {
    for (const distance of [0, tobPull.commit - 1])
      expect(tobPullOutcome({ distance, href, hostId: 'a' })).toBe('none');
  });
  it('requires distance, so velocity alone cannot trigger entry', () => {
    expect(tobPullOutcome({ distance: tobPull.start, href, hostId: 'a' })).toBe('none');
  });
  it('refreshes when a computer has not named its Tob yet', () => {
    expect(tobPullOutcome({ distance: tobPull.commit, href: undefined, hostId: 'a' })).toBe(
      'refresh',
    );
  });
  it('has the refresh fallback when no computer exists', () => {
    expect(tobPullOutcome({ distance: tobPull.commit, href: undefined, hostId: undefined })).toBe(
      'refresh',
    );
  });
  it('never opens a stale href from a different computer', () => {
    expect(tobPullOutcome({ distance: tobPull.commit, href, hostId: 'b' })).toBe('refresh');
  });
  it('search and other inactive states cannot open or refresh', () => {
    expect(tobPullOutcome({ distance: tobPull.commit, href, hostId: 'a', enabled: false })).toBe(
      'none',
    );
    expect(tobPullCanStart(0, false)).toBe(false);
  });
  it('starts only at the top, not from the middle of the list', () => {
    expect(tobPullCanStart(0, true)).toBe(true);
    expect(tobPullCanStart(-10, true)).toBe(true);
    expect(tobPullCanStart(tobPull.topTolerance + 1, true)).toBe(false);
  });
  it.each(['all', 'cloud:workspace'])('opens the recent computer Tob under %s', (filter) => {
    const hostId = tobModeHostId(filter, computers, ['b', 'a'], 'a');
    expect(
      tobPullOutcome({ distance: tobPull.commit, hostId, href: tobModeHref(hostId, computers) }),
    ).toBe('tob');
    expect(hostId).toBe('b');
  });
  it('the explicit computer filter wins over recent history', () => {
    const hostId = tobModeHostId(computerEnvironmentKey('a'), computers, ['b'], 'b');
    expect(tobModeHref(hostId, computers)?.params.slug).toBe('tob-a');
  });
});
