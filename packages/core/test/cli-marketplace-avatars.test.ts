import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { avatarDataUrl, avatarFixtures } from '../../market/test/avatar-fixtures.js';
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
