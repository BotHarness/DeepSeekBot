import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_AGENT_VOICE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'voice-providers': 'deepseekbot voice-providers [--bot <bot-slug>]',
  'voice-provider-add':
    'deepseekbot voice-provider-add <local|custom> [--kind asr] [--name <name>] [--base-url <url>] [--model <model>] [--voice <voice-id> | --language <code>]; keyed presets are added by the Human in Settings',
  'voice-provider-test': 'deepseekbot voice-provider-test <provider-id> [--voice <voice-id>]',
  'voice-provider-remove': 'deepseekbot voice-provider-remove <provider-id>',
  'voice-set': 'deepseekbot voice-set <bot-slug> (<provider-id> [--voice <voice-id>] | off)',
  'voice-asr-set':
    'deepseekbot voice-asr-set <bot-slug> (<asr-provider-id> [--language <code>] | off)',
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'voice-providers': ['bot'],
  'voice-provider-add': ['kind', 'name', 'base-url', 'model', 'voice', 'language'],
  'voice-provider-test': ['voice'],
  'voice-provider-remove': [],
  'voice-set': ['voice'],
  'voice-asr-set': ['language'],
};

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function textValue(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 500 ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    usage(`${field} needs a nonempty value of at most 500 characters.`);
  return value.trim();
}

export function parseAgentVoice(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      values['key-stdin'] !== undefined
        ? 'Keys never pass through a Bot; the Human adds keyed Providers in Settings › Voice.'
        : 'This option is not available for the scoped CLI operation.',
    );
  const positional = (count: number, shape: string) => {
    if (rest.length !== count) usage(`${command} needs ${shape}.`);
    return rest.map((value, index) => textValue(value, `argument ${index + 1}`));
  };
  const voice =
    values['voice'] === undefined ? {} : { voiceId: textValue(values['voice'], '--voice') };
  switch (command) {
    case 'voice-providers':
      positional(0, 'no positional arguments');
      return {
        command,
        args: values['bot'] === undefined ? {} : { slug: textValue(values['bot'], '--bot') },
        write: false,
      };
    case 'voice-provider-add': {
      const [preset] = positional(1, 'one preset id');
      const args: Record<string, unknown> = { preset };
      for (const [flag, field] of [
        ['name', 'name'],
        ['base-url', 'baseUrl'],
        ['model', 'model'],
        ['voice', 'defaultVoice'],
        ['kind', 'kind'],
        ['language', 'language'],
      ] as const)
        if (values[flag] !== undefined) args[field] = textValue(values[flag], `--${flag}`);
      return { command, args, write: true };
    }
    case 'voice-provider-test': {
      const [id] = positional(1, 'one voice Provider id');
      return { command, args: { id, ...voice }, write: false };
    }
    case 'voice-provider-remove': {
      const [id] = positional(1, 'one voice Provider id');
      return { command, args: { id }, write: true };
    }
    case 'voice-asr-set': {
      const [slug, providerId] = positional(2, 'a bot id and an ASR Provider id (or off)');
      if (providerId === 'off') {
        if (values['language'] !== undefined) usage('--language does not apply to `off`.');
        return { command, args: { slug, providerId: null }, write: true };
      }
      return {
        command,
        args: {
          slug,
          providerId,
          ...(values['language'] === undefined
            ? {}
            : { language: textValue(values['language'], '--language') }),
        },
        write: true,
      };
    }
    default: {
      const [slug, providerId] = positional(2, 'a bot id and a TTS Provider id (or off)');
      if (providerId === 'off') {
        if (values['voice'] !== undefined) usage('--voice does not apply to `off`.');
        return { command, args: { slug, providerId: null }, write: true };
      }
      return { command, args: { slug, providerId, ...voice }, write: true };
    }
  }
}
