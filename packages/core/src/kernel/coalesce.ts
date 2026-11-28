export interface Coalesced {
  schedule(): void;
  flush(): void;
  cancel(): void;
}

export function coalesce(
  run: () => void,
  { delayMs, maxWaitMs }: { delayMs: number; maxWaitMs: number },
): Coalesced {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt: number | undefined;
  const fire = (): void => {
    timer = undefined;
    firstAt = undefined;
    run();
  };
  return {
    schedule() {
      const now = Date.now();
      firstAt ??= now;
      clearTimeout(timer);
      timer = setTimeout(fire, Math.max(0, Math.min(delayMs, firstAt + maxWaitMs - now)));
      timer.unref?.();
    },
    flush() {
      if (timer === undefined) return;
      clearTimeout(timer);
      fire();
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      firstAt = undefined;
    },
  };
}
