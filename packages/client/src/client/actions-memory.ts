import type * as prompts from '@botharness/host-client/prompt-presets';
import { loadBotDetail } from '@botharness/host-client/bots';
import {
  moveMemoryLocation,
  loadMemorySnapshot,
  loadMemoryFile,
  loadMemoryHistory,
  loadMemoryDiff,
  loadMemoryGitGraph,
  loadMemoryGitCommitDiff,
  loadOverviewMemory,
  loadMemoryWorkingChanges,
  loadMemoryWorkingDiff,
  loadMemoryRecoveryHistory,
  restoreMemoryCheckpoint,
  restoreMemoryCommit,
  nameMemoryVersion,
  loadMemoryVersions,
  removeMemoryVersionName,
  saveMemoryFile,
  repairMemory,
  type BridgeCall,
  type MemoryAcceptedCommit,
  type MemorySnapshot,
  type MemoryGitGraph,
  type MemoryGitCommitDiff,
  type MemoryWorkingChange,
  type MemoryWorkingDiff,
  type MemoryWorkingKind,
  type MemoryRecoveryCheckpoint,
  type MemoryVersion,
  type MemoryVersionName,
  type MemoryRepairEvent,
} from './bridge.js';
import type { BridgeActions } from './actions.js';

export interface MemoryActions {
  memoryDirectory(slug: string): Promise<string | undefined>;
  moveMemoryLocation(slug: string, location: string | null): Promise<string>;
  memorySnapshot(channelId: string): Promise<MemorySnapshot>;
  memoryFile(
    channelId: string,
    path: string,
  ): Promise<
    | {
        path: string;
        body: string;
        head: string;
        binary?: boolean;
        image?: import('./bridge.js').MemoryImage;
        markdown?: import('./bridge.js').MemoryMarkdown;
      }
    | undefined
  >;
  memoryHistory(channelId: string): Promise<MemoryAcceptedCommit[]>;
  memoryDiff(channelId: string, sha: string): Promise<string>;
  memoryGitGraph(channelId: string, offset: number): Promise<MemoryGitGraph>;
  memoryGitCommitDiff(channelId: string, sha: string): Promise<MemoryGitCommitDiff>;
  memoryWorkingChanges(channelId: string): Promise<MemoryWorkingChange[]>;
  memoryWorkingDiff(
    channelId: string,
    path: string,
    kind: MemoryWorkingKind,
  ): Promise<MemoryWorkingDiff>;
  memoryRecoveryHistory(channelId: string): Promise<MemoryRecoveryCheckpoint[]>;
  memoryRestore(input: {
    channelId: string;
    checkpointId: string;
    expectedCurrentId: string;
  }): Promise<{ checkpoint: MemoryRecoveryCheckpoint; archivePath: string }>;
  memoryRestoreCommit(input: {
    channelId: string;
    sha: string;
    expectedHead: string;
    restoreId: string;
    name?: string;
  }): Promise<{
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  }>;
  memoryNameVersion(input: {
    channelId: string;
    sha: string;
    name: string;
  }): Promise<MemoryVersionName>;
  memoryRemoveVersionName(input: { channelId: string; tag: string }): Promise<void>;
  memoryVersions(channelId: string): Promise<MemoryVersion[]>;
  memoryRepair(input: {
    channelId: string;
    expectedHead: string;
    repairId: string;
  }): Promise<MemoryRepairEvent>;
  memorySave(input: {
    channelId: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  }): Promise<MemoryAcceptedCommit>;
}

export function createMemoryActions(call: BridgeCall, host: prompts.PromptPresetClient) {
  return {
    async memoryDirectory(slug) {
      const { bot } = await loadBotDetail(host, slug);
      return typeof bot['memoryDir'] === 'string' ? bot['memoryDir'] : undefined;
    },
    moveMemoryLocation: (slug, location) => moveMemoryLocation(call, slug, location),
    memorySnapshot: (channelId) => loadMemorySnapshot(call, channelId),
    memoryFile: (channelId, path) => loadMemoryFile(call, channelId, path),
    memoryHistory: (channelId) => loadMemoryHistory(call, channelId),
    memoryDiff: (channelId, sha) => loadMemoryDiff(call, channelId, sha),
    memoryGitGraph: (channelId, offset) => loadMemoryGitGraph(call, channelId, offset),
    memoryGitCommitDiff: (channelId, sha) => loadMemoryGitCommitDiff(call, channelId, sha),
    overviewMemory: (after) => loadOverviewMemory(call, after),
    memoryWorkingChanges: (channelId) => loadMemoryWorkingChanges(call, channelId),
    memoryWorkingDiff: (channelId, path, kind) =>
      loadMemoryWorkingDiff(call, channelId, path, kind),
    memoryRecoveryHistory: (channelId) => loadMemoryRecoveryHistory(call, channelId),
    memoryRestore: (input) => restoreMemoryCheckpoint(call, input),
    memoryRestoreCommit: (input) => restoreMemoryCommit(call, input),
    memoryNameVersion: (input) => nameMemoryVersion(call, input),
    memoryRemoveVersionName: (input) => removeMemoryVersionName(call, input),
    memoryVersions: (channelId) => loadMemoryVersions(call, channelId),
    memorySave: (input) => saveMemoryFile(call, input),
    memoryRepair: (input) => repairMemory(call, input),
  } satisfies MemoryActions & Pick<BridgeActions, 'overviewMemory'>;
}
