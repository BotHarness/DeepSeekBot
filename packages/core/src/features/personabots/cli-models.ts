import { join } from 'node:path';
import type { OperationalDatabaseOwner } from '../../database/owner.js';
import {
  createModelPresetStore,
  hasPresetEngines,
  type ModelPreset,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../../models/presets.js';
import type { BotCreateCliIo, BotCreateStep, CreateValues } from './cli-types.js';
import { CliFailure, usageError } from './cli-errors.js';
import { trimmed, resolveHome, openRegistry } from './cli-offline.js';

const STATIC_CATALOG_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure-openai-responses',
  'baseten',
  'cerebras',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'deepseek',
  'deepseek-account',
  'deepseek-official',
  'fireworks',
  'github-copilot',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'kimi-coding',
  'minimax',
  'minimax-cn',
  'mistral',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'opencode',
  'opencode-go',
  'openrouter',
  'qwen-token-plan',
  'qwen-token-plan-cn',
  'qwen-token-plan-individual',
  'together',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
]);

export function assertKnownProvider(
  provider: string,
  carry?: { steps: BotCreateStep[]; bot?: { id: string; name: string } },
): void {
  if (!STATIC_CATALOG_PROVIDER_IDS.has(provider)) {
    throw new CliFailure(
      'invalid-input',
      `Unknown provider: ${provider}. Check the spelling; purely dynamic providers validate at the Host.`,
      1,
      carry?.steps ?? [],
      carry?.bot,
    );
  }
}

function modelStore(dshHome: string, owner: OperationalDatabaseOwner) {
  return createModelPresetStore({ rootDir: join(dshHome, 'botharness'), database: owner });
}

export function runModelPresets(
  values: CreateValues,
  io: BotCreateCliIo,
): { presets: ModelPreset[] } {
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    return { presets: modelStore(dshHome, owner).list() };
  } finally {
    owner.close();
  }
}

function parseRoute(values: CreateValues, prefix: 'orchestrator' | 'assignment'): ModelRoute {
  const provider = trimmed(values[`${prefix}-provider`]);
  const model = trimmed(values[`${prefix}-model`]);
  const effort = trimmed(values[`${prefix}-effort`]);
  if (provider === undefined || model === undefined) {
    throw usageError(`--${prefix}-provider and --${prefix}-model are required.`);
  }
  return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) };
}

export function runModelPresetCreate(
  values: CreateValues,
  io: BotCreateCliIo,
): { preset: ModelPreset } {
  if (Object.keys(values).some((key) => /^(orchestrator|assignment)-engine(?:-|$)/u.test(key)))
    throw usageError('Model Preset Subscription Engines require an online Host target.');
  if (values['plan-stdin'])
    throw usageError('Model Preset plan stdin requires an online Host target.');
  if (
    values['orchestrator-group'] !== undefined ||
    values['assignment-groups'] !== undefined ||
    values['assignment-default-group'] !== undefined
  )
    throw usageError('Model Preset Routing Groups require an online Host target.');
  const name = trimmed(values.name);
  if (name === undefined) throw usageError('--name is required for a model preset.');
  const orchestrator = parseRoute(values, 'orchestrator');
  const assignmentDefault = parseRoute(values, 'assignment');
  assertKnownProvider(orchestrator.provider);
  assertKnownProvider(assignmentDefault.provider);
  const mode = values['assignment-models'];
  if (mode !== undefined && mode !== 'open' && mode !== 'listed')
    throw usageError('--assignment-models must be open or listed.');
  const dshHome = resolveHome(values, io);
  const { owner } = openRegistry(dshHome);
  try {
    try {
      const preset = modelStore(dshHome, owner).create({
        name,
        orchestrator,
        assignmentDefault,
        ...(mode === undefined ? {} : { openAssignmentModels: mode === 'open' }),
      });
      io.stderr(`tobs: created model preset ${preset.id} ("${preset.name}")`);
      return { preset };
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new CliFailure('duplicate-preset', `Model preset already exists: ${name}`, 1);
      }
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The model preset could not be created.',
        1,
      );
    }
  } finally {
    owner.close();
  }
}

export function runModelPresetApply(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; plan: PersonaBotModelPlan | null } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-preset-apply needs exactly one bot id.');
  const presetId = trimmed(values.preset);
  if (presetId === undefined) throw usageError('--preset is required to apply a model preset.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    const preset = modelStore(dshHome, owner).get(presetId);
    if (preset === undefined) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    assertKnownProvider(preset.orchestrator.provider);
    assertKnownProvider(preset.assignmentDefault.provider);
    if (hasPresetEngines(preset))
      throw new CliFailure(
        'engine-unavailable',
        'Apply this Subscription Engine preset through the online Host.',
        1,
      );
    const applied = registry.applyModelPreset(slug, preset);
    if (!applied.ok) {
      throw new CliFailure('unknown-preset', `Unknown model preset: ${presetId}`, 1);
    }
    io.stderr(`tobs: applied model preset "${preset.name}" to ${slug}`);
    return {
      bot: { id: slug, name: applied.record.displayName },
      plan: applied.record.modelPlan ?? null,
    };
  } finally {
    owner.close();
  }
}

export function runModelPlan(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): {
  bot: { id: string; name: string };
  plan: PersonaBotModelPlan | null;
  revision: number;
  readiness: { status: 'deferred'; code: string; detail: string };
} {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('model-plan needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    return {
      bot: { id: slug, name: record.displayName },
      plan: record.modelPlan ?? null,
      revision: record.modelPlan?.revision ?? record.modelPlanRevision ?? 0,
      readiness: {
        status: 'deferred',
        code: 'host-only',
        detail: 'Model readiness inspection needs a running Host.',
      },
    };
  } finally {
    owner.close();
  }
}
