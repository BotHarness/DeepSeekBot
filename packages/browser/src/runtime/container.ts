import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server, type Socket } from 'node:net';
import { basename } from 'node:path';
import { stat, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';

import {
  freeUdpPort,
  loopbackPort,
  SELKIES_RTC_CONFIG_SCRIPT,
  selkiesWebRtcEnv,
  type SelkiesWebRtcContainer,
  type SelkiesWebRtcMedia,
} from '../../../core/src/http/selkies-webrtc.js';
import type { BrowserExecution } from './browser.js';

export const CONTAINER_BROWSER_IMAGE =
  'lscr.io/linuxserver/chrome@sha256:0614c258b65fa8acbc86d0f674efec942958b94dc341d710d27126ea3bad848c';

const execute = promisify(execFile);
const OWNER_LABEL = 'ai.botharness.browser';
const CDP_PORT = 9222;
const RELAY =
  'import socket,sys,threading\ns=socket.create_connection(("127.0.0.1",9222),10)\ns.settimeout(None)\ndef copy_in():\n try:\n  while True:\n   b=sys.stdin.buffer.read1(65536)\n   if not b: break\n   s.sendall(b)\n finally:\n  s.shutdown(socket.SHUT_WR)\nthreading.Thread(target=copy_in,daemon=True).start()\nwhile True:\n b=s.recv(65536)\n if not b: break\n sys.stdout.buffer.write(b);sys.stdout.buffer.flush()';

export interface ContainerBrowserOptions {
  readonly profileDirectory: string;
  readonly onEvent?: (detail: string) => void;
  readonly onViewer?: (
    prefix: string,
    upstream: () => URL | undefined,
    webrtc: SelkiesWebRtcContainer,
  ) => () => void;
  readonly run?: (args: readonly string[]) => Promise<string>;
  readonly tailnetAddress?: () => Promise<string | undefined>;
}

export function containerBrowserIdentity(directory: string): string {
  return createHash('sha256').update(directory).digest('hex').slice(0, 24);
}

export function containerBrowserArgs(
  identity: string,
  media?: SelkiesWebRtcMedia,
): readonly string[] {
  return [
    'run',
    '-d',
    '--name',
    `botharness-browser-${identity}`,
    '--hostname',
    `botharness-browser-${identity}`,
    '--label',
    `${OWNER_LABEL}=${identity}`,
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--shm-size',
    '512m',
    '--pids-limit',
    '1024',
    '--security-opt',
    'no-new-privileges=true',
    '--publish',
    '127.0.0.1::3000',
    ...(media === undefined ? [] : ['--publish', `127.0.0.1::${String(media.port)}/udp`]),
    ...selkiesWebRtcEnv(media).flatMap((entry) => ['--env', entry]),
    '--mount',
    `type=volume,source=botharness-browser-${identity},target=/config`,
    '--env',
    'PIXELFLUX_WAYLAND=false',
    '--env',
    'START_DOCKER=false',
    '--env',
    `SUBFOLDER=/botharness-browser/viewer/${identity}/`,
    '--env',
    'HARDEN_DESKTOP=true',
    '--env',
    'SELKIES_ENABLE_SHARING=false',
    '--env',
    'SELKIES_CLIPBOARD_ENABLED=false|locked',
    '--env',
    'SELKIES_CLIPBOARD_IN_ENABLED=false|locked',
    '--env',
    'SELKIES_CLIPBOARD_OUT_ENABLED=false|locked',
    '--env',
    'SELKIES_FILE_TRANSFERS=none',
    '--env',
    'SELKIES_COMMAND_ENABLED=false|locked',
    '--env',
    'SELKIES_MICROPHONE_ENABLED=false|locked',
    '--env',
    'SELKIES_GAMEPAD_ENABLED=false|locked',
    '--env',
    'SELKIES_UI_SHOW_SIDEBAR=false|locked',
    '--env',
    'SELKIES_MANUAL_WIDTH=1024',
    '--env',
    'SELKIES_MANUAL_HEIGHT=768',
    '--env',
    `CHROME_CLI=--user-data-dir=/config/bot-browser --remote-debugging-port=${CDP_PORT} --disable-blink-features=AutomationControlled --no-first-run --no-default-browser-check about:blank`,
    CONTAINER_BROWSER_IMAGE,
  ];
}

export function createContainerBrowserExecution(
  options: ContainerBrowserOptions,
): BrowserExecution & Required<Pick<BrowserExecution, 'viewerUrl' | 'prepareUpload'>> {
  const identity = containerBrowserIdentity(options.profileDirectory);
  const name = `botharness-browser-${identity}`;
  const prefix = `/botharness-browser/viewer/${identity}`;
  const event = options.onEvent ?? (() => undefined);
  const run =
    options.run ??
    (async (args: readonly string[]) => {
      const result = await execute('docker', [...args], {
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      return result.stdout.trim();
    });
  let active = false;
  let server: Server | undefined;
  let viewer: URL | undefined;
  let media: SelkiesWebRtcMedia | undefined;
  let releaseViewer: (() => void) | undefined;
  let starting: Promise<{ endpoint: string; binary: string }> | undefined;
  let stopping = false;
  let uploadBytes = 0;
  const sockets = new Set<Socket>();
  const relays = new Set<ChildProcess>();

  const webrtc: SelkiesWebRtcContainer = {
    async media() {
      const advertised = media;
      if (!active || advertised === undefined) return undefined;
      const published = loopbackPort(await run(['port', name, `${String(advertised.port)}/udp`]));
      return published === undefined ? undefined : { advertised, loopbackPort: published };
    },
    async prepare() {
      await run(['exec', name, 'sh', '-c', SELKIES_RTC_CONFIG_SCRIPT]);
    },
  };

  const inspectOwned = async (): Promise<boolean> => {
    const names = await run(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']);
    if (names === '') return false;
    const label = await run([
      'inspect',
      '--format',
      `{{index .Config.Labels "${OWNER_LABEL}"}}`,
      name,
    ]);
    if (label !== identity) throw new Error('Container Browser name belongs to another owner');
    return true;
  };

  const closeRelay = async (): Promise<void> => {
    active = false;
    uploadBytes = 0;
    for (const socket of sockets) socket.destroy();
    for (const relay of relays) relay.kill('SIGTERM');
    sockets.clear();
    relays.clear();
    const old = server;
    server = undefined;
    if (old !== undefined) await new Promise<void>((resolve) => old.close(() => resolve()));
    releaseViewer?.();
    releaseViewer = undefined;
    viewer = undefined;
  };

  const stopOwned = async (): Promise<void> => {
    if (await inspectOwned()) {
      await run(['stop', '--time', '10', name]);
      await run(['rm', name]);
    }
  };

  const launch = async (): Promise<{ endpoint: string; binary: string }> => {
    const started = Date.now();
    let phase = 'docker';
    event('initiator=browser phase=start target=container');
    try {
      await closeRelay();
      await run(['info', '--format', '{{.ServerVersion}}']);
      phase = 'owner-check';
      await stopOwned();
      phase = 'volume';
      await run(['volume', 'create', '--label', `${OWNER_LABEL}=${identity}`, name]);
      const volumeOwner = await run([
        'volume',
        'inspect',
        '--format',
        `{{index .Labels "${OWNER_LABEL}"}}`,
        name,
      ]);
      if (volumeOwner !== identity)
        throw new Error('Container Browser volume belongs to another owner');
      await mkdir(options.profileDirectory, { recursive: true });
      phase = 'profile-recovery';
      await run([
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--cpus',
        '1',
        '--memory',
        '256m',
        '--pids-limit',
        '128',
        '--security-opt',
        'no-new-privileges=true',
        '--label',
        `${OWNER_LABEL}=${identity}`,
        '--mount',
        `type=volume,source=${name},target=/config`,
        '--entrypoint',
        '/bin/sh',
        CONTAINER_BROWSER_IMAGE,
        '-c',
        'rm -f /config/bot-browser/SingletonLock /config/bot-browser/SingletonCookie /config/bot-browser/SingletonSocket',
      ]);
      phase = 'launch';
      const tailnet = await options.tailnetAddress?.().catch(() => undefined);
      media =
        tailnet === undefined
          ? undefined
          : await freeUdpPort(tailnet).then(
              (port) => ({ address: tailnet, port }),
              () => undefined,
            );
      await run(containerBrowserArgs(identity, media));
      phase = 'readiness';
      let endpoint: string | undefined;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline && !stopping) {
        try {
          const info = JSON.parse(
            await run([
              'exec',
              name,
              'curl',
              '--max-time',
              '2',
              '-fsS',
              `http://127.0.0.1:${CDP_PORT}/json/version`,
            ]),
          ) as { webSocketDebuggerUrl?: unknown };
          if (typeof info.webSocketDebuggerUrl === 'string') {
            endpoint = info.webSocketDebuggerUrl;
            break;
          }
        } catch {}
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
      if (endpoint === undefined || stopping)
        throw new Error('Container Bot Browser did not become ready');
      phase = 'cdp-relay';
      server = createServer((socket) => {
        sockets.add(socket);
        const relay = spawn('docker', ['exec', '-i', name, 'python3', '-u', '-c', RELAY], {
          stdio: ['pipe', 'pipe', 'ignore'],
          windowsHide: true,
        });
        relays.add(relay);
        relay.stdin!.on('error', () => socket.destroy());
        relay.stdout!.on('error', () => socket.destroy());
        socket.pipe(relay.stdin!);
        relay.stdout!.pipe(socket);
        relay.on('error', () => socket.destroy());
        relay.on('exit', () => {
          relays.delete(relay);
          socket.destroy();
        });
        socket.on('error', () => relay.kill('SIGTERM'));
        socket.on('close', () => {
          sockets.delete(socket);
          relay.kill('SIGTERM');
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Container CDP relay did not bind loopback');
      const ws = new URL(endpoint);
      if (ws.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(ws.hostname))
        throw new Error('Container CDP endpoint is not loopback');
      ws.hostname = '127.0.0.1';
      ws.port = String(address.port);
      phase = 'viewer';
      const port = await run(['port', name, '3000/tcp']);
      const match = /^127\.0\.0\.1:(\d+)$/u.exec(port);
      if (match === null) throw new Error('Container viewer is not bound exclusively to loopback');
      viewer = new URL(`http://127.0.0.1:${match[1]}${prefix}/`);
      releaseViewer = options.onViewer?.(prefix, () => viewer, webrtc);
      active = true;
      event(`initiator=browser phase=ready target=container durationMs=${Date.now() - started}`);
      return { endpoint: ws.href, binary: CONTAINER_BROWSER_IMAGE };
    } catch (error) {
      await closeRelay();
      await stopOwned().catch(() => undefined);
      event(
        `initiator=browser phase=refused target=container reason=${phase}-failed durationMs=${Date.now() - started}`,
      );
      throw new Error(
        `Container Bot Browser startup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return {
    start() {
      stopping = false;
      starting ??= launch().finally(() => {
        starting = undefined;
      });
      return starting;
    },
    isRunning: () => active,
    viewerUrl: () => (active && releaseViewer !== undefined ? `${prefix}/` : undefined),
    async stop() {
      stopping = true;
      active = false;
      await starting?.catch(() => undefined);
      await closeRelay();
      await stopOwned();
      event('initiator=browser phase=stopped target=container');
    },
    async prepareUpload(path) {
      if (!active) throw new Error('Container Bot Browser is not running');
      const info = await stat(path);
      if (!info.isFile() || info.size > 64 * 1024 * 1024)
        throw new Error('Browser upload must be a regular file no larger than 64 MiB');
      if (uploadBytes + info.size > 128 * 1024 * 1024)
        throw new Error(
          'Container Browser upload storage is full; stop the browser before uploading more files',
        );
      uploadBytes += info.size;
      const dir = `/tmp/botharness-upload-${randomUUID()}`;
      const dest = `${dir}/${basename(path)}`;
      try {
        await run(['exec', '--user', 'abc', name, 'mkdir', '-m', '700', '-p', dir]);
        await run(['cp', '-L', path, `${name}:${dest}`]);
        await run(['exec', name, 'chown', 'abc:abc', dest]);
        await run(['exec', name, 'chmod', '400', dest]);
      } catch (error) {
        uploadBytes -= info.size;
        await run(['exec', name, 'rm', '-rf', dir]).catch(() => undefined);
        throw error;
      }
      return {
        path: dest,
        dispose: async () => undefined,
      };
    },
  };
}
