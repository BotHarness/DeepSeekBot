export const WORKSPACE_GRANTS_CHANGED = 'botharness/workspace-grants-changed';

function createEvents() {
  return { revisions: new Map<string, number>(), listeners: new Map<string, Set<() => void>>() };
}
const local = createEvents();
const scoped = new WeakMap<object, ReturnType<typeof createEvents>>();

function events(scope?: object): ReturnType<typeof createEvents> {
  if (scope === undefined) return local;
  let current = scoped.get(scope);
  if (current === undefined) {
    current = createEvents();
    scoped.set(scope, current);
  }
  return current;
}

export function workspaceGrantRevision(slug: string, scope?: object): number {
  const { revisions } = events(scope);
  return revisions.get(slug) ?? 0;
}

export function subscribeWorkspaceGrantChanges(
  slug: string,
  listener: () => void,
  scope?: object,
): () => void {
  const { listeners, revisions } = events(scope);
  let scoped = listeners.get(slug);
  if (scoped === undefined) {
    scoped = new Set();
    listeners.set(slug, scoped);
  }
  scoped.add(listener);
  return () => {
    scoped.delete(listener);
    if (scoped.size === 0) {
      listeners.delete(slug);
      revisions.delete(slug);
    }
  };
}

export function publishWorkspaceGrantChange(slug: string, scope?: object): void {
  const { listeners, revisions } = events(scope);
  const scoped = listeners.get(slug);
  if (scoped !== undefined) {
    revisions.set(slug, workspaceGrantRevision(slug, scope) + 1);
    scoped.forEach((listener) => listener());
  }
  if (scope === undefined)
    window.dispatchEvent(new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug } }));
}
