import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { VOICE_DICTATION_LIMITS } from '../voice/dictation.js';
import { readWavAs16kMono } from '../voice/wav.js';
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
  language: { type: 'string' },
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
      'add a TTS Provider from a preset (local, custom, fish-audio, elevenlabs, openai), or with --kind asr a speech recognition Provider (custom, local, openai, groq, or soniox which streams while the caller speaks; --language); key only from --key-stdin',
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
    command: 'voice-defaults',
    description:
      'show the Host-wide default TTS and speech recognition Providers that every Bot without its own binding uses',
  },
  {
    command: 'voice-default-set',
    description:
      'set the Host-wide default: tts <provider-id> [--voice <id>], asr <provider-id> [--language <code>], or <tts|asr> off',
  },
  {
    command: 'voice-vad-set',
    description:
      'set the Host-wide speech detection threshold in dBFS (-70 to -20; lower hears quieter microphones), or default; put -- before a negative value (voice-vad-set -- -55); affects pause-cut dictation and calls, not Soniox dictation',
  },
  {
    command: 'voice-transcribe',
    description:
      'transcribe a test recording --file <absolute audio file> with a Bot binding (--bot) or an ASR Provider (--provider); the audio is not stored',
  },
  {
    command: 'voice-dictate',
    description:
      'run composer dictation on a WAV recording --file <absolute .wav>: streams it in 200 ms chunks through the same Host session the composer mic uses (Bot binding with --bot, a Provider with --provider, or the Host default) and prints the live and final text; the audio is not stored',
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
  if (command === 'voice-defaults') {
    positionals(command, rest, 0, 'no positional arguments');
    const rpc = await connect();
    const view = (await rpc('voiceProviders', {})) as {
      defaults?: unknown;
      speechThreshold?: unknown;
    };
    return {
      defaults: view.defaults ?? { tts: null, asr: null },
      ...(view.speechThreshold === undefined ? {} : { speechThreshold: view.speechThreshold }),
    };
  }
  if (command === 'voice-vad-set') {
    const [value] = positionals(
      command,
      rest,
      1,
      'a threshold in dBFS after -- such as -- -55, or default',
    );
    if (value !== 'default' && !/^-?\d+(?:\.\d+)?$/u.test(value!))
      usage(
        'The threshold is a number in dBFS, written after -- such as `voice-vad-set -- -55`, or default.',
      );
    const rpc = await connect();
    return rpc('voiceSpeechThresholdSet', { dbfs: value === 'default' ? null : Number(value) });
  }
  if (command === 'voice-default-set') {
    const [kind, target] = positionals(command, rest, 2, 'tts or asr, and a Provider id (or off)');
    if (kind !== 'tts' && kind !== 'asr') usage('The first argument is tts or asr.');
    if (kind === 'tts' && values.language !== undefined)
      usage('--language applies to the asr default.');
    if (kind === 'asr' && values.voice !== undefined) usage('--voice applies to the tts default.');
    const off = target === 'off';
    if (off && (values.voice !== undefined || values.language !== undefined))
      usage('--voice and --language do not apply to `off`.');
    const rpc = await connect();
    return rpc('voiceDefaultSet', {
      kind,
      providerId: off ? null : target,
      ...(values.voice === undefined ? {} : { voiceId: values.voice }),
      ...(values.language === undefined ? {} : { language: values.language }),
    });
  }
  if (command === 'voice-dictate') return runVoiceDictate(rest, values, connect);
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

const DICTATE_CHUNK_SAMPLES = 3_200;
const DICTATE_SAMPLE_RATE = 16_000;

async function runVoiceDictate(
  rest: string[],
  values: VoiceValues,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  positionals('voice-dictate', rest, 0, 'no positional arguments; use --file');
  if (values.file === undefined || !isAbsolute(values.file))
    usage('voice-dictate needs --file <absolute .wav file>.');
  let pcm: Int16Array;
  try {
    pcm = readWavAs16kMono(readFileSync(values.file));
  } catch (error) {
    throw new CliLiveError(
      'invalid-input',
      error instanceof Error && !('code' in error) ? error.message : `Cannot read ${values.file}.`,
    );
  }
  if (pcm.length > (VOICE_DICTATION_LIMITS.maxMs / 1000) * DICTATE_SAMPLE_RATE)
    throw new CliLiveError(
      'invalid-input',
      `voice-dictate takes at most ${VOICE_DICTATION_LIMITS.maxMs / 1000} s of audio.`,
    );
  const target = {
    ...(values.bot?.trim() ? { slug: values.bot.trim() } : {}),
    ...(values.provider?.trim() ? { providerId: values.provider.trim() } : {}),
    ...(values.language === undefined ? {} : { language: values.language }),
  };
  const rpc = await connect();
  const opened = (await rpc('voiceDictation', { kind: 'open', ...target })) as {
    dictation?: { id?: unknown };
  };
  const id = opened?.dictation?.id;
  if (typeof id !== 'string') throw new CliLiveError('invalid-response', 'No dictation id.');
  const heard: string[] = [];
  try {
    for (let offset = 0; offset < pcm.length; offset += DICTATE_CHUNK_SAMPLES) {
      const chunk = pcm.subarray(offset, offset + DICTATE_CHUNK_SAMPLES);
      const pushed = (await rpc('voiceDictation', {
        kind: 'push',
        id,
        pcm: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('base64'),
      })) as { dictation?: { text?: unknown; state?: unknown } };
      const text = pushed?.dictation?.text;
      if (typeof text === 'string' && text !== '' && heard.at(-1) !== text) heard.push(text);
      if (pushed?.dictation?.state !== 'listening') break;
    }
  } catch (error) {
    await rpc('voiceDictation', { kind: 'cancel', id }).catch(() => undefined);
    throw error;
  }
  const stopped = (await rpc('voiceDictation', { kind: 'stop', id })) as {
    dictation?: Record<string, unknown> & {
      state?: unknown;
      text?: unknown;
      error?: { code?: unknown; message?: unknown };
    };
  };
  const final = stopped?.dictation;
  if (final?.state === 'failed')
    throw new CliLiveError(
      typeof final.error?.code === 'string' ? final.error.code : 'asr-failed',
      typeof final.error?.message === 'string' ? final.error.message : 'Dictation failed.',
    );
  if (final?.state === 'cancelled')
    throw new CliLiveError(
      'dictation-cancelled',
      'The Host ended the dictation before it finished, so the transcript is incomplete.',
    );
  if (typeof final?.text === 'string' && final.text !== '' && heard.at(-1) !== final.text)
    heard.push(final.text);
  return { ...final, heard };
}
