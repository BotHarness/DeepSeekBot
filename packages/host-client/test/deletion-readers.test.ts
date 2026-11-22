import { expect, it, vi } from 'vitest';
import { confirmBotDeletion, previewBotDeletion, retryBotDeletion } from '../src/deletion-readers';
import { HostAnswerInvalid } from '../src/host-answer';

const host = (value: unknown) => ({ call: vi.fn().mockResolvedValue(value) });
const deletion = {
  slug: 'tea',
  displayName: 'Tea',
  memoryDir: '/tea',
  acceptedAt: '2026-11-20T00:00:00Z',
  eraseMemory: false,
  phase: 'complete',
  memory: 'retained',
};
const preview = {
  slug: 'tea',
  displayName: 'Tea',
  memoryDir: '/tea',
  token: 'scope-token',
  eraseAvailable: false,
  dependencies: { sessions: [], workspaces: [], grants: [], identities: [], channels: ['dm-tea'] },
};
const args = { slug: 'tea', token: preview.token, eraseMemory: false };

it('preserves a reviewed deletion scope with and without the optional refusal and accepted receipt', async () => {
  await expect(previewBotDeletion(host({ preview }), args.slug)).resolves.toEqual({ preview });
  const started = { ...preview, refusal: 'Memory is outside the managed folder', deletion };
  await expect(previewBotDeletion(host({ preview: started }), args.slug)).resolves.toEqual({
    preview: started,
  });
});

it.each([
  { refusal: null },
  { slug: 'other' },
  { token: '' },
  { dependencies: { ...preview.dependencies, grants: undefined } },
  { dependencies: { ...preview.dependencies, channels: [2] } },
  { deletion: { ...deletion, ownership: { path: '/tea', device: 1 } } },
])('rejects an unreadable preview %j', async (change) => {
  await expect(
    previewBotDeletion(host({ preview: { ...preview, ...change } }), args.slug),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
});

it.each([
  (value: unknown) => confirmBotDeletion(host(value), args),
  (value: unknown) => retryBotDeletion(host(value), args.slug),
])(
  'requires the Bot deletion receipt and checks optional ownership and cleanup fields',
  async (read) => {
    await expect(read({ deletion })).resolves.toEqual({ deletion });
    const extended = {
      ...deletion,
      failure: 'Review required',
      cleanupAccepted: false,
      ownership: { path: '/tea', device: 1, inode: 2 },
    };
    await expect(read({ deletion: extended })).resolves.toEqual({ deletion: extended });
    for (const change of [
      { slug: 'other' },
      { acceptedAt: undefined },
      { phase: 'done' },
      { eraseMemory: 'no' },
      { failure: false },
      { cleanupAccepted: null },
      { ownership: { path: '/tea', device: 1, inode: -2 } },
    ])
      await expect(read({ deletion: { ...deletion, ...change } })).rejects.toBeInstanceOf(
        HostAnswerInvalid,
      );
  },
);

it('refuses a receipt for a different Memory choice', async () => {
  await expect(
    confirmBotDeletion(host({ deletion: { ...deletion, eraseMemory: true } }), args),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
});

it('preserves the existing redacted administrative receipts for the CLI', async () => {
  const admin = {
    metadataOnly: true,
    bot: {
      slug: 'tea',
      displayName: 'Tea',
      ownerHumanId: 'mia',
      owner: false,
      paused: false,
      createdAt: '2026-11-20T00:00:00Z',
    },
  };
  const metadata = { slug: 'tea', displayName: 'Tea', eraseAvailable: false, token: preview.token };
  const { memoryDir: _private, ...redacted } = deletion;
  const reviewed = { ...admin, preview: { ...metadata, deletion: redacted } };
  const completed = { ...admin, deletion: redacted };
  await expect(previewBotDeletion(host(reviewed), args.slug, true)).resolves.toEqual(reviewed);
  await expect(confirmBotDeletion(host(completed), args, true)).resolves.toEqual(completed);
  await expect(retryBotDeletion(host(completed), args.slug, true)).resolves.toEqual(completed);
  await expect(previewBotDeletion(host(reviewed), args.slug)).rejects.toBeInstanceOf(
    HostAnswerInvalid,
  );
  await expect(
    confirmBotDeletion(
      host({ ...admin, deletion: { ...redacted, acceptedAt: false } }),
      args,
      true,
    ),
  ).rejects.toBeInstanceOf(HostAnswerInvalid);
});
