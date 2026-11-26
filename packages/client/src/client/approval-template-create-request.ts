type Listener = (botSlug: string) => void;

let pending: string | undefined;
const listeners = new Set<Listener>();

export function requestApprovalTemplateCreate(botSlug: string): void {
  if (listeners.size === 0) {
    pending = botSlug;
    return;
  }
  pending = undefined;
  for (const listener of listeners) listener(botSlug);
}

export function onApprovalTemplateCreate(listener: Listener): () => void {
  listeners.add(listener);
  const waiting = pending;
  pending = undefined;
  if (waiting !== undefined) listener(waiting);
  return () => {
    listeners.delete(listener);
  };
}
