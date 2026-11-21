import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { decodeSolution } from '../../../packages/core/src/marketplace/altcha';
import { FakeHost } from '../../../packages/host-client/test/fake-host';
import { avatarDataUrl } from '../../../packages/market/test/avatar-fixtures';
import { marketplaceAvatars } from '../src/marketplace/avatars';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_: string, text: string) =>
    createHash('sha256').update(text).digest('hex'),
}));

const avatar = {
  id: 'cafebeef-dddd-eeee-ffff-000000000000',
  imageUrl: 'https://market.example.test/avatar.webp',
  name: 'Blue',
  description: '',
  tags: ['blue'],
  author: { name: 'Ada', id: 'abc234' },
  applyCount: 1,
};

let client: HostClient;
let host: FakeHost;
beforeEach(() => {
  host = new FakeHost();
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
});
afterEach(() => client.stop());

describe('mobile Marketplace Avatar bridge', () => {
  it('rejects a malformed Host page without exposing it to the grid', async () => {
    host.methods.set('marketplaceAvatarList', () => ({
      avatars: [{ id: 'incomplete' }],
      nextCursor: null,
    }));
    const list = marketplaceAvatars(client).list({});
    await list.refresh();
    expect(list.getSnapshot()).toMatchObject({
      status: 'failed',
      error: 'marketplace-unavailable',
    });
    expect(list.getSnapshot().value).toBeUndefined();
  });

  it('carries search and tag filters through paging and merges overlaps', async () => {
    host.methods.set('marketplaceAvatarList', ({ cursor }) => ({
      avatars: cursor ? [avatar, { ...avatar, id: 'other' }] : [avatar],
      nextCursor: cursor ? null : 'next',
    }));
    host.methods.set('marketplaceAvatarTags', () => [{ tag: 'blue', count: 2 }]);
    const actions = marketplaceAvatars(client);
    const list = actions.list({ q: 'ocean', tag: 'blue' });
    await Promise.all([list.refresh(), actions.tags.refresh()]);
    expect(actions.tags.getSnapshot().value).toEqual([{ topic: 'blue', count: 2 }]);
    expect(list.getSnapshot().value?.avatars).toEqual([avatar]);
    await list.more();
    expect(list.getSnapshot().value?.avatars.map(({ id }) => id)).toEqual([avatar.id, 'other']);
    expect(host.calls.filter(({ method }) => method === 'marketplaceAvatarList')).toEqual([
      { method: 'marketplaceAvatarList', args: { q: 'ocean', tag: 'blue' } },
      { method: 'marketplaceAvatarList', args: { q: 'ocean', tag: 'blue', cursor: 'next' } },
    ]);
  });

  it('uses Host candidates and refreshes the roster after apply', async () => {
    const bots = [{ slug: 'ada', displayName: 'Ada', hasAppearance: true }];
    host.methods.set('marketplaceAvatarApplyCandidates', () => ({ bots }));
    host.methods.set('marketplaceAvatarApply', () => ({ applied: true }));
    const actions = marketplaceAvatars(client);
    await actions.candidates.refresh();
    expect(actions.candidates.getSnapshot().value).toEqual(bots);
    host.calls.length = 0;
    await actions.apply(avatar.id, 'ada');
    expect(host.calls[0]).toEqual({
      method: 'marketplaceAvatarApply',
      args: { id: avatar.id, bot: 'ada' },
    });
    expect(host.calls.some(({ method }) => method === 'list')).toBe(true);
  });

  it('uses the owner account, expected Author ID, stored source and management bridges', async () => {
    const author = { ...avatar.author, avatar: null, termsAcceptedAt: '2026-11-21' };
    const image = avatarDataUrl('webp');
    host.methods.set('marketplaceAccount', () => ({ signedIn: true, author }));
    host.methods.set('marketplaceAvatarSource', () => ({ image }));
    host.methods.set('marketplaceAvatarPublish', () => avatar);
    host.methods.set('marketplaceAvatarMine', () => ({ avatars: [avatar] }));
    host.methods.set('marketplaceAvatarEdit', () => ({ ...avatar, name: 'Ocean' }));
    host.methods.set('marketplaceAvatarDelete', () => ({ deleted: true }));
    const actions = marketplaceAvatars(client);
    await actions.account.refresh();
    expect(actions.account.getSnapshot().value?.author).toEqual(author);
    const source = await actions.source('ada');
    const draft = {
      image: source.image,
      name: 'Blue',
      description: '',
      tags: ['blue'],
      requestKey: 'request-blue',
      expectedAuthorId: author.id,
      confirm: true,
    } satisfies Parameters<typeof actions.publish>[0];
    await expect(actions.publish(draft)).resolves.toEqual(avatar);
    await actions.mine.refresh();
    expect(actions.mine.getSnapshot().value).toEqual([avatar]);
    const patch = { name: 'Ocean', description: '', tags: ['ocean'] };
    await expect(actions.edit(avatar.id, patch)).resolves.toMatchObject({ name: 'Ocean' });
    await actions.remove(avatar.id);
    expect(host.calls.filter(({ method }) => method.startsWith('marketplaceAvatar'))).toEqual([
      { method: 'marketplaceAvatarSource', args: { bot: 'ada' } },
      { method: 'marketplaceAvatarPublish', args: draft },
      { method: 'marketplaceAvatarMine', args: {} },
      { method: 'marketplaceAvatarEdit', args: { id: avatar.id, ...patch } },
      { method: 'marketplaceAvatarDelete', args: { id: avatar.id } },
    ]);
  });

  it('solves the Host report challenge and submits the optional reason', async () => {
    const salt = 'mobile?expires=1795280000';
    const challenge = createHash('sha256')
      .update(salt + '72')
      .digest('hex');
    host.methods.set('marketplaceChallenge', () => ({
      algorithm: 'SHA-256',
      challenge,
      salt,
      maxnumber: 100,
      signature: 'signature',
    }));
    host.methods.set('marketplaceAvatarReport', () => ({ received: true }));
    await marketplaceAvatars(client).report(
      avatar.id,
      'Inappropriate image',
      new AbortController().signal,
    );
    const args = host.calls.find(({ method }) => method === 'marketplaceAvatarReport')?.args;
    expect(args).toMatchObject({ id: avatar.id, reason: 'Inappropriate image' });
    expect(decodeSolution(String(args?.altcha))).toMatchObject({ challenge, salt, number: 72 });
  });
});
