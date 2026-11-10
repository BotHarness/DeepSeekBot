export type GenuiStartQueue = {
  take(start: () => void, priority?: number): () => void;
};

export function genuiStartQueue(limit: number): GenuiStartQueue {
  let running = 0;
  const waiting: Array<{ begin: () => void; priority: number }> = [];
  const next = () => {
    while (running < limit && waiting.length > 0) {
      running += 1;
      waiting.shift()?.begin();
    }
  };
  return {
    take(start, priority = 0) {
      let state: 'waiting' | 'running' | 'done' = 'waiting';
      const begin = () => {
        state = 'running';
        start();
      };
      const entry = { begin, priority };
      const at = waiting.findIndex((other) => other.priority < priority);
      waiting.splice(at === -1 ? waiting.length : at, 0, entry);
      queueMicrotask(next);
      return () => {
        if (state === 'waiting') waiting.splice(waiting.indexOf(entry), 1);
        if (state === 'running') {
          running -= 1;
          next();
        }
        state = 'done';
      };
    },
  };
}
