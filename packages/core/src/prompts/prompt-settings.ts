import type { PersonaBotRegistry } from '../bots/registry.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import {
  DEFAULT_PROMPT_TEXT,
  isPromptPartId,
  promptTextOf,
  type PromptPartTexts,
  type PromptText,
} from './prompt-parts.js';
import {
  promptPartTexts,
  resolvePromptParts,
  type PromptPresetLibrary,
  type ResolvedPromptPart,
} from './prompt-presets.js';

export interface PromptSettings {
  library: PromptPresetLibrary;
  resolved(botSlug: string): ResolvedPromptPart[];
  textForSession(sessionId: string): PromptText;
  snapshotTexts(sessionId: string): PromptPartTexts | undefined;
  refreshAfterCompaction(sessionId: string): { refreshed: boolean };
  pending(botSlug: string, sessionId: string | undefined): boolean;
}

function parseTexts(body: string | undefined): PromptPartTexts | undefined {
  if (body === undefined) return undefined;
  try {
    const value = JSON.parse(body) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const texts: PromptPartTexts = {};
    for (const [id, text] of Object.entries(value))
      if (isPromptPartId(id) && typeof text === 'string') texts[id] = text;
    return texts;
  } catch {
    return {};
  }
}

const serialize = (texts: PromptPartTexts) =>
  JSON.stringify(Object.fromEntries(Object.entries(texts).sort(([a], [b]) => a.localeCompare(b))));

export function createPromptSettings(options: {
  library: PromptPresetLibrary;
  registry: Pick<PersonaBotRegistry, 'get'>;
  ownership: Pick<SessionOwnership, 'resolve' | 'promptSnapshot' | 'writePromptSnapshot'>;
}): PromptSettings {
  const { library, registry, ownership } = options;
  const resolved = (botSlug: string): ResolvedPromptPart[] => {
    const bot = registry.get(botSlug);
    const globalId = library.globalPresetId();
    return resolvePromptParts({
      global: globalId === undefined ? undefined : library.get(globalId),
      preset: bot?.promptPreset === undefined ? undefined : library.get(bot.promptPreset),
      bot: bot?.promptOverrides,
    });
  };
  const currentTexts = (botSlug: string) => promptPartTexts(resolved(botSlug));
  const snapshotTexts = (sessionId: string) => parseTexts(ownership.promptSnapshot(sessionId));
  return {
    library,
    resolved,
    snapshotTexts,
    textForSession(sessionId) {
      const recorded = snapshotTexts(sessionId);
      if (recorded !== undefined) return promptTextOf(recorded);
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return DEFAULT_PROMPT_TEXT;
      const texts = currentTexts(owner.botSlug);
      try {
        return promptTextOf(
          parseTexts(ownership.writePromptSnapshot(sessionId, serialize(texts), false)),
        );
      } catch {
        return promptTextOf(texts);
      }
    },
    refreshAfterCompaction(sessionId) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return { refreshed: false };
      const next = serialize(currentTexts(owner.botSlug));
      if (ownership.promptSnapshot(sessionId) === next) return { refreshed: false };
      ownership.writePromptSnapshot(sessionId, next, true);
      return { refreshed: true };
    },
    pending(botSlug, sessionId) {
      if (sessionId === undefined) return false;
      const recorded = ownership.promptSnapshot(sessionId);
      return recorded !== undefined && recorded !== serialize(currentTexts(botSlug));
    },
  };
}
