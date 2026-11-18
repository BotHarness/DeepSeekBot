import type { ModelRoute, PersonaBotModelPlan } from './presets.js';
import type { RestingRoute, RestReason, RouteRests } from './route-rest.js';

type RouteKey = Pick<ModelRoute, 'provider' | 'model'>;

export interface ModelSwitch {
  kind: 'switch';
  from: RouteKey;
  to: ModelRoute;
  reason: RestReason | 'returned';
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

export interface GroupFallback {
  route(sessionId: string): ModelRoute | undefined;
  choose(
    botSlug: string,
    sessionId: string,
    failed: RestingRoute,
  ): Promise<ModelSwitch | RoutesExhausted | undefined>;
  restore(botSlug: string, sessionId: string): Promise<ModelSwitch | undefined>;
  pick(botSlug: string, groupId: string): Promise<GroupPick>;
  forget(sessionId: string): void;
}

const same = (left: RouteKey, right: RouteKey) =>
  left.provider === right.provider && left.model === right.model;

export function createGroupFallback(options: {
  plan(botSlug: string): PersonaBotModelPlan | undefined;
  inheritedGroup?(): string | undefined;
  routes(groupId: string): ModelRoute[];
  rests: Pick<RouteRests, 'restingUntil'>;
  requireAllowed(botSlug: string, route: ModelRoute): void;
  validate(route: ModelRoute): Promise<void>;
}): GroupFallback {
  const overrides = new Map<string, { botSlug: string; groupId: string; route: ModelRoute }>();
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
  return {
    route(sessionId) {
      const override = overrides.get(sessionId);
      if (override === undefined) return undefined;
      if (groupOf(override.botSlug) !== override.groupId) {
        overrides.delete(sessionId);
        return undefined;
      }
      return { ...override.route };
    },
    async choose(botSlug, sessionId, failed) {
      const group = routesOf(botSlug);
      if (group === undefined) return undefined;
      const rests: RestingRoute[] = [failed];
      for (const route of group.routes) {
        if (same(route, failed)) continue;
        const rest = options.rests.restingUntil(route);
        if (rest !== undefined) {
          rests.push(rest);
          continue;
        }
        try {
          options.requireAllowed(botSlug, route);
          await options.validate(route);
        } catch {
          continue;
        }
        overrides.set(sessionId, { botSlug, groupId: group.groupId, route: { ...route } });
        return {
          kind: 'switch',
          from: { provider: failed.provider, model: failed.model },
          to: { ...route },
          reason: failed.reason ?? 'quota',
          until: failed.until,
        };
      }
      return { kind: 'exhausted', rests };
    },
    async restore(botSlug, sessionId) {
      const override = overrides.get(sessionId);
      if (override === undefined || override.botSlug !== botSlug) return undefined;
      const group = routesOf(botSlug);
      if (group === undefined || group.groupId !== override.groupId) {
        overrides.delete(sessionId);
        return undefined;
      }
      for (const route of group.routes) {
        if (same(route, override.route)) return undefined;
        if (options.rests.restingUntil(route) !== undefined) continue;
        try {
          options.requireAllowed(botSlug, route);
          await options.validate(route);
        } catch {
          continue;
        }
        overrides.set(sessionId, { ...override, route: { ...route } });
        return {
          kind: 'switch',
          from: { provider: override.route.provider, model: override.route.model },
          to: { ...route },
          reason: 'returned',
        };
      }
      return undefined;
    },
    async pick(botSlug, groupId) {
      let routes: ModelRoute[];
      try {
        routes = options.routes(groupId);
      } catch {
        return { kind: 'missing' };
      }
      const rests: RestingRoute[] = [];
      for (const route of routes) {
        const rest = options.rests.restingUntil(route);
        if (rest !== undefined) {
          rests.push(rest);
          continue;
        }
        try {
          options.requireAllowed(botSlug, route);
          await options.validate(route);
        } catch {
          continue;
        }
        return { kind: 'route', route: { ...route } };
      }
      return { kind: 'exhausted', rests };
    },
    forget(sessionId) {
      overrides.delete(sessionId);
    },
  };
}
