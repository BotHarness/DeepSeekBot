import { describe, expect, it } from 'vitest';
import {
  BUNDLE_ID,
  missingTools,
  parseArgs,
  pickSimulator,
  pushPayload,
  renamePairingLink,
} from '../e2e-mobile-sim.mjs';

describe('iOS Simulator phone journey', () => {
  it('reads its flags', () => {
    expect(parseArgs([])).toEqual({
      app: undefined,
      keep: false,
      approval: true,
      device: 'iPhone 16',
    });
    expect(parseArgs(['--keep', '--no-approval', '--device', 'iPhone 16e'])).toMatchObject({
      keep: true,
      approval: false,
      device: 'iPhone 16e',
    });
    expect(() => parseArgs(['--app'])).toThrow('--app needs a value');
    expect(() => parseArgs(['--fast'])).toThrow('unknown flag --fast');
  });

  it('picks the newest available iOS runtime and the named device type', () => {
    const list = {
      runtimes: [
        {
          platform: 'iOS',
          isAvailable: true,
          version: '18.2',
          identifier: 'ios-18-2',
          name: 'iOS 18.2',
        },
        {
          platform: 'iOS',
          isAvailable: true,
          version: '18.10',
          identifier: 'ios-18-10',
          name: 'iOS 18.10',
        },
        {
          platform: 'iOS',
          isAvailable: false,
          version: '26.0',
          identifier: 'ios-26',
          name: 'iOS 26.0',
        },
        {
          platform: 'watchOS',
          isAvailable: true,
          version: '11.0',
          identifier: 'watch',
          name: 'watchOS',
        },
      ],
      devicetypes: [{ name: 'iPhone 16', identifier: 'type-16' }],
    };
    expect(pickSimulator(list, 'iPhone 16')).toEqual({
      runtime: 'ios-18-10',
      deviceType: 'type-16',
      runtimeName: 'iOS 18.10',
    });
    expect(() => pickSimulator({ runtimes: [], devicetypes: [] }, 'iPhone 16')).toThrow(
      'no available iOS Simulator runtime',
    );
  });

  it('renames the Host in a pairing link and keeps the offer', () => {
    const payload = {
      v: 1,
      host: { id: 'host-1', name: 'MacBook' },
      routes: ['http://127.0.0.1:3080'],
      offer: 'secret-offer',
    };
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    const renamed = renamePairingLink(link, 'Mac A');
    expect(renamed.hostId).toBe('host-1');
    const decoded = JSON.parse(
      Buffer.from(new URL(renamed.link).searchParams.get('p'), 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({ ...payload, host: { id: 'host-1', name: 'Mac A' } });
  });

  it('puts the push data under body, where expo-notifications reads it', () => {
    expect(
      pushPayload({
        title: 'Ada',
        body: 'Ada needs your approval',
        badge: 1,
        data: { hostId: 'h', itemId: 'approval:1', kind: 'tool-approval' },
      }),
    ).toEqual({
      'Simulator Target Bundle': BUNDLE_ID,
      aps: { alert: { title: 'Ada', body: 'Ada needs your approval' }, sound: 'default', badge: 1 },
      body: { v: 1, hostId: 'h', itemId: 'approval:1', kind: 'tool-approval' },
    });
    expect(pushPayload({ badge: 0, data: { hostId: 'h' } })).toEqual({
      'Simulator Target Bundle': BUNDLE_ID,
      aps: { badge: 0 },
      body: { v: 1, hostId: 'h' },
    });
  });

  it('names each missing tool with how to install it', () => {
    expect(missingTools({ which: () => true, javaHome: '/jdk' })).toEqual([]);
    expect(missingTools({ which: () => false, javaHome: undefined })).toHaveLength(3);
  });
});
