type Direction = { x: number; y: number };
type Send = (direction: Direction) => Promise<boolean>;

export function createHeldScrollMotion() {
  let enabled = false,
    active = false,
    pending = false,
    generation = 0;
  let direction: Direction = { x: 0, y: 0 };
  let send: Send = async () => false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    const wasActive = active;
    active = false;
    generation++;
    clearTimeout(timer);
    timer = undefined;
    direction = { x: 0, y: 0 };
    if (wasActive) void send(direction).catch(() => false);
  };
  const tick = async () => {
    if (!enabled || !active || pending) return;
    const version = generation,
      started = Date.now();
    pending = true;
    try {
      if (!(await send(direction)) && version === generation) stop();
    } catch {
      if (version === generation) stop();
    } finally {
      pending = false;
      if (enabled && active)
        timer = setTimeout(
          () => {
            timer = undefined;
            void tick();
          },
          Math.max(0, 80 - (Date.now() - started)),
        );
    }
  };
  return {
    configure(nextEnabled: boolean, nextSend: Send) {
      if (!nextEnabled) stop();
      enabled = nextEnabled;
      send = nextSend;
    },
    start() {
      stop();
      active = enabled;
    },
    move(next: Direction) {
      if (!enabled || !active) return;
      const axis = (v: number) =>
        !Number.isFinite(v) || Math.abs(v) < 0.18 ? 0 : Math.max(-1, Math.min(1, v));
      direction = { x: axis(next.x), y: axis(next.y) };
      if (timer === undefined) void tick();
    },
    stop,
  };
}
