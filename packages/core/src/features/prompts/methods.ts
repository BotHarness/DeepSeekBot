import {
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { BotRuntime } from '../../runtime/bot-runtime.js';
import type { BotSystemPromptView } from '../../runtime/prompt-inspection.js';
import { PROMPT_PARTS, promptTextHash, type PromptPartId } from '../../prompts/prompt-parts.js';
import {
  PROMPT_LIMITS,
  applyPromptLimitEdits,
  parsePromptLimitEdits,
} from '../../prompts/prompt-limits.js';
import {
  applyPromptPartEdits,
  parsePromptPartEdits,
  type PromptPreset,
  type PromptPresetFailure,
  type ResolvedPromptLimit,
  type ResolvedPromptPart,
} from '../../prompts/prompt-presets.js';
import type { PromptSettings } from '../../prompts/prompt-settings.js';
import { summarizeTurnInput, type TurnInputView } from '../../runtime/prompt-inspection.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface PromptPartView {
  id: PromptPartId;
  kind: 'system' | 'turn';
  section: string;
  defaultText: string;
  defaultHash: string;
}

export interface BotPromptView {
  slug: string;
  presetId: string | null;
  globalPresetId: string | null;
  sessionId: string | null;
  pending: boolean;
  parts: ResolvedPromptPart[];
  limits: ResolvedPromptLimit[];
}

export interface PromptLimitView {
  id: (typeof PROMPT_LIMITS)[number]['id'];
  group: 'inbox' | 'review';
  defaultValue: number;
  min: number;
  max: number;
}

function promptPresetFailure(reason: PromptPresetFailure): BridgeResult<never> {
  const message: Record<PromptPresetFailure, string> = {
    'invalid-input': 'The Prompt Preset name or part text is invalid',
    'not-found': 'Unknown Prompt Preset',
    'stale-revision': 'The Prompt Preset changed; read it again before editing',
    'duplicate-name': 'Another Prompt Preset already has this name',
    unavailable: 'Prompt Presets are unavailable',
  };
  return {
    ok: false,
    error: { code: `prompt-preset-${reason}`, message: message[reason] },
  };
}

interface PromptBotContext {
  registry: Pick<PersonaBotRegistry, 'get'>;
  runtime?: Pick<BotRuntime, 'currentOrchestratorSessionId'>;
}

function botPromptView(
  deps: PromptBotContext,
  prompts: PromptSettings,
  slug: string,
): BotPromptView {
  const sessionId = deps.runtime?.currentOrchestratorSessionId?.(slug) ?? null;
  return {
    slug,
    presetId: deps.registry.get(slug)?.promptPreset ?? null,
    globalPresetId: prompts.library.globalPresetId() ?? null,
    sessionId,
    pending: prompts.pending(slug, sessionId ?? undefined),
    parts: prompts.resolved(slug),
    limits: prompts.resolvedLimits(slug),
  };
}

export interface PromptBridgeDeps {
  botSystemPrompt?(slug: string): Promise<BotSystemPromptView>;
  prompts?: PromptSettings;
}

export interface PromptBridgeMethods {
  botSystemPrompt(payload: unknown): Promise<BridgeResult<BotSystemPromptView>>;
  promptParts(
    payload: unknown,
  ): BridgeResult<{ parts: PromptPartView[]; limits: PromptLimitView[] }>;
  promptPresets(
    payload: unknown,
  ): BridgeResult<{ presets: PromptPreset[]; globalPresetId: string | null }>;
  promptPresetCreate(payload: unknown): BridgeResult<{ preset: PromptPreset }>;
  promptPresetUpdate(payload: unknown): BridgeResult<{ preset: PromptPreset }>;
  promptPresetDelete(payload: unknown): BridgeResult<{ id: string; clearedBots: string[] }>;
  promptGlobalSet(payload: unknown): BridgeResult<{ presetId: string | null }>;
  botPrompt(payload: unknown): BridgeResult<BotPromptView>;
  botPromptSet(payload: unknown): BridgeResult<BotPromptView>;
}

export function createPromptBridgeMethods(
  deps: PromptBridgeDeps &
    PromptBotContext & {
      registry: Pick<PersonaBotRegistry, 'setPromptSettings'>;
    },
  globalRegistry: Pick<PersonaBotRegistry, 'list' | 'setPromptSettings'>,
): PromptBridgeMethods {
  return {
    async botSystemPrompt(payload) {
      const slug = asSlug(payload);
      if (!slug) return invalidInput('slug is required');
      if (!deps.registry.get(slug)) return unknownBot(slug);
      if (!deps.botSystemPrompt) return unavailable();
      try {
        return { ok: true, value: await deps.botSystemPrompt(slug) };
      } catch {
        return unavailable();
      }
    },
    promptParts() {
      return {
        ok: true,
        value: {
          parts: PROMPT_PARTS.map((part) => ({
            id: part.id,
            kind: part.kind,
            section: part.section,
            defaultText: part.defaultText,
            defaultHash: promptTextHash(part.defaultText),
          })),
          limits: PROMPT_LIMITS.map(({ id, group, defaultValue, min, max }) => ({
            id,
            group,
            defaultValue,
            min,
            max,
          })),
        },
      };
    },
    promptPresets() {
      if (deps.prompts === undefined) return unavailable();
      const library = deps.prompts.library;
      return {
        ok: true,
        value: {
          presets: library.list(),
          globalPresetId: library.globalPresetId() ?? null,
        },
      };
    },
    promptPresetCreate(payload) {
      if (deps.prompts === undefined) return unavailable();
      const source = asObject(payload);
      const parts = source['parts'] === undefined ? {} : parsePromptPartEdits(source['parts']);
      const limits = source['limits'] === undefined ? {} : parsePromptLimitEdits(source['limits']);
      if (typeof source['name'] !== 'string' || parts === undefined || limits === undefined)
        return invalidInput(
          'name, optional parts ({partId: text}) and limits ({limitId: integer in range}) are required',
        );
      const result = deps.prompts.library.create({
        name: source['name'],
        parts,
        limits,
      });
      return result.ok
        ? { ok: true, value: { preset: result.value } }
        : promptPresetFailure(result.reason);
    },
    promptPresetUpdate(payload) {
      if (deps.prompts === undefined) return unavailable();
      const source = asObject(payload);
      const parts =
        source['parts'] === undefined ? undefined : parsePromptPartEdits(source['parts']);
      const limits =
        source['limits'] === undefined ? undefined : parsePromptLimitEdits(source['limits']);
      const expected = source['expectedRevision'];
      if (
        typeof source['id'] !== 'string' ||
        (source['name'] !== undefined && typeof source['name'] !== 'string') ||
        (source['parts'] !== undefined && parts === undefined) ||
        (source['limits'] !== undefined && limits === undefined) ||
        (expected !== undefined && !Number.isSafeInteger(expected))
      )
        return invalidInput(
          'id, and optional name, parts, limits and expectedRevision are required',
        );
      const result = deps.prompts.library.update(source['id'], {
        ...(typeof source['name'] === 'string' ? { name: source['name'] } : {}),
        ...(parts === undefined ? {} : { parts }),
        ...(limits === undefined ? {} : { limits }),
        ...(expected === undefined ? {} : { expectedRevision: expected as number }),
      });
      return result.ok
        ? { ok: true, value: { preset: result.value } }
        : promptPresetFailure(result.reason);
    },
    promptPresetDelete(payload) {
      if (deps.prompts === undefined) return unavailable();
      const id = asObject(payload)['id'];
      if (typeof id !== 'string') return invalidInput('id is required');
      const result = deps.prompts.library.delete(id);
      if (!result.ok) return promptPresetFailure(result.reason);
      const clearedBots = globalRegistry
        .list()
        .filter((record) => record.promptPreset === id)
        .map((record) => record.slug);
      for (const slug of clearedBots) globalRegistry.setPromptSettings(slug, { preset: null });
      return {
        ok: true,
        value: {
          id,
          clearedBots: clearedBots.filter((slug) => deps.registry.get(slug) !== undefined),
        },
      };
    },
    promptGlobalSet(payload) {
      if (deps.prompts === undefined) return unavailable();
      const presetId = asObject(payload)['presetId'];
      if (presetId !== null && typeof presetId !== 'string')
        return invalidInput('presetId (a Prompt Preset id, or null for built-in) is required');
      const result = deps.prompts.library.setGlobalPresetId(presetId ?? undefined);
      return result.ok ? { ok: true, value: result.value } : promptPresetFailure(result.reason);
    },
    botPrompt(payload) {
      if (deps.prompts === undefined) return unavailable();
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return { ok: true, value: botPromptView(deps, deps.prompts, slug) };
    },
    botPromptSet(payload) {
      const prompts = deps.prompts;
      if (prompts === undefined) return unavailable();
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      const source = asObject(payload);
      const presetId = source['presetId'];
      const parts =
        source['parts'] === undefined ? undefined : parsePromptPartEdits(source['parts']);
      const limits =
        source['limits'] === undefined ? undefined : parsePromptLimitEdits(source['limits']);
      if (
        (presetId !== undefined && presetId !== null && typeof presetId !== 'string') ||
        (source['parts'] !== undefined && parts === undefined) ||
        (source['limits'] !== undefined && limits === undefined)
      )
        return invalidInput(
          'optional presetId (id or null), parts ({partId: text|null}) and limits ({limitId: integer|null}) are required',
        );
      if (typeof presetId === 'string' && prompts.library.get(presetId) === undefined)
        return promptPresetFailure('not-found');
      const result = deps.registry.setPromptSettings(slug, {
        ...(presetId === undefined ? {} : { preset: presetId }),
        ...(parts === undefined
          ? {}
          : {
              overrides: applyPromptPartEdits(record.promptOverrides ?? {}, parts),
            }),
        ...(limits === undefined
          ? {}
          : {
              limits: applyPromptLimitEdits(record.promptLimits ?? {}, limits),
            }),
      });
      if (!result.ok) return unknownBot(slug);
      return { ok: true, value: botPromptView(deps, prompts, slug) };
    },
  };
}

export interface PromptsAdapterMethods {
  botTurnInput(
    payload: unknown,
  ): Promise<BridgeResult<{ slug: string; sessionId: string; turns: TurnInputView[] }>>;
}

export function createPromptsAdapterMethods(deps: BridgeMethodsDeps): PromptsAdapterMethods {
  return {
    async botTurnInput(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const source = asObject(payload) ?? {};
      const turns = source['turns'] === undefined ? 1 : source['turns'];
      if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 1 || turns > 20)
        return invalidInput('turns must be an integer from 1 to 20');
      const roots = deps.ownership.rootsFor(slug);
      const requested = source['sessionId'];
      if (requested !== undefined && typeof requested !== 'string')
        return invalidInput('sessionId must be a string');
      const sessionId =
        requested ??
        deps.runtime?.currentOrchestratorSessionId?.(slug) ??
        [...roots].reverse().find((root) => root.rootRole === 'orchestrator')?.sessionId;
      if (sessionId === undefined || !roots.some((root) => root.sessionId === sessionId))
        return invalidInput('The Session does not belong to this PersonaBot');
      if (deps.readUsageSessionLog === undefined) return unavailable();
      const log = await deps.readUsageSessionLog(sessionId);
      if (log === undefined) return unavailable();
      return {
        ok: true,
        value: {
          slug,
          sessionId,
          ...summarizeTurnInput(log.events, { turns }),
        },
      };
    },
  };
}
