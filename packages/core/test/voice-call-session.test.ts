import { describe, expect, it } from 'vitest';

import type { CallClientMedia, CallPost } from '../src/voice/call-client.js';
import type {
  CallVisualSource,
  VoiceCallResult,
  VoiceCallView,
} from '../src/voice/call-contract.js';
import {
  CallCaptureFailure,
  createCallSession,
  type CallCapture,
  type CallCaptureEvents,
  type CallSessionState,
} from '../src/voice/call-session.js';

const flush = async () => {
  for (let index = 0; index < 5; index += 1) await new Promise((done) => setImmediate(done));
};

function fakeHost(options: { refuseVisual?: boolean } = {}) {
  const posts: Record<string, unknown>[] = [];
  let phase: VoiceCallView['phase'] = 'listening';
  let endReason: VoiceCallView['endReason'];
  let gate: Promise<void> | undefined;
  let opens = 0;
  const view = (): VoiceCallView => ({
    callId: `call-000000000000000${opens}`,
    slug: 'mira',
    channelId: 'dm-mira',
    phase,
    muted: false,
    busy: false,
    media: 'webrtc',
    startedAt: 0,
    durationMs: 1_000,
    events: [],
    lastSeq: 0,
    offer: { type: 'offer', sdp: 'v=0' },
    ...(endReason === undefined ? {} : { endReason }),
  });
  const post: CallPost = async (body) => {
    posts.push(body);
    if (body['kind'] === 'open') {
      opens += 1;
      phase = 'listening';
      endReason = undefined;
    }
    if (body['kind'] === 'visual' && gate !== undefined) await gate;
    if (body['kind'] === 'visual' && options.refuseVisual === true)
      return { ok: false, code: 'invalid-input', error: 'no' } as VoiceCallResult;
    if (body['kind'] === 'hangup') phase = 'ended';
    return { ok: true, call: view() } as VoiceCallResult;
  };
  return {
    post,
    posts,
    visuals: () =>
      posts
        .filter((body) => body['kind'] === 'visual')
        .map((body) => {
          const { kind: _kind, callId: _callId, ...rest } = body;
          return rest;
        }),
    frames: () => posts.filter((body) => body['kind'] === 'frame').length,
    end(reason: VoiceCallView['endReason']) {
      phase = 'ended';
      endReason = reason;
    },
    holdVisual(wait: Promise<void>) {
      gate = wait;
    },
  };
}

const media: CallClientMedia = {
  start: async () => 'v=0',
  mute: () => undefined,
  stop: () => undefined,
  onState: () => () => undefined,
};

function fakeCaptures(
  options: {
    fail?: (index: number) => CallCaptureFailure | undefined;
    hold?: (index: number) => Promise<void> | undefined;
  } = {},
) {
  const made: {
    source: CallVisualSource;
    events: CallCaptureEvents;
    running: boolean;
    stopped: boolean;
  }[] = [];
  const factory = (source: CallVisualSource, events: CallCaptureEvents): CallCapture => {
    const entry = { source, events, running: false, stopped: false };
    const failure = options.fail?.(made.length);
    const hold = options.hold?.(made.length);
    made.push(entry);
    return {
      async acquire() {
        if (hold !== undefined) await hold;
        if (failure !== undefined) throw failure;
      },
      run: () => void (entry.running = true),
      stop: () => {
        entry.running = false;
        entry.stopped = true;
      },
    };
  };
  return { factory, made, last: () => made.at(-1)! };
}

const frame = (source: CallVisualSource) => ({ source, jpeg: 'AA==', score: 0.5, skipped: 0 });

function setup(
  host = fakeHost(),
  captures = fakeCaptures(),
): {
  host: ReturnType<typeof fakeHost>;
  captures: ReturnType<typeof fakeCaptures>;
  session: ReturnType<typeof createCallSession>;
  states: CallSessionState[];
  advance: () => Promise<void>;
} {
  const states: CallSessionState[] = [];
  let tick: (() => void) | undefined;
  const session = createCallSession({
    post: host.post,
    media,
    capture: captures.factory,
    onChange: (state) => states.push(state),
    now: () => 5_000,
    setInterval: (run) => {
      tick = run;
      return 1;
    },
    clearInterval: () => {
      tick = undefined;
    },
  });
  return {
    host,
    captures,
    session,
    states,
    advance: async () => {
      tick?.();
      await flush();
    },
  };
}

describe('call session visual sharing', () => {
  it('acquires capture, asks the Host, then sends counted keyframes', async () => {
    const world = setup();
    await world.session.client.open('mira');
    expect(await world.session.share('camera')).toBe(true);
    const capture = world.captures.last();
    expect(capture.running).toBe(true);
    expect(world.host.visuals()).toEqual([{ source: 'camera' }]);
    await capture.events.keyframe(frame('camera'));
    expect(world.host.frames()).toBe(1);
    expect(world.session.state().visual).toMatchObject({
      source: 'camera',
      keyframes: 1,
      keyframeAt: 5_000,
    });
    await world.session.unshare('camera');
    expect(capture.stopped).toBe(true);
    expect(world.host.visuals().at(-1)).toEqual({ source: 'off' });
    expect(world.session.state().visual.source).toBe('off');
  });

  it('switches source by asking the Host before stopping the old capture', async () => {
    const world = setup();
    await world.session.client.open('mira');
    await world.session.share('camera');
    const camera = world.captures.last();
    await camera.events.keyframe(frame('camera'));
    await world.session.share('screen');
    expect(camera.stopped).toBe(true);
    expect(world.host.visuals()).toEqual([{ source: 'camera' }, { source: 'screen' }]);
    expect(world.session.state().visual).toMatchObject({ source: 'screen', keyframes: 0 });
    await camera.events.keyframe(frame('camera'));
    expect(world.host.frames()).toBe(1);
  });

  it('restarts the same source without telling the Host again and keeps the count', async () => {
    const world = setup();
    await world.session.client.open('mira');
    await world.session.share('camera');
    await world.captures.last().events.keyframe(frame('camera'));
    expect(await world.session.share('camera')).toBe(true);
    expect(world.captures.made).toHaveLength(1);
    expect(await world.session.share('camera', { restart: true })).toBe(true);
    expect(world.captures.made).toHaveLength(2);
    expect(world.captures.made[0]!.stopped).toBe(true);
    expect(world.host.visuals()).toEqual([{ source: 'camera' }]);
    expect(world.session.state().visual.keyframes).toBe(1);
  });

  it('tells the Host nothing when capture is denied or cancelled', async () => {
    const denied = setup(
      fakeHost(),
      fakeCaptures({ fail: () => new CallCaptureFailure('camera-denied') }),
    );
    await denied.session.client.open('mira');
    expect(await denied.session.share('camera')).toBe(false);
    expect(denied.session.state().visual).toMatchObject({ source: 'off', error: 'camera-denied' });
    expect(denied.host.visuals()).toEqual([]);
    denied.session.dismissVisual();
    expect(denied.session.state().visual.error).toBeUndefined();
    const cancelled = setup(
      fakeHost(),
      fakeCaptures({ fail: () => new CallCaptureFailure('screen-cancelled', true) }),
    );
    await cancelled.session.client.open('mira');
    await cancelled.session.share('screen');
    expect(cancelled.session.state().visual).toMatchObject({ source: 'off', error: undefined });
    expect(cancelled.host.visuals()).toEqual([]);
  });

  it('turns a failed restart into an unshare', async () => {
    const world = setup(
      fakeHost(),
      fakeCaptures({
        fail: (index) => (index === 1 ? new CallCaptureFailure('camera-missing') : undefined),
      }),
    );
    await world.session.client.open('mira');
    await world.session.share('camera');
    expect(await world.session.share('camera', { restart: true })).toBe(false);
    expect(world.captures.made.every((entry) => entry.stopped)).toBe(true);
    expect(world.session.state().visual).toMatchObject({ source: 'off', error: 'camera-missing' });
    expect(world.host.visuals()).toEqual([{ source: 'camera' }, { source: 'off' }]);
  });

  it('keeps a share off when it is turned off while a restart acquires', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((done) => (release = done));
    const world = setup(
      fakeHost(),
      fakeCaptures({ hold: (index) => (index === 1 ? held : undefined) }),
    );
    await world.session.client.open('mira');
    await world.session.share('camera');
    const restarting = world.session.share('camera', { restart: true });
    await flush();
    await world.session.unshare('camera');
    release!();
    expect(await restarting).toBe(false);
    expect(world.captures.made.every((entry) => entry.stopped && !entry.running)).toBe(true);
    expect(world.session.state().visual).toMatchObject({ source: 'off', starting: false });
    expect(world.host.visuals()).toEqual([{ source: 'camera' }, { source: 'off' }]);
  });

  it('stops capture and drops the share when the Host refuses it', async () => {
    const world = setup(fakeHost({ refuseVisual: true }));
    await world.session.client.open('mira');
    expect(await world.session.share('camera')).toBe(false);
    expect(world.captures.last().stopped).toBe(true);
    expect(world.session.state().visual).toMatchObject({ source: 'off', starting: false });
  });

  it('records a system stop and a pause with the Host', async () => {
    const world = setup();
    await world.session.client.open('mira');
    await world.session.share('screen');
    const screen = world.captures.last();
    screen.events.pause(true);
    screen.events.pause(true);
    screen.events.pause(false);
    await flush();
    expect(world.host.visuals()).toEqual([
      { source: 'screen' },
      { source: 'off', paused: true },
      { source: 'screen', resumed: true },
    ]);
    screen.events.ended();
    await flush();
    expect(world.session.state().visual).toMatchObject({ source: 'off', error: 'screen-stopped' });
    expect(world.host.visuals().at(-1)).toEqual({ source: 'off', stopped: true });
  });

  it('stops capture when the call ends mid-share', async () => {
    const world = setup();
    await world.session.client.open('mira');
    await world.session.share('camera');
    world.host.end('host-stopped');
    await world.advance();
    expect(world.session.state().call).toMatchObject({ status: 'ended', reason: 'host-stopped' });
    expect(world.captures.last().stopped).toBe(true);
    expect(world.session.state().visual.source).toBe('off');
  });

  it('drops a share that finishes after the call ended', async () => {
    let release: (() => void) | undefined;
    const host = fakeHost();
    host.holdVisual(new Promise<void>((done) => (release = done)));
    const world = setup(host);
    await world.session.client.open('mira');
    const sharing = world.session.share('camera');
    await flush();
    const hangup = world.session.hangup();
    release!();
    expect(await sharing).toBe(false);
    await hangup;
    expect(world.captures.last().stopped).toBe(true);
    expect(world.captures.last().running).toBe(false);
    expect(world.session.state().visual).toMatchObject({ source: 'off', starting: false });
  });

  it('drops a pending switch when the old capture ends and turns the Host off again', async () => {
    let release: (() => void) | undefined;
    const host = fakeHost();
    const world = setup(host);
    await world.session.client.open('mira');
    await world.session.share('screen');
    const screen = world.captures.last();
    host.holdVisual(new Promise<void>((done) => (release = done)));
    const switching = world.session.share('camera');
    await flush();
    screen.events.ended();
    release!();
    expect(await switching).toBe(false);
    await flush();
    const camera = world.captures.last();
    expect(camera.stopped).toBe(true);
    expect(camera.running).toBe(false);
    expect(world.session.state().visual).toMatchObject({
      source: 'off',
      starting: false,
      error: 'screen-stopped',
    });
    expect(world.host.visuals()).toEqual([
      { source: 'screen' },
      { source: 'camera' },
      { source: 'off', stopped: true },
      { source: 'off' },
    ]);
  });

  it('drops a share whose call was replaced while the Host answered', async () => {
    let release: (() => void) | undefined;
    const host = fakeHost();
    const world = setup(host);
    await world.session.client.open('mira');
    host.holdVisual(new Promise<void>((done) => (release = done)));
    const sharing = world.session.share('camera');
    await flush();
    host.end('host-stopped');
    await world.advance();
    await world.session.client.open('mira');
    expect(world.session.state().call.status).toBe('live');
    release!();
    expect(await sharing).toBe(false);
    expect(world.captures.last().stopped).toBe(true);
    expect(world.captures.last().running).toBe(false);
    expect(world.session.state().visual).toMatchObject({ source: 'off', starting: false });
  });

  it('keeps a stale share from settling the share of the next call', async () => {
    let failFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    const first = new Promise<void>((done) => (failFirst = done));
    const second = new Promise<void>((done) => (finishSecond = done));
    const world = setup(
      fakeHost(),
      fakeCaptures({
        hold: (index) => (index === 0 ? first : second),
        fail: (index) => (index === 0 ? new CallCaptureFailure('camera-denied') : undefined),
      }),
    );
    await world.session.client.open('mira');
    const stale = world.session.share('camera');
    await flush();
    await world.session.hangup();
    await world.session.client.open('mira');
    const fresh = world.session.share('camera');
    await flush();
    failFirst!();
    expect(await stale).toBe(false);
    expect(world.session.state().visual).toMatchObject({ starting: true, error: undefined });
    expect(await world.session.share('screen')).toBe(false);
    finishSecond!();
    expect(await fresh).toBe(true);
    expect(world.captures.made).toHaveLength(2);
    expect(world.captures.last().running).toBe(true);
    expect(world.session.state().visual).toMatchObject({ source: 'camera', starting: false });
    expect(world.host.visuals()).toEqual([{ source: 'camera' }]);
  });

  it('ignores keyframes from a disposed session', async () => {
    const world = setup();
    await world.session.client.open('mira');
    await world.session.share('camera');
    const capture = world.captures.last();
    world.session.dispose();
    const emitted = world.states.length;
    await capture.events.keyframe(frame('camera'));
    expect(capture.stopped).toBe(true);
    expect(world.host.frames()).toBe(0);
    expect(world.states).toHaveLength(emitted);
  });

  it('shares nothing before the call is live', async () => {
    const world = setup();
    expect(await world.session.share('camera')).toBe(false);
    expect(world.captures.made).toHaveLength(0);
  });
});
