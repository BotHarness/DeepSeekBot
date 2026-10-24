type Axis = 'horizontal' | 'vertical';
type Direction = { x: number; y: number };
type Send = (axis: Axis, steps: number) => Promise<boolean>;

export function createHeldScroll(interval = 100) {
  let enabled = false;
  let active = false;
  let generation = 0;
  let direction: Direction = { x: 0, y: 0 };
  let send: Send = async () => false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const steps = (value: number) =>
    !Number.isFinite(value) || Math.abs(value) < 0.18
      ? 0
      : Math.sign(value) * Math.ceil(Math.min(1, Math.abs(value)) * 2);
  const stop = () => {
    active = false;
    generation++;
    direction = { x: 0, y: 0 };
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    if (!enabled || !active || pending || timer !== undefined) return;
    if (steps(direction.x) === 0 && steps(direction.y) === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void tick();
    }, interval);
  };
  const tick = async () => {
    if (!enabled || !active || pending) return;
    pending = true;
    const version = generation;
    try {
      for (const [axis, coordinate] of [
        ['horizontal', 'x'],
        ['vertical', 'y'],
      ] as const) {
        if (!enabled || !active || generation !== version) return;
        const amount = steps(direction[coordinate]);
        if (amount !== 0 && !(await send(axis, amount))) {
          if (generation === version) stop();
          return;
        }
      }
    } catch {
      if (generation === version) stop();
    } finally {
      pending = false;
      schedule();
    }
  };
  return {
    configure(nextEnabled: boolean, nextSend: Send) {
      send = nextSend;
      enabled = nextEnabled;
      if (!enabled) stop();
    },
    start() {
      stop();
      active = enabled;
    },
    move(next: Direction) {
      if (!enabled || !active) return;
      direction = next;
      schedule();
    },
    stop,
  };
}
