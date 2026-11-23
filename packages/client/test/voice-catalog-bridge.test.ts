import { expect, it } from 'vitest';

import { browseVoiceCatalog } from '../src/client/voice-bridge.js';

it('keeps only HTTPS sample links from a speech catalog page', async () => {
  const page = await browseVoiceCatalog(
    async () => ({
      ok: true,
      value: {
        items: [
          { id: 'sampled', name: 'Sampled', previewUrl: 'https://platform.r2.fish.audio/a.mp3' },
          { id: 'plain', name: 'Plain', previewUrl: 'http://platform.r2.fish.audio/b.mp3' },
          { id: 'broken', name: 'Broken', previewUrl: 'not a link' },
          { id: 'shared', name: 'Shared', importFrom: 'owner-1' },
        ],
        nextCursor: '2',
      },
    }),
    { kind: 'tts', preset: 'fish-audio', collection: 'public', key: 'test-key' },
  );
  expect(page).toEqual({
    items: [
      { id: 'sampled', name: 'Sampled', previewUrl: 'https://platform.r2.fish.audio/a.mp3' },
      { id: 'plain', name: 'Plain' },
      { id: 'broken', name: 'Broken' },
      { id: 'shared', name: 'Shared', importFrom: 'owner-1' },
    ],
    nextCursor: '2',
  });
});
