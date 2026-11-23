import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateVoiceTemplate } from '../src/voice/request-template.js';
import { templateRequest } from '../src/voice/template-request.js';

const scaffold = {
  version: 1,
  url: 'https://speech.example/{voice}?text={text}',
  method: 'POST',
  auth: { kind: 'bearer' },
  body: { kind: 'json', value: '' },
  result: { kind: 'audio' },
};

describe('ADR-0363 template invariants', () => {
  it('accepts only bounded normalized templates that validate identically on a second pass', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 24_000 }),
        fc.constantFrom('x', '界', 'é', '🎧'),
        fc.boolean(),
        (length, character, includeHeaders) => {
          const result = validateVoiceTemplate(
            {
              ...scaffold,
              ...(includeHeaders ? { headers: {} } : {}),
              body: { kind: 'json', value: character.repeat(length) },
            },
            'tts',
          );
          if (result.valid) {
            expect(Buffer.byteLength(JSON.stringify(result.template), 'utf8')).toBeLessThanOrEqual(
              65_536,
            );
            expect(validateVoiceTemplate(result.template, 'tts')).toEqual(result);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('keeps the authenticated origin fixed for all rendered path and query values', () => {
    const result = validateVoiceTemplate(scaffold, 'tts');
    if (!result.valid) throw new Error('Invalid fixture');
    fc.assert(
      fc.property(fc.string(), fc.string(), (voice, text) => {
        const request = templateRequest(result.template, { voice, text }, 'fixture-secret');
        expect(new URL(request.url).origin).toBe('https://speech.example');
        expect(new URL(request.url).searchParams.get('text')).toBe(text);
        expect(new Headers(request.init.headers).get('authorization')).toBe(
          'Bearer fixture-secret',
        );
      }),
      { numRuns: 100 },
    );
  });
});
