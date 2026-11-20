import { afterEach, expect, it, vi } from 'vitest';
import { browserCarrier } from '../src/client/remote-hosts.js';
import { BROWSER_ADMISSION_PROTOCOL } from '../../../deploy/private-relay/admission.mjs';

afterEach(() => vi.unstubAllGlobals());

it('carries private admission only in the offered protocols for an exact secure private channel URL', () => {
  const opened: { url: string; protocols?: string[] }[] = [];
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor(url: string, protocols?: string[]) {
        opened.push({ url, ...(protocols ? { protocols } : {}) });
      }
      send() {}
      close() {}
    },
  );
  const token = 'ab'.repeat(32);
  const headers = { 'X-BotHarness-Admission': token, Authorization: `Bearer ${token}` };
  const events = { open: vi.fn(), message: vi.fn(), closed: vi.fn() };
  const carrier = browserCarrier();
  carrier.openSocket('wss://private.example/botharness-device/channel', events, headers);
  expect(opened).toEqual([
    {
      url: 'wss://private.example/botharness-device/channel',
      protocols: [BROWSER_ADMISSION_PROTOCOL, `botharness-admission.${token}`],
    },
  ]);
  expect(opened[0]!.url).not.toContain(token);
  for (const url of [
    'ws://private.example/botharness-device/channel',
    'wss://host.tailnet.ts.net/botharness-device/channel',
    'wss://private.example/botharness-device/channel?redirect=1',
  ])
    expect(() => carrier.openSocket(url, events, headers)).toThrow(
      'private-admission-route-invalid',
    );
  expect(() =>
    carrier.openSocket('wss://private.example/botharness-device/channel', events, {
      'X-BotHarness-Admission': 'bad',
    }),
  ).toThrow('private-admission-invalid');
  expect(opened).toHaveLength(1);
  carrier.openSocket('ws://192.168.1.20:3080/botharness-device/channel', events);
  expect(opened[1]).toEqual({ url: 'ws://192.168.1.20:3080/botharness-device/channel' });
});
