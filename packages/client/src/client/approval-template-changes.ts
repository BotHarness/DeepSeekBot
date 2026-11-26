type Listener = () => void;

const owners = new WeakMap<object, Map<string, Set<Listener>>>();

export function onApprovalTemplateChange(
  owner: object,
  botSlug: string,
  listener: Listener,
): () => void {
  let bots = owners.get(owner);
  if (bots === undefined) {
    bots = new Map();
    owners.set(owner, bots);
  }
  let listeners = bots.get(botSlug);
  if (listeners === undefined) {
    listeners = new Set();
    bots.set(botSlug, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) bots.delete(botSlug);
  };
}

export function announceApprovalTemplateChange(
  owner: object,
  botSlug: string,
  except?: Listener,
): void {
  for (const listener of [...(owners.get(owner)?.get(botSlug) ?? [])])
    if (listener !== except) listener();
}
