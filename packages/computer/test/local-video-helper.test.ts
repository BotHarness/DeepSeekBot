import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), verify: vi.fn(async () => true), assets: vi.fn(async () => undefined) }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('../src/media/install.js', () => ({
  LOCAL_VIDEO_LAUNCHER: 'botharness-media-launcher.exe',
  localVideoAssetsDirectory: () => 'assets', localVideoHelperDirectory: () => 'runtime',
  verifyLocalVideoAssets: mocks.assets, verifyLocalVideoHelper: mocks.verify,
}));
vi.mock('../src/tool/local-driver.js', () => ({ localDriverEnv: () => ({ PATH: 'test-path' }) }));
import { createLocalVideoMedia } from '../src/media/supervisor.js';
import type { LocalVideoMediaStatus } from '../src/local-video-contract.js';

class Helper extends EventEmitter {
  readonly pid = 54321;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly commands: Record<string, unknown>[] = [];
  hangOffer = false;
  hangClose = false;
  launchId = '';
  readonly stdin = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      const command = JSON.parse(chunk.toString()) as Record<string, unknown>;
      this.commands.push(command);
      if (command['op'] === 'close' && !this.hangClose) queueMicrotask(() => this.finishTree());
      else if (command['op'] === 'offer' && !this.hangOffer) this.reply(command, {
        offer: { type: 'offer', sdp: 'native-video-offer' }, display: { width: 1920, height: 1080 },
      });
      else if (command['op'] === 'answer') this.reply(command, null);
      else if (command['op'] === 'stats') this.reply(command, {
        status: 'live', captureAlive: true, width: 1920, height: 1080, framesEncoded: 30, bytesSent: 1234,
      });
      callback();
    },
  });
  event(value: Record<string, unknown>) { this.stdout.write(JSON.stringify({ launchId: this.launchId, ...value }) + '\n'); }
  message(value: unknown) { this.event({ event: 'helper-message', json: JSON.stringify(value) }); }
  ready() {
    this.event({ event: 'tree-owned', version: 1, rootPid: 54322 });
    this.message({ event: 'ready', version: 1 });
  }
  exited = false;
  exit(code: number) { if (!this.exited) { this.exited = true; this.emit('exit', code); this.emit('close', code); } }
  finishTree() { this.event({ event: 'tree-closed', version: 1, activeProcesses: 0 }); this.exit(0); }
  kill = vi.fn(() => { this.exit(1); return true; });
  reply(command: Record<string, unknown>, value: unknown) {
    queueMicrotask(() => this.message({ id: command['id'], ok: true, value }));
  }
}

const binding = { computerId: 'local' as const, runtimeId: 'runtime', viewerId: 'viewer', attemptId: 'attempt' };
let helper: Helper;
beforeEach(() => {
  vi.clearAllMocks(); mocks.verify.mockResolvedValue(true);
  helper = new Helper();
  mocks.spawn.mockImplementation((_command, args) => { helper.launchId = args[3]; setImmediate(() => helper.ready()); return helper; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function media() { return createLocalVideoMedia({ platform: 'win32', arch: 'x64' }); }
function open(provider = media(), controller = new AbortController(), statuses: LocalVideoMediaStatus[] = []) {
  return provider.open({ binding, signal: controller.signal, onStatus: (status) => statuses.push(status) });
}

describe('supervised Local Computer media', () => {
  it('loads only a verified helper and closes the actual process before resolving close', async () => {
    const provider = media();
    const peer = await open(provider);
    expect(peer.offer.sdp).toBe('native-video-offer');
    expect(mocks.verify).toHaveBeenCalledOnce();
    await peer.answer({ type: 'answer', sdp: 'native-video-answer' });
    await peer.close();
    expect(helper.commands.map((command) => command['op'])).toEqual(['offer', 'answer', 'close']);
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });

  it('refuses a second viewer without stopping the first helper', async () => {
    const provider = media();
    const peer = await open(provider);
    await expect(open(provider)).rejects.toMatchObject({ code: 'viewer-limit' });
    expect(helper.commands.some((command) => command['op'] === 'close')).toBe(false);
    await peer.close();
  });

  it('refuses missing runtime without spawning or implicitly installing', async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(open()).rejects.toMatchObject({ code: 'helper-missing' });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('cancels before a slow verification completes without spawning', async () => {
    let verified: ((value: boolean) => void) | undefined;
    mocks.verify.mockImplementationOnce(() => new Promise<boolean>((resolve) => { verified = resolve; }));
    const controller = new AbortController();
    const opening = open(media(), controller);
    await vi.waitFor(() => expect(verified).toBeDefined());
    controller.abort(); verified?.(true);
    await expect(opening).rejects.toMatchObject({ code: 'helper-start-failed' });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('cancels an in-flight offer and cannot publish a late successful peer', async () => {
    helper.hangOffer = true;
    const controller = new AbortController();
    const opening = open(media(), controller);
    const rejected = expect(opening).rejects.toMatchObject({ code: 'disposed' });
    await vi.waitFor(() => expect(helper.commands.some((command) => command['op'] === 'offer')).toBe(true));
    controller.abort();
    await rejected;
    expect(helper.commands.at(-1)?.['op']).toBe('close');
  });

  it('fences a crashed Electron root and accepts cleanup only after its retained Job drains', async () => {
    const statuses: LocalVideoMediaStatus[] = [];
    const peer = await open(media(), new AbortController(), statuses);
    helper.finishTree();
    expect(statuses.some((status) => status.status === 'failed' && !status.captureAlive)).toBe(true);
    await expect(peer.answer({ type: 'answer', sdp: 'late' })).rejects.toMatchObject({ code: 'helper-failed' });
    await peer.close();
  });

  it('closes an oversized protocol buffer without forwarding its content to diagnostics', async () => {
    const statuses: LocalVideoMediaStatus[] = [];
    const peer = await open(media(), new AbortController(), statuses);
    helper.stdout.write('x'.repeat(128 * 1024 + 1));
    expect(statuses.some((status) => status.status === 'failed')).toBe(true);
    await peer.close();
  });

  it('kills an unresponsive launcher but keeps readmission poisoned without Job cleanup proof', async () => {
    const provider = media();
    const statuses: LocalVideoMediaStatus[] = [];
    const peer = await open(provider, new AbortController(), statuses);
    helper.hangClose = true;
    vi.useFakeTimers();
    const closing = peer.close();
    const refused = expect(closing).rejects.toMatchObject({ code: 'operation-timeout' });
    await vi.advanceTimersByTimeAsync(2600);
    await refused;
    expect(helper.kill).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(statuses.some((status) => status.status === 'closed')).toBe(false);
    await expect(open(provider)).rejects.toMatchObject({ code: 'viewer-limit' });
  });

  it('does not confuse abrupt launcher exit with zero live descendants', async () => {
    const provider = media();
    const peer = await open(provider);
    helper.hangClose = true;
    helper.exit(1);
    await expect(peer.close()).rejects.toMatchObject({ code: 'helper-failed' });
    await expect(open(provider)).rejects.toMatchObject({ code: 'viewer-limit' });
  });

  it('cannot accept cleanup evidence forged inside an Electron message', async () => {
    const provider = media();
    const peer = await open(provider);
    helper.hangClose = true;
    helper.message({ event: 'tree-closed', version: 1, activeProcesses: 0 });
    helper.exit(1);
    await expect(peer.close()).rejects.toMatchObject({ code: 'helper-failed' });
    await expect(open(provider)).rejects.toMatchObject({ code: 'viewer-limit' });
  });

  it('refuses a zero-process receipt from another launcher lifetime', async () => {
    const provider = media();
    const peer = await open(provider);
    helper.hangClose = true;
    helper.event({ event: 'tree-closed', version: 1, activeProcesses: 0, launchId: 'old-launch' });
    helper.exit(1);
    await expect(peer.close()).rejects.toMatchObject({ code: 'helper-failed' });
    await expect(open(provider)).rejects.toMatchObject({ code: 'viewer-limit' });
  });

  it('never inherits Electron Node-mode or debugging flags from the launching Host', async () => {
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1');
    vi.stubEnv('NODE_OPTIONS', '--inspect=0.0.0.0:9229');
    const peer = await open();
    const spawnOptions = mocks.spawn.mock.calls[0]?.[2];
    expect(spawnOptions.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(spawnOptions.env).not.toHaveProperty('NODE_OPTIONS');
    expect(spawnOptions.windowsHide).toBe(true);
    await peer.close();
  });
});
