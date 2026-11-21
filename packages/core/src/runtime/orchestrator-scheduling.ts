import type { createActivityEvents } from '../features/activity/events.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotHoldCause } from './bot-runtime.js';

interface OrchestratorSchedulingPorts {
  activeTurns: Map<string, Promise<void>>;
  activityEvents: ReturnType<typeof createActivityEvents>;
  checkHarvestReadiness: (botSlug: string) => void;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  held: Map<string, BotHoldCause>;
  inboxFactoryRetries: Map<string, { attempts: number; timer?: NodeJS.Timeout }>;
  pendingHarvests: Set<string>;
  recoverPendingDigests: (botSlug?: string) => void;
  registry: PersonaBotRegistry;
  runHarvestTurn: (botSlug: string) => Promise<void>;
  tails: Map<string, Promise<unknown>>;
  warn: ((message: string) => void) | undefined;
}

export function createOrchestratorScheduling(ports: OrchestratorSchedulingPorts) {
  function enqueue(turnKey: string, task: () => Promise<void>): Promise<void> {
    const previous = ports.tails.get(turnKey) ?? Promise.resolve();
    let run: Promise<void>;
    const invoke = (): Promise<void> => {
      if (ports.registry.get(turnKey) === undefined) return Promise.resolve();
      ports.activeTurns.set(turnKey, run);
      return task();
    };
    run = previous.then(invoke, invoke);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    ports.tails.set(turnKey, tail);
    void tail.then(() => {
      if (ports.tails.get(turnKey) === tail) ports.tails.delete(turnKey);
      if (ports.activeTurns.get(turnKey) === run) ports.activeTurns.delete(turnKey);
    });
    return run;
  }

  function scheduleHarvest(botSlug: string): void {
    if (ports.closed() || ports.held.has(botSlug)) return;
    const bot = ports.registry.get(botSlug);
    if (bot === undefined || bot.paused === true) return;
    if (ports.pendingHarvests.has(botSlug)) return;
    ports.pendingHarvests.add(botSlug);
    const settled = enqueue(botSlug, () => ports.runHarvestTurn(botSlug));
    void settled
      .finally(() => {
        ports.pendingHarvests.delete(botSlug);
        ports.checkHarvestReadiness(botSlug);
      })
      .catch(() => undefined);
  }

  function retryInboxAfterAgentFactoryStarts(
    botSlug: string,
    sourceEventIds: string[],
    error: unknown,
  ): boolean {
    if (!(error instanceof Error) || !error.message.includes('no agent factory registered'))
      return false;
    const retryable = ports.database.read((database) => {
      const placeholders = sourceEventIds.map(() => '?').join(', ');
      const row = database
        .prepare(
          `SELECT COUNT(*) AS count FROM inbox_admissions
                  WHERE bot_slug = ? AND source_event_id IN (${placeholders})
                    AND attempt_state = 'retryable'`,
        )
        .get(botSlug, ...sourceEventIds) as { count: number };
      return row.count === sourceEventIds.length;
    });
    const prior = ports.inboxFactoryRetries.get(botSlug);
    const attempts = prior?.attempts ?? 0;
    if (!retryable || attempts >= 5 || ports.closed()) {
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'inbox-factory-retry-declined',
          botSlug,
          attempts,
          reason: !retryable ? 'non-retryable-admission' : ports.closed() ? 'closed' : 'exhausted',
        }),
      );
      return false;
    }
    if (prior?.timer !== undefined) clearTimeout(prior.timer);

    const delayMs = Math.min(250 * 2 ** attempts, 2_000);
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'inbox-factory-retry-scheduled',
        botSlug,
        attempt: attempts + 1,
        delayMs,
      }),
    );
    const timer = setTimeout(() => {
      ports.inboxFactoryRetries.set(botSlug, { attempts: attempts + 1 });
      if (!ports.closed()) scheduleHarvest(botSlug);
    }, delayMs);
    timer.unref();
    ports.inboxFactoryRetries.set(botSlug, { attempts: attempts + 1, timer });
    return true;
  }

  function resumeAutomaticWakes(botSlug: string): void {
    queueMicrotask(() => {
      if (ports.closed() || ports.held.has(botSlug)) return;
      ports.checkHarvestReadiness(botSlug);
      ports.recoverPendingDigests(botSlug);
      ports.activityEvents.armSnooze(botSlug);
    });
  }

  function clearInboxFactoryRetries(): void {
    for (const retry of ports.inboxFactoryRetries.values())
      if (retry.timer !== undefined) clearTimeout(retry.timer);
    ports.inboxFactoryRetries.clear();
  }

  return {
    enqueue,
    scheduleHarvest,
    retryInboxAfterAgentFactoryStarts,
    resumeAutomaticWakes,
    clearInboxFactoryRetries,
  };
}
