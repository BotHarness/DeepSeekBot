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
it.each(['account-discover', 'account-status'])(
  'uses the same Host account owner for %s without confirmation or caller trust flags',
  async (action) => {
    const { http, connect } = fixture();
    await runRelationshipCommand([action], {}, connect);
    expect(http).toHaveBeenCalledExactlyOnceWith('/api/botharness/relationships', {
      action: action === 'account-discover' ? 'discover-account' : 'account-status',
    });
  },
);
it('requires private output for account enrollment and refuses a signed-out owner before issuing any grant', async () => {
  const http = vi.fn(async () => ({
    bytes: new TextEncoder().encode(JSON.stringify({ state: 'signed-out', relationships: [] })),
  }));
  const connect = async () => ({ http });
  await expect(runRelationshipCommand(['account-enroll', id], {}, connect)).rejects.toThrow(
    '--out',
  );
  expect(http).not.toHaveBeenCalled();
  await expect(
    runRelationshipCommand(
      ['account-enroll', id],
      { out: '/new-private-account-grant.json' },
      connect,
    ),
  ).rejects.toThrow('Sign in');
  expect(http).toHaveBeenCalledExactlyOnceWith('/api/botharness/relationships', {
    action: 'account-status',
  });
});
it('checks directions without confirmation or issuing another enrollment', async () => {
  const { http, connect } = fixture();
  await runRelationshipCommand(['sync', id], {}, connect);
  expect(http).toHaveBeenCalledWith('/api/botharness/relationships', { action: 'sync', id });
  await expect(runRelationshipCommand(['route', id], {}, connect)).rejects.toThrow('--link-file');
});
it('retries pending retirement through the same sync owner without replaying initiation', async () => {
  const http = vi.fn(async () => ({
    bytes: new TextEncoder().encode(
      JSON.stringify({
        relationship: {
          id,
          state: 'disconnected',
          peerRevocationPending: true,
          revocationAttempts: 1,
          automaticEnrollmentSuppressed: true,
        },
      }),
    ),
  }));
  expect(await runRelationshipCommand(['sync', id], {}, async () => ({ http }))).toMatchObject({
    relationship: { state: 'disconnected', peerRevocationPending: true, revocationAttempts: 1 },
  });
  expect(http).toHaveBeenCalledExactlyOnceWith('/api/botharness/relationships', {
    action: 'sync',
    id,
  });
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
