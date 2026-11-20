import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserCarrier } from '../src/client/remote-hosts.js';

afterEach(() => vi.unstubAllGlobals());

describe('Team sign-in from the desktop Client', () => {
  it('asks its own Host to post member sign-in and password changes to the Team Host', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        contentType: 'application/json',
        body: btoa('{"credential":"member.secret"}'),
      }),
      text: async () => '{}',
    }));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const carrier = browserCarrier({ teamViaHost: true });
    const signIn = await carrier.request(
      'https://team.example.ts.net/botharness-device/team/device-sign-in',
      { method: 'POST', body: '{"username":"alice"}', signal },
    );
    await carrier.request('https://team.example.ts.net/botharness-device/team/device-password', {
      method: 'POST',
      headers: { authorization: 'Device member.secret' },
      body: '{}',
      signal,
    });
    await carrier.request('https://team.example.ts.net/botharness-device/channel', {
      method: 'GET',
      signal,
    });
    expect(await signIn.text()).toBe('{"credential":"member.secret"}');
    expect(
      fetch.mock.calls.map(([url, init]) => [url, JSON.parse(String(init.body ?? 'null'))]),
    ).toEqual([
      [
        './api/botharness/remote-custody',
        {
          action: 'team',
          route: 'https://team.example.ts.net',
          path: 'device-sign-in',
          body: '{"username":"alice"}',
        },
      ],
      [
        './api/botharness/remote-custody',
        {
          action: 'team',
          route: 'https://team.example.ts.net',
          path: 'device-password',
          headers: { authorization: 'Device member.secret' },
          body: '{}',
        },
      ],
      ['https://team.example.ts.net/botharness-device/channel', null],
    ]);
  });

  it('keeps posting directly where its own Host cannot relay', async () => {
    const fetch = vi.fn(async () => ({ status: 200, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetch);
    await browserCarrier().request(
      'https://team.example.ts.net/botharness-device/team/device-sign-in',
      {
        method: 'POST',
        body: '{}',
        signal: new AbortController().signal,
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://team.example.ts.net/botharness-device/team/device-sign-in',
      expect.objectContaining({ mode: 'cors', credentials: 'omit' }),
    );
  });
});
