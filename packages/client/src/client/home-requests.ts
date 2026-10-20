type HomeRequestListener = (body: string) => void;

const listeners = new Set<HomeRequestListener>();
let pending: string | undefined;

export function requestHomeMessage(body: string): void {
  const listener = [...listeners].at(-1);
  if (listener) listener(body);
  else pending = body;
}

export function receiveHomeMessages(listener: HomeRequestListener): () => void {
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
