import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  isPersonaBotAvatar,
  MAX_PERSONA_BOT_AVATAR_BYTES,
  personaBotAvatarFromBytes,
} from '../src/bots/persona-bot.js';

const HEADERS = {
  png: [137, 80, 78, 71, 13, 10, 26, 10],
  jpeg: [0xff, 0xd8, 0xff],
  webp: [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')],
} as const;
type ImageType = keyof typeof HEADERS;

const imageType = fc.constantFrom<ImageType>('png', 'jpeg', 'webp');
const image = (type: ImageType, body: Uint8Array) => Uint8Array.from([...HEADERS[type], ...body]);
const dataUrl = (type: string, bytes: Uint8Array) =>
  `data:image/${type};base64,${Buffer.from(bytes).toString('base64')}`;

const body = fc.oneof(
  fc.uint8Array({ maxLength: 64 }),
  fc
    .integer({ min: MAX_PERSONA_BOT_AVATAR_BYTES - 16, max: MAX_PERSONA_BOT_AVATAR_BYTES + 16 })
    .map((size) => new Uint8Array(Math.max(0, size - 12)).fill(7)),
);

describe('ADR-0086 custom PersonaBot avatars are bounded data URLs', () => {
  it('turns any recognised image within the bound into a data URL that round-trips its bytes', () => {
    fc.assert(
      fc.property(imageType, body, (type, rest) => {
        const bytes = image(type, rest);
        const avatar = personaBotAvatarFromBytes(bytes);
        if (bytes.length > MAX_PERSONA_BOT_AVATAR_BYTES) {
          expect(avatar).toBeUndefined();
          return;
        }
        expect(avatar).toBe(dataUrl(type, bytes));
        expect(isPersonaBotAvatar(avatar)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('refuses a declared type whose bytes carry another image header', () => {
    fc.assert(
      fc.property(
        imageType,
        imageType,
        fc.uint8Array({ maxLength: 64 }),
        (declared, actual, rest) => {
          fc.pre(declared !== actual);
          expect(isPersonaBotAvatar(dataUrl(declared, image(actual, rest)))).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('accepts only values that decode to a bounded image of the declared type', () => {
    const candidate = fc.oneof(
      fc.string(),
      fc
        .tuple(imageType, fc.uint8Array({ maxLength: 64 }))
        .map(([type, bytes]) => dataUrl(type, bytes)),
      fc
        .tuple(fc.constantFrom('png', 'jpeg', 'webp', 'gif', 'svg+xml'), imageType, body)
        .map(([declared, actual, rest]) => dataUrl(declared, image(actual, rest))),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        if (!isPersonaBotAvatar(value)) return;
        const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/u.exec(value)!;
        const bytes = Buffer.from(match[2]!, 'base64');
        expect(bytes.length).toBeGreaterThan(0);
        expect(bytes.length).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
        expect(personaBotAvatarFromBytes(bytes)).toBe(value);
      }),
      { numRuns: 500 },
    );
  });
});
