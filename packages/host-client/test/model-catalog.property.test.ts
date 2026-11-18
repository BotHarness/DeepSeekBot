import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ModelCatalogInvalid, parseModelCatalog } from '../src/model-catalog.js';

const text = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.string({ maxLength: 12 }),
  fc.constantFrom('deepseek', 'openai', 'GPT-6.1'),
);
const maybe = <T>(value: fc.Arbitrary<T>) =>
  fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer(), value);
const filled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const row = fc.record(
  {
    provider: maybe(text),
    providerName: maybe(text),
    model: maybe(text),
    modelName: maybe(text),
    credential: fc.constantFrom(undefined, 'missing', 'invalid', 'other'),
  },
  { requiredKeys: [] },
);
const rows = fc.array(fc.oneof(row, fc.constant(null), fc.integer(), fc.string()), {
  maxLength: 8,
});
const revision = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.double(),
  fc.constant(Number.MAX_SAFE_INTEGER + 1),
  fc.string(),
);

describe('parseModelCatalog', () => {
  it('keeps exactly the rows with a provider and a model, naming blanks by id', () => {
    fc.assert(
      fc.property(rows, (models) => {
        const kept = models.flatMap((value) => {
          if (typeof value !== 'object' || value === null) return [];
          const entry = value as Record<string, unknown>;
          return filled(entry['provider']) && filled(entry['model']) ? [entry] : [];
        });
        const parsed = parseModelCatalog({ models }).models;
        expect(parsed.map((entry) => [entry.provider, entry.model])).toEqual(
          kept.map((entry) => [entry['provider'], entry['model']]),
        );
        parsed.forEach((entry, index) => {
          const source = kept[index]!;
          expect(entry.providerName).toBe(
            filled(source['providerName']) ? source['providerName'] : entry.provider,
          );
          expect(entry.modelName).toBe(
            filled(source['modelName']) ? source['modelName'] : entry.model,
          );
          expect(entry.providerName.trim()).not.toBe('');
          expect(entry.modelName.trim()).not.toBe('');
        });
      }),
    );
  });

  it('keeps the default revision only when it is a non-negative safe integer', () => {
    fc.assert(
      fc.property(revision, (defaultRevision) => {
        const parsed = parseModelCatalog({ models: [], defaultRevision });
        const valid =
          typeof defaultRevision === 'number' &&
          Number.isSafeInteger(defaultRevision) &&
          defaultRevision >= 0;
        expect(parsed.defaultRevision).toBe(valid ? defaultRevision : undefined);
      }),
    );
  });

  it('rejects an answer whose models are not a list', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer(), fc.string(), fc.object()),
        (models) => {
          expect(() => parseModelCatalog({ models })).toThrow(ModelCatalogInvalid);
        },
      ),
    );
  });
});
