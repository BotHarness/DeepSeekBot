import { EngineRefusal, type EngineId } from '../engines/engine-session.js';
import { createMemoryFallbackOverrides, type FallbackOverrideStore } from './fallback-overrides.js';
import type { ModelRoute, PersonaBotModelPlan } from './presets.js';
import type { RestingRoute, RestReason, RouteRests } from './route-rest.js';
import type { RoutingTarget } from './routing-groups.js';

type RouteKey = Pick<ModelRoute, 'provider' | 'model'>;

export interface ModelSwitch {
  kind: 'switch';
  from: RouteKey;
  to: ModelRoute;
  reason: RestReason;
  until?: string;
}

export interface RoutesExhausted {
  kind: 'exhausted';
  rests: RestingRoute[];
}

export type GroupPick =
  | { kind: 'route'; route: ModelRoute }
  | { kind: 'exhausted'; rests: RestingRoute[] }
  | { kind: 'missing' };

export interface SubscriptionRest {
  engine: EngineId;
  account: string;
  until: string;
}

export type MixedGroupPick =
  | { kind: 'target'; target: RoutingTarget }
  | { kind: 'exhausted'; rests: RestingRoute[]; subscription?: SubscriptionRest }
  | { kind: 'unavailable' };

export interface GroupFallback {
  route(sessionId: string): ModelRoute | undefined;
  choose(
    botSlug: string,
    sessionId: string,
    failed: RestingRoute,
  ): Promise<ModelSwitch | RoutesExhausted | undefined>;
  start(botSlug: string, sessionId: string): Promise<void>;
  pick(botSlug: string, groupId: string, effort?: string): Promise<GroupPick>;
  pickMixedOrchestrator(
    botSlug: string,
    attempted?: ReadonlySet<string>,
  ): Promise<MixedGroupPick | undefined>;
  isMixed(groupId: string): boolean;
  pickMixedAssignment(
    botSlug: string,
    groupId: string,
    effort?: string,
    attempted?: ReadonlySet<string>,
  ): Promise<MixedGroupPick | undefined>;
  inherited(): string | undefined;
  inheritedEffort(): string | undefined;
}

const same = (left: RouteKey, right: RouteKey) =>
  left.provider === right.provider && left.model === right.model;

export function routingTargetRestKey(target: RoutingTarget): string {
  return target.kind === 'engine'
    ? JSON.stringify(['engine', target.engine])
    : JSON.stringify(['route', target.route.provider, target.route.model]);
}

export function unavailableRoutingEngine(error: unknown): boolean {
  return (
    error instanceof EngineRefusal &&
    [
      'engine-not-installed',
      'engine-signed-out',
      'engine-not-subscription',
      'unknown-model',
      'unknown-effort',
    ].includes(error.code)
  );
}

export function createGroupFallback(options: {
  plan(botSlug: string): PersonaBotModelPlan | undefined;
  inheritedGroup?(): string | undefined;
  inheritedEffort?(): string | undefined;
  routes(groupId: string): ModelRoute[];
  engines?: {
    targets(groupId: string): RoutingTarget[];
    allowed(botSlug: string): boolean;
    limit(engine: EngineId): Omit<SubscriptionRest, 'engine'> | undefined;
  };
  allowsGroup?(botSlug: string, groupId: string): boolean;
  rests: Pick<RouteRests, 'restingUntil'>;
  requireAllowed(botSlug: string, route: ModelRoute): void;
  validate(route: ModelRoute): Promise<void>;
  withEffort?(route: ModelRoute, effort: string | undefined): Promise<ModelRoute>;
  overrides?: FallbackOverrideStore;
}): GroupFallback {
  const withEffort = async (route: ModelRoute, effort: string | undefined) =>
    options.withEffort === undefined || effort === undefined
      ? { ...route }
      : options.withEffort(route, effort);
  const effortOf = (botSlug: string): string | undefined => {
    const plan = options.plan(botSlug);
    if (plan === undefined) return options.inheritedEffort?.();
    return plan.orchestratorGroupId === undefined ? undefined : plan.orchestratorGroupEffort;
  };
  const overrides = options.overrides ?? createMemoryFallbackOverrides();
  const groupOf = (botSlug: string): string | undefined => {
    const plan = options.plan(botSlug);
    return plan === undefined ? options.inheritedGroup?.() : plan.orchestratorGroupId;
  };
  const routesOf = (botSlug: string): { groupId: string; routes: ModelRoute[] } | undefined => {
    const groupId = groupOf(botSlug);
    if (groupId === undefined) return undefined;
    try {
      return { groupId, routes: options.routes(groupId) };
    } catch {
      return undefined;
    }
  };
  const isUsable = async (botSlug: string, route: ModelRoute): Promise<boolean> => {
    try {
      options.requireAllowed(botSlug, route);
      await options.validate(route);
      return true;
    } catch {
      return false;
    }
  };
  const targetsOf = (groupId: string): RoutingTarget[] => {
    try {
      return options.engines?.targets(groupId) ?? [];
    } catch {
      return [];
    }
  };
  const pickMixed = async (
    botSlug: string,
    groupId: string,
    effort?: string,
    attempted?: ReadonlySet<string>,
  ): Promise<MixedGroupPick | undefined> => {
    const engines = options.engines;
    if (engines === undefined) return undefined;
    const targets = targetsOf(groupId);
    if (!targets.some((target) => target.kind === 'engine')) return undefined;
    if (options.allowsGroup?.(botSlug, groupId) === false) return { kind: 'unavailable' };
    const enginesAllowed = engines.allowed(botSlug);
    const rests: RestingRoute[] = [];
    let unavailable = false;
    let subscription: SubscriptionRest | undefined;
    const restingEngines = new Set<EngineId>();
    const restingRoutes = new Set<string>();
    for (const target of targets) {
      if (target.kind === 'engine') {
        if (!enginesAllowed) {
          unavailable = true;
          continue;
        }
        const limit = engines.limit(target.engine);
        if (limit === undefined) {
          if (!attempted?.has(routingTargetRestKey(target))) return { kind: 'target', target };
          unavailable = true;
          continue;
        }
        if (!restingEngines.has(target.engine)) {
          restingEngines.add(target.engine);
          if (subscription === undefined || limit.until < subscription.until)
            subscription = { engine: target.engine, ...limit };
          rests.push({
            provider: target.engine,
            model: limit.account,
            until: limit.until,
            reason: 'quota',
          });
        }
        continue;
      }
      const rest = options.rests.restingUntil(target.route);
      if (rest !== undefined) {
        const key = JSON.stringify([rest.provider, rest.model]);
        if (!restingRoutes.has(key)) {
          restingRoutes.add(key);
          rests.push(rest);
        }
        continue;
      }
      if (!attempted?.has(routingTargetRestKey(target)) && (await isUsable(botSlug, target.route)))
        return {
          kind: 'target',
          target: { kind: 'route', route: await withEffort(target.route, effort) },
        };
      unavailable = true;
    }
    return !unavailable && rests.length > 0
      ? {
          kind: 'exhausted',
          rests: rests.sort((left, right) => left.until.localeCompare(right.until)),
          ...(subscription === undefined ? {} : { subscription }),
        }
      : { kind: 'unavailable' };
  };
  return {
    inherited: () => options.inheritedGroup?.(),
    inheritedEffort: () => options.inheritedEffort?.(),
    route(sessionId) {
      const override = overrides.get(sessionId);
      if (override === undefined) return undefined;
      const group = routesOf(override.botSlug);
      const member =
        group?.groupId === override.groupId
          ? group.routes.find((route) => same(route, override.route))
          : undefined;
      const effort = override.route.reasoningEffort;
      if (
        member === undefined ||
        (member.reasoningEffort === undefined
          ? effort !== undefined && effort !== effortOf(override.botSlug)
          : effort !== member.reasoningEffort)
      ) {
        overrides.delete(sessionId);
        return undefined;
      }
      return { ...override.route };
    },
    async choose(botSlug, sessionId, failed) {
      const group = routesOf(botSlug);
      if (group === undefined || options.allowsGroup?.(botSlug, group.groupId) === false)
        return undefined;
      const rests: RestingRoute[] = [failed];
      for (const route of group.routes) {
        if (same(route, failed)) continue;
        const rest = options.rests.restingUntil(route);
        if (rest !== undefined) {
          rests.push(rest);
          continue;
        }
        if (!(await isUsable(botSlug, route))) continue;
        const next = await withEffort(route, effortOf(botSlug));
        overrides.set(sessionId, { botSlug, groupId: group.groupId, route: next });
        return {
          kind: 'switch',
          from: { provider: failed.provider, model: failed.model },
          to: { ...next },
          reason: failed.reason ?? 'quota',
          until: failed.until,
        };
      }
      return { kind: 'exhausted', rests };
    },
    async start(botSlug, sessionId) {
      const group = routesOf(botSlug);
      if (group === undefined || options.allowsGroup?.(botSlug, group.groupId) === false) return;
      for (const route of group.routes) {
        if (options.rests.restingUntil(route) !== undefined) return;
        if (!(await isUsable(botSlug, route))) continue;
        overrides.set(sessionId, {
          botSlug,
          groupId: group.groupId,
          route: await withEffort(route, effortOf(botSlug)),
        });
        return;
      }
    },
    async pick(botSlug, groupId, effort) {
      if (options.allowsGroup?.(botSlug, groupId) === false) return { kind: 'missing' };
      let modelRoutes: ModelRoute[];
      try {
        modelRoutes = options.routes(groupId);
      } catch {
        return { kind: 'missing' };
      }
      const rests: RestingRoute[] = [];
      for (const route of modelRoutes) {
        const rest = options.rests.restingUntil(route);
        if (rest !== undefined) {
          rests.push(rest);
          continue;
        }
        if (!(await isUsable(botSlug, route))) continue;
        return { kind: 'route', route: await withEffort(route, effort) };
      }
      return { kind: 'exhausted', rests };
    },
    pickMixedOrchestrator(botSlug, attempted) {
      const groupId = groupOf(botSlug);
      if (groupId === undefined || options.engines === undefined) return Promise.resolve(undefined);
      return pickMixed(botSlug, groupId, effortOf(botSlug), attempted);
    },
    isMixed: (groupId) => targetsOf(groupId).some((target) => target.kind === 'engine'),
    pickMixedAssignment: pickMixed,
  };
}
