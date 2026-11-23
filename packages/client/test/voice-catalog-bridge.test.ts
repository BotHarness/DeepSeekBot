import { expect, it } from 'vitest';

import { browseVoiceCatalog, voiceProviderTemplate } from '../src/client/voice-bridge.js';

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

it('rejects a stored template whose variant is missing its fields', async () => {
  const valid = {
    version: 1,
    url: 'https://tts.example/v1/speak',
    method: 'POST',
    auth: { kind: 'header', name: 'X-API-Key', prefix: '' },
    headers: {},
    body: { kind: 'json', value: { text: '{text}' } },
    result: { kind: 'base64', path: 'data.audio' },
  };
  const read = (template: unknown) =>
    voiceProviderTemplate(async () => ({ ok: true, value: { template } }), 'p1');
  await expect(read(valid)).resolves.toEqual(valid);
  await expect(read({ ...valid, auth: { kind: 'header' } })).rejects.toThrow(
    'invalid voiceProviderTemplate response',
  );
  await expect(read({ ...valid, result: { kind: 'text' } })).rejects.toThrow(
    'invalid voiceProviderTemplate response',
  );
  await expect(
    read({ ...valid, body: { kind: 'multipart', fields: { file: 1 } } }),
  ).rejects.toThrow('invalid voiceProviderTemplate response');
});
