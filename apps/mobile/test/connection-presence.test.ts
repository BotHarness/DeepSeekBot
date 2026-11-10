import { describe, expect, it } from 'vitest';

import {
  CONNECTION_OFFLINE_MS,
  CONNECTION_QUIET_MS,
  connectionPresence,
} from '../src/ui/connection-presence';

describe('connection presence', () => {
  it('stays quiet through a short drop', () => {
    expect(connectionPresence('reconnecting', false, 0)).toEqual({ offline: false });
    expect(connectionPresence('unreachable', false, CONNECTION_QUIET_MS - 1)).toEqual({
      offline: false,
    });
    expect(connectionPresence('connected', true, CONNECTION_QUIET_MS - 1)).toEqual({
      offline: false,
    });
  });

  it('shows progress once the drop lasts, and offline once a lost connection stays down', () => {
    expect(connectionPresence('connecting', false, CONNECTION_QUIET_MS)).toEqual({
      progress: 'connecting',
      offline: false,
    });
    expect(connectionPresence('unreachable', false, CONNECTION_QUIET_MS)).toEqual({
      progress: 'reconnecting',
      offline: false,
    });
    expect(connectionPresence('reconnecting', false, CONNECTION_OFFLINE_MS)).toEqual({
      offline: true,
    });
    expect(connectionPresence('connecting', false, CONNECTION_OFFLINE_MS)).toEqual({
      progress: 'connecting',
      offline: false,
    });
    expect(connectionPresence('unreachable', false, CONNECTION_OFFLINE_MS)).toEqual({
      offline: true,
    });
  });

  it('says nothing once connected again', () => {
    expect(connectionPresence('connected', false, undefined)).toEqual({ offline: false });
    expect(connectionPresence('refused', false, undefined)).toEqual({ offline: false });
  });
});
