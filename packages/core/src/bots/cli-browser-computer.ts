import { createReadStream, createWriteStream, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';

type LiveHost = Awaited<ReturnType<typeof connectLiveHost>>;

export const BROWSER_COMPUTER_OPTIONS = {
  tab: { type: 'string' },
  profile: { type: 'string' },
  package: { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  'token-stdin': { type: 'boolean' },
  dir: { type: 'string' },
  plugin: { type: 'string' },
  entity: { type: 'string' },
  viewer: { type: 'string' },
  probe: { type: 'boolean' },
} as const;

export const BROWSER_COMPUTER_COMMANDS = [
  {
    command: 'browser-observation',
    description: "read a Bot's Browser state, tabs and current picture (--out saves the picture)",
  },
  {
    command: 'browser-takeover-audit',
    description: "list a Bot's Browser takeover events (mint, accept, input, complete)",
  },
  {
    command: 'browser-takeover-recording',
    description: 'read one Browser takeover and its recorded input (token from stdin)',
  },
  {
    command: 'browser-profile-set',
    description: "pick a Bot's Browser profile (--profile <name> or default)",
  },
  {
    command: 'browser-packages',
    description: 'read whether the Host can install missing Browser libraries, and any install',
  },
  {
    command: 'browser-install-packages',
    description: 'install missing Browser system libraries (--package …, needs --confirm)',
  },
  {
    command: 'computer-install-packages',
    description: 'install the packages Local Computer is missing (needs --confirm)',
  },
  { command: 'computer-diagnostics', description: 'read recent Computer diagnostic events' },
  { command: 'computer-logs', description: "read the Host's operational log entries" },
  {
    command: 'computer-exports',
    description: 'list Container Computer archives in the Host export folder',
  },
  {
    command: 'computer-export',
    description: 'export Container Computer to an archive (--out downloads it)',
  },
  {
    command: 'computer-upload',
    description: 'upload a local .tar archive into the Host export folder',
  },
  {
    command: 'computer-import',
    description: 'restore Container Computer from an export-folder archive (needs --confirm)',
  },
  {
    command: 'computer-open-dir',
    description: 'open the Computer export folder in the Host file manager',
  },
  {
    command: 'computer-webrtc',
    description: 'read whether a phone can call Container Computer over WebRTC (--probe signals)',
  },
  {
    command: 'browser-webrtc',
    description:
      'read whether a phone can call a Container Browser over WebRTC (--viewer <id>, --probe)',
  },
] as const;

export interface BrowserComputerValues {
  tab?: string;
  profile?: string;
  package?: string[];
  confirm?: boolean;
  'token-stdin'?: boolean;
  dir?: string;
  plugin?: string;
  entity?: string;
  viewer?: string;
  probe?: boolean;
  out?: string;
  name?: string;
  bot?: string;
  since?: string;
  limit?: string;
  wait?: boolean;
}

type Command = (typeof BROWSER_COMPUTER_COMMANDS)[number]['command'];

const BOT_COMMANDS: readonly Command[] = [
  'browser-observation',
  'browser-takeover-audit',
  'browser-profile-set',
];
const FILE_COMMANDS: readonly Command[] = ['computer-upload', 'computer-import'];
const CONFIRMED: readonly Command[] = [
  'browser-install-packages',
  'computer-install-packages',
  'computer-import',
];

export function isBrowserComputerCommand(command: string): command is Command {
  return BROWSER_COMPUTER_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

const absolute = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value);
const archiveName = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar$/u.test(value) && !value.includes('..');

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const PROBE_DEADLINE_MS = 20_000;

export function probeSignaling(
  socket: WebSocket,
  deadlineMs = PROBE_DEADLINE_MS,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  return new Promise((resolve) => {
    let server = '';
    let settled = false;
    const finish = (result: Record<string, unknown>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve({ ...result, milliseconds: Date.now() - started });
    };
    const timer = setTimeout(
      () => finish({ ok: false, code: 'signaling-timeout', session: server !== '' }),
      deadlineMs,
    );
    socket.addEventListener('open', () =>
      socket.send(
        `HELLO client ${JSON.stringify({ client_type: 'controller', client_slot: -1, display_id: 'primary' })}`,
      ),
    );
    socket.addEventListener('error', () => finish({ ok: false, code: 'signaling-refused' }));
    socket.addEventListener('close', (event) =>
      finish({ ok: false, code: 'signaling-closed', closeCode: event.code }),
    );
    socket.addEventListener('message', (event) => {
      const text = String(event.data);
      if (text === 'HELLO') return socket.send('SESSION server');
      if (text.startsWith('SESSION_OK ')) {
        server = text.slice('SESSION_OK '.length);
        return;
      }
      if (text === 'ERROR peer server not found') {
        setTimeout(() => {
          if (!settled) socket.send('SESSION server');
        }, 500);
        return;
      }
      let message: { sdp?: { type?: string; sdp?: string } } = {};
      try {
        message = JSON.parse(text.slice(text.indexOf(' ') + 1)) as typeof message;
      } catch {
        return;
      }
      if (message.sdp?.type !== 'offer' || typeof message.sdp.sdp !== 'string') return;
      const lines = message.sdp.sdp.split(/\r?\n/u);
      const candidates = [...new Set(lines.filter((line) => line.startsWith('a=candidate:')))].map(
        (line) => {
          const [, , protocol, , address, port, , type] = line.split(' ');
          return { protocol, address, port: Number(port), type };
        },
      );
      finish({ ok: true, offer: true, iceLite: lines.includes('a=ice-lite'), candidates });
    });
  });
}

function count(value: string | undefined, flag: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max)
    usage(`${flag} must be an integer from 0 to ${String(max)}.`);
  return parsed;
}

export async function runBrowserComputerCommand(
  command: Command,
  rest: string[],
  values: BrowserComputerValues,
  io: BotCreateCliIo,
  connect: () => Promise<LiveHost>,
): Promise<unknown> {
  const positionals = BOT_COMMANDS.includes(command) || FILE_COMMANDS.includes(command) ? 1 : 0;
  if (rest.length !== positionals || rest.some((value) => !value.trim()))
    usage(
      positionals === 0
        ? `${command} takes no positional arguments.`
        : FILE_COMMANDS.includes(command)
          ? `${command} needs exactly one ${command === 'computer-upload' ? 'local file' : 'archive name'}.`
          : `${command} needs exactly one bot id.`,
    );
  const target = rest[0]?.trim() ?? '';
  if (CONFIRMED.includes(command) && values.confirm !== true)
    usage(
      command === 'computer-import'
        ? 'computer-import replaces Container Computer data with the archive. Pass --confirm.'
        : `${command} installs system packages on the Host. Pass --confirm.`,
    );
  if (values.out !== undefined && !absolute(values.out))
    usage('--out must be an absolute file path.');
  if (values.dir !== undefined && !absolute(values.dir)) usage('--dir must be an absolute folder.');
  const viewer = values.viewer?.trim() ?? '';
  if (command === 'browser-webrtc' && !/^[a-f0-9]{24}$/u.test(viewer))
    usage(
      'browser-webrtc needs --viewer <id>, the id in the Container Browser viewer path /botharness-browser/viewer/<id>/.',
    );
  if (command === 'browser-profile-set' && !values.profile?.trim())
    usage('browser-profile-set requires --profile <name> or --profile default.');
  const packages = (values.package ?? []).map((name) => name.trim()).filter(Boolean);
  if (command === 'browser-install-packages' && packages.length === 0)
    usage('browser-install-packages needs --package for each library the Browser reported.');
  if (command === 'computer-import' && !archiveName(target))
    usage('computer-import needs an archive name from computer-exports, such as computer.tar.');
  let upload: { path: string; name: string; bytes: number } | undefined;
  if (command === 'computer-upload') {
    if (!absolute(target)) usage('computer-upload needs an absolute local file path.');
    const name = values.name?.trim() || basename(target);
    if (!archiveName(name))
      usage('The uploaded archive name must end in .tar, such as computer.tar.');
    let bytes: number;
    try {
      const info = statSync(target);
      if (!info.isFile()) throw new Error('not a file');
      bytes = info.size;
    } catch {
      usage(`Cannot read ${target}.`);
    }
    upload = { path: target, name, bytes };
  }
  let token = '';
  if (command === 'browser-takeover-recording') {
    if (values['token-stdin'] !== true) usage('browser-takeover-recording requires --token-stdin.');
    token = (await (io.readStdin?.() ?? Promise.resolve(''))).trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(token))
      usage('stdin must hold the takeover token from the takeover link.');
  }
  const since = count(values.since, '--since', Number.MAX_SAFE_INTEGER);
  const limit = count(values.limit, '--limit', 1000);

  const host = await connect();
  const json = async (path: string, body?: Record<string, unknown>) => {
    const { bytes } = await host.http(path, body);
    try {
      return record(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      throw new CliLiveError('host-protocol-error', `The Host returned no JSON for ${path}.`);
    }
  };
  const query = (path: string, params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== '') search.set(key, String(value));
    const text = search.toString();
    return text === '' ? path : `${path}?${text}`;
  };
  const waitFor = async (read: () => Promise<Record<string, unknown>>) => {
    let state = await read();
    while (values.wait === true && record(state['install'] ?? state)['state'] === 'installing') {
      await delay(1000);
      state = await read();
    }
    return state;
  };

  switch (command) {
    case 'browser-observation': {
      const observed = await json(
        query('/api/browser/observation', { slug: target, tab: values.tab }),
      );
      const frame = observed['frame'];
      if (typeof frame !== 'string') return observed;
      const match = /^data:([^;,]+);base64,(.*)$/su.exec(frame);
      if (match === null) return { ...observed, frame: null };
      const bytes = Buffer.from(match[2]!, 'base64');
      if (values.out !== undefined) writeFileSync(values.out, bytes, { mode: 0o600 });
      return {
        ...observed,
        frame: {
          mimeType: match[1],
          bytes: bytes.byteLength,
          ...(values.out === undefined ? {} : { path: values.out }),
        },
      };
    }
    case 'browser-takeover-audit':
      return json(query('/api/browser/takeover/audit', { slug: target }));
    case 'browser-takeover-recording':
      return json(query('/api/browser/takeover/recording', { token }));
    case 'browser-profile-set':
      return host.rpc('browserProfileSet', { slug: target, profile: values.profile!.trim() });
    case 'browser-packages':
      return json('/api/browser/install-packages');
    case 'browser-install-packages':
      await json('/api/browser/install-packages', { authorize: true, packages });
      return waitFor(() => json('/api/browser/install-packages'));
    case 'computer-install-packages':
      await json('/api/computer/install-packages', { authorize: true });
      return waitFor(() => json('/api/computer/status'));
    case 'computer-diagnostics':
      return json('/api/computer/diagnostics');
    case 'computer-logs':
      return json(
        query('/api/computer/logs', {
          plugin: values.plugin?.trim(),
          owner: values.bot?.trim() ? `bot:${values.bot.trim()}` : undefined,
          entity: values.entity?.trim(),
          since,
          limit,
        }),
      );
    case 'computer-exports':
      return json('/api/computer/exports');
    case 'computer-export': {
      const exported = await json('/api/computer/export', {
        authorize: true,
        ...(values.dir === undefined ? {} : { dir: values.dir }),
      });
      const { downloadToken, ...result } = exported;
      if (values.out === undefined) return result;
      if (typeof downloadToken !== 'string')
        throw new CliLiveError('host-protocol-error', 'The Host returned no download token.');
      const response = await host.stream(query('/api/computer/download', { token: downloadToken }));
      if (response.body === null)
        throw new CliLiveError('host-protocol-error', 'The Host returned an empty archive.');
      let bytes = 0;
      try {
        await pipeline(
          Readable.fromWeb(response.body as never),
          async function* (source: AsyncIterable<Buffer>) {
            for await (const chunk of source) {
              bytes += chunk.byteLength;
              yield chunk;
            }
          },
          createWriteStream(values.out, { mode: 0o600 }),
        );
      } catch {
        throw new CliLiveError(
          'host-unreachable',
          'The archive download was interrupted; export again.',
        );
      }
      return { ...result, download: { path: values.out, bytes } };
    }
    case 'computer-upload': {
      const started = await json('/api/computer/upload', { authorize: true, file: upload!.name });
      if (typeof started['uploadToken'] !== 'string')
        throw new CliLiveError('host-protocol-error', 'The Host returned no upload token.');
      await host.stream(query('/api/computer/upload-content', { token: started['uploadToken'] }), {
        method: 'POST',
        headers: {
          'content-type': 'application/x-tar',
          'content-length': String(upload!.bytes),
        },
        body: Readable.toWeb(createReadStream(upload!.path)) as ReadableStream,
        duplex: 'half',
      } as RequestInit);
      return { ok: true, file: upload!.name, bytes: upload!.bytes };
    }
    case 'computer-import':
      return json('/api/computer/import', { authorize: true, file: target });
    case 'computer-open-dir':
      return json('/api/computer/open-dir', {
        authorize: true,
        ...(values.dir === undefined ? {} : { dir: values.dir }),
      });
    case 'computer-webrtc':
    case 'browser-webrtc': {
      const computer = command === 'computer-webrtc';
      const status = await json(
        computer ? '/api/computer/webrtc' : query('/api/browser/webrtc', { viewer }),
      );
      if (values.probe !== true || status['available'] !== true) return status;
      const probe = await probeSignaling(
        host.socket(
          computer
            ? '/api/computer/webrtc/signaling'
            : query('/api/browser/webrtc/signaling', { viewer }),
        ),
      );
      return { ...status, probe };
    }
  }
}
