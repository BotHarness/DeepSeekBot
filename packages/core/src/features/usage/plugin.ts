import type { Context } from '@deepseek-ai/cordis';
import type { DshSessionEvent, DshSessionStore } from '../../sessions/source.js';
import type { BotHarnessCore } from '../../plugin-types.js';

export function mountReconciliation(
  ctx: Context,
  core: Pick<BotHarnessCore, 'usage' | 'ownership'>,
  dshSessions: DshSessionStore,
) {
  for (const session of dshSessions.list())
    core.usage?.primeSession(session.id, session.snapshotEvents());
  if (core.usage !== undefined) {
    const usage = core.usage;

    ctx.inject(['sessionQuery'], (sessionCtx) => {
      const query = sessionCtx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return;
      const readUsageLog = async (sessionId: string) => {
        try {
          const snapshot = await query.readSession(sessionId);
          return {
            events: snapshot.events,
            inheritedEventCount: snapshot.inheritedEventCount ?? 0,
          };
        } catch (error) {
          ctx.logger.warn(`botharness: usage log read failed for ${sessionId}: ${String(error)}`);
          return undefined;
        }
      };
      const tracked = core.ownership.list().map((record) => record.sessionId);
      void usage.rebuild(tracked, readUsageLog).then(
        (report) => {
          if (report.legacyBaselineBots !== undefined) {
            ctx.logger.warn(
              `botharness: usage legacy baseline retained; phase=reconcile bots=${report.legacyBaselineBots} historical_backfill=unverifiable`,
            );
          }
          ctx.logger.info(
            `botharness: usage reconciliation completed (${report.folded} attempts, ${report.failed} failed sessions)`,
          );
        },
        (error: unknown) => {
          ctx.logger.warn(`botharness: usage projection rebuild failed: ${String(error)}`);
        },
      );
    });
  }
}

export function bindParentTurnUsage(ctx: Context, core: Pick<BotHarnessCore, 'usage'>): void {
  ctx.on(
    'subagent/start',
    (info) => {
      const parentSessionId = ctx.agents.get(info.id)?.session.header.parentSession;
      if (parentSessionId) core.usage?.bindParentTurn(info.id, parentSessionId);
    },
    { global: true },
  );
}
