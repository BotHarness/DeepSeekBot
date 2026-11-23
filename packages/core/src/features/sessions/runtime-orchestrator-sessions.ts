import { join } from 'node:path';

import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type {
  OrchestratorReplacement,
  NativeSessionArchive,
  BotAgentAdapter,
} from '../../runtime/bot-runtime.js';
import type { SessionOwnership } from '../../sessions/ownership.js';

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

  function currentOrchestratorSessionId(botSlug: string): string | undefined {
    return ports.ownership
      .rootsFor(botSlug, 'orchestrator')
      .find(
        (root) =>
          ports.ownership.contentAvailable(root.sessionId) &&
          ports.sessionArchived?.(root.sessionId) !== true,
      )?.sessionId;
  }

  async function replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
    nextCwd?: () => string | undefined,
  ): Promise<OrchestratorReplacement<T>> {
    const current = ports.currentOrchestratorSessionId(botSlug);
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
    const at = Math.max(ports.now().getTime(), Date.parse(owner.createdAt) + 1);
    const sessionId = ports.createSessionId();
    if (ports.ownership.resolve(sessionId) !== undefined)
      throw new Error('Replacement Orchestrator Session ID is already claimed');
    claimOrchestrator(bot, new Date(at).toISOString(), sessionId, nextCwd?.());
    let value: T;
    try {
      value = body();
    } catch (error) {
      ports.ownership.discardUnstartedOrchestrator(sessionId, bot.slug);
      throw error;
    }
    releaseReplacedOrchestrators(bot.slug, sessionId);
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

  function claimOrchestrator(
    bot: PersonaBotRecord,
    at: string,
    sessionId = ports.createSessionId(),
    cwdReference = orchestratorCwdReference(bot),
  ): string {
    ports.ownership.claim({
      sessionId,
      botSlug: bot.slug,
      rootRole: 'orchestrator',
      ...(cwdReference === undefined ? {} : { cwdReference }),
      at,
    });
    return sessionId;
  }

  function orchestratorCwdReference(bot: PersonaBotRecord): string | undefined {
    return ports.orchestratorCwd?.(bot) ?? cwdReference(bot);
  }

  function cwdReference(bot: PersonaBotRecord): string | undefined {
    const configured = bot.workspaces[0];
    if (configured !== undefined) return configured;
    return ports.workspaceRoot === undefined ? undefined : join(ports.workspaceRoot, bot.slug);
  }

  return {
    captureNativeOrchestratorModel,
    currentOrchestratorSessionId,
    replaceOrchestrator,
    ensureOrchestrator,
  };
}
