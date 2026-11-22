import type { HumanContext } from '../humans/context.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { ActivityLiveFrame } from './live.js';

export class LiveUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveUnavailable';
  }
}

export interface ActivitySource {
  snapshot(human: HumanContext): PersonaBotActivitySnapshot;
  onChange(listener: (change?: unknown) => void): () => void;
}

export function createLiveActivity(
  activity: ActivitySource | undefined,
  project: <T>(human: HumanContext, value: T, channelId?: string) => T,
) {
  const activitySubscribers = new Set<{ close(): void }>();
  let activityFrame:
    | { humanId: string; change: unknown; snapshot: PersonaBotActivitySnapshot; data: string }
    | undefined;
  const currentActivity = (human: HumanContext, source: ActivitySource, change?: unknown) => {
    if (
      change === undefined ||
      activityFrame?.change !== change ||
      activityFrame?.humanId !== human.humanId
    ) {
      const snapshot = source.snapshot(human);
      activityFrame = { humanId: human.humanId, change, snapshot, data: JSON.stringify(snapshot) };
    }
    return activityFrame;
  };
  const openActivity = (human: HumanContext): Response => {
    if (activity === undefined) return new Response('Activity unavailable', { status: 503 });
    const encoder = new TextEncoder();
    let cancel: (() => void) | undefined;
    let flush: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let ended = false;
        let pending = false;
        let sent: string | undefined;
        let unsubscribe: (() => void) | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const subscriber = {
          close() {
            if (ended) return;
            ended = true;
            unsubscribe?.();
            if (heartbeat !== undefined) clearInterval(heartbeat);
            activitySubscribers.delete(subscriber);
            try {
              controller.close();
            } catch {}
          },
        };
        const send = (change?: unknown): void => {
          if (ended) return;
          if ((controller.desiredSize ?? 0) <= 0) {
            pending = true;
            return;
          }
          pending = false;
          const { data } = currentActivity(human, activity, change);
          if (data === sent) return;
          sent = data;
          try {
            controller.enqueue(encoder.encode(`event: activity/snapshot\ndata: ${data}\n\n`));
          } catch {
            subscriber.close();
          }
        };
        flush = () => {
          if (pending) send();
        };
        activitySubscribers.add(subscriber);
        cancel = () => subscriber.close();
        unsubscribe = activity.onChange(send);
        send();
        heartbeat = setInterval(() => {
          if (ended || (controller.desiredSize ?? 0) <= 0) return;
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            subscriber.close();
          }
        }, 15_000);
      },
      pull() {
        flush?.();
      },
      cancel() {
        cancel?.();
      },
    });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  };
  async function* followActivity(
    human: HumanContext,
    signal: AbortSignal,
  ): AsyncGenerator<ActivityLiveFrame> {
    if (activity === undefined) throw new LiveUnavailable('Activity unavailable');
    let ended = signal.aborted;
    let pending = false;
    let lastChange: unknown;
    let wake: (() => void) | undefined;
    const subscriber = {
      close(): void {
        if (ended) return;
        ended = true;
        activitySubscribers.delete(subscriber);
        wake?.();
      },
    };
    const abort = (): void => subscriber.close();
    signal.addEventListener('abort', abort, { once: true });
    const unsubscribe = ended
      ? undefined
      : activity.onChange((change) => {
          lastChange = change;
          pending = true;
          wake?.();
        });
    if (!ended) activitySubscribers.add(subscriber);
    try {
      if (ended) return;
      let sent = currentActivity(human, activity);
      yield project(human, { type: 'baseline', snapshot: sent.snapshot });
      for (;;) {
        if (ended) return;
        if (pending) {
          pending = false;
          const next = currentActivity(human, activity, lastChange);
          if (next.data === sent.data) continue;
          sent = next;
          yield project(human, { type: 'changed', snapshot: next.snapshot });
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe?.();
      subscriber.close();
    }
  }
  return { activitySubscribers, currentActivity, openActivity, followActivity };
}
