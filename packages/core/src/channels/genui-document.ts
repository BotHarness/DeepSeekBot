import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { GenuiError } from './genui.js';

export const GENUI_DOCUMENT_LIMITS = Object.freeze({
  bytes: 262_144,
  htmlBytes: 196_608,
  stateBytes: 8_192,
  fields: 16,
  options: 20,
  stringLength: 500,
  depth: 8,
});

const identity = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const fieldSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('string'),
    initial: z.string().max(500),
    maxLength: z.number().int().min(0).max(500),
  }),
  z.strictObject({
    type: z.literal('number'),
    initial: z.number().finite(),
    min: z.number().finite(),
    max: z.number().finite(),
  }),
  z.strictObject({ type: z.literal('boolean'), initial: z.boolean() }),
  z.strictObject({
    type: z.literal('choice'),
    initial: z.string().max(500),
    options: z.array(z.string().max(500)).min(1).max(20),
  }),
]);
export type GenuiDocumentField = z.infer<typeof fieldSchema>;
const documentSchema = z.strictObject({
  version: z.literal(2),
  snapshotId: identity,
  observedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(200),
  predecessorMessageId: identity.optional(),
  html: z.string().min(1),
  stateContract: z
    .strictObject({ version: z.literal(1), fields: z.record(identity, fieldSchema) })
    .optional(),
});
export type GenuiDocument = z.infer<typeof documentSchema>;
export const genuiDocumentStateSchema = z
  .strictObject({
    version: z.literal(1),
    values: z.record(identity, z.union([z.string().max(500), z.number().finite(), z.boolean()])),
  })
  .superRefine((value, context) => {
    if (
      Object.keys(value.values).length > GENUI_DOCUMENT_LIMITS.fields ||
      encodedSize(value) > GENUI_DOCUMENT_LIMITS.stateBytes ||
      Object.keys(value.values).some(unsafeKey)
    )
      context.addIssue({ code: 'custom', message: 'Invalid document state limits or keys.' });
  });
export type GenuiDocumentState = z.infer<typeof genuiDocumentStateSchema>;
export interface GenuiDocumentView {
  version: number;
  state: GenuiDocumentState;
}
export const genuiDocumentReplySchema = z.strictObject({
  version: z.literal(2),
  messageId: identity,
  snapshotId: identity,
  intent: z.enum(['continue', 'refresh']),
  state: genuiDocumentStateSchema,
});
export type GenuiDocumentReply = z.infer<typeof genuiDocumentReplySchema>;

function unsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

function encodedSize(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? Infinity : new TextEncoder().encode(json).length;
  } catch {
    return Infinity;
  }
}

function assertPlain(value: unknown, depth = 0): void {
  if (depth > GENUI_DOCUMENT_LIMITS.depth)
    throw new GenuiError('invalid-genui', 'Document nesting exceeds its budget.');
  if (value === null || typeof value !== 'object') return;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new GenuiError('invalid-genui', 'Document values must be plain JSON.');
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeKey(key)) throw new GenuiError('invalid-genui', 'Unsafe document key.');
    assertPlain(entry, depth + 1);
  }
}

export function parseGenuiDocument(value: unknown): GenuiDocument {
  assertPlain(value);
  if (encodedSize(value) > GENUI_DOCUMENT_LIMITS.bytes)
    throw new GenuiError('invalid-genui', 'Document exceeds the 256 KiB budget.');
  const result = documentSchema.safeParse(value);
  if (
    !result.success ||
    new TextEncoder().encode(result.data.html).length > GENUI_DOCUMENT_LIMITS.htmlBytes
  )
    throw new GenuiError('invalid-genui', 'Invalid document structure or HTML resource limits.');
  const document = result.data;
  const fields = Object.values(document.stateContract?.fields ?? {});
  if (fields.length > GENUI_DOCUMENT_LIMITS.fields)
    throw new GenuiError('invalid-genui', 'Too many document state fields.');
  for (const field of fields) {
    if (
      (field.type === 'number' &&
        (field.min > field.max || field.initial < field.min || field.initial > field.max)) ||
      (field.type === 'string' && field.initial.length > field.maxLength) ||
      (field.type === 'choice' &&
        (new Set(field.options).size !== field.options.length ||
          !field.options.includes(field.initial)))
    )
      throw new GenuiError('invalid-genui', 'Invalid document state contract.');
  }
  validateGenuiDocumentState(document, initialGenuiDocumentState(document));
  return document;
}

export function initialGenuiDocumentState(document: GenuiDocument): GenuiDocumentState {
  return {
    version: 1,
    values: Object.fromEntries(
      Object.entries(document.stateContract?.fields ?? {}).map(([key, field]) => [
        key,
        field.initial,
      ]),
    ),
  };
}

export function validateGenuiDocumentState(
  document: GenuiDocument,
  value: unknown,
): GenuiDocumentState {
  assertPlain(value);
  if (encodedSize(value) > GENUI_DOCUMENT_LIMITS.stateBytes)
    throw new GenuiError('invalid-genui', 'Document state exceeds the 8 KiB budget.');
  const parsed = genuiDocumentStateSchema.safeParse(value);
  if (!parsed.success) throw new GenuiError('invalid-genui', 'Invalid private document state.');
  const fields = document.stateContract?.fields ?? {};
  const values = parsed.data.values;
  if (Object.keys(fields).length !== Object.keys(values).length)
    throw new GenuiError(
      'invalid-genui',
      'Document state must contain exactly its registered fields.',
    );
  for (const [key, field] of Object.entries(fields)) {
    const entry = values[key];
    if (
      !Object.hasOwn(values, key) ||
      (field.type === 'string' && (typeof entry !== 'string' || entry.length > field.maxLength)) ||
      (field.type === 'number' &&
        (typeof entry !== 'number' || entry < field.min || entry > field.max)) ||
      (field.type === 'boolean' && typeof entry !== 'boolean') ||
      (field.type === 'choice' && (typeof entry !== 'string' || !field.options.includes(entry)))
    )
      throw new GenuiError(
        'invalid-genui',
        'Document state does not match its registered contract.',
      );
  }
  return parsed.data;
}

export function validateGenuiDocumentReply(
  document: GenuiDocument,
  value: unknown,
): GenuiDocumentReply {
  assertPlain(value);
  const parsed = genuiDocumentReplySchema.safeParse(value);
  if (!parsed.success || parsed.data.snapshotId !== document.snapshotId)
    throw new GenuiError('invalid-genui', 'The document snapshot does not match.');
  return { ...parsed.data, state: validateGenuiDocumentState(document, parsed.data.state) };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
}

export function genuiDocumentIdentity(document: GenuiDocument): string {
  const envelope = JSON.stringify(stableValue(parseGenuiDocument(document)));
  return bytesToHex(sha256(new TextEncoder().encode(envelope)));
}
