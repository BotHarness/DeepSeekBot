import { describe, expect, it } from 'vitest';
import { settingsTargetIdentity } from '../src/client/environment-settings-target.js';
import { THIS_HOST } from '../src/client/remote-hosts.js';

describe('Environment settings target identity', () => {
  it('resolves a local sentinel when its actual identity arrives', () => {
    const target = { hostId: THIS_HOST, name: 'This Host', local: true };
    expect(settingsTargetIdentity(target, {})).toEqual(target);
    expect(settingsTargetIdentity(target, { id: 'actual-local-id', name: 'Studio' }))
      .toEqual({ hostId: 'actual-local-id', name: 'Studio', local: true });
    expect(target.hostId).toBe(THIS_HOST);
  });

  it('does not replace a remote settings choice when local identity arrives', () => {
    const target = { hostId: 'remote-id', name: 'Remote Studio', local: false };
    expect(settingsTargetIdentity(target, { id: 'actual-local-id', name: 'Studio' })).toBe(target);
  });
});
