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
