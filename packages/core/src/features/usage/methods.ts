import { localDay } from '../activity/methods.js';
import {
  asObject,
  invalidInput,
  unavailable,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { isUsageOverviewPeriod, usageOverviewPeriods } from '../../usage/overview.js';
import { OperationalDatabaseError } from '../../database/owner.js';
import {
  currentBotPrimaryColor,
  historicalBotPrimaryColor,
  resolveBotPrimaryColor,
} from '../../bots/primary-color.js';
import { usageFilterSchema, type UsageQueryResult } from '../../usage/query.js';
import type {
  BridgeMethodsDeps,
  ProfileSessionUsage,
  OverviewUsage,
} from '../../bridge/methods.js';

export interface UsageAdapterMethods {
  profileSessionUsage(payload: unknown): Promise<BridgeResult<ProfileSessionUsage>>;
  overviewUsage(payload: unknown): BridgeResult<OverviewUsage>;
  profileUsage(payload: unknown): BridgeResult<UsageQueryResult>;
}

export function createUsageAdapterMethods(
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
  dmMemory: (payload: unknown, historical?: boolean) => { botSlug: string } | BridgeResult<never>,
): UsageAdapterMethods {
  return {
    overviewUsage(payload) {
      const source = asObject(payload);
      const period = source['period'];
      const after = source['after'];
      if (
        !isUsageOverviewPeriod(period) ||
        (after !== undefined &&
          (typeof after !== 'string' || after.length === 0 || after.length > 255))
      )
        return invalidInput(
          `Overview usage requires a period of ${usageOverviewPeriods.join(', ')} and an optional Bot cursor`,
        );
      if (deps.usage === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Usage statistics unavailable',
          },
        };
      try {
        const memberSlugs = !isHostOwner()
          ? deps.registry.listHistorical().map((bot) => bot.slug)
          : undefined;
        const result = deps.usage.overview(period, after, memberSlugs);
        return {
          ok: true,
          value: {
            ...result,
            bots: result.bots.map((row) => {
              const bot = deps.registry.get(row.slug);
              const historical = deps.registry.getHistorical(row.slug);
              return {
                ...row,
                displayName: historical?.displayName ?? row.slug,
                current: bot !== undefined,
                primaryColor:
                  bot === undefined
                    ? historicalBotPrimaryColor(row.slug, historical?.primaryColor).retained!
                    : resolveBotPrimaryColor({
                        ...bot,
                        primaryColor: currentBotPrimaryColor(bot.primaryColor),
                      }).color,
              };
            }),
          },
        };
      } catch (error) {
        if (error instanceof OperationalDatabaseError)
          return {
            ok: false,
            error: {
              code: 'storage-unavailable',
              message: 'Usage statistics unavailable',
            },
          };
        throw error;
      }
    },
    profileUsage(payload) {
      const scope = dmMemory(payload, true);
      if (!('botSlug' in scope)) return scope;
      const parsed = usageFilterSchema.safeParse(asObject(payload)['filter']);
      if (!parsed.success || parsed.data.end > (localDay(new Date().toISOString()) ?? ''))
        return invalidInput('Usage filter requires real dates within a 182-day non-future range');
      if (deps.usage === undefined) return unavailable();
      try {
        return {
          ok: true,
          value: deps.usage.query(scope.botSlug, parsed.data),
        };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    async profileSessionUsage(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      if (deps.usage === undefined || deps.readUsageSessionLog === undefined) return unavailable();
      try {
        const slug = scope.botSlug;
        const weeks = 26;
        const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
        const assignments = new Map(
          (deps.runtime?.listAssignments(slug) ?? []).map((entry) => [entry.sessionId, entry]),
        );
        const roots = deps.ownership.rootsFor(slug);
        const resumed =
          deps.runtime?.currentOrchestratorSessionId === undefined
            ? undefined
            : (deps.runtime.currentOrchestratorSessionId(slug) ?? null);
        const orchestrator = roots
          .filter(
            (root) =>
              root.rootRole === 'orchestrator' &&
              (resumed === undefined || root.sessionId === resumed),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 1);
        const updatedAt = (root: (typeof roots)[number]) =>
          assignments.get(root.sessionId)?.updatedAt ?? root.createdAt;
        const recent = roots
          .filter((root) => root.rootRole === 'assignment')
          .sort((left, right) => updatedAt(right).localeCompare(updatedAt(left)))
          .slice(0, 5);
        const rows: ProfileSessionUsage['rows'] = [];
        for (const root of [...orchestrator, ...recent]) {
          const summary = await deps.usage.sessionSummary(
            slug,
            root.sessionId,
            since,
            deps.readUsageSessionLog,
          );
          rows.push({
            ...summary,
            sessionId: root.sessionId,
            role: root.rootRole,
            label: assignments.get(root.sessionId)?.title.slice(0, 160) ?? root.rootRole,
            updatedAt: updatedAt(root),
          });
        }
        const current = dmMemory(payload);
        if (!('botSlug' in current) || current.botSlug !== slug) return unavailable();
        return { ok: true, value: { slug, weeks, since, rows } };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
  };
}
