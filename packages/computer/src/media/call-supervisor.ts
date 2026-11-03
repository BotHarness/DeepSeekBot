import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VoiceCallMedia, VoiceCallMediaPeer } from '../../../core/src/voice/calls.js';
import type { VoiceCallDescription } from '../../../core/src/voice/call-contract.js';
import {
  MAC_VIDEO_EXECUTABLE,
  macVideoHelperDirectory,
  verifyMacVideoHelper,
} from './install-macos.js';
import { localDriverEnv } from '../tool/local-driver.js';
import {
  LOCAL_VIDEO_LAUNCHER,
  localVideoAssetsDirectory,
  localVideoHelperDirectory,
  verifyLocalVideoAssets,
  verifyLocalVideoHelper,
} from './install.js';

const REQUEST_TIMEOUT = 9_000;
const MAX_PENDING = 4;
const LINE_LIMIT = 128 * 1024;
const SIGNAL_LIMIT = 96 * 1024;
const AUDIO_CHUNK = 48 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const PCM_LINE_LIMIT = 16 * 1024;

class CallMediaError extends Error {
  constructor(
    readonly code: 'unsupported-platform' | 'helper-missing' | 'helper-failed' | 'busy',
    message: string,
  ) {
    super(message);
  }
}

export interface CallMediaOptions {
  readonly helperDirectory?: string | undefined;
  readonly assetsDirectory?: string | undefined;
  readonly platform?: string | undefined;
  readonly arch?: string | undefined;
  readonly onEvent?: ((detail: string) => void) | undefined;
}

export function createCallMedia(options: CallMediaOptions = {}): VoiceCallMedia {
  let active = false;
  const target = () => {
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    const mac = platform === 'darwin' && (arch === 'arm64' || arch === 'x64');
    const supported = mac || (platform === 'win32' && arch === 'x64');
    const directory =
      options.helperDirectory ??
      (mac ? macVideoHelperDirectory(arch) : localVideoHelperDirectory());
    const assets = options.assetsDirectory ?? localVideoAssetsDirectory();
    return { platform, arch, mac, supported, directory, assets };
  };
  const verified = async () => {
    const { mac, arch, directory, assets, platform } = target();
    await verifyLocalVideoAssets(assets, platform);
    return mac ? verifyMacVideoHelper(directory, arch) : verifyLocalVideoHelper(directory, assets);
  };
  return {
    async availability() {
      const { supported } = target();
      if (!supported) return 'unsupported-platform';
      try {
        return (await verified()) ? 'ready' : 'helper-missing';
      } catch {
        return 'helper-missing';
      }
    },
    async open({ callId, signal, onPcm, onStatus }): Promise<VoiceCallMediaPeer> {
      const { mac, supported, directory, assets } = target();
      if (!supported)
        throw new CallMediaError('unsupported-platform', 'Calls need a Mac or Windows x64 Host.');
      if (active) throw new CallMediaError('busy', 'This Host already has call media running.');
      active = true;
      const launchId = randomUUID();
      const started = Date.now();
      const event = (detail: string) => options.onEvent?.(`call=${callId} ${detail}`);
      let child: ChildProcessWithoutNullStreams | undefined;
      let profile: string | undefined;
      let output = '';
      let nextId = 1;
      let closing: Promise<void> | undefined;
      let closed = false;
      let exited = false;
      let treeOwned = false;
      let treeStopped = false;
      let spawnFailed = false;
      let bootstrapLineSeen = false;
      let statusSent = false;
      const pending = new Map<
        number,
        {
          resolve(value: unknown): void;
          reject(error: Error): void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      const playbacks = new Map<string, { resolve(): void; reject(error: Error): void }>();
      let ready:
        | { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
        | undefined;
      let exitResolve: (() => void) | undefined;
      const exit = new Promise<void>((resolve) => {
        exitResolve = resolve;
      });
      const status = (value: 'connected' | 'failed' | 'closed') => {
        if (value !== 'connected') {
          if (statusSent) return;
          statusSent = true;
        }
        onStatus(value);
      };
      const rejectAll = (error: Error) => {
        if (ready) {
          clearTimeout(ready.timer);
          ready.reject(error);
          ready = undefined;
        }
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        pending.clear();
        for (const playback of playbacks.values()) playback.reject(error);
        playbacks.clear();
      };
      const request = (op: string, extra: Record<string, unknown> = {}): Promise<unknown> => {
        if (closed || !child || exited)
          return Promise.reject(
            new CallMediaError('helper-failed', 'The call helper is unavailable.'),
          );
        if (pending.size >= MAX_PENDING)
          return Promise.reject(
            new CallMediaError('helper-failed', 'The call helper queue is full.'),
          );
        const id = nextId++;
        const line = JSON.stringify({ id, op, ...extra }) + '\n';
        if (
          Buffer.byteLength(line) > LINE_LIMIT ||
          child.stdin.writableLength + Buffer.byteLength(line) > 4 * LINE_LIMIT
        )
          return Promise.reject(
            new CallMediaError('helper-failed', 'The call helper byte queue is full.'),
          );
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new CallMediaError('helper-failed', 'The call helper did not respond in time.'));
            failed();
          }, REQUEST_TIMEOUT);
          pending.set(id, { resolve, reject, timer });
          child!.stdin.write(line, (error) => {
            if (error) failed();
          });
        });
      };
      const close = (): Promise<void> => {
        closing ??= (async () => {
          closed = true;
          signal.removeEventListener('abort', aborted);
          rejectAll(new CallMediaError('helper-failed', 'The call ended.'));
          try {
            if (child && !exited) {
              child.stdin.end(JSON.stringify({ id: nextId++, op: 'close' }) + '\n');
              if (!(await boundedExit(exit, 2400))) {
                child.kill();
                await boundedExit(exit, 200);
                throw new CallMediaError(
                  'helper-failed',
                  'The call process tree did not confirm cleanup within its limit.',
                );
              }
            }
            if (child && !spawnFailed && !treeStopped)
              throw new CallMediaError(
                'helper-failed',
                'The call process tree exited without confirming cleanup. Restart the Host before another call.',
              );
            event(`phase=call-media-stopped durationMs=${Date.now() - started}`);
          } finally {
            if (!child || spawnFailed || (exited && treeStopped)) active = false;
            if (profile && (!child || spawnFailed || (exited && treeStopped)))
              void rm(profile, { recursive: true, force: true }).catch(() => undefined);
            status('closed');
          }
        })();
        return closing;
      };
      const failed = () => {
        if (closed) return;
        event(`phase=call-media-failed durationMs=${Date.now() - started}`);
        status('failed');
        void close().catch(() => event('phase=call-media-cleanup-refused'));
      };
      const aborted = () => {
        void close().catch(() => event('phase=call-media-cleanup-refused'));
      };
      const helperMessage = (message: Record<string, unknown>): boolean => {
        if ('id' in message && typeof message['id'] === 'number' && 'ok' in message) {
          const waiter = pending.get(message['id']);
          if (!waiter) return false;
          pending.delete(message['id']);
          clearTimeout(waiter.timer);
          if (message['ok'] === true && 'value' in message) waiter.resolve(message['value']);
          else
            waiter.reject(
              new CallMediaError('helper-failed', 'The call helper refused the operation.'),
            );
          return true;
        }
        switch (message['event']) {
          case 'ready':
            if (!ready || message['version'] !== 1) return false;
            clearTimeout(ready.timer);
            ready.resolve();
            ready = undefined;
            return true;
          case 'pcm': {
            const data = message['data'];
            if (typeof data !== 'string' || data.length > PCM_LINE_LIMIT) return false;
            const bytes = Buffer.from(data, 'base64');
            if (bytes.byteLength % 2 !== 0) return false;
            const samples = new Int16Array(bytes.byteLength / 2);
            for (let index = 0; index < samples.length; index += 1)
              samples[index] = bytes.readInt16LE(index * 2);
            bytes.fill(0);
            onPcm(samples);
            return true;
          }
          case 'state':
            if (message['state'] === 'connected') {
              event(`phase=call-media-connected durationMs=${Date.now() - started}`);
              status('connected');
              return true;
            }
            if (message['state'] === 'failed' || message['state'] === 'closed') {
              failed();
              return true;
            }
            return false;
          case 'played': {
            const id = message['playback'];
            if (typeof id !== 'string') return false;
            const playback = playbacks.get(id);
            if (playback === undefined) return true;
            playbacks.delete(id);
            if (message['ok'] === true) playback.resolve();
            else playback.reject(new CallMediaError('helper-failed', 'The audio could not play.'));
            return true;
          }
          default:
            return false;
        }
      };
      try {
        signal.throwIfAborted();
        if (!(await verified()))
          throw new CallMediaError(
            'helper-missing',
            'Start Local Computer once to install the media helper, then call again.',
          );
        signal.throwIfAborted();
        profile = await mkdtemp(join(tmpdir(), 'botharness-call-'));
        signal.throwIfAborted();
        child = spawn(
          mac ? process.execPath : join(directory, LOCAL_VIDEO_LAUNCHER),
          [
            ...(mac ? [join(assets, 'launcher-macos.cjs')] : []),
            join(directory, mac ? MAC_VIDEO_EXECUTABLE : 'electron.exe'),
            join(assets, 'call-main.cjs'),
            String(process.pid),
            launchId,
          ],
          {
            env: {
              ...localDriverEnv(),
              ...(mac ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
              BOTHARNESS_MEDIA_USER_DATA: profile,
            },
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
        signal.addEventListener('abort', aborted, { once: true });
        child.once('exit', (code) => {
          event(
            `phase=call-media-exit exitCode=${code ?? 'signal'} durationMs=${Date.now() - started}`,
          );
          if (!closed) failed();
        });
        child.once('close', () => {
          exited = true;
          exitResolve?.();
        });
        child.once('error', () => {
          spawnFailed = child?.pid === undefined;
          exited = true;
          exitResolve?.();
          failed();
        });
        child.stdin.on('error', failed);
        child.stderr.on('data', () => {});
        const readiness = new Promise<void>((resolve, reject) => {
          ready = {
            resolve,
            reject,
            timer: setTimeout(() => {
              ready = undefined;
              reject(new CallMediaError('helper-failed', 'The call helper did not become ready.'));
            }, REQUEST_TIMEOUT),
          };
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          if (treeStopped) return;
          if (Buffer.byteLength(output) + Buffer.byteLength(chunk) > 2 * LINE_LIMIT) {
            output = '';
            return failed();
          }
          output += chunk;
          let newline;
          while ((newline = output.indexOf('\n')) >= 0) {
            const line = output.slice(0, newline);
            output = output.slice(newline + 1);
            try {
              const envelope = JSON.parse(line) as Record<string, unknown>;
              if (envelope['launchId'] !== launchId) return failed();
              if (
                envelope['event'] === 'tree-owned' &&
                envelope['version'] === 1 &&
                Number.isSafeInteger(envelope['rootPid']) &&
                (envelope['rootPid'] as number) > 0 &&
                !treeOwned
              ) {
                treeOwned = true;
                event(
                  `phase=call-media-tree-owned launcherPid=${child?.pid ?? 0} rootPid=${String(envelope['rootPid'])}`,
                );
                continue;
              }
              if (
                envelope['event'] === 'tree-closed' &&
                envelope['version'] === 1 &&
                envelope['activeProcesses'] === 0 &&
                treeOwned &&
                !treeStopped
              ) {
                treeStopped = true;
                event('phase=call-media-tree-closed activeProcesses=0');
                if (!closed) failed();
                continue;
              }
              if (closed) continue;
              if (
                envelope['event'] !== 'helper-message' ||
                typeof envelope['json'] !== 'string' ||
                !treeOwned ||
                treeStopped
              )
                return failed();
              if (ready && !bootstrapLineSeen && envelope['json'] === '\r') {
                bootstrapLineSeen = true;
                continue;
              }
              const message: unknown = JSON.parse(envelope['json']);
              if (typeof message !== 'object' || message === null || Array.isArray(message))
                return failed();
              if (!helperMessage(message as Record<string, unknown>)) return failed();
            } catch {
              return failed();
            }
          }
        });
        await readiness;
        signal.throwIfAborted();
        const offer = parseOffer(await request('offer'));
        if (closed) throw new CallMediaError('helper-failed', 'The call ended during startup.');
        event(`phase=call-media-ready codec=opus durationMs=${Date.now() - started}`);
        let answered = false;
        let playbackSeq = 0;
        return {
          offer,
          async answer(answer: VoiceCallDescription, answerSignal?: AbortSignal) {
            if (
              answered ||
              answer.type !== 'answer' ||
              Buffer.byteLength(answer.sdp) > SIGNAL_LIMIT
            )
              throw new CallMediaError(
                'helper-failed',
                'The call answer is invalid or already applied.',
              );
            answered = true;
            answerSignal?.throwIfAborted();
            try {
              await request('answer', { sdp: answer.sdp });
            } catch (error) {
              failed();
              throw error;
            }
          },
          async play(audio: Uint8Array, mime: string, playSignal: AbortSignal) {
            if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES)
              throw new CallMediaError('helper-failed', 'The audio is empty or too large.');
            const playback = `p${(playbackSeq += 1)}`;
            const encoded = Buffer.from(audio).toString('base64');
            for (let offset = 0; offset < encoded.length; offset += AUDIO_CHUNK) {
              playSignal.throwIfAborted();
              await request('audio', {
                playback,
                data: encoded.slice(offset, offset + AUDIO_CHUNK),
              });
            }
            const done = new Promise<void>((resolve, reject) =>
              playbacks.set(playback, { resolve, reject }),
            );
            const stop = () => {
              void request('stop', { playback }).catch(() => undefined);
              playbacks
                .get(playback)
                ?.reject(new CallMediaError('helper-failed', 'Playback stopped.'));
              playbacks.delete(playback);
            };
            playSignal.addEventListener('abort', stop, { once: true });
            try {
              await request('play', { playback, mime: mime.slice(0, 40) });
              await done;
            } finally {
              playSignal.removeEventListener('abort', stop);
            }
          },
          close,
        };
      } catch (error) {
        await close().catch(() => undefined);
        if (error instanceof CallMediaError) throw error;
        throw new CallMediaError('helper-failed', 'The call media could not start.');
      }
    },
  };
}

function boundedExit(exit: Promise<void>, milliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    void exit.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function parseOffer(value: unknown): VoiceCallDescription {
  const offer =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)['offer']
      : undefined;
  const fields =
    typeof offer === 'object' && offer !== null ? (offer as Record<string, unknown>) : {};
  if (
    fields['type'] === 'offer' &&
    typeof fields['sdp'] === 'string' &&
    fields['sdp'].startsWith('v=0') &&
    Buffer.byteLength(fields['sdp']) <= SIGNAL_LIMIT &&
    /^m=audio /mu.test(fields['sdp']) &&
    !/^m=(?!audio )/mu.test(fields['sdp'])
  )
    return { type: 'offer', sdp: fields['sdp'] };
  throw new CallMediaError('helper-failed', 'The call helper returned an invalid offer.');
}
