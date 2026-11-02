import { closeSync, fstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { noiseFingerprint, NOISE_PROTOCOL } from '../devices/noise/xk.js';
import { pairingLink, type PairingPayload } from '../devices/http.js';
import { openSshTunnel, SshTunnelError } from '../devices/ssh-tunnel.js';
import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';

export const SSH_COMMANDS = [
  {
    command: 'ssh-tunnel',
    description: 'keep an SSH tunnel to an existing Linux Host open for this computer’s browser',
  },
] as const;

export const SSH_OPTIONS = {
  'pairing-file': { type: 'string' },
  'local-port': { type: 'string' },
  'remote-port': { type: 'string' },
  'ssh-config': { type: 'string' },
} as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readSshPairing(
  text: string,
): PairingPayload & { encryption: NonNullable<PairingPayload['encryption']> } {
  try {
    if (text.length > 16_384) throw new Error('too-large');
    const link = new URL(text.trim());
    if (!['deepseekbot:', 'deepseekbot-dev:'].includes(link.protocol)) throw new Error('scheme');
    const body = record(
      JSON.parse(Buffer.from(link.searchParams.get('p') ?? '', 'base64url').toString('utf8')),
    );
    const host = record(body['host']),
      encryption = record(body['encryption']);
    if (
      (body['v'] !== 1 && body['v'] !== 2) ||
      body['enrollment'] !== undefined ||
      typeof host['id'] !== 'string' ||
      !host['id'] ||
      typeof host['name'] !== 'string' ||
      typeof body['offer'] !== 'string' ||
      !body['offer'] ||
      typeof body['expiresAt'] !== 'string' ||
      !Number.isFinite(Date.parse(body['expiresAt'])) ||
      encryption['protocol'] !== 'connect-noise-xk-v1' ||
      typeof encryption['publicKey'] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(encryption['publicKey'])
    )
      throw new Error('invalid');
    return {
      v: 2,
      host: { id: host['id'], name: host['name'] },
      offer: body['offer'],
      expiresAt: body['expiresAt'],
      routes: [],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        noise: NOISE_PROTOCOL,
        required: true,
        loopback: 'encrypted',
        publicKey: encryption['publicKey'],
        fingerprint: noiseFingerprint(Buffer.from(encryption['publicKey'], 'hex')),
      },
    };
  } catch {
    throw new CliLiveError(
      'ssh-pairing-invalid',
      'Use a private pairing file created by the intended Host with its pinned key.',
    );
  }
}

function readPrivatePairing(path: string): ReturnType<typeof readSshPairing> {
  let file: number;
  try {
    file = openSync(path, 'r');
  } catch {
    throw new CliLiveError('ssh-pairing-unavailable', 'Could not open the pairing file.');
  }
  try {
    const stat = fstatSync(file);
    if (
      !stat.isFile() ||
      stat.size > 16_384 ||
      (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    )
      throw new CliLiveError(
        'ssh-pairing-not-private',
        'Use a private regular pairing file (mode 0600 on Linux and macOS).',
      );
    return readSshPairing(readFileSync(file, 'utf8'));
  } finally {
    closeSync(file);
  }
}

export async function runSshCli(
  rest: string[],
  values: {
    'pairing-file'?: string;
    'local-port'?: string;
    'remote-port'?: string;
    'ssh-config'?: string;
    out?: string;
  },
  io: BotCreateCliIo,
): Promise<number> {
  const input = values['pairing-file'],
    output = values.out;
  if (
    rest.length !== 1 ||
    !input ||
    !output ||
    !isAbsolute(input) ||
    !isAbsolute(output) ||
    !/^\d+$/u.test(values['local-port'] ?? '') ||
    !/^\d+$/u.test(values['remote-port'] ?? '') ||
    (values['ssh-config'] !== undefined && !isAbsolute(values['ssh-config']))
  )
    throw new CliLiveError(
      'usage',
      'ssh-tunnel <alias> requires absolute --pairing-file and new --out paths, --local-port and --remote-port; optional --ssh-config must be absolute.',
    );
  const payload = readPrivatePairing(input);
  let file: number;
  try {
    file = openSync(output, 'wx', 0o600);
  } catch {
    throw new CliLiveError('ssh-output-unavailable', 'Choose a new writable --out file.');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('SIGHUP', stop);
  let tunnel: Awaited<ReturnType<typeof openSshTunnel>> | undefined;
  let ready = false;
  try {
    tunnel = await openSshTunnel({
      target: {
        alias: rest[0]!,
        localPort: Number(values['local-port']),
        remotePort: Number(values['remote-port']),
        ...(values['ssh-config'] === undefined ? {} : { config: values['ssh-config'] }),
        hostId: payload.host.id,
        hostKey: payload.encryption.publicKey,
      },
      env: io.env,
      signal: controller.signal,
      log: (event) => io.stderr(JSON.stringify(event)),
    });
    writeFileSync(file, `${pairingLink({ ...payload, routes: [tunnel.origin] })}\n`);
    io.stdout(
      JSON.stringify({
        status: 'ready',
        hostId: payload.host.id,
        route: tunnel.origin,
        hostFingerprint: payload.encryption.fingerprint,
        link: { path: output },
        offerExpired: Date.parse(payload.expiresAt) <= Date.now(),
        next: 'Keep this command running. In your local Host browser choose Add remote and paste the private output file. Approve its device key on the remote Host. Stop with Ctrl+C.',
      }),
    );
    ready = true;
    const result = await tunnel.closed;
    return result.stopped ? 0 : 1;
  } catch (error) {
    const code = error instanceof SshTunnelError ? error.code : 'ssh-tunnel-failed';
    const message =
      error instanceof SshTunnelError
        ? error.message
        : 'The SSH tunnel or pairing output could not be prepared.';
    if (!ready) throw new CliLiveError(code, message);
    io.stderr(JSON.stringify({ module: 'ssh-tunnel', phase: 'refused', code }));
    return 1;
  } finally {
    closeSync(file);
    await tunnel?.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGHUP', stop);
  }
}
