import { describe, expect, it, vi } from 'vitest';
import { stopGenuiQaBot } from '../genui-qa-cleanup.mjs';

const bot = { slug: 'synthetic-qa-bot', channelId: 'synthetic-qa-dm' };

describe('owned GenUI QA activity cleanup', () => {
  it('fences further dispatch before stopping only the run-owned Bot in its Channel', async () => {
    const stop = { stopped: [], alreadyIdle: [] };
    const call = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(stop);
    await expect(stopGenuiQaBot(call, bot)).resolves.toEqual({ paused: true, stop });
    expect(call.mock.calls).toEqual([
      ['pause', { slug: bot.slug }],
      ['botStop', { botSlug: bot.slug, channelId: bot.channelId }],
    ]);
  });

  it('does not turn a cleanup failure into a successful receipt', async () => {
    const call = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('stop failed'));
    await expect(stopGenuiQaBot(call, bot)).rejects.toThrow('stop failed');
  });

  it('does not stop an unfenced Bot when pause fails', async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error('pause failed'));
    await expect(stopGenuiQaBot(call, bot)).rejects.toThrow('pause failed');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
