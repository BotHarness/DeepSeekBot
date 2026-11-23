import { join } from 'node:path';

import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type {
  OrchestratorReplacement,
  NativeSessionArchive,
  BotAgentAdapter,
} from '../../runtime/bot-runtime.js';
import type {
  PendingOrchestratorReplacement,
  SessionOwnership,
  SessionOwnershipRecord,
} from '../../sessions/ownership.js';

export const BOT_BUSY = {
  outcome: 'refused',
  code: 'bot-busy',
  message: 'This Bot is working right now; wait for it to finish, then try again.',
} as const;

interface OrchestratorSessionsPorts {
  agents: BotAgentAdapter;
  closed: () => boolean;
  createSessionId: () => string;
  currentOrchestratorSessionId: (botSlug: string) => string | undefined;
  now: () => Date;
  orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  ownership: SessionOwnership;
  preparedOrchestrators: Set<string>;
  registry: PersonaBotRegistry;
  sessionArchive: (() => NativeSessionArchive | undefined) | undefined;
  sessionArchived: ((sessionId: string) => boolean) | undefined;
  warn: ((message: string) => void) | undefined;
  workspaceRoot: string | undefined;
}

export function createOrchestratorSessions(ports: OrchestratorSessionsPorts) {
  function captureNativeOrchestratorModel(sessionId: string): void {
    if (ports.closed() || ports.preparedOrchestrators.has(sessionId)) return;
    const owner = ports.ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return;
    const bot = ports.registry.get(owner.botSlug);
    if (
      bot === undefined ||
      bot.paused ||
      ports.currentOrchestratorSessionId(bot.slug) !== sessionId
    )
      return;
    ports.agents.captureNativeOrchestratorModel?.(sessionId, bot);
  }

  function latestAvailableOrchestrator(botSlug: string): SessionOwnershipRecord | undefined {
    return ports.ownership
      .rootsFor(botSlug, 'orchestrator')
      .find(
        (root) =>
          ports.ownership.contentAvailable(root.sessionId) &&
          ports.sessionArchived?.(root.sessionId) !== true,
      );
  }

  function currentOrchestratorSessionId(botSlug: string): string | undefined {
    const root = latestAvailableOrchestrator(botSlug);
    if (root === undefined) return undefined;
    const bot = ports.registry.get(botSlug);
    const cwd = bot === undefined ? undefined : orchestratorCwdReference(bot);
    if (cwd === undefined || root.cwdReference === cwd) return root.sessionId;
    if (
      ports.ownership
        .pendingOrchestratorReplacements(botSlug)
        .some((replacement) => replacement.cwdReference === cwd)
    )
      return undefined;
    return root.sessionId;
  }

  async function replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
    nextCwd?: () => string | undefined,
  ): Promise<OrchestratorReplacement<T>> {
    const current =
      ports.currentOrchestratorSessionId(botSlug) ??
      (nextCwd === undefined ? undefined : latestAvailableOrchestrator(botSlug)?.sessionId);
    if (current === undefined) return { outcome: 'replaced', value: body() };
    const archive = ports.sessionArchive?.();
    if (archive === undefined) throw new Error('DSH Session archive is unavailable');
    try {
      await archive.archiveSession(current);
    } catch (error) {
      if (error instanceof Error && error.name === 'WorkspaceActiveSessionError') return BOT_BUSY;
      if (!(error instanceof Error && error.name === 'WorkspaceUnknownSessionError')) throw error;
      return {
        outcome: 'replaced',
        value: supersedeUnsavedOrchestrator(current, body, nextCwd),
      };
    }
    await ports.agents.releaseSession?.(current).catch(() =>
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'orchestrator-release-failed',
          botSlug,
          sessionId: current,
        }),
      ),
    );
    try {
      return { outcome: 'replaced', value: body() };
    } catch (error) {
      await archive.unarchiveSession(current);
      throw error;
    }
  }

  function supersedeUnsavedOrchestrator<T>(
    unsaved: string,
    body: () => T,
    nextCwd?: () => string | undefined,
  ): T {
    const owner = ports.ownership.resolve(unsaved);
    const bot = owner === undefined ? undefined : ports.registry.get(owner.botSlug);
    if (owner === undefined || bot === undefined) throw new Error('Unknown Orchestrator Session');
    const sessionId = ports.createSessionId();
    const previousCwdReference = orchestratorCwdReference(bot);
    const cwdReference = nextCwd?.() ?? previousCwdReference;
    ports.ownership.reserveOrchestratorReplacement({
      sessionId,
      botSlug: bot.slug,
      cwdReference,
      previousCwdReference,
      createdAt: nextRootCreatedAt(bot.slug, ports.now().toISOString()),
    });
    let value: T;
    try {
      value = body();
    } catch (error) {
      try {
        ports.ownership.discardOrchestratorReplacement(sessionId);
      } catch {
        warnReplacementFailure('orchestrator-replacement-discard-failed', bot.slug, sessionId);
      }
      throw error;
    }
    try {
      try {
        ports.ownership.commitOrchestratorReplacement(sessionId);
      } catch {
        ports.ownership.commitOrchestratorReplacement(sessionId);
      }
      releaseReplacedOrchestrators(bot.slug, sessionId);
    } catch {
      warnReplacementFailure('orchestrator-replacement-publication-failed', bot.slug, sessionId);
    }
    return value;
  }

  function ensureOrchestrator(
    bot: PersonaBotRecord,
    at: string,
  ): { sessionId: string; resume: boolean } {
    const existing = ports.currentOrchestratorSessionId(bot.slug);
    const orchestrator =
      existing === undefined
        ? { sessionId: claimOrchestrator(bot, at), resume: false }
        : { sessionId: existing, resume: true };
    releaseReplacedOrchestrators(bot.slug, orchestrator.sessionId);
    return orchestrator;
  }

  function releaseReplacedOrchestrators(botSlug: string, current: string): void {
    const release = ports.agents.releaseSession?.bind(ports.agents);
    if (release === undefined) return;
    for (const root of ports.ownership.rootsFor(botSlug, 'orchestrator')) {
      if (root.sessionId === current) continue;
      void release(root.sessionId).catch(() =>
        ports.warn?.(
          JSON.stringify({
            component: 'bot-runtime',
            event: 'orchestrator-release-failed',
            botSlug,
            sessionId: root.sessionId,
          }),
        ),
      );
    }
  }

  function claimOrchestrator(bot: PersonaBotRecord, at: string): string {
    const sessionId = ports.createSessionId();
    const cwdReference = orchestratorCwdReference(bot);
    ports.ownership.claim({
      sessionId,
      botSlug: bot.slug,
      rootRole: 'orchestrator',
      ...(cwdReference === undefined ? {} : { cwdReference }),
      at: nextRootCreatedAt(bot.slug, at),
    });
    return sessionId;
  }

  function nextRootCreatedAt(botSlug: string, at: string): string {
    const newestClaim = ports.ownership.rootsFor(botSlug, 'orchestrator')[0]?.createdAt ?? '';
    const newestReservation =
      ports.ownership.pendingOrchestratorReplacements(botSlug)[0]?.createdAt ?? '';
    const latest = newestClaim > newestReservation ? newestClaim : newestReservation;
    if (latest < at) return at;
    return new Date(Date.parse(latest) + 1).toISOString();
  }

  function orchestratorCwdReference(bot: PersonaBotRecord): string | undefined {
    return ports.orchestratorCwd?.(bot) ?? cwdReference(bot);
  }

  function cwdReference(bot: PersonaBotRecord): string | undefined {
    const configured = bot.workspaces[0];
    if (configured !== undefined) return configured;
    return ports.workspaceRoot === undefined ? undefined : join(ports.workspaceRoot, bot.slug);
  }

  function reconcilePendingOrchestratorReplacements(): void {
    let pending: PendingOrchestratorReplacement[];
    try {
      pending = ports.ownership.pendingOrchestratorReplacements();
    } catch {
      warnReplacementFailure('orchestrator-replacement-recovery-failed');
      return;
    }
    for (const { botSlug, sessionId, cwdReference, previousCwdReference, createdAt } of pending) {
      try {
        const bot = ports.registry.get(botSlug);
        const latest = ports.ownership.rootsFor(botSlug, 'orchestrator')[0];
        if (
          bot !== undefined &&
          cwdReference !== undefined &&
          orchestratorCwdReference(bot) === cwdReference &&
          previousCwdReference !== cwdReference &&
          (latest === undefined || latest.createdAt < createdAt)
        ) {
          ports.ownership.commitOrchestratorReplacement(sessionId);
          releaseReplacedOrchestrators(botSlug, sessionId);
        } else {
          ports.ownership.discardOrchestratorReplacement(sessionId);
        }
      } catch {
        warnReplacementFailure('orchestrator-replacement-recovery-failed', botSlug, sessionId);
      }
    }
  }

  function warnReplacementFailure(event: string, botSlug?: string, sessionId?: string): void {
    ports.warn?.(JSON.stringify({ component: 'bot-runtime', event, botSlug, sessionId }));
  }

  return {
    captureNativeOrchestratorModel,
    reconcilePendingOrchestratorReplacements,
    currentOrchestratorSessionId,
    replaceOrchestrator,
    ensureOrchestrator,
  };
}
