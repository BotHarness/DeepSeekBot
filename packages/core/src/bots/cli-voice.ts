import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const VOICE_OPTIONS = {
  'base-url': { type: 'string' },
  'key-stdin': { type: 'boolean' },
  voice: { type: 'string' },
  text: { type: 'string' },
  markdown: { type: 'boolean' },
  language: { type: 'string' },
} as const;

export interface VoiceValues {
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
  kind?: string;
  language?: string;
  file?: string;
}

export const VOICE_COMMANDS = [
  {
    command: 'voice-providers',
    description:
      'list TTS and ASR Provider presets and the configured Providers (keys are never shown); --bot also shows its voice and speech recognition bindings',
  },
  {
    command: 'voice-provider-add',
    description:
      'add a TTS Provider from a preset (custom, fish-audio, elevenlabs, openai), or with --kind asr a speech recognition Provider (custom, openai, groq, or soniox which streams while the caller speaks; --language); key only from --key-stdin',
  },
  {
    command: 'voice-provider-remove',
    description:
      'remove a TTS or ASR Provider, its stored key, and the Bot voice or ASR bindings that use it',
  },
  {
    command: 'voice-provider-test',
    description:
      'health-check a TTS Provider (synthesizes a short phrase) or an ASR Provider (transcribes silence); reports ok or the error',
  },
  {
    command: 'voice-set',
    description: "bind a Bot's voice: <bot> <provider-id> [--voice <id>], or <bot> off",
  },
  {
    command: 'voice-asr-set',
    description:
      "bind a Bot's speech recognition for calls: <bot> <asr-provider-id> [--language <code>], or <bot> off",
  },
  {
    command: 'voice-transcribe',
    description:
      'transcribe a test recording --file <absolute audio file> with a Bot binding (--bot) or an ASR Provider (--provider); the audio is not stored',
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
    if (values.kind !== undefined && values.kind !== 'tts' && values.kind !== 'asr')
      usage('--kind must be tts or asr.');
    if (values.kind === 'asr' && values.voice !== undefined)
      usage('--voice does not apply to an ASR Provider.');
    return rpc('voiceProviderAdd', {
      ...(values.kind === 'asr' ? { kind: 'asr' } : {}),
      ...(values.language === undefined ? {} : { language: values.language }),
      preset,
      ...(values.name === undefined ? {} : { name: values.name }),
      ...(values['base-url'] === undefined ? {} : { baseUrl: values['base-url'] }),
      ...(values.model === undefined ? {} : { model: values.model }),
      ...(values.voice === undefined ? {} : { defaultVoice: values.voice }),
      ...(key === undefined ? {} : { key }),
    });
  }
  if (command === 'voice-provider-remove') {
    const [id] = positionals(command, rest, 1, 'one TTS or ASR Provider id');
    const rpc = await connect();
    return rpc('voiceProviderRemove', { id });
  }
  if (command === 'voice-provider-test') {
    const [id] = positionals(command, rest, 1, 'one TTS or ASR Provider id');
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
  if (command === 'voice-asr-set') {
    if (rest.length === 2 && rest[1]!.trim() === 'off') {
      if (values.language !== undefined) usage('--language does not apply to `off`.');
      const rpc = await connect();
      return rpc('botAsrSet', { slug: rest[0]!.trim(), providerId: null });
    }
    const [slug, providerId] = positionals(
      command,
      rest,
      2,
      'a bot id and an ASR Provider id (or off)',
    );
    const rpc = await connect();
    return rpc('botAsrSet', {
      slug,
      providerId,
      ...(values.language === undefined ? {} : { language: values.language }),
    });
  }
  if (command === 'voice-transcribe') {
    positionals(command, rest, 0, 'no positional arguments; use --bot or --provider');
    const bot = values.bot?.trim();
    const provider = values.provider?.trim();
    if (!bot && !provider) usage('voice-transcribe needs --bot <slug> or --provider <id>.');
    if (values.file === undefined || !isAbsolute(values.file))
      usage('voice-transcribe needs --file <absolute audio file>.');
    let audio: Buffer;
    try {
      audio = readFileSync(values.file);
    } catch {
      throw new CliLiveError('invalid-input', `Cannot read ${values.file}.`);
    }
    const rpc = await connect();
    return rpc('voiceTranscribe', {
      audio: audio.toString('base64'),
      ...(bot ? { slug: bot } : {}),
      ...(provider ? { providerId: provider } : {}),
      ...(values.language === undefined ? {} : { language: values.language }),
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
