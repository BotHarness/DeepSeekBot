import { expect, it, vi } from 'vitest';
import { VOICE_CALL_PATH } from '../../../packages/core/src/voice/call-contract';
import { readCallReadiness } from '../../../packages/core/src/voice/call-client';
import { createHostClient } from '../src/host/client';

it('refuses Bot calls over Connect before any request leaves the phone', async () => {
  const raw = { request: vi.fn(), openSocket: vi.fn() };
  const host = createHostClient({
    hostId: 'host',
    credential: 'synthetic',
    routes: ['https://host.deepseekbot.dev'],
    carrier: raw,
  });
  try {
    const answer = await host.api(VOICE_CALL_PATH, { body: { kind: 'open', slug: 'mira' } });
    expect(answer).toMatchObject({
      status: 409,
      body: { ok: false, code: 'connect-carrier-required' },
    });
    expect(
      await readCallReadiness(
        async (body) => (await host.api(VOICE_CALL_PATH, { body })).body as never,
        'mira',
      ),
    ).toMatchObject({ code: 'connect-carrier-required' });
    expect(raw.request).not.toHaveBeenCalled();
    expect(raw.openSocket).not.toHaveBeenCalled();
  } finally {
    host.stop();
  }
});
