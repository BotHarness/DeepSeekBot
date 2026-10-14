import { pageChannelJournal } from '../../../packages/core/src/channels/timeline.js';
import type { ChannelMessage } from '../../../packages/core/src/channels/channel.js';
import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import type { ChannelLiveFrame, MuxClientFrame } from '../src/host/wire';
import wire from './fixtures/host-wire.json';

type Rpc = keyof typeof wire.rpc;

function recorded(method: Rpc): unknown {
  const bodies = wire.rpc[method].filter((entry) => entry.status === 200);
  return structuredClone(bodies.at(-1)!.body);
}

type Socket = { events: HostSocketEvents; streams: Map<string, string> };

export class FakeChannel {
  readonly messages: ChannelMessage[] = [];
  private followers = new Map<string, { entry: Socket; streamId: string }>();
  constructor(readonly id: string) {}

  get revision(): number {
    return this.messages.length;
  }

  append(message: Partial<ChannelMessage> & { id: string }, notify = true): number {
    this.messages.push({
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '',
      ...message,
    } as ChannelMessage);
    const revision = this.messages.length;
    if (notify)
      this.emit({
        type: 'entry',
        entry: { channelId: this.id, message: this.messages.at(-1)!, revision },
      });
    return revision;
  }

  page(through: number, before?: number, limit?: number) {
    return pageChannelJournal(this.id, this.messages, { through, before, limit });
  }

  follow(entry: Socket, streamId: string, limit: number): void {
    this.followers.set(streamId, { entry, streamId });
    const cursor = this.revision;
    this.send(streamId, { type: 'opened', cursor, page: this.page(cursor, undefined, limit)! });
    this.send(streamId, {
      type: 'notification',
      notification: { kind: 'draft-baseline', channelId: this.id, revision: 0, drafts: [] },
    });
  }

  cancel(streamId: string): void {
    this.followers.delete(streamId);
  }

  drop(entry: Socket): void {
    for (const [streamId, follower] of this.followers)
      if (follower.entry === entry) this.followers.delete(streamId);
  }

  get followerCount(): number {
    return this.followers.size;
  }

  emit(frame: ChannelLiveFrame): void {
    for (const streamId of this.followers.keys()) this.send(streamId, frame);
  }

  private send(streamId: string, value: ChannelLiveFrame): void {
    const follower = this.followers.get(streamId);
    follower?.entry.events.message(JSON.stringify({ type: 'item', streamId, value }));
  }
}

export class FakeHost {
  token = 'launch-token-1';
  up = true;
  private cookie = false;
  private secret = 1;
  private cookieSecret = 0;
  private sockets = new Set<Socket>();
  readonly requests: string[] = [];
  readonly answers = new Map<string, (args: Record<string, unknown>) => unknown>();
  readonly calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  readonly channels = new Map<string, FakeChannel>();
  readonly methods = new Map<string, (args: Record<string, unknown>) => unknown>();
  readonly failing = new Set<string>();

  channel(id: string): FakeChannel {
    let channel = this.channels.get(id);
    if (channel === undefined) {
      channel = new FakeChannel(id);
      this.channels.set(id, channel);
    }
    return channel;
  }

  readonly carrier: HostCarrier = {
    request: async (url, init) => {
      await Promise.resolve();
      this.requests.push(`${init.method} ${url}`);
      if (!this.up) throw new TypeError('Network request failed');
      const parsed = new URL(url);
      if (init.method === 'GET' && parsed.pathname === '/') {
        if (parsed.searchParams.get('token') === this.token || this.authenticated()) {
          this.cookie = true;
          this.cookieSecret = this.secret;
          return response(303, '');
        }
        return response(wire.login.refused.status, 'unauthorized');
      }
      if (!this.authenticated()) return response(401, 'unauthorized');
      const method = parsed.pathname.replace('/api/botharness/', '') as Rpc;
      const body = JSON.parse(init.body ?? '{}') as {
        rpcId: string;
        payload: { args: Record<string, unknown> };
      };
      const answer = this.answers.get(method);
      if (answer !== undefined)
        return response(
          200,
          JSON.stringify({
            type: 'server-response',
            rpcId: body.rpcId,
            result: answer(body.payload.args),
          }),
        );
      this.calls.push({ method, args: body.payload.args });
      if (this.failing.has(method)) throw new TypeError('Network request failed');
      const handler = this.methods.get(method) ?? this.channelMethod(method);
      if (handler !== undefined) {
        let result: unknown;
        try {
          result = { ok: true, value: await handler(body.payload.args) };
        } catch (error) {
          result = {
            ok: false,
            error: { code: 'invalid-input', message: (error as Error).message, details: {} },
          };
        }
        return response(
          200,
          JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result }),
        );
      }
      const recordedBody = recorded(method) as { rpcId: string };
      return response(200, JSON.stringify({ ...recordedBody, rpcId: body.rpcId }));
    },
    openSocket: (url, events) => {
      const entry = { events, streams: new Map<string, string>() };
      queueMicrotask(() => {
        if (!this.up) return events.closed('connection refused');
        if (!url.endsWith('/api/remote.mux') || !this.authenticated())
          return events.closed('Expected HTTP 101 response but was 401');
        this.sockets.add(entry);
        events.open();
      });
      return {
        send: (text) => {
          const frame = JSON.parse(text) as MuxClientFrame;
          if (frame.type === 'cancel') {
            for (const channel of this.channels.values()) channel.cancel(frame.streamId);
            return;
          }
          entry.streams.set(frame.endpoint, frame.streamId);
          queueMicrotask(() => {
            if (frame.endpoint === 'botharness/followRoster')
              this.emit(entry, frame.streamId, wire.mux.roster[0]);
            else if (frame.endpoint === 'botharness/followActivity')
              this.emit(entry, frame.streamId, wire.mux.activity[0]);
            else if (frame.endpoint === 'botharness/followChannel') {
              const args = frame.payload.args as { channelId: string; limit: number };
              const channel = this.channels.get(args.channelId);
              if (channel === undefined)
                entry.events.message(
                  JSON.stringify({
                    type: 'error',
                    streamId: frame.streamId,
                    error: { code: 'not-found', message: 'Unknown Channel', details: {} },
                  }),
                );
              else channel.follow(entry, frame.streamId, args.limit);
            } else
              entry.events.message(
                JSON.stringify({ ...wire.mux.unknownEndpoint!.frame, streamId: frame.streamId }),
              );
          });
        },
        close: () => {
          for (const channel of this.channels.values()) channel.drop(entry);
          if (this.sockets.delete(entry)) entry.events.closed('closed by client');
        },
      };
    },
  };

  private channelMethod(method: string): ((args: Record<string, unknown>) => unknown) | undefined {
    if (method === 'channelDm')
      return (args) => {
        const channel = this.channel(`dm-${String(args['slug'])}`);
        return { channel: { id: channel.id, type: 'dm', botSlug: args['slug'] } };
      };
    if (method === 'channelJournalPage')
      return (args) => {
        const channel = this.channels.get(String(args['channelId']));
        const page = channel?.page(
          args['through'] as number,
          args['before'] as number | undefined,
          args['limit'] as number | undefined,
        );
        if (page === undefined) throw new Error('Channel journal page is unavailable');
        return page;
      };
    if (method === 'channelSend')
      return (args) => {
        const channel = this.channels.get(String(args['channelId']));
        if (channel === undefined) throw new Error('Unknown Channel');
        const id = String(args['messageId']);
        const existing = channel.messages.find((message) => message.id === id);
        if (existing !== undefined) return { message: existing };
        channel.append({ id, body: String(args['body']), author: { kind: 'human' } });
        return { message: channel.messages.at(-1) };
      };
    return undefined;
  }

  private authenticated(): boolean {
    return this.cookie && this.cookieSecret === this.secret;
  }

  private emit(entry: { events: HostSocketEvents }, streamId: string, value: unknown): void {
    entry.events.message(JSON.stringify({ type: 'item', streamId, value }));
  }

  push(endpoint: 'botharness/followRoster' | 'botharness/followActivity', value: unknown): void {
    for (const entry of this.sockets) {
      const streamId = entry.streams.get(endpoint);
      if (streamId !== undefined) this.emit(entry, streamId, value);
    }
  }

  kill(): void {
    this.up = false;
    for (const entry of this.sockets) {
      for (const channel of this.channels.values()) channel.drop(entry);
      this.sockets.delete(entry);
      entry.events.closed('connection lost');
    }
  }

  restart(): void {
    this.token = `launch-token-${Number(this.token.split('-').at(-1)) + 1}`;
    this.up = true;
  }

  resetSecret(): void {
    this.secret += 1;
  }
}

function response(status: number, body: string) {
  return { status, text: async () => body };
}
