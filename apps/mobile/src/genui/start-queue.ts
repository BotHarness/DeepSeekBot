export type GenuiStartQueue = {
  take(start: () => void): () => void;
};

export function genuiStartQueue(limit: number): GenuiStartQueue {
  let running = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    while (running < limit && waiting.length > 0) {
      running += 1;
      waiting.shift()?.();
    }
  };
  return {
    take(start) {
      let state: 'waiting' | 'running' | 'done' = 'waiting';
      const begin = () => {
        state = 'running';
        start();
      };
      waiting.push(begin);
      next();
      return () => {
        if (state === 'waiting') waiting.splice(waiting.indexOf(begin), 1);
        if (state === 'running') {
          running -= 1;
          next();
        }
        state = 'done';
      };
    },
  };
}
