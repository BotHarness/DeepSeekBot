import type { ChannelLiveFrame } from './live.js';

export const CHANNEL_STREAM_PATH = '/api/botharness/stream';
export const CHANNEL_COMMIT_EVENT = 'channel/message';
export const CHANNEL_ADMISSION_EVENT = 'channel/admission';
export const CHANNEL_HUMAN_READ_EVENT = 'channel/human-read';
export const CHANNEL_REACTION_EVENT = 'channel/reaction';
export const CHANNEL_VOICE_EVENT = 'channel/voice';
export const CHANNEL_ATTACHMENTS_EVENT = 'channel/attachments';
export const CHANNEL_SESSION_LINKS_EVENT = 'channel/session-links';
export const CHANNEL_DRAFT_EVENT = 'channel/draft';
export const CHANNEL_DRAFT_APPEND_EVENT = 'channel/draft-append';
export const CHANNEL_DRAFT_BASELINE_EVENT = 'channel/draft-baseline';
export const CHANNEL_DRAFT_SETTLED_EVENT = 'channel/draft-settled';
export const CHANNEL_DRAFT_ABANDONED_EVENT = 'channel/draft-abandoned';
export const ROSTER_CHANGED_EVENT = 'roster/changed';
export const ROSTER_LATEST_EVENT = 'roster/latest';
export const HUMAN_ATTENTION_CHANGED_EVENT = 'human-attention/changed';
export const CONTENT_PURGED_EVENT = 'content/purged';

export function encodeChannelFrame(frame: ChannelLiveFrame): string {
  if (frame.type === 'opened') return 'retry: 1500\n\n';
  if (frame.type === 'entry')
    return `id: ${frame.entry.revision}\nevent: ${CHANNEL_COMMIT_EVENT}\ndata: ${JSON.stringify(frame.entry)}\n\n`;
  const notification = frame.notification;
  if (notification.kind === 'admission') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_ADMISSION_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'human-read') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_HUMAN_READ_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'reaction') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_REACTION_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'voice') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_VOICE_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'attachments') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_ATTACHMENTS_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'session-links') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_SESSION_LINKS_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'draft-baseline') {
    const { kind: _kind, ...data } = notification;
    return `event: ${CHANNEL_DRAFT_BASELINE_EVENT}\ndata: ${JSON.stringify(data)}\n\n`;
  }
  if (notification.kind === 'draft')
    return `event: ${CHANNEL_DRAFT_EVENT}\ndata: ${JSON.stringify(notification.draft)}\n\n`;
  if (notification.kind === 'draft-append')
    return `event: ${CHANNEL_DRAFT_APPEND_EVENT}\ndata: ${JSON.stringify(notification.append)}\n\n`;
  const name =
    notification.kind === 'draft-settled'
      ? CHANNEL_DRAFT_SETTLED_EVENT
      : CHANNEL_DRAFT_ABANDONED_EVENT;
  return `event: ${name}\ndata: ${JSON.stringify(notification.event)}\n\n`;
}

export function parseRevision(value: string | null): number | undefined {
  if (value === null || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : undefined;
}

export function combineLiveResponses(channel: Response, roster: Response): Response {
  const readers = [channel.body!, roster.body!].map((body) => body.getReader());
  let ended = false;
  let completed = 0;
  const waiters = new Set<() => void>();
  const resume = (): void => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const stop = async (): Promise<void> => {
    ended = true;
    resume();
    await Promise.allSettled(readers.map((reader) => reader.cancel()));
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> => {
        try {
          while (!ended) {
            if ((controller.desiredSize ?? 0) <= 0)
              await new Promise<void>((resolve) => waiters.add(resolve));
            if (ended) return;
            const chunk = await reader.read();
            if (ended) return;
            if (chunk.done) {
              completed++;
              if (reader === readers[0] || completed === readers.length) {
                controller.close();
                await stop();
              }
              return;
            }
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          if (ended) return;
          controller.error(error);
          await stop();
        }
      };
      for (const reader of readers) void pump(reader);
    },
    pull() {
      resume();
    },
    cancel() {
      return stop();
    },
  });
  return new Response(body, { headers: channel.headers });
}
