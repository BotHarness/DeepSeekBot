import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { admin, createMarket, fakeRepository, post, submit } from './market-harness.js';

type Market = ReturnType<typeof createMarket>;

const HOST_A = 'hostA_aaaaaaaaaaaaaaaaaaaaaaaa';
const HOST_B = 'hostB_bbbbbbbbbbbbbbbbbbbbbbbb';

function receipt(market: Market, id: string, hostId: unknown, ip?: string) {
  return post(market, `/v1/bots/${encodeURIComponent(id)}/installs`, { hostId }, ip);
}

async function listed(market: Market): Promise<string> {
  const repository = fakeRepository();
  market.publish(repository);
  const response = await submit(market, repository.htmlUrl);
  return ((await response.json()) as { bot: { id: string } }).bot.id;
}

async function installs(market: Market, id: string): Promise<{ list: number; detail: number }> {
  const page = (await (await market.request('/v1/bots?include=uploads')).json()) as {
    bots: { id: string; installs: number }[];
  };
  const detail = (await (await market.request(`/v1/bots/${id}`)).json()) as {
    bot: { installs: number };
  };
  return { list: page.bots.find((bot) => bot.id === id)!.installs, detail: detail.bot.installs };
}

async function code(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { error?: { code: string } }).error?.code;
}

describe('Install Receipts', () => {
  it('starts at zero and counts each Host once per entry', async () => {
    const market = createMarket();
    const id = await listed(market);
    expect(await installs(market, id)).toEqual({ list: 0, detail: 0 });

    const first = await receipt(market, id, HOST_A);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ counted: true, installs: 1 });
    const again = await receipt(market, id, HOST_A, '198.51.100.7');
    expect(await again.json()).toEqual({ counted: false, installs: 1 });
    expect(await (await receipt(market, id, HOST_B)).json()).toEqual({
      counted: true,
      installs: 2,
    });

    expect(await installs(market, id)).toEqual({ list: 2, detail: 2 });
  });

  it('stores only a hash of the marketplace Host identifier', async () => {
    const market = createMarket();
    const id = await listed(market);
    await receipt(market, id, HOST_A);

    const rows = market.sqlite.prepare('SELECT bot_id, host_hash FROM install_receipts').all();
    expect(rows).toEqual([
      { bot_id: id, host_hash: createHash('sha256').update(HOST_A).digest('hex') },
    ]);
  });

  it('counts Uploaded Bots the same way', async () => {
    const market = createMarket();
    const token = 'token-alice';
    const send = (method: string, path: string, body?: unknown) =>
      market.request(path, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    await send('PUT', '/v1/me', { displayName: 'Alice', acceptTerms: true });
    const soul = new TextEncoder().encode('# Helper');
    const begun = (await (
      await send('POST', '/v1/uploads', {
        displayName: 'Helper',
        files: [
          {
            path: 'SOUL.md',
            size: soul.byteLength,
            sha256: createHash('sha256').update(soul).digest('hex'),
          },
        ],
      })
    ).json()) as { upload: { id: string; botId: string } };
    await market.request(`/v1/uploads/${begun.upload.id}/files/SOUL.md`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: soul,
    });
    expect((await send('POST', `/v1/uploads/${begun.upload.id}/publish`)).status).toBe(201);

    expect(await (await receipt(market, begun.upload.botId, HOST_A)).json()).toEqual({
      counted: true,
      installs: 1,
    });
    expect(await installs(market, begun.upload.botId)).toEqual({ list: 1, detail: 1 });
  });

  it('refuses a malformed Host identifier, an unknown entry and a blocked entry', async () => {
    const market = createMarket();
    const id = await listed(market);

    for (const hostId of [undefined, 42, 'short', 'has spaces in it but long enough']) {
      const refused = await receipt(market, id, hostId);
      expect(refused.status).toBe(400);
      expect(await code(refused)).toBe('invalid-receipt');
    }
    expect(await code(await receipt(market, 'R_missing', HOST_A))).toBe('bot-not-found');

    expect((await admin(market, { id, action: 'block' })).status).toBe(200);
    const blocked = await receipt(market, id, HOST_A);
    expect(blocked.status).toBe(404);
    expect(market.sqlite.prepare('SELECT count(*) AS n FROM install_receipts').get()).toEqual({
      n: 0,
    });
  });

  it('rate limits receipts per source address', async () => {
    const market = createMarket({ limits: { installPerHour: 2 } });
    const id = await listed(market);

    expect((await receipt(market, id, HOST_A)).status).toBe(202);
    expect((await receipt(market, id, HOST_B)).status).toBe(202);
    const limited = await receipt(market, id, 'hostC_cccccccccccccccccccccccc');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('3600');
    expect((await receipt(market, id, 'hostC_cccccccccccccccccccccccc', '192.0.2.9')).status).toBe(
      202,
    );
  });

  it('accepts only POST and is unavailable without request protection', async () => {
    const market = createMarket();
    const id = await listed(market);
    expect((await market.request(`/v1/bots/${id}/installs`)).status).toBe(405);

    const unprotected = createMarket({ env: { ALTCHA_HMAC_KEY: '' } });
    const refused = await receipt(unprotected, 'R_any', HOST_A);
    expect(refused.status).toBe(503);
    expect(await code(refused)).toBe('receipts-unavailable');
  });
});
