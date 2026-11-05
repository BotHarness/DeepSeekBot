import { pageChannelJournal } from '../../../packages/core/src/channels/timeline.js';
import type { ChannelMessage } from '../../../packages/core/src/channels/channel.js';
import type { HostCarrier, HostSocketEvents } from '../src/host/carrier';
import type { ChannelLiveFrame, MuxClientFrame, WireDraft } from '../src/host/wire';
import wire from './fixtures/host-wire.json';

type Rpc = keyof typeof wire.rpc;

function recorded(method: Rpc): unknown {
  const bodies = wire.rpc[method].filter((entry) => entry.status === 200);
  return structuredClone(bodies.at(-1)!.body);
}

type Socket = { events: HostSocketEvents; streams: Map<string, string>; device: boolean };

export class ChangeLog {
  epoch = 'epoch-1';
  floor = 0;
  rows: Array<{ seq: number; channelId: string; messageId: string | null }> = [];
  get seq(): number {
    return this.rows.at(-1)?.seq ?? this.floor;
  }
  record(channelId: string, messageId: string | null): void {
    this.rows.push({ seq: this.seq + 1, channelId, messageId });
  }
  rotate(): void {
    this.floor = this.seq;
    this.rows = [];
    this.epoch = `${this.epoch}+`;
  }
}

export class FakeChannel {
  readonly messages: ChannelMessage[] = [];
  bodiesSent = 0;
  private followers = new Map<string, { entry: Socket; streamId: string }>();
  readonly follows: Array<Record<string, unknown>> = [];
  baselineDrafts: WireDraft[] = [];
  constructor(
    readonly id: string,
    readonly log = new ChangeLog(),
  ) {}

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
    this.log.record(this.id, message.id);
    if (notify)
      this.emit({
        type: 'entry',
        entry: { channelId: this.id, message: this.messages.at(-1)!, revision },
      });
    return revision;
  }

  page(through: number, before?: number, limit?: number) {
    const page = pageChannelJournal(this.id, this.messages, { through, before, limit });
    this.bodiesSent += page?.entries.length ?? 0;
    return page;
  }

  edit(messageId: string, patch: Partial<ChannelMessage>): void {
    const index = this.messages.findIndex((message) => message.id === messageId);
    this.messages[index] = { ...this.messages[index]!, ...patch };
    this.log.record(this.id, messageId);
  }

  purge(messageId: string): void {
    const index = this.messages.findIndex((message) => message.id === messageId);
    const { attachments: _attachments, ...message } = this.messages[index]!;
    this.messages[index] = {
      ...message,
      body: '',
      contentPurge: { actor: 'local-human' },
    } as ChannelMessage;
    this.log.record(this.id, messageId);
  }

  follow(entry: Socket, streamId: string, limit: number): void {
    this.followers.set(streamId, { entry, streamId });
    const cursor = this.revision;
    this.send(streamId, {
      type: 'opened',
      cursor,
      page:
        limit === 0
          ? { entries: [], olderCursor: null, hasOlder: this.messages.length > 0 }
          : this.page(cursor, undefined, limit)!,
    });
    this.send(streamId, {
      type: 'notification',
      notification: {
        kind: 'draft-baseline',
        channelId: this.id,
        revision: Math.max(0, ...this.baselineDrafts.map((draft) => draft.revision)),
        drafts: structuredClone(this.baselineDrafts),
      },
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

  react(messageId: string, reactions: NonNullable<ChannelMessage['reactions']>): void {
    const message = this.messages.find((entry) => entry.id === messageId);
    if (message === undefined) return;
    if (reactions.length === 0) delete message.reactions;
    else message.reactions = reactions;
    this.emit({
      type: 'notification',
      notification: { kind: 'reaction', channelId: this.id, messageId, reactions },
    });
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
  constructor(readonly hostId = 'host-1') {}
  readonly credential = 'device-1.secret-1';
  offer = 'offer-1';
  revoked = false;
  up = true;
  olderHost = false;
  changes = true;
  refusesEmptyPage = false;
  changesFail = false;
  changesStall = false;
  changesHeld: Promise<void> | undefined;
  readonly log = new ChangeLog();
  deviceSnapshot: unknown;
  private sockets = new Set<Socket>();
  readonly requests: string[] = [];
  readonly unreachable = new Set<string>();
  readonly answers = new Map<string, (args: Record<string, unknown>) => unknown>();
  readonly calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  readonly channels = new Map<string, FakeChannel>();
  readonly methods = new Map<string, (args: Record<string, unknown>) => unknown>([
    ['ping', () => ({ ok: true })],
    [
      'settings/describe',
      () => ({
        namespaces: [{ ns: 'botharness-client', value: { sortMode: 'updated', sortModes: {} } }],
      }),
    ],
  ]);
  readonly failing = new Set<string>();
  readonly uploads: Array<{ name: string; type: string; text: string }> = [];

  channel(id: string): FakeChannel {
    let channel = this.channels.get(id);
    if (channel === undefined) {
      channel = new FakeChannel(id, this.log);
      this.channels.set(id, channel);
    }
    return channel;
  }

  readonly carrier: HostCarrier = {
    request: async (url, init) => {
      await Promise.resolve();
      this.requests.push(`${init.method} ${url}`);
      const parsed = new URL(url);
      if (!this.up || this.unreachable.has(parsed.origin))
        throw new TypeError('Network request failed');
      if (parsed.pathname === '/botharness-device/pair') {
        const body = JSON.parse(String(init.body ?? '{}')) as { offer?: string };
        if (body.offer !== this.offer) return response(401, '{"code":"offer-invalid"}');
        this.offer = 'used';
        return response(
          200,
          JSON.stringify({
            deviceId: 'device-1',
            credential: this.credential,
            host: { id: this.hostId, name: 'studio' },
          }),
        );
      }
      const refusal = this.refusal(init.headers?.['authorization']);
      if (refusal !== undefined) return response(401, JSON.stringify({ code: refusal }));
      if (parsed.pathname === '/botharness-device/api/botharness/attachment/upload') {
        if (this.failing.has('upload')) throw new TypeError('Network request failed');
        const name = parsed.searchParams.get('name') ?? '';
        const body = init.body as Blob;
        const text = await body.text();
        this.uploads.push({ name, type: body.type, text });
        if (body.type !== 'application/octet-stream')
          return response(502, '{"code":"host-session-unavailable"}');
        return response(
          200,
          JSON.stringify({
            attachment: {
              name,
              mime: 'text/plain',
              size: text.length,
              hash: `sha256:${String(this.uploads.length).padStart(64, '0')}`,
            },
          }),
        );
      }
      if (parsed.pathname === '/botharness-device/api/computer/status') return response(404, '{}');
      if (parsed.pathname === '/botharness-device/api/botharness/devices')
        return response(
          this.deviceSnapshot === undefined ? 404 : 200,
          JSON.stringify(this.deviceSnapshot ?? {}),
        );
      const method = parsed.pathname.replace(
        /^\/botharness-device\/api\/(?:botharness\/)?/u,
        '',
      ) as Rpc;
      const body = JSON.parse(String(init.body ?? '{}')) as {
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
            error: {
              code: (error as { code?: string }).code ?? 'invalid-input',
              message: (error as Error).message,
              details: {},
            },
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
    openSocket: (url, events, headers) => {
      const entry = { events, streams: new Map<string, string>(), device: true };
      queueMicrotask(() => {
        if (!this.up || this.unreachable.has(new URL(url.replace(/^ws/u, 'http')).origin))
          return events.closed('connection refused');
        if (
          !url.endsWith('/botharness-device/api/remote.mux') ||
          this.refusal(headers?.['authorization']) !== undefined
        )
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
              channel?.follows.push({ ...args });
              if (this.olderHost && 'drafts' in args)
                entry.events.message(
                  JSON.stringify({
                    type: 'error',
                    streamId: frame.streamId,
                    error: {
                      code: 'gateway/arguments-invalid',
                      message: 'args fields do not match the descriptor: unexpected "drafts"',
                      details: {},
                    },
                  }),
                );
              else if (channel === undefined)
                entry.events.message(
                  JSON.stringify({
                    type: 'error',
                    streamId: frame.streamId,
                    error: { code: 'not-found', message: 'Unknown Channel', details: {} },
                  }),
                );
              else if (this.refusesEmptyPage && args.limit === 0)
                entry.events.message(
                  JSON.stringify({
                    type: 'error',
                    streamId: frame.streamId,
                    error: { code: 'invalid', message: 'Invalid Channel page size', details: {} },
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

  private refusal(authorization: string | undefined): string | undefined {
    if (authorization === undefined) return 'device-credential-missing';
    if (authorization !== `Device ${this.credential}`) return 'device-unknown';
    return this.revoked ? 'device-revoked' : undefined;
  }

  revoke(): void {
    this.revoked = true;
    for (const entry of this.sockets) {
      this.sockets.delete(entry);
      entry.events.closed('');
    }
  }

  private channelMethod(method: string): ((args: Record<string, unknown>) => unknown) | undefined {
    if (method === 'channelDm')
      return (args) => {
        const channel = this.channel(`dm-${String(args['slug'])}`);
        return { channel: { id: channel.id, type: 'dm', botSlug: args['slug'] } };
      };
    if (method === 'channelChangeCursor')
      return () => {
        if (!this.changes) throw Object.assign(new Error('Unknown method'), { code: 'not-found' });
        return { epoch: this.log.epoch, seq: this.log.seq };
      };
    if (method === 'channelChanges')
      return async (args) => {
        const held = this.changesHeld;
        this.changesHeld = undefined;
        if (held !== undefined) {
          await held;
          throw new Error('Host busy');
        }
        if (!this.changes) throw Object.assign(new Error('Unknown method'), { code: 'not-found' });
        if (this.changesFail) throw new Error('Host busy');
        const channel = this.channels.get(String(args['channelId']));
        if (channel === undefined) throw new Error('Unknown Channel');
        const since = args['sinceSeq'] as number;
        if (this.changesStall)
          return {
            upserts: [],
            tombstones: [],
            removed: [],
            channelChanged: false,
            readChanged: false,
            cursor: { epoch: this.log.epoch, seq: since },
            hasMore: true,
          };
        const cursor = { epoch: this.log.epoch, seq: this.log.seq };
        if (args['epoch'] !== this.log.epoch || since < this.log.floor || since > cursor.seq)
          return { reset: true, cursor };
        const limit = (args['limit'] as number | undefined) ?? 200;
        const rows = this.log.rows.filter((row) => row.channelId === channel.id && row.seq > since);
        const page = rows.slice(0, limit);
        const ids = [
          ...new Set(page.flatMap((row) => (row.messageId === null ? [] : [row.messageId]))),
        ];
        const entries = ids.flatMap((id) => {
          const index = channel.messages.findIndex((message) => message.id === id);
          return index < 0
            ? []
            : [{ channelId: channel.id, message: channel.messages[index]!, revision: index + 1 }];
        });
        channel.bodiesSent += entries.length;
        const purged = (entry: (typeof entries)[number]) =>
          (entry.message as { contentPurge?: unknown }).contentPurge !== undefined;
        return {
          upserts: entries.filter((entry) => !purged(entry)),
          tombstones: entries.filter(purged).map((entry) => entry.message.id),
          removed: ids.filter((id) => !channel.messages.some((message) => message.id === id)),
          channelChanged: false,
          readChanged: false,
          cursor: { epoch: cursor.epoch, seq: rows.length > limit ? page.at(-1)!.seq : cursor.seq },
          hasMore: rows.length > limit,
        };
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
        channel.append({
          id,
          body: String(args['body']),
          author: { kind: 'human' },
          ...(args['attachments'] === undefined
            ? {}
            : { attachments: args['attachments'] as NonNullable<ChannelMessage['attachments']> }),
        });
        return { message: channel.messages.at(-1) };
      };
    if (method === 'channelReact')
      return (args) => {
        const channel = this.channels.get(String(args['channelId']));
        const message = channel?.messages.find((entry) => entry.id === args['messageId']);
        if (channel === undefined || message === undefined) throw new Error('Unknown message');
        const emoji = String(args['emoji']);
        const others = (message.reactions ?? [])
          .map((reaction) => ({
            emoji: reaction.emoji,
            actors: reaction.actors.filter(
              (actor) => reaction.emoji !== emoji || actor.kind !== 'human',
            ),
          }))
          .filter((reaction) => reaction.actors.length > 0);
        const existing = others.find((reaction) => reaction.emoji === emoji);
        const me = { kind: 'human' as const, id: 'local-human' };
        const reactions =
          args['active'] !== true
            ? others
            : existing === undefined
              ? [...others, { emoji, actors: [me] }]
              : others.map((reaction) =>
                  reaction === existing ? { emoji, actors: [...reaction.actors, me] } : reaction,
                );
        channel.react(message.id, reactions);
        return { reactions };
      };
    return undefined;
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

  endFollower(endpoint: 'botharness/followRoster' | 'botharness/followChannel'): void {
    for (const entry of this.sockets) {
      const streamId = entry.streams.get(endpoint);
      if (streamId !== undefined) entry.events.message(JSON.stringify({ type: 'end', streamId }));
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
    this.up = true;
  }
}

function response(status: number, body: string) {
  return { status, text: async () => body };
}
