import {
  RemoteJournalStream,
  RemoteSnapshotStream,
  RemoteStreamCarrierError,
} from '@deepseek-ai/dsh-api-gateway/client';
import type {
  ClientRemote,
  RemoteJournalFrame,
  RemoteJournalStreamOptions,
} from '@deepseek-ai/dsh-api-gateway/client';
import {
  parseJournalEntry,
  parseJournalPage,
  type JournalEntry,
  type JournalPage,
} from './bridge.js';
import type {
  ActivityLiveFrame,
  ChannelLiveFrame,
  RosterLiveFrame,
} from '../../../core/src/channels/live.js';
import type { CompanionLiveFrame } from '../../../core/src/companions/live.js';
import type { ChannelFollow } from './channel-live.js';
import type { TypedLive } from './messaging-defaults-live.js';

const follow = Object.freeze({
  service: 'botharnessBridge',
  namespace: 'botharness',
  mode: 'stream' as const,
  invocation: Object.freeze({ kind: 'direct' as const }),
  parameters: Object.freeze([]),
  cancellation: Object.freeze({ parameter: 'signal' as const }),
  result: Object.freeze({ mode: 'src-json' as const }),
});

export const SNAPSHOT_REMOTE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    ...follow,
    id: 'src:botharnessBridge#botharness/followRoster',
    method: 'followRoster',
  }),
  Object.freeze({
    ...follow,
    id: 'src:botharnessBridge#botharness/followActivity',
    method: 'followActivity',
  }),
]);

const strict = <Value>(name: string, accepts: (value: unknown) => value is Value) =>
  Object.freeze({
    mode: 'strict' as const,
    typeSymbol: `@botharness/core#botharness/followChannel:${name}`,
    create: () => ({
      parse: (value: unknown): Value => {
        if (!accepts(value)) throw new TypeError(`Expected ${name}`);
        return value;
      },
    }),
  });

export const CHANNEL_REMOTE_DESCRIPTOR = Object.freeze({
  ...follow,
  id: 'src:botharnessBridge#botharness/followChannel',
  method: 'followChannel',
  parameters: Object.freeze([
    Object.freeze({
      name: 'channelId',
      wire: 'channelId',
      source: 'json' as const,
      codec: strict('a Channel ID', (value): value is string => typeof value === 'string'),
    }),
    Object.freeze({
      name: 'limit',
      wire: 'limit',
      source: 'json' as const,
      codec: strict(
        'a page size',
        (value): value is number => Number.isSafeInteger(value) && (value as number) >= 1,
      ),
    }),
  ]),
});

export interface ChannelNamespace {
  followChannel(
    channelId: string,
    limit: number,
    signal: AbortSignal,
  ): AsyncIterable<ChannelLiveFrame>;
}

const CHANNEL_PAGE = 50;

interface JournalRequest {
  before?: number;
  limit: number;
}
type JournalFrame = RemoteJournalFrame<JournalEntry, number, JournalPage, unknown>;

class ChannelJournal extends RemoteJournalStream<
  JournalPage,
  JournalEntry,
  number,
  JournalRequest,
  unknown
> {
  constructor(
    remote: Pick<ClientRemote, '$stream'>,
    options: RemoteJournalStreamOptions<JournalPage, JournalEntry, number, unknown>,
    private readonly source: (
      request: JournalRequest,
      signal: AbortSignal,
    ) => AsyncIterable<unknown>,
    private readonly pages: (
      request: JournalRequest,
      through: number,
      signal: AbortSignal,
    ) => Promise<JournalPage>,
  ) {
    super(remote, options);
  }
  protected async *follow(
    request: JournalRequest,
    signal: AbortSignal,
  ): AsyncGenerator<JournalFrame> {
    for await (const value of this.source(request, signal)) {
      const frame = value as {
        type?: unknown;
        cursor?: unknown;
        page?: unknown;
        entry?: unknown;
        notification?: unknown;
      };
      if (frame.type === 'opened') {
        const page = parseJournalPage(frame.page);
        if (page === undefined || typeof frame.cursor !== 'number')
          throw new Error('Invalid Channel journal opening');
        yield { type: 'opened', cursor: frame.cursor, page };
      } else if (frame.type === 'entry') {
        const entry = parseJournalEntry(frame.entry);
        if (entry === undefined) throw new Error('Invalid Channel journal entry');
        yield { type: 'entry', entry };
      } else if (frame.type === 'notification') {
        yield { type: 'notification', notification: frame.notification };
      }
    }
  }
  protected readPage(
    request: JournalRequest,
    through: number,
    signal: AbortSignal,
  ): Promise<JournalPage> {
    return this.pages(request, through, signal);
  }
  protected repairRequest(initial: JournalRequest): JournalRequest {
    return { limit: initial.limit };
  }
}

export function createChannelFollow(
  remote: Pick<ClientRemote, '$stream'>,
  namespace: () => ChannelNamespace,
  readPage: (
    channelId: string,
    request: { through: number; before?: number; limit: number },
    signal: AbortSignal,
  ) => Promise<JournalPage>,
): ChannelFollow {
  return (channelId, handlers) => {
    const name = 'botharness Channel journal';
    let stopped = false;
    const failed = (error: unknown): void => {
      if (stopped) return;
      console.warn(`botharness: ${name} failed`, error);
      handlers.interrupted(true);
    };
    const journal = new ChannelJournal(
      remote,
      {
        name,
        emptyCursor: 0,
        entries: (page) => page.entries,
        hasMore: (page) => page.hasOlder,
        first: (entry) => entry.revision,
        last: (entry) => entry.revision,
        compare: (left, right) => left - right,
        follows: (left, right) => right === left + 1,
        publish: (change) => {
          if (!stopped) handlers.change(change);
        },
        carrierFailed: () => {
          if (!stopped) handlers.interrupted(false);
        },
        failed,
      },
      (request, signal) => namespace().followChannel(channelId, request.limit, signal),
      (request, through, signal) =>
        readPage(
          channelId,
          request.before === undefined
            ? { through, limit: request.limit }
            : { through, before: request.before, limit: request.limit },
          signal,
        ),
    );
    journal.open({ limit: CHANNEL_PAGE }).catch(failed);
    return {
      stop() {
        stopped = true;
        void journal.dispose();
      },
      prepend: (before) => journal.prepend({ before, limit: CHANNEL_PAGE }),
    };
  };
}

const identifier = (name: string) =>
  Object.freeze({
    name,
    wire: name,
    source: 'json' as const,
    codec: Object.freeze({
      mode: 'strict' as const,
      typeSymbol: `@botharness/core#botharness/followCompanion:${name}`,
      create: () => ({
        parse: (value: unknown): string => {
          if (typeof value !== 'string') throw new TypeError('Expected a string');
          return value;
        },
      }),
    }),
  });

export const COMPANION_REMOTE_DESCRIPTOR = Object.freeze({
  ...follow,
  id: 'src:botharnessBridge#botharness/followCompanion',
  method: 'followCompanion',
  parameters: Object.freeze([identifier('resume'), identifier('lastEventId')]),
});

export interface CompanionNamespace {
  followCompanion(
    resume: string,
    lastEventId: string,
    signal: AbortSignal,
  ): AsyncIterable<CompanionLiveFrame>;
}

export interface CompanionSource {
  readonly readyState: number;
  addEventListener(name: string, listener: (event: Event) => void): void;
  close(): void;
}

export function createCompanionSource(
  remote: Pick<ClientRemote, '$stream'>,
  namespace: () => CompanionNamespace,
): (url: string) => CompanionSource {
  return (url) => {
    const name = 'botharness Companion stream';
    const resume = new URL(url, 'http://localhost').searchParams.get('resume') ?? '';
    const events = new EventTarget();
    let state = 0;
    let lastEventId = '';
    const publish = (frame: CompanionLiveFrame): void => {
      if (state === 2) return;
      if (frame.id !== undefined) lastEventId = frame.id;
      state = 1;
      events.dispatchEvent(new MessageEvent(`companion/${frame.type}`, { data: frame.value }));
    };
    const interrupted = (closed: boolean): void => {
      if (state === 2) return;
      state = closed ? 2 : 0;
      events.dispatchEvent(new Event('error'));
    };
    const stream = new RemoteSnapshotStream<CompanionLiveFrame, CompanionLiveFrame>(
      remote.$stream<CompanionLiveFrame>({
        name,
        open: (signal) => namespace().followCompanion(resume, lastEventId, signal),
        ended: (accepted) =>
          accepted
            ? new RemoteStreamCarrierError(`${name} ended without a terminal result`)
            : new Error(`${name} ended before its baseline`),
        carrierFailed: () => interrupted(false),
      }),
      {
        name,
        isSnapshot: (frame): frame is CompanionLiveFrame => frame.type === 'baseline',
        replace: publish,
        update: publish,
        failed: (error) => {
          if (state === 2) return;
          console.warn(`botharness: ${name} failed`, error);
          interrupted(true);
        },
      },
    );
    stream.start();
    return {
      get readyState() {
        return state;
      },
      addEventListener: (type, listener) => events.addEventListener(type, listener),
      close() {
        state = 2;
        void stream.dispose();
      },
    };
  };
}

export interface SnapshotNamespace {
  followRoster(signal: AbortSignal): AsyncIterable<RosterLiveFrame>;
  followActivity(signal: AbortSignal): AsyncIterable<ActivityLiveFrame>;
}

const RETRY_MS = 5_000;

function supervised<Frame extends { type: string }>(
  remote: Pick<ClientRemote, '$stream'>,
  name: string,
  open: (signal: AbortSignal) => AsyncIterable<Frame>,
  handlers: {
    replace(frame: Frame): void;
    update(frame: Frame): void;
    interrupted(): void;
  },
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: RemoteSnapshotStream<Frame, Frame> | undefined;
  const start = (): void => {
    timer = undefined;
    if (stopped) return;
    const stream = new RemoteSnapshotStream<Frame, Frame>(
      remote.$stream<Frame>({
        name,
        open,
        ended: (accepted) =>
          accepted
            ? new RemoteStreamCarrierError(`${name} ended without a terminal result`)
            : new Error(`${name} ended before its baseline`),
        carrierFailed: () => handlers.interrupted(),
      }),
      {
        name,
        isSnapshot: (frame): frame is Frame => frame.type === 'baseline',
        replace: handlers.replace,
        update: handlers.update,
        failed: (error) => {
          if (stopped || current !== stream) return;
          console.warn(`botharness: ${name} failed`, error);
          handlers.interrupted();
          current = undefined;
          void stream.dispose();
          timer = setTimeout(start, RETRY_MS);
        },
      },
    );
    current = stream;
    stream.start();
  };
  start();
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    void current?.dispose();
    current = undefined;
  };
}

export function createTypedLive(
  remote: Pick<ClientRemote, '$stream'>,
  namespace: () => SnapshotNamespace,
): TypedLive {
  return {
    roster: (handlers) =>
      supervised<RosterLiveFrame>(
        remote,
        'botharness roster stream',
        (signal) => namespace().followRoster(signal),
        {
          replace: (frame) => {
            if (frame.type === 'baseline') handlers.baseline(frame.placements);
          },
          update: (frame) => {
            if (frame.type === 'changed') handlers.changed();
            else if (frame.type === 'latest')
              handlers.latest({ channelId: frame.channelId, message: frame.message });
            else if (frame.type === 'purged') handlers.purged(frame.placements);
          },
          interrupted: handlers.interrupted,
        },
      ),
    activity: (handlers) =>
      supervised<ActivityLiveFrame>(
        remote,
        'botharness Activity stream',
        (signal) => namespace().followActivity(signal),
        {
          replace: (frame) => handlers.snapshot(JSON.stringify(frame.snapshot)),
          update: (frame) => handlers.snapshot(JSON.stringify(frame.snapshot)),
          interrupted: handlers.interrupted,
        },
      ),
  };
}
