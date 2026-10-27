import { queryOverviewMemory, type OverviewMemory } from './overview.js';
import { createMemoryFiles } from './file-actions.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { createMemoryAcceptance, type MemoryAcceptance } from './accepted.js';
import { createMemoryGit } from './git.js';
import { inspectMemoryRepository, type MemoryRepositoryInspection } from './repository.js';
import { createMemoryStore, type MemoryStore } from './store.js';
import { DEFAULT_STANDING_LIMITS, type StandingLimits } from './soul.js';

export interface MemoryAgentRef {
  session?: { id?: string };
}

export interface MemoryServiceOptions {
  registry: PersonaBotRegistry;
  ownership: SessionOwnership;
  database?: OperationalDatabaseOwner;
  now?: () => Date;
  warn?: (message: string) => void;
}

export interface MemoryService extends MemoryAcceptance, ReturnType<typeof createMemoryFiles> {
  storeForSession(sessionId: string | undefined): MemoryStore | undefined;
  storeForAgent(agent: MemoryAgentRef | undefined): MemoryStore | undefined;

  personaForSession(sessionId: string | undefined): string;

  refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };

  personaPending?(sessionId: string): boolean;

  memoryDirFor(sessionId: string | undefined): string | undefined;

  repositoryFor(sessionId: string | undefined): MemoryRepositoryInspection | undefined;

  overviewActivity?(after?: string): Promise<OverviewMemory>;

  activity?(botSlug: string, sinceIso: string): Array<{ at: string }>;
}

export function createMemoryService(options: MemoryServiceOptions): MemoryService {
  const { registry, ownership } = options;
  const stores = new Map<string, MemoryStore>();
  const acceptance =
    options.database === undefined
      ? undefined
      : createMemoryAcceptance({
          registry,
          ownership,
          database: attachOperationalModule(options.database, 'memory'),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(options.warn === undefined ? {} : { warn: options.warn }),
        });
  const requireAcceptance = (): MemoryAcceptance => {
    if (acceptance === undefined) throw new Error('Memory acceptance storage is unavailable');
    return acceptance;
  };

  const memoryDirFor = (sessionId: string | undefined): string | undefined => {
    if (sessionId === undefined || sessionId.length === 0) return undefined;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return undefined;
    return registry.memoryDirFor(owner.botSlug);
  };

  const repositoryFor = (sessionId: string | undefined): MemoryRepositoryInspection | undefined => {
    const memoryDir = memoryDirFor(sessionId);
    return memoryDir === undefined ? undefined : inspectMemoryRepository({ memoryDir });
  };

  const storeForMemoryDir = (memoryDir: string): MemoryStore => {
    let store = stores.get(memoryDir);
    if (store === undefined) {
      store = createMemoryStore({
        memoryDir,
        ...(options.now === undefined ? {} : { now: options.now }),
      });
      stores.set(memoryDir, store);
    }
    return store;
  };

  const storeForSession = (sessionId: string | undefined): MemoryStore | undefined => {
    const memoryDir = memoryDirFor(sessionId);
    if (memoryDir === undefined) return undefined;
    if (inspectMemoryRepository({ memoryDir }).state !== 'ready') return undefined;
    return storeForMemoryDir(memoryDir);
  };

  const limitsForSession = (sessionId: string): StandingLimits => {
    const owner = ownership.resolve(sessionId);
    const record = owner === undefined ? undefined : registry.get(owner.botSlug);
    return record?.standingLimits ?? DEFAULT_STANDING_LIMITS;
  };

  const personaForSession = (sessionId: string | undefined): string => {
    if (sessionId === undefined || sessionId.length === 0) return '';
    const recorded = ownership.personaSnapshot(sessionId);
    if (recorded !== undefined) return recorded.body;
    const store = storeForSession(sessionId);
    if (store === undefined) return '';
    const body = store.standingPrompt(limitsForSession(sessionId));
    const at = (options.now ?? (() => new Date()))().toISOString();
    return ownership.recordPersonaSnapshot(sessionId, body, at).body;
  };

  const refreshPersonaAfterCompaction = (
    botSlug: string,
    sessionId: string,
  ): { refreshed: boolean } => {
    const owner = ownership.resolve(sessionId);
    if (owner === undefined || owner.botSlug !== botSlug) return { refreshed: false };
    const store = storeForSession(sessionId);
    if (store === undefined) return { refreshed: false };
    const current = store.standingPrompt(limitsForSession(sessionId));
    if (ownership.personaSnapshot(sessionId)?.body === current) return { refreshed: false };
    ownership.refreshPersonaSnapshot(
      sessionId,
      current,
      (options.now ?? (() => new Date()))().toISOString(),
    );
    return { refreshed: true };
  };

  const personaPending = (sessionId: string): boolean => {
    const recorded = ownership.personaSnapshot(sessionId);
    const store = storeForSession(sessionId);
    if (recorded === undefined || store === undefined) return false;
    return recorded.body !== store.standingPrompt(limitsForSession(sessionId));
  };

  return {
    sourceReferences: (ids) => requireAcceptance().sourceReferences(ids),
    ...createMemoryFiles(registry),
    continueFromCommit: (input) => requireAcceptance().continueFromCommit(input),
    switchBranch: (input) => requireAcceptance().switchBranch(input),
    prepareTurn: (botSlug, sessionId, options) =>
      requireAcceptance().prepareTurn(botSlug, sessionId, options),
    scanChanges: (botSlug) => requireAcceptance().scanChanges(botSlug),
    pendingCommits: (botSlug) => requireAcceptance().pendingCommits(botSlug),
    advanceCommitCursor: (botSlug, branch, head) =>
      requireAcceptance().advanceCommitCursor(botSlug, branch, head),
    preparedObservation: (botSlug, sessionId) =>
      requireAcceptance().preparedObservation(botSlug, sessionId),
    reconcileTurn: (input) => requireAcceptance().reconcileTurn(input),
    abortTurn: (botSlug, sessionId, preserveObservation) =>
      requireAcceptance().abortTurn(botSlug, sessionId, preserveObservation),
    snapshot: (botSlug) => requireAcceptance().snapshot(botSlug),
    readAccepted: (botSlug, path) => requireAcceptance().readAccepted(botSlug, path),
    markdownImageFile: (botSlug, path, source, revision, reference) =>
      requireAcceptance().markdownImageFile(botSlug, path, source, revision, reference),
    imageFile: (botSlug, path, source, revision) =>
      requireAcceptance().imageFile(botSlug, path, source, revision),
    history: (botSlug, limit) => requireAcceptance().history(botSlug, limit),
    diff: (botSlug, sha) => requireAcceptance().diff(botSlug, sha),
    gitGraph: (botSlug, offset, path) => requireAcceptance().gitGraph(botSlug, offset, path),
    gitCommitDiff: (botSlug, sha) => requireAcceptance().gitCommitDiff(botSlug, sha),
    workingChanges: (botSlug) => requireAcceptance().workingChanges(botSlug),
    workingDiff: (botSlug, path, kind) => requireAcceptance().workingDiff(botSlug, path, kind),
    recoveryHistory: (botSlug) => requireAcceptance().recoveryHistory(botSlug),
    restoreHuman: (input) => requireAcceptance().restoreHuman(input),
    saveHuman: (input) => requireAcceptance().saveHuman(input),
    restoreCommitHuman: (input) => requireAcceptance().restoreCommitHuman(input),
    nameVersionHuman: (input) => requireAcceptance().nameVersionHuman(input),
    versions: (botSlug) => requireAcceptance().versions(botSlug),
    removeVersionNameHuman: (input) => requireAcceptance().removeVersionNameHuman(input),
    repairHuman: (input) => requireAcceptance().repairHuman(input),
    memoryDirFor,
    repositoryFor,
    overviewActivity: (after) =>
      queryOverviewMemory(registry, options.now?.() ?? new Date(), after),
    activity: (botSlug, sinceIso) => {
      const memoryDir = registry.memoryDirFor(botSlug);
      return memoryDir === undefined ? [] : createMemoryGit(memoryDir).activitySince(sinceIso);
    },
    personaForSession,
    refreshPersonaAfterCompaction,
    personaPending,
    storeForSession,
    storeForAgent: (agent) => storeForSession(agent?.session?.id),
  };
}
