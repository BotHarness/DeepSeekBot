import { type HumanContext } from '../humans/context.js';
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
      z.object({ kind: z.literal('remote-bot'), hostId: identity, slug: identity }).strict(),
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
    actor: identity,
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

export const deletedHumanSchema = z
  .object({
    humanId: identity,
    deletedAt: z.iso.datetime(),
    privateChannels: z.array(identity).max(1_000_000).optional(),
  })
  .strict();

export type DeletedHuman = z.infer<typeof deletedHumanSchema>;

export const purgeCheckpointSchema = z
  .object({
    format: z.literal('botharness-purge'),
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    facts: z.array(purgeFactSchema).max(1_000_000),
    deletedHumans: z.array(deletedHumanSchema).max(1_000_000).optional(),
  })
  .strict()
  .refine(
    (value) => !value.deletedHumans?.length || value.version === 3,
    'Deleted Humans require checkpoint version 3',
  );
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

export interface GroupDisbandResult {
  messages: number;
  cleanupPending?: number;
  retained?: number;
}

export interface ContentPurge {
  memberPreview(
    human: HumanContext,
    humanId: string,
  ): { token: string; counts: { channels: number; bots: number; messages: number; files: number } };
  memberConfirm(human: HumanContext, humanId: string, token: string): void;
  redactions(): PurgedPlacement[];
  history(human: HumanContext): ChannelHistoryItem[];
  sources(
    human: HumanContext,
    channelId: string,
    before?: string,
  ): { sources: PurgeSource[]; before?: string };
  preview(human: HumanContext, channelId: string, sourceEventIds: readonly string[]): PurgePreview;
  confirm(
    human: HumanContext,
    channelId: string,
    sourceEventIds: readonly string[],
    token: string,
  ): { accepted: number; cleanupPending?: number };
  textPreview(human: HumanContext, scope: TextCleanupScope): TextCleanupPreview;
  textConfirm(human: HumanContext, scope: TextCleanupScope, token: string): TextCleanupResult;
  disband(human: HumanContext, channelId: string): GroupDisbandResult;
  checkpoint(): PurgeCheckpoint;
  withCheckpoint<T>(exportSnapshot: (checkpoint: PurgeCheckpoint) => T): T;
  close(): void;
}

export interface PurgedPlacement {
  sourceEventId: string;
  channelId: string;
  messageId: string;
  fileIds?: string[];
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
