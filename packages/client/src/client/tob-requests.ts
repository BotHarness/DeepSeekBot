type TobRequestListener = (body: string) => void;

const listeners = new Set<TobRequestListener>();
let pending: string | undefined;

export function requestTobMessage(body: string): void {
  const listener = [...listeners].at(-1);
  if (listener) listener(body);
  else pending = body;
}

export function receiveTobMessages(listener: TobRequestListener): () => void {
  listeners.add(listener);
  if (pending !== undefined) {
    const body = pending;
    pending = undefined;
    listener(body);
  }
  return () => {
    listeners.delete(listener);
  };
}
