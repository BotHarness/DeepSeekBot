import type { BotAvatarChoice } from './bot-avatar-choice';
import type { CreationTagDraft } from './bot-creation-tags';
import type { ZipImportFile } from './zip-import-file';
import type { ZipImportPreview, ZipImportSource } from './zip-import-upload';

export interface BotCreationDraft extends CreationTagDraft {
  hostId: string;
  displayName: string;
  persona: string;
  description: string;
  source?: GitImportDraft | ZipImportDraft;
  avatar?: BotAvatarChoice;
}

export interface ZipImportDraft extends ZipImportSource {
  defaultsApplied?: true;
  preview?: ZipImportSource & { hostId: string; deviceId: string };
}

export interface GitImportSource {
  kind: 'git';
  gitUrl: string;
  commit: string;
  origin?: 'marketplace';
  listingId?: string;
}

export interface GitImportDraft {
  kind: 'git';
  gitUrl: string;
  origin?: 'marketplace';
  listingId?: string;
  expectedCommit?: string;
  preview?: GitImportSource & { hostId: string; deviceId: string };
}

export interface BlankBotInput {
  displayName: string;
  persona?: string;
  description?: string;
  roles?: string[];
}

export interface BotCreationOperation {
  hostId: string;
  deviceId: string;
  operationKey: string;
  input: BlankBotInput;
  source?: GitImportSource | ZipImportSource;
}

export type CreationReceipt =
  | { operationKey: string; botSlug: string; status: 'reserved' }
  | { operationKey: string; botSlug: string; status: 'created'; channelId: string };

export type CreationRecord = (
  | { kind: 'draft'; draft: BotCreationDraft }
  | {
      kind: 'submitted';
      operation: BotCreationOperation;
      mutationStarted: boolean;
      acknowledged?: boolean;
      avatar?: BotAvatarChoice;
    }
) & { unavailableOperations?: BotCreationOperation[] };

export interface CreationSnapshot {
  loaded: boolean;
  record: CreationRecord;
  busy: boolean;
  receipt?: CreationReceipt | undefined;
  error?: string | undefined;
  transfer?: { bytes: number; total: number } | undefined;
  notice?: 'avatar-failed' | undefined;
}

export class BotCreationFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface BotCreationPort {
  pickZip?(): Promise<ZipImportFile | null>;
  discardZip?(file: ZipImportFile): void;
  previewZip?(
    target: { hostId: string; deviceId: string },
    source: ZipImportSource,
    progress: (bytes: number, total: number) => void,
  ): Promise<ZipImportPreview>;
  preview?(target: { hostId: string; deviceId: string }, gitUrl: string): Promise<GitImportSource>;
  lookup(operation: BotCreationOperation): Promise<CreationReceipt | null>;
  create(
    operation: BotCreationOperation,
    progress?: (bytes: number, total: number) => void,
  ): Promise<CreationReceipt>;
  deviceId(hostId: string): string | undefined;
  applyAvatar?(
    operation: BotCreationOperation,
    receipt: Extract<CreationReceipt, { status: 'created' }>,
    avatar: BotAvatarChoice,
  ): Promise<void>;
}
