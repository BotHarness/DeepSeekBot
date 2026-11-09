import type { CallHeartbeatPump } from '../../../core/src/voice/call-client.js';
import type { VoiceCallResult } from '../../../core/src/voice/call-contract.js';

export const HEARTBEAT_WORKER_SOURCE = `
let timer;
let flying = 0;
let config;
let after = 0;
const beat = async () => {
  if (config === undefined || flying >= config.maxInFlight) return;
  flying += 1;
  const sent = config;
  let result;
  try {
    const response = await fetch(sent.url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'heartbeat', callId: sent.callId, after, client: sent.client }),
    });
    result = await response.json();
    if (typeof result?.ok !== 'boolean') result = undefined;
  } catch {
    result = undefined;
  } finally {
    flying -= 1;
  }
  if (config === sent) postMessage({ result });
};
onmessage = (event) => {
  const message = event.data;
  if (message.type === 'start') {
    config = message;
    clearInterval(timer);
    timer = setInterval(beat, message.periodMs);
  } else if (message.type === 'after') {
    after = message.seq;
  } else if (message.type === 'stop') {
    clearInterval(timer);
    config = undefined;
    close();
  }
};
`;

export interface HeartbeatWorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<{ result?: VoiceCallResult }>) => void) | null;
}

export function createWorkerHeartbeats(options: {
  readonly url: string;
  readonly client: string;
  readonly maxInFlight: number;
  readonly worker?: () => HeartbeatWorkerLike | undefined;
}): CallHeartbeatPump | undefined {
  let source: string | undefined;
  const make =
    options.worker ??
    (() => {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return undefined;
      try {
        source ??= URL.createObjectURL(
          new Blob([HEARTBEAT_WORKER_SOURCE], { type: 'text/javascript' }),
        );
        return new Worker(source) as unknown as HeartbeatWorkerLike;
      } catch {
        return undefined;
      }
    });
  const probe = make();
  if (probe === undefined) return undefined;
  probe.terminate();
  return {
    start({ callId, periodMs, onResult }) {
      const worker = make();
      if (worker === undefined) return { after: () => undefined, stop: () => undefined };
      let stopped = false;
      worker.onmessage = (event) => {
        if (!stopped) onResult(event.data.result);
      };
      worker.postMessage({
        type: 'start',
        url: options.url,
        callId,
        client: options.client,
        periodMs,
        maxInFlight: options.maxInFlight,
      });
      return {
        after: (seq) => worker.postMessage({ type: 'after', seq }),
        stop: () => {
          if (stopped) return;
          stopped = true;
          worker.onmessage = null;
          worker.postMessage({ type: 'stop' });
          worker.terminate();
        },
      };
    },
  };
}
