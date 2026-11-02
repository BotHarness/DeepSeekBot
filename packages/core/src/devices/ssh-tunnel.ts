import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { ConnectChannel, CONNECT_CHANNEL_PATH } from './noise/channel.js';
import { freeLoopbackPort, openSshLoopback } from './ssh-loopback.js';

export class SshTunnelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SshTunnelTarget {
  alias: string;
  localPort: number;
  remotePort: number;
  config?: string;
  hostId: string;
  hostKey: string;
}

export interface SshTunnelEvent {
  module: 'ssh-tunnel';
  initiator: 'operator';
  command: 'system-openssh-forward';
  phase: 'starting' | 'ready' | 'stopping' | 'closed' | 'refused';
  durationMs: number;
  code?: string;
}

export function sshTunnelArgs(target: SshTunnelTarget): string[] {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.@:[\]-]{0,253}$/u.test(target.alias))
    throw new SshTunnelError('ssh-target-invalid', 'Use an existing SSH alias or user@host.');
  for (const port of [target.localPort, target.remotePort])
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new SshTunnelError('ssh-port-invalid', 'Ports must be integers from 1 to 65535.');
  if (!target.hostId || !/^[0-9a-f]{64}$/u.test(target.hostKey))
    throw new SshTunnelError('host-key-required', 'Use a pairing file with the intended Host key.');
  return [
    ...(target.config === undefined ? [] : ['-F', target.config]),
    '-N',
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
    '-o',
    'ControlMaster=no',
    '-o',
    'ControlPath=none',
    '-o',
    'ForwardAgent=no',
    '-o',
    'PermitLocalCommand=no',
    '-L',
    `127.0.0.1:${target.localPort}:127.0.0.1:${target.remotePort}`,
    '--',
    target.alias,
  ];
}

async function checkLocalPort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', () =>
      reject(new SshTunnelError('ssh-local-port-unavailable', 'Choose a free local port.')),
    );
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}

export async function verifyTunnelHost(
  target: Pick<SshTunnelTarget, 'localPort' | 'hostId' | 'hostKey'>,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const key = randomBytes(32);
  const channel = new ConnectChannel({
    role: 'initiator',
    hostId: target.hostId,
    hostKey: Buffer.from(target.hostKey, 'hex'),
    staticKey: key,
    ephemeralKey: randomBytes(32),
  });
  return new Promise<boolean>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${target.localPort}${CONNECT_CHANNEL_PATH}`, {
      handshakeTimeout: 750,
      maxPayload: 70_000,
    });
    let done = false;
    const finish = (result: boolean | SshTunnelError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      channel.close();
      key.fill(0);
      socket.terminate();
      if (result instanceof SshTunnelError) reject(result);
      else resolve(result);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 1000);
    signal.addEventListener('abort', abort, { once: true });
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));
    socket.on('open', () => {
      if (!done) socket.send(channel.start());
    });
    socket.on('message', (data, binary) => {
      if (done) return;
      try {
        if (binary) throw new Error('binary-handshake');
        const result = channel.receive(data.toString());
        if (result.reply) socket.send(result.reply);
        if (result.ready) finish(true);
      } catch {
        finish(
          new SshTunnelError(
            'ssh-host-identity-mismatch',
            'The tunnel did not authenticate the Host in the pairing file.',
          ),
        );
      }
    });
  });
}

export async function openSshTunnel(options: {
  target: SshTunnelTarget;
  env?: NodeJS.ProcessEnv;
  signal: AbortSignal;
  timeoutMs?: number;
  log(event: SshTunnelEvent): void;
}) {
  sshTunnelArgs(options.target);
  await checkLocalPort(options.target.localPort);
  if (options.signal.aborted)
    throw new SshTunnelError('ssh-cancelled', 'SSH connection cancelled.');
  const sshPort = await freeLoopbackPort();
  const args = sshTunnelArgs({ ...options.target, localPort: sshPort });
  let carrier: Awaited<ReturnType<typeof openSshLoopback>>;
  try {
    carrier = await openSshLoopback(options.target.localPort, sshPort);
  } catch {
    throw new SshTunnelError('ssh-local-port-unavailable', 'Choose a free local port.');
  }
  const started = performance.now();
  const log = (phase: SshTunnelEvent['phase'], code?: string) =>
    options.log({
      module: 'ssh-tunnel',
      initiator: 'operator',
      command: 'system-openssh-forward',
      phase,
      durationMs: Math.round(performance.now() - started),
      ...(code === undefined ? {} : { code }),
    });
  log('starting');
  const child = spawn(process.platform === 'win32' ? 'ssh.exe' : 'ssh', args, {
    env: options.env,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let reason = 'ssh-connection-failed',
    stopped = false,
    exited = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  child.stderr.on('data', (bytes: Buffer) => {
    const text = bytes.toString().slice(0, 4096);
    if (/host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/iu.test(text))
      reason = 'ssh-host-key-refused';
    else if (/permission denied|authentication failed/iu.test(text))
      reason = 'ssh-authentication-refused';
    else if (/address already in use|cannot listen to port/iu.test(text))
      reason = 'ssh-local-port-unavailable';
  });
  child.on('error', (error) => {
    if ('code' in error && error.code === 'ENOENT') reason = 'ssh-missing';
  });
  const closed = new Promise<{ stopped: boolean; code: string }>((resolve) =>
    child.once('close', () => {
      exited = true;
      clearTimeout(killTimer);
      controller.abort();
      options.signal.removeEventListener('abort', stop);
      log('closed', stopped ? 'ssh-stopped' : reason);
      void carrier.close().then(() => resolve({ stopped, code: stopped ? 'ssh-stopped' : reason }));
    }),
  );
  const stop = () => {
    if (stopped || exited) return;
    stopped = true;
    log('stopping');
    controller.abort();
    child.kill();
    killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
  };
  options.signal.addEventListener('abort', stop, { once: true });
  if (options.signal.aborted) stop();
  try {
    const deadline = performance.now() + (options.timeoutMs ?? 15_000);
    while (!exited && !stopped && performance.now() < deadline) {
      if (await verifyTunnelHost(options.target, controller.signal)) {
        if (exited || stopped) break;
        log('ready');
        return {
          origin: `http://127.0.0.1:${options.target.localPort}`,
          closed,
          close: async () => {
            stop();
            await closed;
          },
        };
      }
      if (!exited && !stopped) await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    throw new SshTunnelError(
      stopped ? 'ssh-cancelled' : exited ? reason : 'ssh-host-unready',
      'SSH could not reach the expected Host. Check SSH trust, authentication, ports and the running Host.',
    );
  } catch (error) {
    log('refused', error instanceof SshTunnelError ? error.code : 'ssh-connection-failed');
    stop();
    await closed;
    throw error;
  }
}
