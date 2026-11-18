import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { privateRequestSchema } from '../src/credentials/contracts.js';
import {
  PRIVATE_FIELD_ID,
  PRIVATE_REFERENCE_IN_TEXT,
  fillSecretPlaceholders,
  privateReference,
  privateReferenceField,
  secretPlaceholders,
} from '../src/credentials/references.js';
import { sourceFilesMatching } from './source-files.js';

const fieldCandidate = fc.string({
  unit: fc.constantFrom(...'abcxyzAZ09_-.: é'.split('')),
  maxLength: 60,
});

const acceptsField = (id: string): boolean =>
  privateRequestSchema.safeParse({
    account: 'default',
    purpose: 'test',
    fields: [{ id, label: 'Field', required: true }],
  }).success;

const fieldId = fieldCandidate.filter((id) => PRIVATE_FIELD_ID.test(id));

describe('one Private Input reference format (docs/decisions/secrets.md)', () => {
  it('spells the field and reference patterns only in credentials/references.ts', () => {
    expect(sourceFilesMatching(/\[a-z0-9_\]\{0,47\}|private:\[0-9a-f/u)).toEqual([
      'credentials/references.ts',
    ]);
  });

  it('declares exactly the field ids that references, placeholders and fences accept', () => {
    fc.assert(
      fc.property(fieldCandidate, (id) => {
        expect(acceptsField(id)).toBe(PRIVATE_FIELD_ID.test(id));
      }),
      { numRuns: 1000 },
    );
  });

  it('reads back every reference and placeholder it writes, and finds a reference inside any reply', () => {
    fc.assert(
      fc.property(fieldId, fc.uuid(), fc.string(), fc.string(), (id, grantId, before, after) => {
        const reference = privateReference(grantId, id);
        expect(privateReferenceField(reference)).toBe(id);
        expect(PRIVATE_REFERENCE_IN_TEXT.test(before + reference + after)).toBe(true);
        expect(secretPlaceholders(`${before}{{${id}}}${after}`)).toContain(id);
        expect(fillSecretPlaceholders(`{{${id}}}`, (field) => `<${field}>`)).toBe(`<${id}>`);
      }),
      { numRuns: 500 },
    );
  });
});
