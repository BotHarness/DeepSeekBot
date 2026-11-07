import { describe, expect, it } from 'vitest';
import {
  GENUI_DOCUMENT_LIMITS,
  genuiDocumentIdentity,
  initialGenuiDocumentState,
  parseGenuiDocument,
  validateGenuiDocumentReply,
  validateGenuiDocumentState,
} from '../src/channels/genui-document.js';

const document = {
  version: 2 as const,
  snapshotId: 'html-1',
  observedAt: '2026-11-08T00:00:00Z',
  title: 'Local comparison',
  html: '<!doctype html><h1>Comparison</h1>',
  stateContract: {
    version: 1 as const,
    fields: {
      query: { type: 'string' as const, initial: '', maxLength: 20 },
      count: { type: 'number' as const, initial: 0, min: -2, max: 5 },
      enabled: { type: 'boolean' as const, initial: false },
      mode: { type: 'choice' as const, initial: 'table', options: ['table', 'chart'] },
    },
  },
};

describe('GenUI HTML document contract', () => {
  it('validates exact primitive state and explicit continuation', () => {
    const parsed = parseGenuiDocument(document);
    const state = initialGenuiDocumentState(parsed);
    expect(state).toEqual({
      version: 1,
      values: { query: '', count: 0, enabled: false, mode: 'table' },
    });
    expect(validateGenuiDocumentState(parsed, state)).toEqual(state);
    const reply = {
      version: 2,
      messageId: 'doc-1',
      snapshotId: parsed.snapshotId,
      intent: 'continue',
      state,
    };
    expect(validateGenuiDocumentReply(parsed, reply)).toEqual(reply);
    expect(() => validateGenuiDocumentReply(parsed, { ...reply, snapshotId: 'forged' })).toThrow();
    expect(() => validateGenuiDocumentReply(parsed, { ...reply, hash: 'forged' })).toThrow();
  });
  it.each([
    { query: '', count: 0, enabled: false },
    { query: '', count: 0, enabled: false, mode: 'table', extra: true },
    { query: '', count: '0', enabled: false, mode: 'table' },
    { query: '', count: 6, enabled: false, mode: 'table' },
    { query: '', count: 0, enabled: false, mode: 'unknown' },
    { query: 'x'.repeat(21), count: 0, enabled: false, mode: 'table' },
    { query: {}, count: 0, enabled: false, mode: 'table' },
  ])('rejects missing, extra, coerced or out-of-contract state', (values) => {
    expect(() => validateGenuiDocumentState(document, { version: 1, values })).toThrow();
  });
  it('supports only empty values without a state contract', () => {
    const { stateContract: _stateContract, ...stateless } = document;
    expect(initialGenuiDocumentState(stateless)).toEqual({ version: 1, values: {} });
    expect(validateGenuiDocumentState(stateless, { version: 1, values: {} })).toEqual({
      version: 1,
      values: {},
    });
    expect(() =>
      validateGenuiDocumentState(stateless, { version: 1, values: { query: '' } }),
    ).toThrow();
  });
  it('hashes the complete normalized envelope independently of record key ordering', () => {
    const identity = genuiDocumentIdentity(document);
    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    const reordered = {
      ...document,
      stateContract: {
        version: 1 as const,
        fields: Object.fromEntries(Object.entries(document.stateContract.fields).reverse()),
      },
    };
    expect(genuiDocumentIdentity(reordered)).toBe(identity);
    for (const update of [
      { html: '<p>Changed</p>' },
      { predecessorMessageId: 'doc-0' },
      { title: 'Changed' },
      { stateContract: undefined },
    ])
      expect(genuiDocumentIdentity({ ...document, ...update })).not.toBe(identity);
  });
  it('rejects UTF-8 budgets, unsafe keys and invalid initial contracts', () => {
    expect(() =>
      parseGenuiDocument({
        ...document,
        html: '中'.repeat(GENUI_DOCUMENT_LIMITS.htmlBytes / 3 + 1),
      }),
    ).toThrow();
    expect(() => parseGenuiDocument({ ...document, html: '\u0000'.repeat(50_000) })).toThrow();
    expect(() =>
      parseGenuiDocument({
        ...document,
        stateContract: {
          version: 1,
          fields: JSON.parse('{"__proto__":{"type":"boolean","initial":false}}'),
        },
      }),
    ).toThrow();
    for (const field of [
      { type: 'string', initial: '', maxLength: 501 },
      { type: 'number', initial: 6, min: 0, max: 5 },
      { type: 'number', initial: 0, min: 5, max: 0 },
      { type: 'choice', initial: 'missing', options: ['table'] },
      { type: 'choice', initial: 'table', options: ['table', 'table'] },
      {
        type: 'choice',
        initial: '0',
        options: Array.from({ length: 21 }, (_, index) => String(index)),
      },
    ])
      expect(() =>
        parseGenuiDocument({ ...document, stateContract: { version: 1, fields: { field } } }),
      ).toThrow();
    expect(() =>
      parseGenuiDocument({
        ...document,
        stateContract: {
          version: 1,
          fields: Object.fromEntries(
            Array.from({ length: 17 }, (_, index) => [
              `field-${index}`,
              { type: 'boolean', initial: false },
            ]),
          ),
        },
      }),
    ).toThrow();
    const oversized = {
      version: 2 as const,
      snapshotId: 'state-budget',
      observedAt: document.observedAt,
      title: 'State',
      html: '<p>State</p>',
      stateContract: {
        version: 1 as const,
        fields: Object.fromEntries(
          Array.from({ length: 16 }, (_, index) => [
            `field-${index}`,
            { type: 'string' as const, initial: '中'.repeat(500), maxLength: 500 },
          ]),
        ),
      },
    };
    expect(() => parseGenuiDocument(oversized)).toThrow();
  });
});
