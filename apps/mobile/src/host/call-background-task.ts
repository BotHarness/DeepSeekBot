export interface CallBackgroundTaskOwner {
  token(): string | null;
  subscribe(changed: () => void): () => void;
}

export function holdCallBackgroundTask(
  token: unknown,
  owner: CallBackgroundTaskOwner,
): Promise<void> {
  if (typeof token !== 'string') return Promise.resolve();
  return new Promise<void>((resolve) => {
    let finished = false;
    let remove: (() => void) | undefined;
    const check = () => {
      if (owner.token() === token) return;
      finished = true;
      remove?.();
      resolve();
    };
    remove = owner.subscribe(check);
    if (finished) remove();
    else check();
  });
}
