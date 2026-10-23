import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LOCAL_VIDEO_LIMITS,
  LocalVideoError,
  type LocalVideoDescription,
  type LocalVideoMedia,
  type LocalVideoMediaStatus,
} from '../local-video-contract.js';
import { localDriverEnv } from '../tool/local-driver.js';
import type { LocalDesktopBinding } from '../tool/local-desktop.js';
import {
  LOCAL_VIDEO_LAUNCHER,
  localVideoAssetsDirectory,
  localVideoHelperDirectory,
  verifyLocalVideoAssets,
  verifyLocalVideoHelper,
} from './install.js';

type Waiter = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};
const REQUEST_TIMEOUT = 9_000;
const HEALTH_INTERVAL = 1_000;
const MAX_PENDING = 4;

export function createLocalVideoMedia(
  options: {
    readonly helperDirectory?: string | undefined;
    readonly assetsDirectory?: string | undefined;
    readonly platform?: string | undefined;
    readonly arch?: string | undefined;
    readonly onEvent?: ((detail: string) => void) | undefined;
    readonly desktop?: (() => LocalDesktopBinding | undefined) | undefined;
  } = {},
): LocalVideoMedia {
  let active = false;
  return {
    async open({ signal, onStatus }) {
      const platform = options.platform ?? process.platform;
      if (!['win32', 'linux'].includes(platform) || (options.arch ?? process.arch) !== 'x64') {
        throw new LocalVideoError(
          'unsupported-platform',
          'Local Computer video requires Windows x64 or a qualified Linux x64 managed desktop.',
        );
      }
      const desktop = platform === 'linux' ? options.desktop?.() : undefined;
      if (platform === 'linux' && (!desktop?.managed || !desktop.alive()))
        throw new LocalVideoError(
          'unsupported-platform',
          'Linux video requires the running Local Computer managed Xvfb desktop. Attached X11 and Wayland sessions are not supported.',
        );
      if (active)
        throw new LocalVideoError('viewer-limit', 'This Computer already has a video viewer.');
      active = true;
      const launchId = randomUUID();
      const directory = options.helperDirectory ?? localVideoHelperDirectory(platform);
      let child: ChildProcessWithoutNullStreams | undefined;
      let profile: string | undefined;
      let output = '';
      let outputRejected = false;
      let nextId = 1;
      let closing: Promise<void> | undefined;
      let closed = false;
      let exited = false;
      let treeOwned = false;
      let treeStopped = false;
      let spawnFailed = false;
      let healthTimer: ReturnType<typeof setTimeout> | undefined;
      let currentStatus: LocalVideoMediaStatus = {
        status: 'starting',
        captureAlive: false,
        width: 0,
        height: 0,
      };
      const pending = new Map<number, Waiter>();
      let ready: Waiter | undefined;
      let exitResolve: (() => void) | undefined;
      const exit = new Promise<void>((resolve) => {
        exitResolve = resolve;
      });
      const started = Date.now();
      const publish = (status: LocalVideoMediaStatus) => {
        currentStatus = status;
        onStatus(status);
      };
      const rejectPending = (error: Error) => {
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
      };
      const request = (op: string, extra: Record<string, unknown> = {}): Promise<unknown> => {
        if (closed || !child || exited)
          return Promise.reject(
            new LocalVideoError('helper-failed', 'The video helper is unavailable.'),
          );
        if (pending.size >= MAX_PENDING)
          return Promise.reject(
            new LocalVideoError('queue-full', 'The video helper request queue is full.'),
          );
        const id = nextId++;
        const line = JSON.stringify({ id, op, ...extra }) + '\n';
        if (
          Buffer.byteLength(line) > LOCAL_VIDEO_LIMITS.requestBytes ||
          child.stdin.writableLength + Buffer.byteLength(line) > LOCAL_VIDEO_LIMITS.requestBytes
        ) {
          return Promise.reject(
            new LocalVideoError('queue-full', 'The video helper byte queue is full.'),
          );
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(
              new LocalVideoError('operation-timeout', 'The video helper did not respond in time.'),
            );
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
          clearTimeout(healthTimer);
          signal.removeEventListener('abort', aborted);
          rejectPending(new LocalVideoError('disposed', 'The video attempt ended.'));
          try {
            if (child && !exited) {
              child.stdin.end(JSON.stringify({ id: nextId++, op: 'close' }) + '\n');
              if (!(await boundedExit(exit, 2400))) {
                child.kill();
                await boundedExit(exit, 200);
                throw new LocalVideoError(
                  'operation-timeout',
                  'The video process tree did not confirm cleanup within its limit.',
                );
              }
            }
            if (child && !spawnFailed && !treeStopped)
              throw new LocalVideoError(
                'helper-failed',
                'The video process tree exited without confirming cleanup. Restart the Host before another attempt.',
              );
            publish({ ...currentStatus, status: 'closed', captureAlive: false });
            options.onEvent?.(`phase=media-stopped durationMs=${Date.now() - started}`);
          } finally {
            if (!child || spawnFailed || (exited && treeStopped)) active = false;
            if (profile && (!child || spawnFailed || (exited && treeStopped)))
              void rm(profile, { recursive: true, force: true }).catch(() => undefined);
          }
        })();
        return closing;
      };
      const failed = () => {
        if (closed) return;
        publish({ ...currentStatus, status: 'failed', captureAlive: false });
        options.onEvent?.(`phase=media-failed durationMs=${Date.now() - started}`);
        void close().catch(() =>
          options.onEvent?.('phase=media-cleanup-refused code=operation-timeout'),
        );
      };
      const aborted = () => {
        void close().catch(() =>
          options.onEvent?.('phase=media-cleanup-refused code=operation-timeout'),
        );
      };
      try {
        signal.throwIfAborted();
        const assets = options.assetsDirectory ?? localVideoAssetsDirectory();
        await verifyLocalVideoAssets(assets, platform);
        if (!(await verifyLocalVideoHelper(directory, assets, platform)))
          throw new LocalVideoError(
            'helper-missing',
            'Start Local Computer to install or repair its video helper.',
          );
        signal.throwIfAborted();
        profile = await mkdtemp(join(tmpdir(), 'botharness-local-video-'));
        signal.throwIfAborted();
        if (desktop && !desktop.alive())
          throw new LocalVideoError(
            'stale-attempt',
            'The Local desktop changed during video startup.',
          );
        child = spawn(
          platform === 'linux' ? process.execPath : join(directory, LOCAL_VIDEO_LAUNCHER),
          platform === 'linux'
            ? [
                join(directory, 'launcher-linux.cjs'),
                'media',
                String(process.pid),
                launchId,
                join(directory, 'electron'),
                join(assets, 'main.cjs'),
              ]
            : [
                join(directory, 'electron.exe'),
                join(assets, 'main.cjs'),
                String(process.pid),
                launchId,
              ],
          {
            env: {
              ...(desktop?.env ?? localDriverEnv()),
              BOTHARNESS_MEDIA_USER_DATA: profile,
              ...(desktop ? { BOTHARNESS_MEDIA_DISPLAY_GENERATION: desktop.generation } : {}),
            },
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );

        signal.addEventListener('abort', aborted, { once: true });
        child.once('exit', (code) => {
          options.onEvent?.(
            `phase=media-exit exitCode=${code ?? 'signal'} durationMs=${Date.now() - started}`,
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
        const readiness = new Promise<unknown>((resolve, reject) => {
          ready = {
            resolve,
            reject,
            timer: setTimeout(() => {
              ready = undefined;
              reject(
                new LocalVideoError(
                  'helper-start-failed',
                  'The video helper did not become ready.',
                ),
              );
            }, REQUEST_TIMEOUT),
          };
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          if (outputRejected) return;
          if (
            Buffer.byteLength(output) + Buffer.byteLength(chunk) >
            LOCAL_VIDEO_LIMITS.requestBytes
          ) {
            outputRejected = true;
            output = '';
            return failed();
          }
          output += chunk;
          let newline;
          while ((newline = output.indexOf('\n')) >= 0) {
            const line = output.slice(0, newline);
            output = output.slice(newline + 1);
            try {
              const envelope: unknown = JSON.parse(line);
              if (
                typeof envelope !== 'object' ||
                envelope === null ||
                !('event' in envelope) ||
                !('launchId' in envelope) ||
                envelope.launchId !== launchId
              )
                return failed();
              if (
                envelope.event === 'tree-owned' &&
                'version' in envelope &&
                envelope.version === 1 &&
                'rootPid' in envelope &&
                typeof envelope.rootPid === 'number' &&
                Number.isSafeInteger(envelope.rootPid) &&
                envelope.rootPid > 0 &&
                !treeOwned
              ) {
                treeOwned = true;
                options.onEvent?.(
                  `phase=media-tree-owned launcherPid=${child?.pid ?? 0} rootPid=${envelope.rootPid}`,
                );
                continue;
              }
              if (
                envelope.event === 'tree-closed' &&
                'version' in envelope &&
                envelope.version === 1 &&
                'activeProcesses' in envelope &&
                envelope.activeProcesses === 0 &&
                treeOwned &&
                !treeStopped
              ) {
                treeStopped = true;
                options.onEvent?.('phase=media-tree-closed activeProcesses=0');
                if (!closed) failed();
                continue;
              }
              if (
                envelope.event !== 'helper-message' ||
                !('json' in envelope) ||
                typeof envelope.json !== 'string' ||
                !treeOwned ||
                treeStopped
              )
                return failed();
              const message: unknown = JSON.parse(envelope.json);
              if (typeof message !== 'object' || message === null) return failed();
              if ('event' in message) {
                if (
                  message.event === 'ready' &&
                  'version' in message &&
                  message.version === 1 &&
                  ready
                ) {
                  clearTimeout(ready.timer);
                  ready.resolve(null);
                  ready = undefined;
                } else return failed();
              } else if ('id' in message && typeof message.id === 'number' && 'ok' in message) {
                const waiter = pending.get(message.id);
                if (!waiter) return failed();
                pending.delete(message.id);
                clearTimeout(waiter.timer);
                if (message.ok === true && 'value' in message) waiter.resolve(message.value);
                else
                  waiter.reject(
                    new LocalVideoError('helper-failed', 'The video helper refused the operation.'),
                  );
              } else return failed();
            } catch {
              return failed();
            }
          }
        });
        await readiness;
        signal.throwIfAborted();
        const offer = parseOffer(await request('offer'));
        if (closed)
          throw new LocalVideoError('disposed', 'The video attempt ended during startup.');
        publish({ ...currentStatus, ...offer.display, status: 'starting', captureAlive: true });
        options.onEvent?.(`phase=media-ready codec=VP8 durationMs=${Date.now() - started}`);

        let polling: Promise<void> | undefined;
        let answerInProgress = false;
        const poll = () => {
          polling = (async () => {
            try {
              if (desktop && !desktop.alive())
                throw new LocalVideoError('stale-attempt', 'The Local desktop ended.');
              if (!closed) publish(parseStatus(await request('stats')));
            } catch {
              if (!closed) failed();
            } finally {
              if (!closed && !answerInProgress) healthTimer = setTimeout(poll, HEALTH_INTERVAL);
            }
          })();
        };
        healthTimer = setTimeout(poll, HEALTH_INTERVAL);
        let answering = false;
        return {
          ...offer,
          async answer(answer: LocalVideoDescription, answerSignal?: AbortSignal) {
            if (
              answering ||
              answer.type !== 'answer' ||
              Buffer.byteLength(answer.sdp) > LOCAL_VIDEO_LIMITS.signalBytes
            ) {
              throw new LocalVideoError(
                'signal-failed',
                'The video answer is invalid or already applied.',
              );
            }
            answering = true;
            answerInProgress = true;
            clearTimeout(healthTimer);
            answerSignal?.addEventListener('abort', aborted, { once: true });
            try {
              answerSignal?.throwIfAborted();
              await polling;
              answerSignal?.throwIfAborted();
              await request('answer', { sdp: answer.sdp });
              if (!closed) healthTimer = setTimeout(poll, HEALTH_INTERVAL);
            } catch (error) {
              failed();
              throw error;
            } finally {
              answerInProgress = false;
              answerSignal?.removeEventListener('abort', aborted);
            }
          },
          close,
        };
      } catch (error) {
        await close().catch(() => undefined);
        if (error instanceof LocalVideoError) throw error;
        throw new LocalVideoError(
          'helper-start-failed',
          'Local Computer video could not start. Check the helper installation and desktop access.',
        );
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

function parseOffer(value: unknown): {
  offer: LocalVideoDescription;
  display: { width: number; height: number };
} {
  if (
    typeof value === 'object' &&
    value !== null &&
    'offer' in value &&
    'display' in value &&
    typeof value.offer === 'object' &&
    value.offer !== null &&
    'type' in value.offer &&
    value.offer.type === 'offer' &&
    'sdp' in value.offer &&
    typeof value.offer.sdp === 'string' &&
    Buffer.byteLength(value.offer.sdp) <= LOCAL_VIDEO_LIMITS.signalBytes &&
    typeof value.display === 'object' &&
    value.display !== null &&
    'width' in value.display &&
    'height' in value.display &&
    typeof value.display.width === 'number' &&
    typeof value.display.height === 'number' &&
    value.display.width > 0 &&
    value.display.width <= 8192 &&
    value.display.height > 0 &&
    value.display.height <= 8192
  ) {
    return {
      offer: { type: 'offer', sdp: value.offer.sdp },
      display: { width: value.display.width, height: value.display.height },
    };
  }
  throw new LocalVideoError(
    'helper-failed',
    'The video helper returned invalid display information.',
  );
}

function parseStatus(value: unknown): LocalVideoMediaStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    !['starting', 'live', 'stalled', 'failed', 'closed'].includes(String(value.status)) ||
    !('captureAlive' in value) ||
    typeof value.captureAlive !== 'boolean' ||
    !('width' in value) ||
    typeof value.width !== 'number' ||
    !('height' in value) ||
    typeof value.height !== 'number'
  ) {
    throw new LocalVideoError(
      'helper-failed',
      'The video helper returned invalid liveness information.',
    );
  }

  return {
    status: value.status as LocalVideoMediaStatus['status'],
    captureAlive: value.captureAlive,
    width: value.width,
    height: value.height,
    codec: 'VP8',
    ...('framesEncoded' in value &&
    typeof value.framesEncoded === 'number' &&
    Number.isFinite(value.framesEncoded)
      ? { framesEncoded: value.framesEncoded }
      : {}),
    ...('bytesSent' in value &&
    typeof value.bytesSent === 'number' &&
    Number.isFinite(value.bytesSent)
      ? { bytesSent: value.bytesSent }
      : {}),
    path:
      'path' in value && (value.path === 'direct' || value.path === 'relay')
        ? value.path
        : 'unknown',
    ...('roundTripTimeMs' in value &&
    typeof value.roundTripTimeMs === 'number' &&
    Number.isFinite(value.roundTripTimeMs)
      ? { roundTripTimeMs: value.roundTripTimeMs }
      : {}),
    ...('availableOutgoingBitrate' in value &&
    typeof value.availableOutgoingBitrate === 'number' &&
    Number.isFinite(value.availableOutgoingBitrate)
      ? { availableOutgoingBitrate: value.availableOutgoingBitrate }
      : {}),
    ...('encoderImplementation' in value && typeof value.encoderImplementation === 'string'
      ? { encoderImplementation: value.encoderImplementation.slice(0, 80) }
      : {}),
  };
}
