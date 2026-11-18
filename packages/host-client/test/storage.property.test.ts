import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { HostAnswerInvalid } from '../src/bot-settings.js';
import {
  STORAGE_KEPT,
  STORAGE_MEDIA_KINDS,
  STORAGE_MESSAGES_KEPT,
  STORAGE_PARTS,
  parseStorageCleanupPreview,
  parseStorageMessagesPreview,
  parseStorageUsage,
} from '../src/storage.js';

const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const field = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.integer({ min: -3, max: 5000 }),
  fc.double(),
  fc.string({ maxLength: 8 }),
  fc.boolean(),
  fc.array(fc.oneof(fc.string({ maxLength: 4 }), fc.integer(), fc.constant(null)), {
    maxLength: 3,
  }),
);
const scope = fc.record(
  {
    before: fc.oneof(fc.constant('2026-11-01T00:00:00.000Z'), field),
    channelIds: field,
    kinds: fc.oneof(fc.subarray([...STORAGE_MEDIA_KINDS, 'thumbnail']), field),
  },
  { requiredKeys: [] },
);
const rows = (shape: Record<string, fc.Arbitrary<unknown>>) =>
  fc.oneof(
    fc.array(fc.oneof(fc.record(shape, { requiredKeys: [] }), field), { maxLength: 4 }),
    field,
  );
const preview = fc.record(
  {
    token: fc.oneof(fc.constant('token-1'), field),
    scope: fc.oneof(scope, field),
    messages: field,
    files: field,
    bytes: field,
    freedBytes: field,
    memoryReferences: field,
    more: field,
    kept: rows({
      reason: fc.constantFrom(...STORAGE_KEPT, ...STORAGE_MESSAGES_KEPT, 'other'),
      files: field,
      messages: field,
    }),
    chats: rows({ channelId: field, name: field, messages: field }),
  },
  { requiredKeys: [] },
);
const usage = fc.record(
  {
    totalBytes: field,
    parts: rows({ kind: fc.constantFrom(...STORAGE_PARTS, 'thumbnails'), bytes: field }),
    chats: rows({
      channelId: field,
      name: field,
      type: field,
      deleted: field,
      messages: field,
      mediaBytes: field,
    }),
  },
  { requiredKeys: [] },
);
const answer = fc.oneof(preview, usage, field, fc.anything());

const outcome = <T>(parse: () => T): T | undefined => {
  try {
    return parse();
  } catch (error) {
    expect(error).toBeInstanceOf(HostAnswerInvalid);
    return undefined;
  }
};

describe('storage answers', () => {
  it('either refuse an answer or return only well-formed fields', () => {
    fc.assert(
      fc.property(answer, (value) => {
        const usageResult = outcome(() => parseStorageUsage(value));
        if (usageResult) {
          expect(isCount(usageResult.totalBytes)).toBe(true);
          for (const part of usageResult.parts) {
            expect(STORAGE_PARTS).toContain(part.kind);
            expect(isCount(part.bytes)).toBe(true);
          }
          for (const chat of usageResult.chats) {
            expect(typeof chat.channelId).toBe('string');
            expect(typeof chat.name).toBe('string');
            expect(isCount(chat.messages) && isCount(chat.mediaBytes)).toBe(true);
          }
        }
        for (const parse of [parseStorageCleanupPreview, parseStorageMessagesPreview]) {
          const result = outcome(() => parse(value));
          if (!result) continue;
          expect(typeof result.token).toBe('string');
          expect(typeof result.scope.before).toBe('string');
          expect(result.scope.channelIds.every((id) => typeof id === 'string')).toBe(true);
          expect(isCount(result.messages) && isCount(result.bytes) && isCount(result.files)).toBe(
            true,
          );
          for (const kept of result.kept) {
            expect([...STORAGE_KEPT, ...STORAGE_MESSAGES_KEPT]).toContain(kept.reason);
          }
        }
        const messages = outcome(() => parseStorageMessagesPreview(value));
        if (messages) expect(isCount(messages.memoryReferences)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('refuse a preview without its token, its cutoff or a valid chat restriction', () => {
    fc.assert(
      fc.property(preview, (value) => {
        const scopeValue = value.scope as Record<string, unknown> | undefined;
        const channelIds = scopeValue?.['channelIds'];
        const valid =
          typeof value.token === 'string' &&
          typeof scopeValue === 'object' &&
          scopeValue !== null &&
          !Array.isArray(scopeValue) &&
          typeof scopeValue['before'] === 'string' &&
          (channelIds === undefined ||
            (Array.isArray(channelIds) && channelIds.every((id) => typeof id === 'string')));
        expect(outcome(() => parseStorageCleanupPreview(value)) !== undefined).toBe(valid);
        expect(outcome(() => parseStorageMessagesPreview(value)) !== undefined).toBe(
          valid && isCount(value.memoryReferences),
        );
      }),
      { numRuns: 500 },
    );
  });
});
