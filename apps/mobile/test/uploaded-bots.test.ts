import { describe, expect, it, vi } from 'vitest';

import type { MarketplaceAuthoredBot } from '../../../packages/core/src/marketplace/client';
import { createUploadedBots } from '../src/account/uploaded-bots';

const item = (id: string) =>
  ({ bot: { id }, files: 1, bytes: 10, blocked: false }) as unknown as MarketplaceAuthoredBot;

describe('uploaded Bots', () => {
  it('loads the account uploads and removes one after the Market deletes it', async () => {
    const authored = vi.fn(async () => ({ ok: true as const, value: [item('U_a'), item('U_b')] }));
    const deleteUpload = vi.fn(async () => ({
      ok: true as const,
      value: { deleted: true as const },
    }));
    const uploads = createUploadedBots({
      connect: { accessToken: async () => ({ ok: true, value: 'token' }) },
      client: { authored, deleteUpload },
    });
    await uploads.refresh('zh');
    expect(authored).toHaveBeenCalledWith('token', 'zh');
    await uploads.remove('U_a');
    expect(deleteUpload).toHaveBeenCalledWith('token', 'U_a');
    const state = uploads.getSnapshot();
    expect(state.status === 'ready' && state.bots.map((entry) => entry.bot.id)).toEqual(['U_b']);
  });

  it('keeps the list when the Market refuses a delete', async () => {
    const uploads = createUploadedBots({
      connect: { accessToken: async () => ({ ok: true, value: 'token' }) },
      client: {
        authored: async () => ({ ok: true, value: [item('U_a')] }),
        deleteUpload: async () => ({ ok: false, code: 'bot-not-found' }),
      },
    });
    await uploads.refresh();
    await expect(uploads.remove('U_a')).rejects.toThrow('bot-not-found');
    const state = uploads.getSnapshot();
    expect(state.status === 'ready' && state.bots).toHaveLength(1);
  });

  it('reports signed out without an account', async () => {
    const authored = vi.fn();
    const uploads = createUploadedBots({
      connect: { accessToken: async () => ({ ok: false, code: 'sign-in-required' }) },
      client: { authored, deleteUpload: vi.fn() },
    });
    expect((await uploads.refresh()).status).toBe('signed-out');
    expect(authored).not.toHaveBeenCalled();
  });
});
