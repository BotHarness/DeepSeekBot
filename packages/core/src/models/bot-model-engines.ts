import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { EngineChoice, EngineId } from '../engines/engine-session.js';
import type { BotModelSlot } from './bot-model-link.js';
import { DEFAULT_MODEL_PRESET_ID, type ModelPreset, type ModelPresetEngine } from './presets.js';

type EngineRole = 'orchestrator' | 'assignment';
type BotModelState = Pick<PersonaBotRecord, 'model' | 'modelPlan' | 'modelLink'>;

export const engineRoleSlot = (role: EngineRole): BotModelSlot =>
  role === 'orchestrator' ? 'main' : 'sub';

export function ownsModelSlot(bot: BotModelState, slot: BotModelSlot): boolean {
  if (bot.modelLink !== undefined) return bot.modelLink[slot] !== undefined;
  if (bot.modelPlan === undefined) return bot.model !== undefined;
  return slot === 'main' || bot.modelPlan.assignmentDefault !== undefined;
}

export function linkedPresetId(bot: BotModelState): string {
  return bot.modelLink?.presetId ?? DEFAULT_MODEL_PRESET_ID;
}

export function presetEngineFor(
  bot: BotModelState,
  role: EngineRole,
  presets: (id: string) => ModelPreset | undefined,
): ModelPresetEngine | undefined {
  if (ownsModelSlot(bot, engineRoleSlot(role))) return undefined;
  const preset = presets(linkedPresetId(bot)) ?? presets(DEFAULT_MODEL_PRESET_ID);
  if (preset === undefined) return undefined;
  if (role === 'orchestrator') return preset.orchestratorEngine;
  if (preset.assignmentFollowsMain !== true) return preset.assignmentEngine;
  return ownsModelSlot(bot, 'main') ? undefined : preset.orchestratorEngine;
}

export function repeatsPresetEngine(
  stored: { engine: EngineId | null; choice: EngineChoice },
  inherited: ModelPresetEngine | undefined,
): boolean {
  if (inherited === undefined) return stored.engine === null;
  if (stored.engine !== inherited.engine) return false;
  const { engine: _engine, ...choice } = inherited;
  const clean = (value: EngineChoice) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .filter(([, entry]) => entry !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  return clean(stored.choice) === clean(choice);
}
