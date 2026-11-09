import { describe, expect, it } from 'vitest';

import {
  CONNECT_HOSTNAME,
  CONNECT_ZONES,
  isConnectZoneHost,
} from '../src/devices/connect-zones.js';

describe('Connect zones', () => {
  it('accepts any name in the dedicated zone and only Connect Host names in shared zones', () => {
    expect(CONNECT_ZONES[0]).toBe('deepseekbot.dev');
    expect(CONNECT_HOSTNAME.test('habcdefghijkl.deepseekbot.dev')).toBe(true);
    expect(CONNECT_HOSTNAME.test('legacy-name.deepseekbot.dev')).toBe(true);
    for (const zone of CONNECT_ZONES.slice(1)) {
      expect(CONNECT_HOSTNAME.test(`habcdefghijkl.${zone}`)).toBe(true);
      expect(CONNECT_HOSTNAME.test(`www.${zone}`)).toBe(false);
      expect(CONNECT_HOSTNAME.test(zone)).toBe(false);
    }
  });

  it('leaves the other names of a shared zone free for private routes', () => {
    expect(isConnectZoneHost('connect.botharness.ai')).toBe(false);
    expect(isConnectZoneHost('relay.tobs.app')).toBe(false);
    expect(isConnectZoneHost('h234567abcdef.tobs.app')).toBe(true);
    expect(isConnectZoneHost('anything.deepseekbot.dev')).toBe(true);
    expect(isConnectZoneHost('deepseekbot.dev')).toBe(true);
  });
});
