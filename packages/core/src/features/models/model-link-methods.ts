import { asObject, asSlug, invalidInput, unknownBot } from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { linkedPresetId, ownsModelSlot } from '../../models/bot-model-engines.js';
import {
  assignmentModelsOf,
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetPlan,
} from '../../models/presets.js';
import { modelFailure } from '../../models/provider-bridge.js';
import type { ModelsBridgeDeps } from './deps.js';
import type { ModelsBridgeMethods } from './methods.js';
import type { createModelRoutingHelpers } from './routing.js';

export function createModelLinkMethods(
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'registry'>,
  requireOwnedBot: (slug: string) => void,
  {
    requireRoutes,
    requireEngineChoices,
    presetEngineChoices,
    presetGroupRoutes,
  }: ReturnType<typeof createModelRoutingHelpers>,
) {
  const slotOverrides = (bot: PersonaBotRecord): ('main' | 'sub')[] => {
    const engines = deps.subscriptionEngines?.store;
    return (['main', 'sub'] as const).filter(
      (slot) =>
        ownsModelSlot(bot, slot) ||
        (engines !== undefined &&
          engines.selection(bot.slug, slot === 'main' ? 'orchestrator' : 'assignment') !==
            undefined),
    );
  };
  const followEngines = (slug: string, slots: readonly ('main' | 'sub')[]) => {
    const engines = deps.subscriptionEngines;
    if (engines === undefined) return;
    for (const slot of slots) {
      const role = slot === 'main' ? 'orchestrator' : 'assignment';
      if (engines.store.selection(slug, role) === undefined) continue;
      engines.use(slug, role, undefined);
      if (role === 'orchestrator') deps.releaseEngineQuotaHold?.(slug);
    }
  };
  const modelPlanReset: ModelsBridgeMethods['modelPlanReset'] = (payload) => {
    const slug = asSlug(payload);
    const source = asObject(payload);
    const revision = source['expectedRevision'];
    const slots = source['slots'];
    if (
      slug === undefined ||
      !Number.isSafeInteger(revision) ||
      !Array.isArray(slots) ||
      slots.length === 0 ||
      !slots.every((slot) => slot === 'main' || slot === 'sub')
    )
      return invalidInput('Bot, expected revision and slots (main, sub) are required');
    const bot = deps.registry.get(slug);
    if (bot === undefined) return unknownBot(slug);
    try {
      requireOwnedBot(slug);
      const preset =
        deps.modelPresets?.get(linkedPresetId(bot)) ??
        deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID);
      if (preset !== undefined) {
        const plan = defaultPresetPlan(preset);
        requireRoutes(slug, [
          ...(slots.includes('main') ? [plan.orchestrator] : []),
          ...(slots.includes('sub') ? assignmentModelsOf(plan) : []),
          ...presetGroupRoutes(plan, slug),
        ]);
        requireEngineChoices(presetEngineChoices(preset), slug);
      }
    } catch (error) {
      return modelFailure(error);
    }
    const result = deps.registry.resetModelSlots(slug, slots, revision as number);
    if (!result.ok) return invalidInput('Bot model changed; reopen before saving');
    followEngines(slug, slots);
    return {
      ok: true,
      value: {
        revision: result.record.modelPlan?.revision ?? result.record.modelPlanRevision ?? 0,
        overrides: slotOverrides(result.record),
      },
    };
  };
  const modelPlanInherit: ModelsBridgeMethods['modelPlanInherit'] = (payload) => {
    const slug = asSlug(payload);
    const revision = asObject(payload)['expectedRevision'];
    if (slug === undefined || !Number.isSafeInteger(revision))
      return invalidInput('Bot and expected revision required');
    try {
      const route = deps.defaultModel?.currentSelection() ?? deps.modelCatalog?.defaultRoute?.();
      requireOwnedBot(slug);
      const preset = deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID);
      if (preset) {
        const plan = defaultPresetPlan(preset);
        requireRoutes(slug, [
          plan.orchestrator,
          ...assignmentModelsOf(plan),
          ...presetGroupRoutes(plan, slug),
        ]);
        requireEngineChoices(presetEngineChoices(preset), slug);
      } else if (route) requireRoutes(slug, [route]);
    } catch (error) {
      return modelFailure(error);
    }
    const result = deps.registry.inheritModel(slug, revision as number);
    if (!result.ok) return invalidInput('Bot model changed; reopen before saving');
    followEngines(slug, ['main', 'sub']);
    return {
      ok: true,
      value: { revision: result.record.modelPlanRevision ?? 0 },
    };
  };
  return { slotOverrides, followEngines, modelPlanInherit, modelPlanReset };
}
