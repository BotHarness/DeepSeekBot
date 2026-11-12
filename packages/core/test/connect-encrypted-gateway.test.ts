import { encryptedCarrier } from '../../../apps/mobile/src/host/encrypted-carrier.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { expect, it, vi } from 'vitest';
import type {
  LocalVideoBinding,
  LocalVideoState,
} from '../../computer/src/local-video-contract.js';
import {
  createEncryptedGateway,
  type CallChannelDiagnostic,
} from '../src/devices/encrypted-gateway.js';
import { createDeviceGateway } from '../src/devices/gateway.js';
import { ConnectChannel } from '../src/devices/noise/channel.js';
import { noisePublicKey } from '../src/devices/noise/xk.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it.each(['connect', 'lan'] as const)(
  '%s admits only the approved Noise key, forwards private RPC and push settings, and closes on device revocation',
  async (route) => {
    const origin = route === 'lan' ? 'http://192.168.1.20:39101' : 'https://host.deepseekbot.dev';
    const owner = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('noise-gateway-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'Host',
    });
    const hostKey = randomBytes(32),
      deviceKey = randomBytes(32);
    const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
    const offer = pairing.createOffer();
    pairing.requestKey({ offer: offer.offer, publicKey });
    pairing.approveKey(offer.receipt, publicKey);
    const paired = pairing.redeem({ offer: offer.offer, publicKey });
    if (!paired.ok) throw new Error('pairing failed');
    const observed: string[] = [];
    const appVersions: (string | string[] | undefined)[] = [];
    const server = createServer(async (request, response) => {
      expect(request.headers.authorization).toBe(`Device ${paired.credential}`);
      appVersions.push(request.headers['x-tobs-app-version']);
      if (request.url === '/botharness-device/push') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            registered: false,
            enabled: false,
            preferences: { approval: true, question: true, 'private-input': true, reply: true },
            quietChannelIds: [],
          }),
        );
        return;
      }
      let body = '';
      for await (const chunk of request) body += String(chunk);
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const gateway = createEncryptedGateway({
      route,
      pairing,
      key: async () => Uint8Array.from(hostKey),
      port: () => port,
    });
    server.on('upgrade', (req, socket, head) => gateway.upgrade(req, socket, head));
    const channel = new ConnectChannel({
      route,
      role: 'initiator',
      hostId: pairing.host().id,
      staticKey: deviceKey,
      ephemeralKey: randomBytes(32),
      hostKey: noisePublicKey(hostKey),
    });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
    const answers: Record<string, unknown>[] = [];
    let next: (() => void) | undefined;
    socket.on('message', (data) => {
      const wire = data.toString();
      observed.push(wire);
      const result = channel.receive(wire);
      if (result.reply) socket.send(result.reply);
      if (result.ready)
        for (const frame of channel.send(
          JSON.stringify({ type: 'admit', credential: paired.credential }),
        ))
          socket.send(frame);
      if (result.message) {
        answers.push(JSON.parse(result.message));
        next?.();
      }
    });
    const wait = async () => {
      if (answers.length) return answers.shift()!;
      await new Promise<void>((resolve) => {
        next = resolve;
      });
      next = undefined;
      return answers.shift()!;
    };
    try {
      await new Promise<void>((resolve) => socket.once('open', resolve));
      socket.send(channel.start());
      expect(await wait()).toMatchObject({ type: 'admitted' });
      const sentinel = 'disposable-private-value';
      for (const frame of channel.send(
        JSON.stringify({
          type: 'request',
          id: '1',
          method: 'POST',
          path: '/botharness-device/api/botharness/privateInputSubmit',
          body: sentinel,
          appVersion: '1.7.0',
        }),
      )) {
        observed.push(frame);
        socket.send(frame);
      }
      const answer = await wait();
      expect(Buffer.from(String(answer.body), 'base64').toString()).toBe(sentinel);
      expect(observed.join('')).not.toContain(sentinel);
      expect(appVersions.at(-1)).toBe('1.7.0');
      const carrier = encryptedCarrier({
        hostId: pairing.host().id,
        credential: paired.credential,
        encryption: {
          protocol: 'connect-noise-xk-v1',
          hostKey: Buffer.from(noisePublicKey(hostKey)).toString('hex'),
          deviceKey: deviceKey.toString('hex'),
        },
        raw: {
          request: async () => {
            throw new Error('plaintext request forbidden');
          },
          openSocket: (url, events, headers) => {
            expect(headers).toBeUndefined();
            expect(url).toBe(`${origin.replace(/^http/u, 'ws')}/botharness-device/channel`);
            const peer = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
            peer.on('open', events.open);
            peer.on('message', (data) => events.message(data.toString()));
            peer.on('close', () => events.closed('closed'));
            peer.on('error', () => events.closed('error'));
            return {
              send: (text) => {
                observed.push(text);
                peer.send(text);
              },
              close: () => peer.close(),
            };
          },
        },
      });
      try {
        const response = await carrier.request(
          `${origin}/botharness-device/api/botharness/privateInputSubmit`,
          {
            method: 'POST',
            body: sentinel,
            headers: {
              authorization: `Device ${paired.credential}`,
              'x-tobs-app-version': '1.7.1',
            },
            signal: new AbortController().signal,
          },
        );
        expect(await response.text()).toBe(sentinel);
        expect(appVersions.at(-1)).toBe('1.7.1');
        const activity = await carrier.request(`${origin}/botharness-device/activity/register`, {
          method: 'POST',
          body: 'private-activity-token',
          signal: new AbortController().signal,
        });
        expect(activity.status).toBe(200);
        expect(await activity.text()).toBe('private-activity-token');
        expect(observed.join('')).not.toContain('private-activity-token');
        const settings = await carrier.request(`${origin}/botharness-device/push`, {
          method: 'GET',
          signal: new AbortController().signal,
        });
        expect(settings.status).toBe(200);
        expect(JSON.parse(await settings.text())).toMatchObject({
          registered: false,
          quietChannelIds: [],
        });

        expect(observed.join('')).not.toContain(paired.credential);
      } finally {
        carrier.close?.();
      }
      const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
      pairing.revoke(paired.device.id);
      await closed;
    } finally {
      socket.terminate();
      channel.close();
      gateway.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

async function endpointFixture(
  options: Pick<
    Parameters<typeof createEncryptedGateway>[0],
    'route' | 'localVideo' | 'voiceCall' | 'changed' | 'callDiagnostic'
  > = {},
) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('noise-endpoint-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Host',
  });
  const hostKey = randomBytes(32),
    deviceKey = randomBytes(32);
  const publicKey = Buffer.from(noisePublicKey(deviceKey)).toString('hex');
  const offer = pairing.createOffer();
  pairing.requestKey({ offer: offer.offer, publicKey });
  pairing.approveKey(offer.receipt, publicKey);
  const paired = pairing.redeem({ offer: offer.offer, publicKey });
  if (!paired.ok) throw new Error('pairing failed');
  const effects: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/botharness-device/api/voice/call')
      return direct.handle(request, response);
    let body = '';
    for await (const chunk of request) body += String(chunk);
    effects.push(body);
    if (!body.startsWith('hold-')) response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const direct = createDeviceGateway({
    pairing,
    port: () => port,
    authenticatedUrl: (url) => url,
    ...(options.voiceCall ? { voiceCall: options.voiceCall } : {}),
  });
  const gateway = createEncryptedGateway({
    ...options,
    pairing,
    key: async () => Uint8Array.from(hostKey),
    port: () => port,
  });
  const streams = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/botharness-device/api/remote.mux') {
      streams.handleUpgrade(req, socket, head, (peer) => {
        peer.on('message', (data) => peer.send(data.toString()));
      });
    } else void gateway.upgrade(req, socket, head);
  });
  const peers: { socket: WebSocket; channel: ConnectChannel }[] = [];
  const connect = async (key = deviceKey, expectedHostKey = noisePublicKey(hostKey)) => {
    const channel = new ConnectChannel({
      route: options.route ?? 'connect',
      role: 'initiator',
      hostId: pairing.host().id,
      staticKey: key,
      ephemeralKey: randomBytes(32),
      hostKey: expectedHostKey,
    });
    const socket = new WebSocket(`ws://127.0.0.1:${port}/botharness-device/channel`);
    peers.push({ socket, channel });
    const answers: Record<string, unknown>[] = [];
    const waiters: ((value: Record<string, unknown>) => void)[] = [];
    const closed = new Promise<string>((resolve) =>
      socket.once('close', (_code, reason) => resolve(reason.toString())),
    );
    const frames = (value: unknown) => channel.send(JSON.stringify(value));
    const send = (value: unknown) => {
      for (const wire of frames(value)) socket.send(wire);
    };
    socket.on('message', (data) => {
      const result = channel.receive(data.toString());
      if (result.reply) socket.send(result.reply);
      if (result.ready) send({ type: 'admit', credential: paired.credential });
      if (result.message) {
        const value = JSON.parse(result.message) as Record<string, unknown>;
        const waiter = waiters.shift();
        if (waiter) waiter(value);
        else answers.push(value);
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    socket.send(channel.start());
    const next = () =>
      answers.length
        ? Promise.resolve(answers.shift()!)
        : new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
    return { socket, channel, frames, send, next, closed };
  };
  return {
    effects,
    connect,
    pairing,
    deviceId: paired.device.id,
    async httpCall(kind: string) {
      const response = await fetch(`http://127.0.0.1:${port}/botharness-device/api/voice/call`, {
        method: 'POST',
        headers: {
          authorization: `Device ${paired.credential}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind, callId: 'call-a123', slug: 'mira' }),
      });
      return response.json();
    },
    async close() {
      for (const { socket, channel } of peers) {
        socket.terminate();
        channel.close();
      }
      gateway.close();
      for (const peer of streams.clients) peer.terminate();
      streams.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const endpointRequest = (id: string) => ({
  type: 'request',
  id,
  method: 'POST',
  path: '/botharness-device/api/botharness/privateInputSubmit',
  body: `effect-${id}`,
});

const videoRequest = (id: string, command: unknown = { kind: 'open' }) => ({
  type: 'request',
  id,
  method: 'POST',
  path: '/botharness-device/api/computer/video',
  body: JSON.stringify(command),
});
const videoBinding: LocalVideoBinding = {
  computerId: 'local',
  runtimeId: 'runtime',
  viewerId: 'viewer',
  attemptId: 'attempt',
};
const videoState = (binding = videoBinding): LocalVideoState => ({
  computerId: 'local',
  runtimeId: binding.runtimeId,
  binding,
  paused: true,
  viewerCount: 1,
  controlHeld: false,
  controller: false,
  lastInputSequence: 0,
  media: { status: 'live', captureAlive: true, width: 1920, height: 1080 },
});
const responseBody = (response: Record<string, unknown>) =>
  JSON.parse(Buffer.from(String(response.body), 'base64').toString());

const callRequest = (id: string, kind: string) => ({
  type: 'request',
  id,
  method: 'POST',
  path: '/botharness-device/api/voice/call',
  body: JSON.stringify({ kind, callId: 'call-a123', slug: 'mira' }),
});
const liveCall = {
  callId: 'call-a123',
  slug: 'mira',
  channelId: 'channel-test',
  phase: 'listening',
  muted: false,
  busy: false,
  media: 'webrtc',
  startedAt: 1,
  durationMs: 1,
  events: [],
  lastSeq: 0,
} as const;

it('compensates an open whose response cannot be queued to the encrypted socket', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const events: CallChannelDiagnostic[] = [];
  const voiceCall = vi
    .fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['voiceCall']>>()
    .mockImplementation(async ({ command }) => {
      if ((command as { kind: string }).kind === 'open') {
        entered();
        await gate;
      }
      return { ok: true, call: liveCall };
    });
  const f = await endpointFixture({
    route: 'lan',
    voiceCall,
    callDiagnostic: (event) => events.push(event),
  });
  let send: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const a = await f.connect();
    expect(await a.next()).toMatchObject({ type: 'admitted' });
    a.send(callRequest('open', 'open'));
    await started;
    send = vi.spyOn(WebSocket.prototype, 'send').mockImplementationOnce(() => {
      throw new Error('private socket error');
    });
    release();
    await a.closed;
    await vi.waitFor(() =>
      expect(voiceCall.mock.calls.map(([input]) => input.command)).toContainEqual({
        kind: 'hangup',
        callId: liveCall.callId,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        phase: 'abandoned-open-cleanup',
        trigger: 'send-failed',
        callId: liveCall.callId,
      }),
    );
    expect(JSON.stringify(events)).not.toContain('private socket error');
  } finally {
    send?.mockRestore();
    release();
    await f.close();
  }
});

it.each([
  { kind: 'open', closed: false },
  { kind: 'heartbeat', closed: false },
  { kind: 'open', closed: true },
  { kind: 'heartbeat', closed: true },
])('only compensates undelivered $kind with closed=$closed', async ({ kind, closed }) => {
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const voiceCall = vi
    .fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['voiceCall']>>()
    .mockImplementation(async ({ command }) => {
      if ((command as { kind: string }).kind === kind) {
        entered();
        await gate;
      }
      return { ok: true, call: liveCall };
    });
  const f = await endpointFixture({ route: 'lan', voiceCall });
  try {
    const a = await f.connect();
    expect(await a.next()).toMatchObject({ type: 'admitted' });
    if (kind === 'heartbeat') {
      a.send(callRequest('open', 'open'));
      await a.next();
    }
    a.send(callRequest('pending', kind));
    await started;
    if (closed) {
      a.socket.close();
      await a.closed;
    } else {
      a.send({ type: 'cancel', id: 'pending' });
      a.send({ type: 'ping' });
      expect(await a.next()).toMatchObject({ type: 'pong' });
    }
    await vi.waitFor(() =>
      expect(
        voiceCall.mock.calls.find(
          ([input]) => (input.command as { kind: string }).kind === kind,
        )?.[0].signal.aborted,
      ).toBe(true),
    );
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!closed) {
      a.send({ type: 'ping' });
      expect(await a.next()).toMatchObject({ type: 'pong' });
    }
    const hangups = voiceCall.mock.calls.filter(
      ([input]) => (input.command as { kind: string }).kind === 'hangup',
    );
    expect(hangups).toHaveLength(kind === 'open' ? 1 : 0);
  } finally {
    release();
    await f.close();
  }
});

it.each(['channel B', 'HTTP'])(
  'does not hang up a call recovered on %s when channel A closes',
  async (route) => {
    let encrypted = 0;
    const voiceCall = vi
      .fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['voiceCall']>>()
      .mockResolvedValue({ ok: true, call: liveCall });
    const f = await endpointFixture({
      route: 'lan',
      voiceCall,
      changed: (state) => {
        encrypted = state.encrypted;
      },
    });
    try {
      const a = await f.connect(),
        b = await f.connect();
      expect(await a.next()).toMatchObject({ type: 'admitted' });
      expect(await b.next()).toMatchObject({ type: 'admitted' });
      a.send(callRequest('open', 'open'));
      expect(responseBody(await a.next())).toMatchObject({
        ok: true,
        call: { callId: liveCall.callId },
      });
      if (route === 'HTTP')
        expect(await f.httpCall('heartbeat')).toMatchObject({
          ok: true,
          call: { callId: liveCall.callId },
        });
      else {
        b.send(callRequest('heartbeat', 'heartbeat'));
        expect(responseBody(await b.next())).toMatchObject({
          ok: true,
          call: { callId: liveCall.callId },
        });
      }
      a.socket.close();
      await a.closed;
      await vi.waitFor(() => expect(encrypted).toBe(1));
      expect(voiceCall.mock.calls.map(([input]) => input.command)).toEqual([
        { kind: 'open', callId: 'call-a123', slug: 'mira' },
        { kind: 'heartbeat', callId: 'call-a123', slug: 'mira' },
      ]);
    } finally {
      await f.close();
    }
  },
);

it.each(['disconnect', 'revoke'] as const)(
  'leaves delivered-call lifetime to its owner on same-channel %s',
  async (reason) => {
    let encrypted = 0;
    const events: CallChannelDiagnostic[] = [];
    const voiceCall = vi
      .fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['voiceCall']>>()
      .mockResolvedValue({ ok: true, call: liveCall });
    const f = await endpointFixture({
      route: 'lan',
      voiceCall,
      changed: (state) => {
        encrypted = state.encrypted;
      },
      callDiagnostic: (event) => {
        events.push(event);
        throw new Error('observer failure');
      },
    });
    try {
      const a = await f.connect();
      expect(await a.next()).toMatchObject({ type: 'admitted' });
      a.send(callRequest('open', 'open'));
      await a.next();
      if (reason === 'revoke') f.pairing.revoke(f.deviceId);
      else a.socket.close();
      await a.closed;
      await vi.waitFor(() => expect(encrypted).toBe(0));
      expect(voiceCall).toHaveBeenCalledTimes(1);
      expect(events).toEqual([
        {
          channelId: expect.stringMatching(/^channel-\d+$/),
          route: 'lan',
          phase: 'channel-close',
          trigger: reason === 'revoke' ? 'revoked' : 'socket-close',
          callId: liveCall.callId,
        },
      ]);
      expect(JSON.stringify(events)).not.toMatch(/credential|token|http|PRIVATE/);
    } finally {
      await f.close();
    }
  },
);

it.each(['lan', 'connect'] as const)(
  '%s video uses only server-owned route and Noise-admitted identity',
  async (route) => {
    const localVideo = vi
      .fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>>()
      .mockResolvedValue({ ok: false, code: 'media-not-live', error: 'No live picture.' });
    const f = await endpointFixture({ route, localVideo });
    try {
      const peer = await f.connect();
      expect(await peer.next()).toMatchObject({ type: 'admitted' });
      peer.send({
        ...videoRequest('video', { kind: 'status', deviceId: 'forged' }),
        route: 'lan',
        deviceId: 'forged',
        headers: {
          'x-botharness-device-route': 'lan',
          authorization: 'Device forged',
          cookie: 'host-owner',
        },
      });
      expect(responseBody(await peer.next())).toMatchObject({
        code: route === 'lan' ? 'media-not-live' : 'connect-carrier-required',
      });
      if (route === 'lan')
        expect(localVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: f.deviceId,
            command: { kind: 'status', deviceId: 'forged' },
          }),
        );
      else expect(localVideo).not.toHaveBeenCalled();
      expect(f.effects).toEqual([]);
    } finally {
      await f.close();
    }
  },
);

it.each([
  '/botharness-device/api/%63omputer/video',
  '/botharness-device/api/computer/%76ideo',
  '/botharness-device/api//computer/video/',
  '/botharness-device/api/computer/video?route=lan',
  '/botharness-device/web/api/computer/video',
  '/botharness-device/api/other/../computer/video',
  '/botharness-device/api/%2e/computer/video',
  '/botharness-device/api%2fcomputer/video',
  '/botharness-device/api%5ccomputer/video',
])('refuses encrypted Connect video alias %s without owner or upstream effects', async (path) => {
  const localVideo =
    vi.fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>>();
  const f = await endpointFixture({ localVideo });
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    peer.send({ ...videoRequest('alias'), path });
    await peer.closed;
    expect(localVideo).not.toHaveBeenCalled();
    expect(f.effects).toEqual([]);
  } finally {
    await f.close();
  }
});

it('cancels a pending LAN open, closes its late attempt, and never affects another connection', async () => {
  let finish!: (result: { ok: true; state: LocalVideoState }) => void;
  let started!: () => void;
  let retired!: () => void;
  let pendingSignal: AbortSignal | undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    retired = resolve;
  });
  const localVideo = vi.fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>>(
    async ({ command, signal }) => {
      if ((command as { kind: string }).kind === 'open') {
        pendingSignal = signal;
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      retired();
      return { ok: true, state: videoState() };
    },
  );
  const f = await endpointFixture({ route: 'lan', localVideo });
  try {
    const peer = await f.connect(),
      other = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    expect(await other.next()).toMatchObject({ type: 'admitted' });
    peer.send(videoRequest('pending'));
    await ready;
    peer.send({ type: 'cancel', id: 'pending' });
    peer.send({ type: 'ping' });
    expect(await peer.next()).toMatchObject({ type: 'pong' });
    expect(pendingSignal?.aborted).toBe(true);
    finish({ ok: true, state: videoState() });
    await closed;
    expect(localVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deviceId: f.deviceId,
        command: { kind: 'close', binding: videoBinding },
      }),
    );
    other.send({ type: 'ping' });
    expect(await other.next()).toMatchObject({ type: 'pong' });
    peer.send({ type: 'ping' });
    expect(await peer.next()).toMatchObject({ type: 'pong' });
    expect(localVideo).toHaveBeenCalledTimes(2);
    expect(f.effects).toEqual([]);
  } finally {
    await f.close();
  }
});

it.each(['disconnect', 'revoke'] as const)(
  'closes an established LAN attempt on %s after its request has finished',
  async (reason) => {
    let retired!: () => void;
    const closed = new Promise<void>((resolve) => {
      retired = resolve;
    });
    const localVideo = vi.fn<
      NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>
    >(async ({ command }) => {
      if ((command as { kind: string }).kind === 'close') retired();
      return { ok: true, state: videoState() };
    });
    const f = await endpointFixture({ route: 'lan', localVideo });
    try {
      const peer = await f.connect();
      expect(await peer.next()).toMatchObject({ type: 'admitted' });
      peer.send(videoRequest('open'));
      expect(responseBody(await peer.next())).toMatchObject({
        ok: true,
        state: { binding: videoBinding },
      });
      if (reason === 'revoke') f.pairing.revoke(f.deviceId);
      else peer.socket.close();
      await closed;
      expect(localVideo).toHaveBeenLastCalledWith(
        expect.objectContaining({ command: { kind: 'close', binding: videoBinding } }),
      );
      expect(f.effects).toEqual([]);
    } finally {
      await f.close();
    }
  },
);

it.each(['disconnect', 'revoke'] as const)(
  'cancels pending LAN open on %s and retires a late success',
  async (reason) => {
    let finish!: (result: { ok: true; state: LocalVideoState }) => void;
    let started!: () => void, cancelled!: () => void, retired!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      retired = resolve;
    });
    const localVideo = vi.fn<
      NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>
    >(async ({ command, signal }) => {
      if ((command as { kind: string }).kind === 'open') {
        signal.addEventListener('abort', cancelled, { once: true });
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      retired();
      return { ok: true, state: videoState() };
    });
    const f = await endpointFixture({ route: 'lan', localVideo });
    try {
      const peer = await f.connect();
      expect(await peer.next()).toMatchObject({ type: 'admitted' });
      peer.send(videoRequest('pending'));
      await ready;
      if (reason === 'revoke') f.pairing.revoke(f.deviceId);
      else peer.socket.close();
      await aborted;
      finish({ ok: true, state: videoState() });
      await closed;
      expect(localVideo).toHaveBeenCalledTimes(2);
      expect(localVideo).toHaveBeenLastCalledWith(
        expect.objectContaining({ command: { kind: 'close', binding: videoBinding } }),
      );
      expect(f.effects).toEqual([]);
    } finally {
      await f.close();
    }
  },
);

it('request-ID reuse cannot steal a late open completion or close a fresh attempt', async () => {
  let finish!: (result: { ok: true; state: LocalVideoState }) => void;
  let started!: () => void, retireOld!: () => void, retireNew!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const oldClosed = new Promise<void>((resolve) => {
    retireOld = resolve;
  });
  const newClosed = new Promise<void>((resolve) => {
    retireNew = resolve;
  });
  const replacement = { ...videoBinding, attemptId: 'replacement', viewerId: 'replacement-viewer' };
  let opens = 0;
  const localVideo = vi.fn<NonNullable<Parameters<typeof createEncryptedGateway>[0]['localVideo']>>(
    async ({ command }) => {
      const operation = command as { kind: string; binding?: LocalVideoBinding };
      if (operation.kind === 'open' && ++opens === 1) {
        started();
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      if (operation.kind === 'close') {
        if (operation.binding?.attemptId === videoBinding.attemptId) retireOld();
        else if (operation.binding?.attemptId === replacement.attemptId) retireNew();
      }
      return { ok: true, state: videoState(replacement) };
    },
  );
  const f = await endpointFixture({ route: 'lan', localVideo });
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    peer.send(videoRequest('same-id'));
    await ready;
    peer.send({ type: 'cancel', id: 'same-id' });
    peer.send(videoRequest('same-id'));
    expect(responseBody(await peer.next())).toMatchObject({ state: { binding: replacement } });
    finish({ ok: true, state: videoState() });
    await oldClosed;
    peer.send({ type: 'ping' });
    expect(await peer.next()).toMatchObject({ type: 'pong' });
    expect(localVideo).toHaveBeenCalledTimes(3);
    expect(localVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: { kind: 'close', binding: videoBinding } }),
    );
    peer.socket.close();
    await newClosed;
    expect(localVideo).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: { kind: 'close', binding: replacement } }),
    );
    expect(f.effects).toEqual([]);
  } finally {
    await f.close();
  }
});

it.each(['tamper', 'replay', 'reconnect-replay'] as const)(
  'rejects %s at the receiving endpoint without an extra application effect',
  async (fault) => {
    const f = await endpointFixture();
    try {
      let peer = await f.connect();
      expect(await peer.next()).toMatchObject({ type: 'admitted' });
      let wire = peer.frames(endpointRequest('one'))[0]!;
      if (fault !== 'tamper') {
        peer.socket.send(wire);
        expect(await peer.next()).toMatchObject({ type: 'response', id: 'one' });
        expect(f.effects).toEqual(['effect-one']);
      }
      if (fault === 'reconnect-replay') {
        peer.socket.close();
        await peer.closed;
        peer = await f.connect();
        expect(await peer.next()).toMatchObject({ type: 'admitted' });
      }
      if (fault === 'tamper') wire = wire.slice(0, -2) + (wire.endsWith('00') ? '01' : '00');
      peer.socket.send(wire);
      await peer.closed;
      expect(f.effects).toEqual(fault === 'tamper' ? [] : ['effect-one']);
    } finally {
      await f.close();
    }
  },
);

it('keeps concurrent sends ordered and refuses a revoked device on a fresh channel', async () => {
  const f = await endpointFixture();
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        Promise.resolve().then(() => peer.send(endpointRequest(String(i)))),
      ),
    );
    const replies = await Promise.all(Array.from({ length: 16 }, () => peer.next()));
    expect(replies.map((r) => r.id).sort()).toEqual(
      Array.from({ length: 16 }, (_, i) => String(i)).sort(),
    );
    expect([...f.effects].sort()).toEqual(
      Array.from({ length: 16 }, (_, i) => `effect-${i}`).sort(),
    );
    f.pairing.revoke(f.deviceId);
    await peer.closed;
    const reconnect = await f.connect();
    expect(await reconnect.next()).toMatchObject({ type: 'refused' });
    await reconnect.closed;
    expect(f.effects).toHaveLength(16);
  } finally {
    await f.close();
  }
});

it('refuses a substituted device key even with the valid device credential', async () => {
  const f = await endpointFixture();
  try {
    const peer = await f.connect(randomBytes(32));
    expect(await peer.next()).toMatchObject({ type: 'refused' });
    await peer.closed;
    expect(f.effects).toEqual([]);
  } finally {
    await f.close();
  }
});

it('keeps a replacement logical stream alive when the old instance closes later', async () => {
  const f = await endpointFixture();
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    const open = { type: 'open', id: 'stream', path: '/botharness-device/api/remote.mux' };
    peer.send(open);
    expect(await peer.next()).toMatchObject({ type: 'opened', id: 'stream' });
    peer.send({ type: 'close', id: 'stream' });
    peer.send(open);
    expect(await peer.next()).toMatchObject({ type: 'opened', id: 'stream' });
    peer.send({ type: 'send', id: 'stream', text: 'replacement' });
    expect(await peer.next()).toMatchObject({ type: 'message', id: 'stream', text: 'replacement' });
    expect(f.effects).toEqual([]);
  } finally {
    await f.close();
  }
});

it('bounds in-flight work for a slow upstream and closes without admitting excess work', async () => {
  const f = await endpointFixture();
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    for (let i = 0; i < 33; i++) peer.send({ ...endpointRequest(String(i)), body: `hold-${i}` });
    await peer.closed;
    expect(f.effects.length).toBeLessThanOrEqual(32);
    expect(f.effects).not.toContain('hold-32');
  } finally {
    await f.close();
  }
});

it('does not let a cancelled request callback consume its replacement request', async () => {
  const f = await endpointFixture();
  try {
    const peer = await f.connect();
    expect(await peer.next()).toMatchObject({ type: 'admitted' });
    peer.send({ ...endpointRequest('same'), body: 'hold-old' });
    await expect.poll(() => f.effects).toEqual(['hold-old']);
    peer.send({ type: 'cancel', id: 'same' });
    peer.send(endpointRequest('same'));
    const result = await peer.next();
    expect(result).toMatchObject({ type: 'response', id: 'same', status: 200 });
    expect(Buffer.from(String(result.body), 'base64').toString()).toBe('effect-same');
    expect(f.effects).toEqual(['hold-old', 'effect-same']);
  } finally {
    await f.close();
  }
});

it('tells a phone paired with another Host key that the handshake was rejected', async () => {
  const f = await endpointFixture({ route: 'lan' });
  try {
    const peer = await f.connect(undefined, noisePublicKey(randomBytes(32)));
    expect(await peer.closed).toBe('channel-handshake-rejected');
  } finally {
    await f.close();
  }
});
