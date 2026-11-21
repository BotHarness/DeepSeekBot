import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import { loadMemoryActivity } from '@botharness/host-client/usage';
import {
  loadMemoryFile as loadHostMemoryFile,
  loadMemoryGitCommitDiff as loadHostMemoryGitCommitDiff,
  loadMemoryGitGraph as loadHostMemoryGitGraph,
  loadMemorySnapshot as loadHostMemorySnapshot,
  parseMemoryCommit,
  parseVersionNames,
  saveMemoryFile as saveHostMemoryFile,
  type MemoryAcceptedCommit,
  type MemoryFile,
  type MemoryGitCommitDiff,
  type MemoryGitGraph,
  type MemoryImageComparison,
  type MemoryMarkdownComparison,
  type MemorySnapshot,
  type MemoryVersionName,
} from '@botharness/host-client/memory';
import type { HostFileTarget } from '../../host-file-actions.js';
import type { OverviewMemory } from '@botharness/host-client/usage';

export async function moveMemoryLocation(
  call: BridgeCall,
  slug: string,
  location: string | null,
): Promise<string> {
  const value = asRecord(await unwrap(call, 'memoryMove', { slug, location }));
  const memoryDir = value?.['memoryDir'];
  if (typeof memoryDir !== 'string') throw new Error('Memory location is invalid');
  return memoryDir;
}

export interface MemoryVersion extends MemoryVersionName {
  sha: string;
  subject: string;
  namedAt: string;
}

export async function loadMemoryVersions(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryVersion[]> {
  const response = asRecord(await unwrap(call, 'memoryVersions', { channelId }));
  const versions = response?.['versions'];
  if (!Array.isArray(versions)) throw new Error('invalid Memory versions');
  return versions.flatMap((item) => {
    const version = asRecord(item);
    return typeof version?.['tag'] === 'string' &&
      typeof version['name'] === 'string' &&
      typeof version['sha'] === 'string' &&
      typeof version['subject'] === 'string' &&
      typeof version['namedAt'] === 'string'
      ? [
          {
            tag: version['tag'],
            name: version['name'],
            sha: version['sha'],
            subject: version['subject'],
            namedAt: version['namedAt'],
          },
        ]
      : [];
  });
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

export interface MemoryRecoveryCheckpoint {
  id: string;
  branch: string;
  head: string;
  indexTree: string;
  workingTree: string;
  origin: 'host-observation' | 'agent-session' | 'human-command';
  originId: string;
  causeKind: 'memory-scan' | 'source-event' | 'human-edit' | 'turn-abort' | 'human-restore';
  causeId: string;
  capturedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  status: 'started' | 'completed';
  completedAt: string | null;
}

export async function loadMemorySnapshot(
  call: BridgeCall,
  channelId: string,
): Promise<MemorySnapshot> {
  return loadHostMemorySnapshot(bridgeHost(call), channelId);
}

export async function loadMemoryFileTarget(
  call: BridgeCall,
  slug: string,
  path: string,
): Promise<HostFileTarget> {
  const response = asRecord(await unwrap(call, 'memoryFileTarget', { slug, path }));
  const target = asRecord(response?.['target']);
  if (
    typeof target?.['path'] !== 'string' ||
    typeof target['relativePath'] !== 'string' ||
    !['file', 'directory'].includes(String(target['kind']))
  )
    throw new Error('Invalid Memory file target');
  return target as unknown as HostFileTarget;
}

export async function loadMemoryFile(
  call: BridgeCall,
  channelId: string,
  path: string,
): Promise<MemoryFile | undefined> {
  return loadHostMemoryFile(bridgeHost(call), channelId, path);
}

export async function loadMemoryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryAcceptedCommit[]> {
  const response = asRecord(await unwrap(call, 'memoryHistory', { channelId }));
  const commits = response?.['commits'];
  if (!Array.isArray(commits)) throw new Error('invalid Memory history');
  return commits.map(parseMemoryCommit);
}

export async function loadMemoryDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<string> {
  const response = asRecord(await unwrap(call, 'memoryDiff', { channelId, sha }));
  if (response?.['sha'] !== sha || typeof response['diff'] !== 'string') {
    throw new Error('invalid Memory diff');
  }
  return response['diff'];
}

export async function loadMemoryGitGraph(
  call: BridgeCall,
  channelId: string,
  offset: number,
): Promise<MemoryGitGraph> {
  return loadHostMemoryGitGraph(bridgeHost(call), channelId, offset);
}

export async function loadMemoryGitCommitDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<MemoryGitCommitDiff> {
  return loadHostMemoryGitCommitDiff(bridgeHost(call), channelId, sha);
}

function parseWorkingChange(value: unknown, allowCurrent = false): MemoryWorkingChange {
  const change = asRecord(value);
  if (
    typeof change?.['path'] !== 'string' ||
    !['staged', 'unstaged', 'untracked', ...(allowCurrent ? ['current'] : [])].includes(
      String(change['kind']),
    ) ||
    typeof change['status'] !== 'string'
  )
    throw new Error('invalid Memory working change');
  return change as unknown as MemoryWorkingChange;
}

export async function loadMemoryWorkingChanges(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryWorkingChange[]> {
  const response = asRecord(await unwrap(call, 'memoryWorkingChanges', { channelId }));
  if (!Array.isArray(response?.['changes'])) throw new Error('invalid Memory working changes');
  return response['changes'].map((change: unknown) => parseWorkingChange(change));
}

export async function loadMemoryWorkingDiff(
  call: BridgeCall,
  channelId: string,
  path: string,
  kind: MemoryWorkingKind,
): Promise<MemoryWorkingDiff> {
  const response = asRecord(await unwrap(call, 'memoryWorkingDiff', { channelId, path, kind }));
  parseWorkingChange(response, true);
  if (
    response?.['path'] !== path ||
    response['kind'] !== kind ||
    typeof response['diff'] !== 'string' ||
    typeof response['binary'] !== 'boolean'
  )
    throw new Error('invalid Memory working diff');
  return response as unknown as MemoryWorkingDiff;
}

export async function loadMemoryRecoveryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryRecoveryCheckpoint[]> {
  const response = asRecord(await unwrap(call, 'memoryRecoveryHistory', { channelId }));
  if (!Array.isArray(response?.['checkpoints'])) throw new Error('invalid Memory checkpoints');
  return response['checkpoints'].map((value: unknown) => {
    const point = asRecord(value);
    if (
      point === undefined ||
      typeof point['id'] !== 'string' ||
      typeof point['branch'] !== 'string' ||
      typeof point['head'] !== 'string' ||
      typeof point['indexTree'] !== 'string' ||
      typeof point['workingTree'] !== 'string' ||
      typeof point['origin'] !== 'string' ||
      typeof point['originId'] !== 'string' ||
      typeof point['causeKind'] !== 'string' ||
      typeof point['causeId'] !== 'string' ||
      typeof point['capturedAt'] !== 'string'
    )
      throw new Error('invalid Memory checkpoint');
    return point as unknown as MemoryRecoveryCheckpoint;
  });
}

export async function restoreMemoryCheckpoint(
  call: BridgeCall,
  input: { channelId: string; checkpointId: string; expectedCurrentId: string },
): Promise<{ checkpoint: MemoryRecoveryCheckpoint; archivePath: string }> {
  const response = asRecord(await unwrap(call, 'memoryRestore', input));
  const checkpoint = asRecord(response?.['checkpoint']);
  if (
    checkpoint === undefined ||
    typeof checkpoint['id'] !== 'string' ||
    typeof response?.['archivePath'] !== 'string'
  )
    throw new Error('invalid Memory restore result');
  return {
    checkpoint: checkpoint as unknown as MemoryRecoveryCheckpoint,
    archivePath: response['archivePath'] as string,
  };
}

export async function restoreMemoryCommit(
  call: BridgeCall,
  input: {
    channelId: string;
    sha: string;
    expectedHead: string;
    restoreId: string;
    name?: string;
  },
): Promise<{
  head: string;
  backup: string | null;
  version: MemoryVersionName | null;
  saved: MemoryRecoveryCheckpoint;
}> {
  const response = asRecord(await unwrap(call, 'memoryRestoreCommit', input));
  const saved = asRecord(response?.['saved']);
  if (
    saved === undefined ||
    typeof saved['id'] !== 'string' ||
    typeof response?.['head'] !== 'string' ||
    (response['backup'] !== null && typeof response['backup'] !== 'string')
  )
    throw new Error('invalid Memory restore result');
  return {
    head: response['head'] as string,
    backup: response['backup'] as string | null,
    version: parseVersionNames([response['version']])[0] ?? null,
    saved: saved as unknown as MemoryRecoveryCheckpoint,
  };
}

export async function nameMemoryVersion(
  call: BridgeCall,
  input: { channelId: string; sha: string; name: string },
): Promise<MemoryVersionName> {
  const response = asRecord(await unwrap(call, 'memoryNameVersion', input));
  const version = parseVersionNames([response?.['version']])[0];
  if (version === undefined) throw new Error('invalid Memory version name result');
  return version;
}

export async function removeMemoryVersionName(
  call: BridgeCall,
  input: { channelId: string; tag: string },
): Promise<void> {
  await unwrap(call, 'memoryRemoveVersionName', input);
}

export async function saveMemoryFile(
  call: BridgeCall,
  input: {
    channelId: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  },
): Promise<MemoryAcceptedCommit> {
  return saveHostMemoryFile(bridgeHost(call), input);
}

export async function repairMemory(
  call: BridgeCall,
  input: { channelId: string; expectedHead: string; repairId: string },
): Promise<MemoryRepairEvent> {
  const response = asRecord(await unwrap(call, 'memoryRepair', input));
  const repair = asRecord(response?.['repair']);
  if (
    repair === undefined ||
    typeof repair['id'] !== 'string' ||
    typeof repair['acceptedHeadSha'] !== 'string' ||
    typeof repair['provisionalHeadSha'] !== 'string' ||
    typeof repair['backupPath'] !== 'string' ||
    repair['status'] !== 'completed' ||
    typeof repair['completedAt'] !== 'string'
  )
    throw new Error('invalid Memory repair result');
  return repair as unknown as MemoryRepairEvent;
}

export async function loadOverviewMemory(
  call: BridgeCall,
  after?: string,
): Promise<OverviewMemory> {
  return loadMemoryActivity(bridgeHost(call), after);
}
