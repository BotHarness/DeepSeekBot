import { z } from 'zod';
import { ATTACHMENT_FILE_ID_PATTERN, ATTACHMENT_HASH_PATTERN } from '../attachments/ref.js';

const identity = z.string().min(1).max(200);
export const purgeFactSchema = z
  .object({
    sourceEventId: identity,
    channelId: identity,
    messageId: identity,
    eventAt: z.iso.datetime(),
    author: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('human') }).strict(),
      z.object({ kind: z.literal('bot'), slug: identity }).strict(),
      z.object({ kind: z.literal('bridged'), source: identity }).strict(),
      z.object({ kind: z.literal('system') }).strict(),
    ]),
    replyTo: identity.optional(),
    causation: z
      .object({
        rootSourceEventId: identity,
        parentSourceEventId: identity,
        hop: z.number().int().min(0),
      })
      .strict()
      .optional(),
    acceptedAt: z.iso.datetime(),
    actor: z.literal('local-human'),
    reason: z.literal('human-request'),
    managedFiles: z
      .array(
        z
          .string()
          .refine(
            (value) =>
              ATTACHMENT_FILE_ID_PATTERN.test(value) || ATTACHMENT_HASH_PATTERN.test(value),
          ),
      )
      .max(1000)
      .optional(),
  })
  .strict();
export type PurgeFact = z.infer<typeof purgeFactSchema>;

export const purgeCheckpointSchema = z
  .object({
    format: z.literal('botharness-purge'),
    version: z.union([z.literal(1), z.literal(2)]),
    facts: z.array(purgeFactSchema).max(1_000_000),
  })
  .strict();
export type PurgeCheckpoint = z.infer<typeof purgeCheckpointSchema>;

export interface ChannelHistoryItem {
  id: string;
  name: string;
  deletedAt: string;
}

export interface PurgeSource {
  sourceEventId: string;
  messageId: string;
  at: string;
  body: string;
  purgedAt?: string;
  refusal?: string;
  cleanupPending?: number;
}

export interface PurgePreview {
  token: string;
  expiresAt: string;
  channelId: string;
  sourceEventIds: string[];
  placements: { channelId: string; name: string; messageId: string }[];
  admissions: { botSlug: string; state: string }[];
  files: { identity: string; name: string; disposition: 'remove' | 'shared' }[];
  effects: { id: string; kind: 'outbox' | 'assignment' | 'causal-source'; state: string }[];
  derivatives: {
    kind: 'memory' | 'workspace';
    botSlug: string;
    location: string;
    reference?: string;
    tracking: 'recorded' | 'possible' | 'unavailable';
  }[];
}

export const TEXT_CLEANUP_LIMIT = 2000;
export type TextCleanupKeptReason = 'bot-working' | 'delivery-pending' | 'shared';

export interface TextCleanupScope {
  before: string;
  channelIds?: readonly string[] | undefined;
}

export interface TextCleanupPreview {
  token: string;
  expiresAt: string;
  scope: { before: string; channelIds: string[] };
  messages: number;
  bytes: number;
  files: number;
  chats: { channelId: string; name: string; messages: number }[];
  kept: { reason: TextCleanupKeptReason; messages: number }[];
  memoryReferences: number;
  more: boolean;
}

export interface TextCleanupResult {
  messages: number;
  freedBytes: number;
  cleanupPending?: number;
}

export interface ContentPurge {
  redactions(): PurgedPlacement[];
  history(): ChannelHistoryItem[];
  sources(channelId: string, before?: string): { sources: PurgeSource[]; before?: string };
  preview(channelId: string, sourceEventIds: readonly string[]): PurgePreview;
  confirm(
    channelId: string,
    sourceEventIds: readonly string[],
    token: string,
  ): { accepted: number; cleanupPending?: number };
  textPreview(scope: TextCleanupScope): TextCleanupPreview;
  textConfirm(scope: TextCleanupScope, token: string): TextCleanupResult;
  checkpoint(): PurgeCheckpoint;
  withCheckpoint<T>(exportSnapshot: (checkpoint: PurgeCheckpoint) => T): T;
  close(): void;
}

export interface PurgedPlacement {
  sourceEventId: string;
  channelId: string;
  messageId: string;
}

export class ContentPurgeError extends Error {
  constructor(
    readonly code: 'purge-unavailable' | 'purge-scope-unsupported' | 'purge-preview-stale',
    message: string,
  ) {
    super(message);
    this.name = 'ContentPurgeError';
  }
}
