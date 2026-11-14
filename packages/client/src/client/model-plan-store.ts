import type { ModelPlanView } from './bridge.js';

function createCache() {
  return { plans: new Map<string, ModelPlanView | null>(), listeners: new Set<() => void>() };
}
const local = createCache();
const scoped = new WeakMap<object, ReturnType<typeof createCache>>();

function cache(scope?: object): ReturnType<typeof createCache> {
  if (scope === undefined) return local;
  let current = scoped.get(scope);
  if (current === undefined) {
    current = createCache();
    scoped.set(scope, current);
  }
  return current;
}

export function rememberModelPlan(
  slug: string,
  plan: ModelPlanView | undefined,
  scope?: object,
): void {
  const { plans, listeners } = cache(scope);
  const previous = plans.get(slug);
  if (plan !== undefined && (previous?.revision ?? 0) > plan.revision) return;
  if (plan === undefined && previous !== undefined && previous !== null) return;
  const next = plan ?? null;
  if (previous === next) return;
  plans.set(slug, next);
  for (const listener of listeners) listener();
}

export function modelPlanOf(
  slug: string | undefined,
  scope?: object,
): ModelPlanView | null | undefined {
  const { plans } = cache(scope);
  return slug === undefined ? undefined : plans.get(slug);
}

export function subscribeModelPlans(listener: () => void, scope?: object): () => void {
  const { listeners } = cache(scope);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateModelPlan(slug: string, scope?: object): void {
  const { plans, listeners } = cache(scope);
  plans.delete(slug);
  for (const listener of listeners) listener();
}

export function invalidateInheritedModelPlans(scope?: object): void {
  const { plans, listeners } = cache(scope);
  for (const [slug, plan] of plans) {
    if (plan === null) plans.delete(slug);
  }
  for (const listener of listeners) listener();
}
