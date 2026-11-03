import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { LocalVoiceKitError, writeLocalVoiceKit, type LocalVoiceKit } from '../voice/local-kit.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const VOICE_OPTIONS = {
  'base-url': { type: 'string' },
  'key-stdin': { type: 'boolean' },
  voice: { type: 'string' },
  text: { type: 'string' },
  markdown: { type: 'boolean' },
} as const;

export interface VoiceValues {
  dir?: string;
  bot?: string;
  provider?: string;
  model?: string;
  out?: string;
  'text-stdin'?: boolean;
  'base-url'?: string;
  'key-stdin'?: boolean;
  voice?: string;
  name?: string;
  text?: string;
  markdown?: boolean;
}

export const VOICE_COMMANDS = [
  {
    command: 'voice-providers',
    description:
      'list TTS Provider presets and the configured TTS Providers (keys are never shown); --bot also shows its voice binding',
  },
  {
    command: 'voice-provider-add',
    description:
      'add a TTS Provider from a preset (custom, fish-audio, elevenlabs, openai); key only from --key-stdin',
  },
  {
    command: 'voice-provider-remove',
    description: 'remove a TTS Provider, its stored key, and the Bot voice bindings that use it',
  },
  {
    command: 'voice-provider-test',
    description:
      'health-check a TTS Provider by synthesizing a short phrase; reports ok or the error',
  },
  {
    command: 'voice-set',
    description: "bind a Bot's voice: <bot> <provider-id> [--voice <id>], or <bot> off",
  },
  {
    command: 'voice-local-kit',
    description:
      'write the local speech service script (SenseVoice + Kokoro, OpenAI-compatible) into --dir <absolute folder> and print the macOS and Windows steps; works offline',
  },
  {
    command: 'voice-synthesize',
    description:
      'synthesize test speech with a Bot binding (--bot) or a provider (--provider) into --out <absolute file>',
  },
] as const;

type Command = (typeof VOICE_COMMANDS)[number]['command'];

export function isVoiceCommand(command: string): command is Command {
  return VOICE_COMMANDS.some((entry) => entry.command === command);
}

export const VOICE_LOCAL_KIT_HELP = {
  command: 'voice-local-kit',
  usage: 'deepseekbot voice-local-kit --dir <absolute folder>',
  description:
    'Writes botharness_voice.py (SenseVoice + Kokoro, OpenAI-compatible on 127.0.0.1:8790) into the folder and prints the macOS and Windows steps. Needs no Host; works in a Bot shell.',
} as const;

export function runVoiceLocalKit(rest: string[], values: { dir?: unknown }): LocalVoiceKit {
  if (rest.length !== 0) usage('voice-local-kit takes no positional arguments; use --dir.');
  const dir = values.dir;
  if (typeof dir !== 'string' || !isAbsolute(dir))
    usage('voice-local-kit needs --dir <absolute folder>.');
  try {
    return writeLocalVoiceKit(dir);
  } catch (error) {
    if (error instanceof LocalVoiceKitError) throw new CliLiveError(error.code, error.message);
    throw error;
  }
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function positionals(command: string, rest: string[], count: number, shape: string): string[] {
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(`${command} needs ${shape}.`);
  return rest.map((value) => value.trim());
}

export async function runVoiceCommand(
  command: Command,
  rest: string[],
  values: VoiceValues,
  io: Pick<BotCreateCliIo, 'readStdin'>,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  if (command === 'voice-local-kit') return runVoiceLocalKit(rest, values);
  if (command === 'voice-providers') {
    positionals(command, rest, 0, 'no positional arguments');
    const rpc = await connect();
    return rpc('voiceProviders', values.bot?.trim() ? { slug: values.bot.trim() } : {});
  }
  if (command === 'voice-provider-add') {
    const [preset] = positionals(command, rest, 1, 'one preset id');
    const key = values['key-stdin'] === true ? ((await io.readStdin?.()) ?? '').trim() : undefined;
    if (values['key-stdin'] === true && !key) usage('--key-stdin read an empty key.');
    const rpc = await connect();
    return rpc('voiceProviderAdd', {
      preset,
      ...(values.name === undefined ? {} : { name: values.name }),
      ...(values['base-url'] === undefined ? {} : { baseUrl: values['base-url'] }),
      ...(values.model === undefined ? {} : { model: values.model }),
      ...(values.voice === undefined ? {} : { defaultVoice: values.voice }),
      ...(key === undefined ? {} : { key }),
    });
  }
  if (command === 'voice-provider-remove') {
    const [id] = positionals(command, rest, 1, 'one TTS Provider id');
    const rpc = await connect();
    return rpc('voiceProviderRemove', { id });
  }
  if (command === 'voice-provider-test') {
    const [id] = positionals(command, rest, 1, 'one TTS Provider id');
    const rpc = await connect();
    return rpc('voiceProviderTest', {
      id,
      ...(values.voice === undefined ? {} : { voiceId: values.voice }),
    });
  }
  if (command === 'voice-set') {
    if (rest.length === 2 && rest[1]!.trim() === 'off') {
      if (values.voice !== undefined) usage('--voice does not apply to `off`.');
      const rpc = await connect();
      return rpc('botVoiceSet', { slug: rest[0]!.trim(), providerId: null });
    }
    const [slug, providerId] = positionals(
      command,
      rest,
      2,
      'a bot id and a TTS Provider id (or off)',
    );
    const rpc = await connect();
    return rpc('botVoiceSet', {
      slug,
      providerId,
      ...(values.voice === undefined ? {} : { voiceId: values.voice }),
    });
  }
  positionals(command, rest, 0, 'no positional arguments; use --bot or --provider');
  const bot = values.bot?.trim();
  const provider = values.provider?.trim();
  if (!bot && !provider) usage('voice-synthesize needs --bot <slug> or --provider <id>.');
  if (values.text !== undefined && values['text-stdin'] === true)
    usage('Give the text with --text or --text-stdin, not both.');
  const text =
    values['text-stdin'] === true ? ((await io.readStdin?.()) ?? '') : (values.text ?? '');
  if (!text.trim()) usage('voice-synthesize needs --text <text> or --text-stdin.');
  const out = values.out;
  if (out === undefined || !isAbsolute(out))
    usage('voice-synthesize needs --out <absolute file> for the audio.');
  const rpc = await connect();
  const result = (await rpc('voiceSynthesize', {
    text,
    ...(bot ? { slug: bot } : {}),
    ...(provider ? { providerId: provider } : {}),
    ...(values.voice === undefined ? {} : { voiceId: values.voice }),
    ...(values.markdown === true ? { markdown: true } : {}),
  })) as { audio?: unknown } & Record<string, unknown>;
  if (typeof result?.audio !== 'string')
    throw new CliLiveError('invalid-response', 'The Host returned no audio.');
  try {
    writeFileSync(out, Buffer.from(result.audio, 'base64'));
  } catch {
    throw new CliLiveError('invalid-input', `Cannot write ${out}.`);
  }
  const { audio: _audio, ...summary } = result;
  return { ...summary, out };
}
