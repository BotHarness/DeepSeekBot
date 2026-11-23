import { describe, expect, it, vi } from 'vitest';

import { createCloudflareApi, GATEWAY_PATH } from '../src/cloudflare.js';

describe('Cloudflare API client', () => {
  it('records bounded upstream codes without credentials or response text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const api = createCloudflareApi({
        token: 'private-token',
        accountId: 'private-account',
        zones: [{ name: 'deepseekbot.dev', id: 'private-zone' }],
        fetcher: async () =>
          Response.json(
            {
              success: false,
              errors: [
                null,
                'private-text',
                { code: 'private-code' },
                { code: 1004, message: 'private-hostname' },
                ...Array.from({ length: 20 }, () => ({ code: 10000 })),
              ],
            },
            { status: 403 },
          ),
      });
      await expect(
        api.pointHostname('deepseekbot.dev', 'private-hostname', 'private-tunnel'),
      ).rejects.toMatchObject({
        status: 403,
      });
      expect(warn.mock.calls).toEqual([
        [
          JSON.stringify({
            event: 'connect-upstream-error',
            method: 'POST',
            resource: 'dns',
            status: 403,
            codes: [1004, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
          }),
        ],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    { stage: 'connections', path: '/accounts/acct/cfd_tunnel/target/connections' },
    { stage: 'tunnel', path: '/accounts/acct/cfd_tunnel/target' },
    { stage: 'dns', path: '/zones/zone/dns_records/target' },
  ])(
    'preserves a $stage deletion failure and permits retry for the same resource',
    async ({ stage, path }) => {
      let upstreamStatus = 503;
      const requests: string[] = [];
      const api = createCloudflareApi({
        token: 'cf-token',
        accountId: 'acct',
        zones: [{ name: 'deepseekbot.dev', id: 'zone' }],
        fetcher: async (input, init) => {
          const requestPath = new URL(String(input)).pathname.replace('/client/v4', '');
          requests.push(`${init?.method} ${requestPath}`);
          const status = requestPath === path ? upstreamStatus : 200;
          return Response.json({ success: status === 200, result: null }, { status });
        },
      });
      const remove = () =>
        stage === 'dns'
          ? api.deleteRecord('deepseekbot.dev', 'target')
          : api.deleteTunnel('target');
      await expect(remove()).rejects.toMatchObject({ status: 503 });
      const expectedRequestsUntilFailure =
        stage === 'dns'
          ? ['DELETE /zones/zone/dns_records/target']
          : stage === 'connections'
            ? ['DELETE /accounts/acct/cfd_tunnel/target/connections']
            : [
                'DELETE /accounts/acct/cfd_tunnel/target/connections',
                'DELETE /accounts/acct/cfd_tunnel/target',
              ];
      expect(requests).toEqual(expectedRequestsUntilFailure);

      upstreamStatus = 200;
      requests.length = 0;
      await expect(remove()).resolves.toBeUndefined();
      expect(requests).toEqual(
        stage === 'dns'
          ? ['DELETE /zones/zone/dns_records/target']
          : [
              'DELETE /accounts/acct/cfd_tunnel/target/connections',
              'DELETE /accounts/acct/cfd_tunnel/target',
            ],
      );

      upstreamStatus = 404;
      requests.length = 0;
      await expect(remove()).resolves.toBeUndefined();
      expect(requests).toEqual(expectedRequestsUntilFailure);
    },
  );

  it('lists the tunnels in pages and reports when it stopped early', async () => {
    const urls: string[] = [];
    const pages = { total: 2 };
    const api = createCloudflareApi({
      token: 'cf-token',
      accountId: 'acct',
      zones: [{ name: 'deepseekbot.dev', id: 'zone' }],
      fetcher: async (input) => {
        const url = new URL(String(input));
        urls.push(`${url.pathname}${url.search}`);
        const page = Number(url.searchParams.get('page'));
        return Response.json({
          success: true,
          result: [
            {
              id: `t${page}`,
              status: page === 1 ? 'healthy' : 'down',
              conns_inactive_at: page === 1 ? null : '2026-10-20T12:00:00Z',
            },
          ],
          result_info: { total_pages: pages.total },
        });
      },
    });
    expect(await api.listTunnels()).toEqual({
      states: new Map([
        ['t1', { status: 'healthy' }],
        ['t2', { status: 'down', inactiveSince: '2026-10-20T12:00:00Z' }],
      ]),
      complete: true,
    });
    expect(urls[0]).toBe(
      '/client/v4/accounts/acct/cfd_tunnel?is_deleted=false&per_page=1000&page=1',
    );
    urls.length = 0;
    pages.total = 30;
    expect((await api.listTunnels()).complete).toBe(false);
    expect(urls).toHaveLength(3);
  });

  it('limits the remote ingress to the device gateway and authenticates with the token', async () => {
    const requests: { method: string; url: string; auth: string | null; body: unknown }[] = [];
    const api = createCloudflareApi({
      token: 'cf-token',
      accountId: 'acct',
      zones: [{ name: 'deepseekbot.dev', id: 'zone' }],
      fetcher: async (input, init) => {
        requests.push({
          method: init?.method ?? 'GET',
          url: String(input),
          auth: new Headers(init?.headers).get('authorization'),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (init?.method === 'PUT' && String(input).includes('dns_records'))
          return Response.json({ success: false, errors: [] }, { status: 404 });
        return Response.json({ success: true, result: { id: 'new-record' } });
      },
    });
    await api.configureIngress('tid', 'hx.deepseekbot.dev', 41001);
    expect(requests[0]).toEqual({
      method: 'PUT',
      url: 'https://api.cloudflare.com/client/v4/accounts/acct/cfd_tunnel/tid/configurations',
      auth: 'Bearer cf-token',
      body: {
        config: {
          ingress: [
            {
              hostname: 'hx.deepseekbot.dev',
              path: GATEWAY_PATH,
              service: 'http://127.0.0.1:41001',
            },
            { service: 'http_status:404' },
          ],
        },
      },
    });
    expect(new RegExp(GATEWAY_PATH).test('/botharness-device/pair')).toBe(true);
    expect(new RegExp(GATEWAY_PATH).test('/api/botharness/devices')).toBe(false);
    expect(await api.pointHostname('deepseekbot.dev', 'hx.deepseekbot.dev', 'tid', 'gone')).toBe(
      'new-record',
    );
    expect(requests.slice(1).map((request) => `${request.method} ${request.url}`)).toEqual([
      'PUT https://api.cloudflare.com/client/v4/zones/zone/dns_records/gone',
      'POST https://api.cloudflare.com/client/v4/zones/zone/dns_records',
    ]);
    expect(requests[2]?.body).toEqual({
      type: 'CNAME',
      name: 'hx.deepseekbot.dev',
      content: 'tid.cfargotunnel.com',
      proxied: true,
    });
  });
});
