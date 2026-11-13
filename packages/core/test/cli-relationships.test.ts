import { expect, it, vi } from 'vitest';
import { runRelationshipCommand } from '../src/bots/cli-relationships.js';

const id = 'a'.repeat(32);
const publicKey = 'ab'.repeat(32);
const response = { relationships: [] };
const fixture = () => {
  const http = vi.fn(async () => ({ bytes: new TextEncoder().encode(JSON.stringify(response)) }));
  return { http, connect: async () => ({ http }) };
};
it('lists relationships through the authenticated owning Host', async () => {
  const { http, connect } = fixture();
  expect(await runRelationshipCommand(['list'], {}, connect)).toEqual(response);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', undefined);
});
it('requires exact identity and explicit reciprocal approval before contacting the Host', async () => {
  const { http, connect } = fixture();
  await expect(runRelationshipCommand(['approve', id, publicKey], {}, connect)).rejects.toThrow(
    'confirm',
  );
  expect(http).not.toHaveBeenCalled();
  await runRelationshipCommand(['approve', id, publicKey], { confirm: true }, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', {
    action: 'approve',
    id,
    confirmedKey: publicKey,
    confirm: true,
  });
});
it('keeps destructive disconnect confirmation and private enrollment output mandatory', async () => {
  const { http, connect } = fixture();
  await expect(runRelationshipCommand(['disconnect', id], {}, connect)).rejects.toThrow('confirm');
  await expect(runRelationshipCommand(['enroll', id], {}, connect)).rejects.toThrow('--out');
  expect(http).not.toHaveBeenCalled();
  await runRelationshipCommand(['disconnect', id], { confirm: true }, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', {
    action: 'disconnect',
    id,
    confirm: true,
  });
});

it('rejects invalid Client names before connecting or creating credentials', async () => {
  const { http, connect } = fixture();
  for (const name of ['', ' ', 'x'.repeat(61)]) {
    await expect(
      runRelationshipCommand(
        ['enroll', id],
        { out: '/new-private-grant.json', 'device-name': name },
        connect,
      ),
    ).rejects.toThrow('--device-name');
  }
  expect(http).not.toHaveBeenCalled();
});
