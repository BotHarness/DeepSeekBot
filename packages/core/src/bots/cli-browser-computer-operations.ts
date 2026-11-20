import { writeFileSync } from 'node:fs';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { connectLiveHost, record } from './cli-live-host.js';
import { timeoutMs, usage, type LiveValues } from './cli-live-input.js';

export const DEVICE_COMMANDS = [
  'browser-open',
  'browser-frame',
  'browser-takeover',
  'browser-input',
  'browser-stop',
  'computer-start',
  'computer-status',
  'computer-stop',
  'browser-tools',
  'browser-tool',
  'computer-tools',
  'computer-tool',
  'computer-frame',
  'computer-takeover',
  'computer-input',
  'computer-video',
] as const;

export async function runDeviceCommand(
  command: (typeof DEVICE_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  const direct = command === 'browser-tool' || command === 'computer-tool';
  const video = command === 'computer-video';
  const computer = (command.startsWith('computer-') && !direct) || command === 'browser-tools';
  const positionals = direct ? 2 : video ? 1 : computer ? 0 : 1;
  if (rest.length !== positionals || rest.some((value) => !value.trim()))
    usage(
      direct
        ? `${command} needs a bot id and a tool name.`
        : video
          ? 'computer-video needs exactly one operation.'
          : computer
            ? `${command} takes no positional arguments.`
            : `${command} needs exactly one bot id.`,
    );
  let toolArgs: Record<string, unknown> = {};
  const input =
    command === 'browser-input' ||
    command === 'computer-input' ||
    (video && !['status', 'open'].includes(rest[0]!));
  if (input && values['args-stdin'] !== true)
    usage(
      video
        ? `computer-video ${rest[0]} needs --args-stdin with its binding/runtime command JSON.`
        : `${command} needs --args-stdin with a JSON input such as {"kind":"click","x":10,"y":20}.`,
    );
  if ((direct || input) && values['args-stdin'] === true) {
    try {
      const raw = await (io.readStdin?.() ?? Promise.resolve(''));
      if (video && Buffer.byteLength(raw) > 128 * 1024) throw new Error('input too large');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      toolArgs = parsed as Record<string, unknown>;
    } catch {
      usage('--args-stdin must be a JSON object of tool arguments.');
    }
  }
  if (
    direct &&
    values.out !== undefined &&
    !values.out.startsWith('/') &&
    !/^[A-Za-z]:[\\/]/u.test(values.out)
  )
    usage('--out must be an absolute file path.');
  const slug = rest[0]?.trim() ?? '';
  if (video) {
    if (
      ![
        'status',
        'open',
        'signal',
        'heartbeat',
        'takeover',
        'input',
        'release',
        'resume',
        'close',
      ].includes(slug)
    )
      usage(
        'computer-video needs status, open, signal, heartbeat, takeover, input, release, resume or close.',
      );
    if (toolArgs['force'] === true && values.confirm !== true)
      usage('Forced takeover requires --confirm.');
    if (
      slug === 'open' &&
      (values.out === undefined ||
        (!values.out.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(values.out)))
    )
      usage('computer-video open requires --out <absolute-file> for private signaling data.');
  }
  if (command === 'browser-frame' || command === 'computer-frame') {
    const out = values.out ?? '';
    if (!out.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(out))
      usage(`${command} requires --out <absolute-file>.`);
  }
  if (
    (command === 'browser-takeover' || command === 'computer-takeover') &&
    values.enabled === values.disabled
  )
    usage(`${command} needs exactly one of --enabled or --disabled.`);
  if (
    command === 'computer-start' &&
    values.target !== undefined &&
    values.target !== 'local' &&
    values.target !== 'container'
  )
    usage('--target must be local or container.');
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { http } = await connectLiveHost(values, io, signal);
  const json = async (path: string, body?: Record<string, unknown>) => {
    const { bytes } = await http(path, body);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new CliLiveError('host-protocol-error', `The Host returned no JSON for ${path}.`);
    }
  };
  let saved = false;
  const savedImages = (items: unknown[]) =>
    items.map((value) => {
      const item = record(value);
      if (item['type'] !== 'image' || typeof item['data'] !== 'string') return item;
      const bytes = Buffer.from(item['data'], 'base64');
      if (values.out !== undefined && !saved) {
        writeFileSync(values.out, bytes, { mode: 0o600 });
        saved = true;
        return {
          type: 'image',
          mimeType: item['mimeType'],
          path: values.out,
          bytes: bytes.byteLength,
        };
      }
      return {
        type: 'image',
        mimeType: item['mimeType'],
        bytes: bytes.byteLength,
      };
    });
  if (command === 'browser-tools') return json('/api/browser/tools');
  if (video) {
    const result = record(
      await json('/api/computer/video', {
        ...toolArgs,
        kind: slug,
        ...(toolArgs['force'] === true ? { confirm: values.confirm === true } : {}),
      }),
    );
    const state = record(result['state']);
    const { offer, ...safeState } = state;
    if (offer !== undefined && values.out !== undefined) {
      try {
        writeFileSync(values.out, JSON.stringify(offer), {
          mode: 0o600,
          flag: 'wx',
        });
      } catch {
        if (state['binding'] !== undefined)
          await json('/api/computer/video', {
            kind: 'close',
            binding: state['binding'],
          }).catch(() => undefined);
        throw new CliLiveError(
          'signaling-file-failed',
          'Private signaling could not be saved. Use a new writable absolute file.',
        );
      }
    }
    return {
      ...result,
      ...(result['state'] === undefined ? {} : { state: safeState }),
      ...(offer === undefined ? {} : { signalingFile: values.out }),
    };
  }
  if (command === 'computer-tools') return json('/api/computer/tools');
  if (command === 'computer-tool') {
    const result = record(
      await json('/api/computer/tool', {
        slug,
        tool: rest[1]!.trim(),
        args: toolArgs,
      }),
    );
    const inner = record(result['result']);
    return Array.isArray(inner['content'])
      ? {
          ...result,
          result: { ...inner, content: savedImages(inner['content']) },
        }
      : result;
  }
  if (command === 'browser-tool') {
    const result = record(
      await json('/api/browser/tool', {
        slug,
        tool: rest[1]!.trim(),
        args: toolArgs,
      }),
    );
    return {
      ...result,
      content: savedImages(Array.isArray(result['content']) ? result['content'] : []),
    };
  }
  if (command === 'browser-open') return json('/api/browser/open', { slug });
  if (command === 'browser-takeover')
    return json('/api/browser/takeover', {
      slug,
      active: values.enabled === true,
    });
  if (command === 'browser-input') return json('/api/browser/input', { ...toolArgs, slug });
  if (command === 'browser-stop') return json('/api/browser/stop', { slug });
  if (command === 'computer-start')
    return json('/api/computer/start', {
      authorize: true,
      ...(values.target === undefined ? {} : { target: values.target }),
    });
  if (command === 'computer-status') return json('/api/computer/status');
  if (command === 'computer-stop') return json('/api/computer/stop', { authorize: true });
  if (command === 'computer-takeover')
    return json('/api/computer/takeover', { active: values.enabled === true });
  if (command === 'computer-input') return json('/api/computer/input', toolArgs);
  if (command === 'computer-frame') {
    const { response, bytes: answer } = await http('/api/computer/frame');
    if (response.status === 204)
      throw new CliLiveError('no-frame', 'The Computer has not produced a frame yet; try again.');
    let desktop: Record<string, unknown>;
    try {
      desktop = record(JSON.parse(new TextDecoder().decode(answer)));
    } catch {
      throw new CliLiveError(
        'host-protocol-error',
        'The Host returned no JSON for /api/computer/frame.',
      );
    }
    if (typeof desktop['data'] !== 'string')
      throw new CliLiveError('host-protocol-error', 'The Host returned no Computer frame.');
    const bytes = Buffer.from(desktop['data'], 'base64');
    writeFileSync(values.out!, bytes, { mode: 0o600 });
    return {
      path: values.out,
      bytes: bytes.byteLength,
      mimeType: desktop['mimeType'],
      width: desktop['width'],
      height: desktop['height'],
      seq: desktop['seq'],
      target: desktop['target'],
    };
  }
  const frame = record(await json(`/api/browser/frame?slug=${encodeURIComponent(slug)}`));
  if (typeof frame['data'] !== 'string')
    throw new CliLiveError('host-protocol-error', 'The Host returned no Browser frame.');
  const bytes = Buffer.from(frame['data'], 'base64');
  writeFileSync(values.out!, bytes, { mode: 0o600 });
  return {
    path: values.out,
    bytes: bytes.byteLength,
    mimeType: frame['mimeType'],
    ...(frame['viewport'] === undefined ? {} : { viewport: frame['viewport'] }),
  };
}
