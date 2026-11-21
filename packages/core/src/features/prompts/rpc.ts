import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { PromptPreset } from '../../prompts/prompt-presets.js';
import type {
  BotPromptView,
  PromptBridgeMethods,
  PromptLimitView,
  PromptPartView,
} from './methods.js';
import type { PromptsAdapterMethods } from './methods.js';

export function botSystemPrompt(
  methods: PromptBridgeMethods,
  slug: string,
): Promise<import('../../runtime/prompt-inspection.js').BotSystemPromptView> {
  return unwrapAsync(methods.botSystemPrompt({ slug }));
}

export function promptParts(methods: PromptBridgeMethods): {
  parts: PromptPartView[];
  limits: PromptLimitView[];
} {
  return unwrap(methods.promptParts({}));
}

export function promptPresets(methods: PromptBridgeMethods): {
  presets: PromptPreset[];
  globalPresetId: string | null;
} {
  return unwrap(methods.promptPresets({}));
}

export function promptPresetCreate(
  methods: PromptBridgeMethods,
  name: string,
  parts?: Record<string, unknown>,
  limits?: Record<string, unknown>,
): { preset: PromptPreset } {
  return unwrap(
    methods.promptPresetCreate({
      name,
      ...(parts === undefined ? {} : { parts }),
      ...(limits === undefined ? {} : { limits }),
    }),
  );
}

export function promptPresetUpdate(
  methods: PromptBridgeMethods,
  id: string,
  name?: string,
  parts?: Record<string, unknown>,
  expectedRevision?: number,
  limits?: Record<string, unknown>,
): { preset: PromptPreset } {
  return unwrap(
    methods.promptPresetUpdate({
      id,
      ...(name === undefined ? {} : { name }),
      ...(parts === undefined ? {} : { parts }),
      ...(limits === undefined ? {} : { limits }),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
  );
}

export function promptPresetDelete(
  methods: PromptBridgeMethods,
  id: string,
): { id: string; clearedBots: string[] } {
  return unwrap(methods.promptPresetDelete({ id }));
}

export function promptGlobalSet(
  methods: PromptBridgeMethods,
  presetId: string | null,
): { presetId: string | null } {
  return unwrap(methods.promptGlobalSet({ presetId }));
}

export function botPrompt(methods: PromptBridgeMethods, slug: string): BotPromptView {
  return unwrap(methods.botPrompt({ slug }));
}

export function botPromptSet(
  methods: PromptBridgeMethods,
  slug: string,
  presetId?: string | null,
  parts?: Record<string, unknown>,
  limits?: Record<string, unknown>,
): BotPromptView {
  return unwrap(
    methods.botPromptSet({
      slug,
      ...(presetId === undefined ? {} : { presetId }),
      ...(parts === undefined ? {} : { parts }),
      ...(limits === undefined ? {} : { limits }),
    }),
  );
}

export function botTurnInput(
  methods: PromptsAdapterMethods,
  slug: string,
  sessionId?: string,
  turns?: number,
): Promise<{
  slug: string;
  sessionId: string;
  turns: import('../../runtime/prompt-inspection.js').TurnInputView[];
}> {
  return unwrapAsync(
    methods.botTurnInput({
      slug,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(turns === undefined ? {} : { turns }),
    }),
  );
}
