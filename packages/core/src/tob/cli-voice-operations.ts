import { isDeepStrictEqual } from 'node:util';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { BridgeResult } from '../bridge/methods.js';
import { createVoiceBridgeMethods } from '../voice/bridge.js';
import { ttsPreset } from '../voice/presets.js';
import type { VoiceProviders } from '../voice/providers.js';
import type { PreparedTobOperation } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_VOICE_CAPABILITIES = [
  ['voice-providers', 'List TTS Provider presets, configured providers and a Bot voice', false],
  ['voice-provider-add', 'Add a keyless TTS Provider such as the local speech service', true],
  ['voice-provider-test', 'Health-check a TTS Provider with a short phrase', false],
  ['voice-provider-remove', 'Remove a TTS Provider and the Bot voices that use it', true],
  ['voice-set', 'Bind or clear a Bot voice', true],
].map(([command, description, write]) => ({
  command: String(command),
  description: String(description),
  write: Boolean(write),
}));

export const TOB_VOICE_ERROR_CODES = [
  'voice-unavailable',
  'unknown-provider',
  'provider-limit',
  'key-required',
  'credential-unavailable',
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function text(value: unknown, max = 500): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TobError('invalid-input');
  return value.trim();
}
function optional(value: unknown, max?: number): string | undefined {
  return value === undefined ? undefined : text(value, max);
}
function unwrap<T>(result: BridgeResult<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  if (code === 'not-found') throw new TobError('unknown-bot');
  if (code === 'invalid-input' || TOB_VOICE_ERROR_CODES.some((entry) => entry === code))
    throw new TobError(code);
  throw new TobError('operation-failed');
}

export function createTobVoiceOperations(deps: {
  providers: () => VoiceProviders | undefined;
  registry: PersonaBotRegistry;
}) {
  const bridge = () =>
    createVoiceBridgeMethods({ providers: deps.providers(), registry: deps.registry });
  const providers = () => {
    const owner = deps.providers();
    if (owner === undefined) throw new TobError('voice-unavailable');
    return owner;
  };
  const voiceOf = (slug: string) => {
    const bot = deps.registry.get(slug);
    if (bot === undefined) throw new TobError('unknown-bot');
    return bot.voice ?? null;
  };
  const same = (actual: unknown, expected: unknown) => {
    if (!isDeepStrictEqual(actual, expected)) throw new TobError('stale-setting');
  };
  const proposal = (command: string, target: string, previousValue: unknown, patch: unknown) =>
    Object.freeze(structuredClone({ command, target, previousValue, patch }));

  return async (command: string, raw: unknown): Promise<PreparedTobOperation | undefined> => {
    if (!TOB_VOICE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const args = structuredClone(object(raw));
    if (command === 'voice-providers') {
      keys(args, ['slug']);
      const slug = optional(args['slug'], 200);
      return {
        run: (guard) => {
          guard();
          return unwrap(bridge().voiceProviders(slug === undefined ? {} : { slug }));
        },
      };
    }
    if (command === 'voice-provider-test') {
      keys(args, ['id', 'voiceId']);
      const id = text(args['id'], 64);
      const voiceId = optional(args['voiceId'], 200);
      return {
        run: async (guard) => {
          guard();
          return unwrap(
            await bridge().voiceProviderTest({ id, ...(voiceId === undefined ? {} : { voiceId }) }),
          );
        },
      };
    }
    if (command === 'voice-provider-add') {
      keys(args, ['preset', 'name', 'baseUrl', 'model', 'defaultVoice']);
      const preset = text(args['preset'], 64);
      const found = ttsPreset(preset);
      if (found === undefined) throw new TobError('invalid-input');
      if (found.keyRequired) throw new TobError('key-required');
      const patch = {
        preset,
        ...Object.fromEntries(
          (['name', 'baseUrl', 'model', 'defaultVoice'] as const).flatMap((field) => {
            const value = optional(args[field], field === 'baseUrl' ? 500 : 200);
            return value === undefined ? [] : [[field, value]];
          }),
        ),
      };
      if (patch.preset === 'custom' && !('baseUrl' in patch)) throw new TobError('invalid-input');
      const before = providers()
        .list()
        .map((entry) => entry.id);
      return {
        proposal: proposal(command, 'voice-providers', null, patch),
        run: async (guard, beforeEffect) => {
          guard();
          same(
            providers()
              .list()
              .map((entry) => entry.id),
            before,
          );
          beforeEffect?.();
          return unwrap(await bridge().voiceProviderAdd(patch));
        },
      };
    }
    if (command === 'voice-provider-remove') {
      keys(args, ['id']);
      const id = text(args['id'], 64);
      if (!providers().has(id)) throw new TobError('unknown-provider');
      const current = providers().get(id);
      return {
        proposal: proposal(command, id, current, { remove: true }),
        run: async (guard, beforeEffect) => {
          guard();
          beforeEffect?.();
          return unwrap(await bridge().voiceProviderRemove({ id }));
        },
      };
    }
    keys(args, ['slug', 'providerId', 'voiceId']);
    const slug = text(args['slug'], 200);
    const providerId = args['providerId'] === null ? null : text(args['providerId'], 64);
    const voiceId = optional(args['voiceId'], 200);
    if (providerId === null && voiceId !== undefined) throw new TobError('invalid-input');
    if (providerId !== null && !providers().has(providerId)) throw new TobError('unknown-provider');
    const previous = voiceOf(slug);
    const patch =
      providerId === null ? null : { providerId, ...(voiceId === undefined ? {} : { voiceId }) };
    return {
      proposal: proposal(command, slug, previous, patch),
      run: (guard, beforeEffect) => {
        guard();
        same(voiceOf(slug), previous);
        beforeEffect?.();
        return unwrap(
          bridge().botVoiceSet({
            slug,
            providerId,
            ...(voiceId === undefined ? {} : { voiceId }),
          }),
        );
      },
    };
  };
}
