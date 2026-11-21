import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { avatarDataUrl, avatarFixtures } from '../../market/test/avatar-fixtures.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createChallenge, verifySolution } from '../src/marketplace/altcha.js';
import { createMarket, TEST_ADMIN_TOKEN } from '../../market/test/market-harness.js';
import { host, invoke, ok } from './cli-host-admin-fixture.js';

it('browses and publishes Marketplace Avatars through the live Host and surfaces member refusals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'market-avatar-cli-'));
  const file = join(dir, 'avatar.webp');
  writeFileSync(file, Buffer.from(avatarFixtures.webp, 'base64'));
  let isOwner = true;
  const live = await host((method) =>
    method === 'marketplaceAvatarPublish' && !isOwner
      ? {
          ok: false,
          error: { code: 'permission-required', message: 'Only the Host owner may publish' },
        }
      : ok({ method }),
  );
  const publish = [
    'marketplace-avatar-publish',
    '--file',
    file,
    '--name',
    'Otter',
    '--description',
    'River',
    '--avatar-tag',
    ' Blue ',
    '--avatar-tag',
    'blue',
    '--operation-key',
    'otter',
    '--confirm',
  ];
  expect((await invoke(['marketplace-avatar-list', '--cursor', 'page2'], live.url)).code).toBe(0);
  expect((await invoke(['marketplace-avatar-detail', 'avatar-id'], live.url)).code).toBe(0);
  expect((await invoke(publish, live.url)).code).toBe(0);
  expect(live.calls).toEqual([
    { method: 'marketplaceAvatarList', args: { cursor: 'page2' } },
    { method: 'marketplaceAvatarDetail', args: { id: 'avatar-id' } },
    {
      method: 'marketplaceAvatarPublish',
      args: {
        image: avatarDataUrl('webp'),
        name: 'Otter',
        description: 'River',
        tags: ['Blue'],
        requestKey: 'otter',
        confirm: true,
      },
    },
  ]);
  isOwner = false;
  expect((await invoke(publish, live.url)).json.error.code).toBe('permission-required');
  writeFileSync(file, 'no image');
  const refused = await invoke(publish, live.url);
  expect(refused.json.error).toMatchObject({
    code: 'unprocessed-image',
    message: expect.stringContaining('256'),
  });
  expect(live.calls).toHaveLength(4);
});

it('applies through the same live Host method, requires a target, and preserves a refusal', async () => {
  let allowed = true;
  const live = await host((method) =>
    method === 'marketplaceAvatarApplyCandidates'
      ? ok({ bots: [{ slug: 'otter' }] })
      : allowed
        ? ok({ applied: true })
        : { ok: false, error: { code: 'bot-not-found', message: 'Bot unavailable' } },
  );
  const apply = [
    'marketplace-avatar-apply',
    'avatar-id',
    '--bot',
    'otter',
    '--operation-key',
    'apply-otter',
  ];
  expect((await invoke(['marketplace-avatar-apply-candidates'], live.url)).json).toMatchObject({
    bots: [{ slug: 'otter' }],
  });
  expect((await invoke(apply, live.url)).code).toBe(0);
  expect(live.calls).toEqual([
    { method: 'marketplaceAvatarApplyCandidates', args: {} },
    {
      method: 'marketplaceAvatarApply',
      args: { id: 'avatar-id', bot: 'otter', operationKey: 'apply-otter' },
    },
  ]);
  expect((await invoke(['marketplace-avatar-apply', 'avatar-id'], live.url)).json.error.code).toBe(
    'usage',
  );
  allowed = false;
  expect((await invoke(apply, live.url)).json.error.code).toBe('bot-not-found');
});

it('publishes a compliant stored Avatar and refuses a missing or unprocessed source', async () => {
  let source: ReturnType<typeof ok> | { ok: false; error: { code: string; message: string } } = ok({
    image: avatarDataUrl('png'),
  });
  const live = await host((method) =>
    method === 'marketplaceAvatarSource' ? source : ok({ id: 'published' }),
  );
  const publish = [
    'marketplace-avatar-publish',
    '--from-bot',
    'otter',
    '--name',
    'Otter',
    '--operation-key',
    'otter',
    '--confirm',
  ];
  expect((await invoke(publish, live.url)).json).toEqual({ id: 'published' });
  expect(live.calls).toEqual([
    { method: 'marketplaceAvatarSource', args: { bot: 'otter' } },
    {
      method: 'marketplaceAvatarPublish',
      args: {
        image: avatarDataUrl('png'),
        name: 'Otter',
        description: '',
        tags: [],
        requestKey: 'otter',
        confirm: true,
      },
    },
  ]);
  expect((await invoke([...publish, '--file', 'unused.png'], live.url)).json.error.code).toBe(
    'usage',
  );
  source = ok({ image: 'data:image/png;base64,aW52YWxpZA==' });
  expect((await invoke(publish, live.url)).json.error).toMatchObject({
    code: 'unprocessed-image',
    message: expect.stringContaining('Publish it from Web'),
  });
  expect(live.calls.slice(2)).toEqual([
    { method: 'marketplaceAvatarSource', args: { bot: 'otter' } },
  ]);
  for (const code of ['no-stored-avatar', 'permission-required']) {
    source = { ok: false, error: { code, message: code } };
    expect((await invoke(publish, live.url)).json.error.code).toBe(code);
    expect(live.calls.at(-1)?.method).toBe('marketplaceAvatarSource');
  }
});

it('solves the Host challenge before reporting an Avatar and passes through refusals', async () => {
  const key = 'challenge-key';
  let listed = true;
  const live = await host(async (method, args) => {
    if (method === 'marketplaceChallenge')
      return ok(await createChallenge({ key, tier: 'default', now: new Date(), number: 42 }));
    expect(method).toBe('marketplaceAvatarReport');
    expect(
      (await verifySolution({ key, payload: String(args['altcha']), now: new Date() })).ok,
    ).toBe(true);
    return listed
      ? ok({ received: true })
      : { ok: false, error: { code: 'avatar-not-found', message: 'Avatar unavailable' } };
  });
  const report = ['marketplace-avatar-report', 'avatar-id'];
  expect((await invoke([...report, '--reason', '  spam  '], live.url)).json).toEqual({
    received: true,
  });
  expect(live.calls[1]?.args).toMatchObject({ id: 'avatar-id', reason: 'spam' });
  listed = false;
  expect((await invoke(report, live.url)).json.error.code).toBe('avatar-not-found');
  expect(live.calls[3]?.args).not.toHaveProperty('reason');
});

it('blocks and restores through the admin Worker endpoint without a Host', async () => {
  const market = createMarket();
  const headers = { authorization: 'Bearer token-alice', 'content-type': 'application/json' };
  await market.request('/v1/me', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ displayName: 'Alice', acceptTerms: true }),
  });
  const published = await market.request('/v1/avatars', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image: avatarDataUrl('png'),
      name: 'Otter',
      requestKey: 'key',
      confirm: true,
    }),
  });
  const { avatar } = await published.json();
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) =>
      market.request(String(input).replace('https://market.test', ''), init),
    );
  try {
    const invokeAdmin = async (action: string, token = TEST_ADMIN_TOKEN) => {
      const stdout: string[] = [];
      const code = await runBotCreateCli(['marketplace-blocklist', action, 'avatar', avatar.id], {
        env: { MARKETPLACE_ADMIN_TOKEN: token, MARKETPLACE_ADMIN_URL: 'https://market.test' },
        stdout: (text) => stdout.push(text),
        stderr: (text) => expect(text).not.toContain(token),
      });
      expect(stdout.join('')).not.toContain(token);
      return { code, json: JSON.parse(stdout.join('')) };
    };
    expect((await invokeAdmin('block', 'wrong-token')).json.error.code).toBe('unauthorized');
    expect(await invokeAdmin('block')).toMatchObject({
      code: 0,
      json: { avatar: { visibility: 'blocked' } },
    });
    expect((await market.request(`/v1/avatars/${avatar.id}`)).status).toBe(404);
    expect(await invokeAdmin('restore')).toMatchObject({
      code: 0,
      json: { avatar: { visibility: 'listed' } },
    });
    expect((await market.request(`/v1/avatars/${avatar.id}`)).status).toBe(200);
  } finally {
    spy.mockRestore();
  }
});
