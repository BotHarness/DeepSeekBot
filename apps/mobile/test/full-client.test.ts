import { describe, expect, it } from 'vitest';

import {
  fullClientLocator,
  privateInputLocator,
} from '../../../packages/core/src/credentials/web-locator';
import {
  fullClientParams,
  fullClientSource,
  fullClientTarget,
  staysInFullClient,
} from '../src/host/full-client';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const CREDENTIAL = 'device-id-0123456789.secret-secret-secret-secret-secret';

describe('full client in the app', () => {
  it('loads the gateway web directory with the device credential as a header, never in the URL', () => {
    const source = fullClientSource(`${ROUTE}/`, CREDENTIAL, { kind: 'home' });
    expect(source.uri).toBe(`${ROUTE}/botharness-device/web/#botharness-open=home`);
    expect(source.uri).not.toContain('secret');
    expect(source.uri).not.toContain('token');
    expect(source.headers).toEqual({ Authorization: `Device ${CREDENTIAL}` });
  });

  it('lands on the target the Web Client can locate', () => {
    const dm = new URL(fullClientSource(ROUTE, CREDENTIAL, { kind: 'dm', slug: 'ada' }).uri);
    expect(fullClientLocator(dm.hash)).toEqual({ kind: 'dm', slug: 'ada' });
    const card = {
      kind: 'private-input',
      channelId: 'dm-ada',
      messageId: crypto.randomUUID(),
    } as const;
    const request = new URL(fullClientSource(ROUTE, CREDENTIAL, card).uri);
    expect(privateInputLocator(request.hash)).toEqual({
      channelId: card.channelId,
      messageId: card.messageId,
    });
    const channel = new URL(
      fullClientSource(ROUTE, CREDENTIAL, { kind: 'channel', channelId: 'team' }).uri,
    );
    expect(fullClientLocator(channel.hash)).toEqual({ kind: 'channel', channelId: 'team' });
    for (const target of [
      { kind: 'home' } as const,
      { kind: 'dm', slug: 'ada' } as const,
      { kind: 'channel', channelId: 'team' } as const,
      card,
    ])
      expect(fullClientTarget(fullClientParams(target))).toEqual(target);
    expect(fullClientTarget({ target: 'dm' })).toEqual({ kind: 'home' });
  });

  it('keeps navigation on the Host web directory and sends everything else out of the app', () => {
    expect(staysInFullClient(ROUTE, `${ROUTE}/botharness-device/web/#botharness-open=home`)).toBe(
      true,
    );
    expect(staysInFullClient(ROUTE, `${ROUTE}/botharness-device/web/assets/a.js`)).toBe(true);
    expect(staysInFullClient(ROUTE, `${ROUTE}/`)).toBe(false);
    expect(staysInFullClient(ROUTE, `${ROUTE}.evil.example/botharness-device/web/`)).toBe(false);
    expect(staysInFullClient(ROUTE, 'https://github.com/BotHarness')).toBe(false);
  });
});
