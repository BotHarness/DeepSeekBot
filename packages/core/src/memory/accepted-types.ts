import type { HumanContext } from '../humans/context.js';
import type { MemoryMarkdown, MemoryMarkdownComparison } from './markdown.js';
import type { MemoryImage, MemoryImageComparison } from './image.js';
import type { StandingUsage } from './soul.js';
import type { MemoryRecoveryCheckpoint } from './recovery.js';

export type MemoryAcceptErrorCode =
  | 'memory-unavailable'
  | 'memory-conflict'
  | 'memory-invalid'
  | 'memory-unknown-commit';

export class MemoryAcceptError extends Error {
  constructor(
    readonly code: MemoryAcceptErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryAcceptError';
  }
}

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  botSlug: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  actorKind: 'human';
  actorId: string;
  causeKind: 'human-repair';
  status: 'started' | 'completed';
  requestedAt: string;
  completedAt: string | null;
}

export interface MemoryAcceptedSnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
  standing: StandingUsage[];
}

export interface MemoryChangeDelta {
  summary: string;
  fromBranch: string;
  toBranch: string;
  fromHead: string;
  toHead: string;
  committedPaths: string[];
  workingPaths: string[];
  clearedPaths: string[];
  personaChanged: boolean;
}

export interface MemoryChangeScan {
  change: MemoryChangeDelta | undefined;
  repositoryRoot: string;
  repositoryIdentity: string;
  observationJson: string;
}

export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  versions: MemoryVersionName[];
  status: 'accepted' | 'pending' | 'needs-repair';
}

export interface MemoryVersionName {
  tag: string;
  name: string;
}

export interface MemoryVersion extends MemoryVersionName {
  sha: string;
  subject: string;
  namedAt: string;
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export interface MemoryGitCommitDiff {
  sha: string;
  subject: string;
  files: {
    path: string;
    status: string;
    images?: MemoryImageComparison;
    markdown?: MemoryMarkdownComparison;
  }[];
  diff: string;
}

export type MemoryWorkingKind = 'staged' | 'unstaged' | 'untracked' | 'current';

export interface MemoryWorkingChange {
  path: string;
  kind: MemoryWorkingKind;
  status: string;
}

export interface MemoryWorkingDiff extends MemoryWorkingChange {
  images?: MemoryImageComparison;
  markdown?: MemoryMarkdownComparison;
  diff: string;
  binary: boolean;
}

export interface MemoryAcceptance {
  prepareTurnAsync(
    ...args: Parameters<MemoryAcceptance['prepareTurn']>
  ): Promise<MemoryChangeDelta | undefined>;
  reconcileTurnAsync(
    ...args: Parameters<MemoryAcceptance['reconcileTurn']>
  ): Promise<MemoryAcceptedCommit[]>;
  abortTurnAsync(...args: Parameters<MemoryAcceptance['abortTurn']>): Promise<void>;
  pendingCommitsAsync(botSlug: string): Promise<MemoryPendingCommits>;
  scanChangesAsync(botSlug: string): Promise<MemoryChangeScan>;
  sourceReferences(sourceEventIds: readonly string[]): Array<{
    sourceEventId: string;
    botSlug: string;
    sha: string;
    memoryDir?: string;
    available: boolean;
  }>;
  continueFromCommit(input: { botSlug: string; sessionId: string; sha: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  switchBranch(input: { botSlug: string; sessionId: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  prepareTurn(
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): MemoryChangeDelta | undefined;
  scanChanges(botSlug: string): MemoryChangeScan;
  pendingCommits(botSlug: string): MemoryPendingCommits;
  advanceCommitCursor(botSlug: string, branch: string, head: string): void;
  preparedObservation(botSlug: string, sessionId: string): MemoryChangeScan;
  reconcileTurn(input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
    preserveObservation?: boolean;
  }): MemoryAcceptedCommit[];
  abortTurn(botSlug: string, sessionId: string, preserveObservation?: boolean): void;
  snapshot(botSlug: string): MemoryAcceptedSnapshot;
  readAccepted(
    botSlug: string,
    path: string,
  ):
    | {
        path: string;
        body: string;
        head: string;
        binary?: boolean;
        image?: MemoryImage;
        markdown?: MemoryMarkdown;
      }
    | undefined;
  markdownImageFile(
    botSlug: string,
    path: string,
    source: string,
    revision: string,
    reference: string,
  ): Buffer;
  imageFile(botSlug: string, path: string, source: string, revision: string): Buffer;
  history(botSlug: string, limit?: number): MemoryAcceptedCommit[];
  diff(botSlug: string, sha: string): { sha: string; diff: string };
  gitGraph(botSlug: string, offset?: number, path?: string): MemoryGitGraph;
  gitCommitDiff(botSlug: string, sha: string): MemoryGitCommitDiff;
  workingChanges(botSlug: string): MemoryWorkingChange[];
  workingDiff(botSlug: string, path: string, kind: MemoryWorkingKind): MemoryWorkingDiff;
  recoveryHistory(botSlug: string): MemoryRecoveryCheckpoint[];
  restoreHuman(
    human: HumanContext,
    input: { botSlug: string; checkpointId: string; expectedCurrentId: string },
  ): {
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  };
  repairHuman(
    human: HumanContext,
    input: {
      botSlug: string;
      expectedHead: string;
      repairId: string;
    },
  ): MemoryRepairEvent;
  saveHuman(
    human: HumanContext,
    input: {
      botSlug: string;
      path: string;
      body: string;
      expectedHead: string;
      editId: string;
    },
  ): MemoryAcceptedCommit;
  restoreCommitHuman(
    human: HumanContext,
    input: {
      botSlug: string;
      sha: string;
      expectedHead: string;
      restoreId: string;
      name?: string;
    },
  ): {
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  };
  nameVersionHuman(input: { botSlug: string; sha: string; name: string }): MemoryVersionName;
  versions(botSlug: string): MemoryVersion[];
  removeVersionNameHuman(input: { botSlug: string; tag: string }): void;
}

export interface MemoryCommitFile {
  path: string;
  added: number | null;
  deleted: number | null;
}

export interface MemoryCommitSummary {
  sha: string;
  subject: string;
  authorName: string;
  authoredAt: string;
  files: MemoryCommitFile[];
  moreFiles: number;
}

export interface MemoryPendingCommits {
  branch: string;
  head: string;
  commits: MemoryCommitSummary[];
}
