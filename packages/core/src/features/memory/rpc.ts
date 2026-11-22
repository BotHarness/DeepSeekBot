import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { OverviewMemory } from '../../memory/overview.js';
import type { MemoryFileTarget } from '../../memory/file-actions.js';
import type {
  MemoryAcceptedCommit,
  MemoryAcceptedSnapshot,
  MemoryGitGraph,
  MemoryVersion,
  MemoryVersionName,
  MemoryGitCommitDiff,
  MemoryWorkingChange,
  MemoryWorkingDiff,
  MemoryWorkingKind,
  MemoryRepairEvent,
} from '../../memory/accepted.js';
import type { MemoryRecoveryCheckpoint } from '../../memory/recovery.js';
import type { MemoryBridgeMethods } from './methods.js';

export function memoryMove(
  methods: MemoryBridgeMethods,
  slug: string,
  location: string | null,
): Promise<{ memoryDir: string; moved: boolean; leftover?: string }> {
  return unwrapAsync(methods.memoryMove({ slug, location }));
}

export function memoryFileTarget(
  methods: MemoryBridgeMethods,
  slug: string,
  path: string,
): { target: MemoryFileTarget } {
  return unwrap(methods.memoryFileTarget({ slug, path }));
}

export function memoryImage(
  methods: MemoryBridgeMethods,
  slug: string,
  path: string,
  source: string,
  revision: string,
  reference?: string,
): { mime: string; dataBase64: string } {
  return unwrap(
    methods.memoryImage({
      slug,
      path,
      source,
      revision,
      ...(reference === undefined ? {} : { reference }),
    }),
  );
}

export function memorySnapshot(
  methods: MemoryBridgeMethods,
  channelId: string,
): { snapshot: MemoryAcceptedSnapshot } {
  return unwrap(methods.memorySnapshot({ channelId }));
}

export function memoryFile(
  methods: MemoryBridgeMethods,
  channelId: string,
  path: string,
): {
  file?: {
    path: string;
    body: string;
    head: string;
    binary?: boolean;
    image?: import('../../memory/image.js').MemoryImage;
    markdown?: import('../../memory/markdown.js').MemoryMarkdown;
  };
} {
  return unwrap(methods.memoryFile({ channelId, path }));
}

export function memoryHistory(
  methods: MemoryBridgeMethods,
  channelId: string,
): { commits: MemoryAcceptedCommit[] } {
  return unwrap(methods.memoryHistory({ channelId }));
}

export function memoryDiff(
  methods: MemoryBridgeMethods,
  channelId: string,
  sha: string,
): { sha: string; diff: string } {
  return unwrap(methods.memoryDiff({ channelId, sha }));
}

export function memoryGitGraph(
  methods: MemoryBridgeMethods,
  channelId: string,
  offset: number,
): MemoryGitGraph {
  return unwrap(methods.memoryGitGraph({ channelId, offset }));
}

export function memoryGitCommitDiff(
  methods: MemoryBridgeMethods,
  channelId: string,
  sha: string,
): MemoryGitCommitDiff {
  return unwrap(methods.memoryGitCommitDiff({ channelId, sha }));
}

export function memoryWorkingChanges(
  methods: MemoryBridgeMethods,
  channelId: string,
): { changes: MemoryWorkingChange[] } {
  return unwrap(methods.memoryWorkingChanges({ channelId }));
}

export function memoryWorkingDiff(
  methods: MemoryBridgeMethods,
  channelId: string,
  path: string,
  kind: MemoryWorkingKind,
): MemoryWorkingDiff {
  return unwrap(methods.memoryWorkingDiff({ channelId, path, kind }));
}

export function memoryRecoveryHistory(
  methods: MemoryBridgeMethods,
  channelId: string,
): {
  checkpoints: MemoryRecoveryCheckpoint[];
} {
  return unwrap(methods.memoryRecoveryHistory({ channelId }));
}

export function memoryRestore(
  methods: MemoryBridgeMethods,
  channelId: string,
  checkpointId: string,
  expectedCurrentId: string,
): {
  checkpoint: MemoryRecoveryCheckpoint;
  archivePath: string;
} {
  return unwrap(
    methods.memoryRestore({
      channelId,
      checkpointId,
      expectedCurrentId,
    }),
  );
}

export function memorySave(
  methods: MemoryBridgeMethods,
  channelId: string,
  path: string,
  body: string,
  expectedHead: string,
  editId: string,
): { commit: MemoryAcceptedCommit } {
  return unwrap(methods.memorySave({ channelId, path, body, expectedHead, editId }));
}

export function memoryRestoreCommit(
  methods: MemoryBridgeMethods,
  channelId: string,
  sha: string,
  expectedHead: string,
  restoreId: string,
  name?: string,
): {
  head: string;
  backup: string | null;
  version: MemoryVersionName | null;
  saved: MemoryRecoveryCheckpoint;
} {
  return unwrap(
    methods.memoryRestoreCommit({
      channelId,
      sha,
      expectedHead,
      restoreId,
      name,
    }),
  );
}

export function memoryVersions(
  methods: MemoryBridgeMethods,
  channelId: string,
): { versions: MemoryVersion[] } {
  return unwrap(methods.memoryVersions({ channelId }));
}

export function memoryNameVersion(
  methods: MemoryBridgeMethods,
  channelId: string,
  sha: string,
  name: string,
): { version: MemoryVersionName } {
  return unwrap(methods.memoryNameVersion({ channelId, sha, name }));
}

export function memoryRemoveVersionName(
  methods: MemoryBridgeMethods,
  channelId: string,
  tag: string,
): { removed: true } {
  return unwrap(methods.memoryRemoveVersionName({ channelId, tag }));
}

export function memoryRepair(
  methods: MemoryBridgeMethods,
  channelId: string,
  expectedHead: string,
  repairId: string,
): { repair: MemoryRepairEvent } {
  return unwrap(methods.memoryRepair({ channelId, expectedHead, repairId }));
}

export function overviewMemory(
  methods: MemoryBridgeMethods,
  after?: string,
): Promise<OverviewMemory> {
  return unwrapAsync(methods.overviewMemory({ after }));
}

export const memoryRpcMethods = {
  memoryMove(
    slug: string,
    location: string | null,
  ): Promise<{ memoryDir: string; moved: boolean; leftover?: string }> {
    return memoryMove(this.methods, slug, location);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const memoryServiceRpc = {
  memoryFileTarget(slug: string, path: string): { target: MemoryFileTarget } {
    return memoryFileTarget(this.methods, slug, path);
  },

  memoryImage(
    slug: string,
    path: string,
    source: string,
    revision: string,
    reference?: string,
  ): { mime: string; dataBase64: string } {
    return memoryImage(this.methods, slug, path, source, revision, reference);
  },

  memorySnapshot(channelId: string): { snapshot: MemoryAcceptedSnapshot } {
    return memorySnapshot(this.methods, channelId);
  },

  memoryFile(
    channelId: string,
    path: string,
  ): {
    file?: {
      path: string;
      body: string;
      head: string;
      binary?: boolean;
      image?: import('../../memory/image.js').MemoryImage;
      markdown?: import('../../memory/markdown.js').MemoryMarkdown;
    };
  } {
    return memoryFile(this.methods, channelId, path);
  },

  memoryHistory(channelId: string): { commits: MemoryAcceptedCommit[] } {
    return memoryHistory(this.methods, channelId);
  },

  memoryDiff(channelId: string, sha: string): { sha: string; diff: string } {
    return memoryDiff(this.methods, channelId, sha);
  },

  memoryGitGraph(channelId: string, offset: number): MemoryGitGraph {
    return memoryGitGraph(this.methods, channelId, offset);
  },

  memoryGitCommitDiff(channelId: string, sha: string): MemoryGitCommitDiff {
    return memoryGitCommitDiff(this.methods, channelId, sha);
  },

  memoryWorkingChanges(channelId: string): { changes: MemoryWorkingChange[] } {
    return memoryWorkingChanges(this.methods, channelId);
  },

  memoryWorkingDiff(channelId: string, path: string, kind: MemoryWorkingKind): MemoryWorkingDiff {
    return memoryWorkingDiff(this.methods, channelId, path, kind);
  },

  memoryRecoveryHistory(channelId: string): {
    checkpoints: MemoryRecoveryCheckpoint[];
  } {
    return memoryRecoveryHistory(this.methods, channelId);
  },

  memoryRestore(
    channelId: string,
    checkpointId: string,
    expectedCurrentId: string,
  ): {
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  } {
    return memoryRestore(this.methods, channelId, checkpointId, expectedCurrentId);
  },

  memoryRestoreCommit(
    channelId: string,
    sha: string,
    expectedHead: string,
    restoreId: string,
    name?: string,
  ): {
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  } {
    return memoryRestoreCommit(this.methods, channelId, sha, expectedHead, restoreId, name);
  },

  memoryNameVersion(channelId: string, sha: string, name: string): { version: MemoryVersionName } {
    return memoryNameVersion(this.methods, channelId, sha, name);
  },

  memoryVersions(channelId: string): { versions: MemoryVersion[] } {
    return memoryVersions(this.methods, channelId);
  },

  memoryRemoveVersionName(channelId: string, tag: string): { removed: true } {
    return memoryRemoveVersionName(this.methods, channelId, tag);
  },

  memorySave(
    channelId: string,
    path: string,
    body: string,
    expectedHead: string,
    editId: string,
  ): { commit: MemoryAcceptedCommit } {
    return memorySave(this.methods, channelId, path, body, expectedHead, editId);
  },

  memoryRepair(
    channelId: string,
    expectedHead: string,
    repairId: string,
  ): { repair: MemoryRepairEvent } {
    return memoryRepair(this.methods, channelId, expectedHead, repairId);
  },

  overviewMemory(after?: string): Promise<OverviewMemory> {
    return overviewMemory(this.methods, after);
  },
} satisfies ThisType<BridgeRpcReceiver>;
