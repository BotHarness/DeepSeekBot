import { dmChannelId } from '../channels/channel.js';
import type { PersonaBotDetail } from '../bridge/methods.js';
import type { ModelPreset, ModelRoute } from '../models/presets.js';
import type { PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type {
  BotCreateCliIo,
  BotCreateResult,
  BotCreateStep,
  CreateValues,
  ValidatedCreate,
} from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { connectLiveHost } from './cli-live.js';
import type { PersonaBotDeletionPreview } from './deletion.js';

export const ONLINE_MANAGEMENT_COMMANDS = [
  'create',
  'list',
  'show',
  'model-presets',
  'model-preset-create',
  'model-preset-apply',
  'model-plan',
  'channels',
] as const;

export const DIAGNOSTIC_COMMANDS = [
  {
    command: 'bot-attention',
    description: 'inspect bounded Bot Source Event and Admission processing states',
  },
  { command: 'bot-sessions', description: 'inspect bounded Bot-owned Session summaries' },
  {
    command: 'bot-activity',
    description: 'inspect a Bot activity snapshot without execution logs',
  },
] as const;

export const LIFECYCLE_COMMANDS = [
  {
    command: 'bot-delete-preview',
    description: 'inspect the current PersonaBot deletion scope and confirmation token',
  },
  {
    command: 'bot-delete-confirm',
    description: 'confirm PersonaBot deletion with stdin scope token; retain Memory',
  },
  {
    command: 'bot-delete-retry',
    description: 'retry incomplete PersonaBot cleanup through its owner',
  },
] as const;

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function route(values: CreateValues, prefix: 'orchestrator' | 'assignment'): ModelRoute {
  const provider = values[`${prefix}-provider`]?.trim();
  const model = values[`${prefix}-model`]?.trim();
  const effort = values[`${prefix}-effort`]?.trim();
  if (!provider || !model) usage(`--${prefix}-provider and --${prefix}-model are required.`);
  return { provider, model, ...(effort ? { reasoningEffort: effort } : {}) };
}

export async function runOnlineManagement(
  command: string,
  rest: string[],
  values: CreateValues,
  io: BotCreateCliIo,
  create?: ValidatedCreate,
  bundle?: { archive: Uint8Array; name?: string; historySkipped: boolean },
): Promise<unknown> {
  if (values.home !== undefined) usage('Do not combine --home and an online Host target.');
  const noTarget = ['create', 'list', 'model-presets', 'model-preset-create', 'channels'].includes(
    command,
  );
  if (rest.length !== (noTarget ? 0 : 1))
    usage(`${command} ${noTarget ? 'takes no positional arguments' : 'requires one Bot ID'}.`);
  const slug = rest[0]?.trim();
  if (!noTarget && !slug) usage('A nonempty Bot ID is required.');
  const seconds = values.timeout === undefined ? 120 : Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    usage('--timeout must be between 0 and 600 seconds.');
  const limit = values.limit === undefined ? 50 : Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) usage('--limit must be 1–100.');
  let presetInput;
  if (command === 'model-preset-create') {
    const name = values.name?.trim();
    if (!name) usage('--name is required for a Model Preset.');
    presetInput = {
      name,
      orchestrator: route(values, 'orchestrator'),
      assignmentDefault: route(values, 'assignment'),
    };
  }
  if (command === 'model-preset-apply' && !values.preset?.trim()) usage('--preset is required.');
  let confirmation: string | undefined;
  if (command === 'bot-delete-confirm') {
    if (!values['confirmation-stdin']) usage('bot-delete-confirm requires --confirmation-stdin.');
    let input: unknown;
    try {
      input = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      usage('Confirmation stdin must be JSON with a token string.');
    }
    if (
      typeof input !== 'object' ||
      input === null ||
      !('token' in input) ||
      typeof input.token !== 'string' ||
      !input.token.trim() ||
      input.token.length > 256 ||
      Object.keys(input).some((key) => key !== 'token')
    )
      usage(
        'Confirmation stdin must contain only a nonempty token string; this command retains Memory.',
      );
    confirmation = input.token;
  }
  const { rpc, importBotZip } = await connectLiveHost(
    values,
    io,
    AbortSignal.timeout(Math.ceil(seconds * 1000)),
  );
  if (command === 'list') return rpc('list', {});
  if (command === 'show') return rpc('get', { slug });
  if (command === 'channels') return rpc('channels', {});
  if (command === 'model-presets') return rpc('modelPresets', {});
  if (command === 'model-preset-create') return rpc('modelPresetCreate', presetInput!);
  if (command === 'model-preset-apply')
    return rpc('modelPresetApply', { slug, presetId: values.preset!.trim() });
  if (command === 'model-plan') return rpc('modelPlan', { slug });
  if (command === 'bot-delete-preview') return rpc('deletionPreview', { slug });
  if (command === 'bot-delete-confirm')
    return rpc('deletionConfirm', { slug, token: confirmation, eraseMemory: false });
  if (command === 'bot-delete-retry') {
    const result = await rpc<{ preview: PersonaBotDeletionPreview }>('deletionPreview', { slug });
    if (result.preview.deletion?.eraseMemory !== false)
      usage('Retry requires an accepted deletion that retains Memory.');
    return rpc('deletionRetry', { slug });
  }
  if (command === 'bot-attention')
    return rpc('botAttention', {
      slug,
      limit,
      ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
      ...(values.state === undefined ? {} : { state: values.state }),
    });
  if (command === 'bot-sessions') {
    const result = await rpc<{ sessions: Array<{ createdAt: string }> }>('sessions', { slug });
    const sorted = [...result.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { sessions: sorted.slice(0, limit), total: sorted.length };
  }
  if (command === 'bot-activity') {
    await rpc('get', { slug });
    const result = await rpc<PersonaBotActivitySnapshot>('activitySnapshot', {});
    const bot = result.bots.find((bot) => bot.slug === slug);
    return {
      generation: result.generation,
      revision: result.revision,
      bot:
        bot === undefined
          ? null
          : {
              ...bot,
              ...(bot.sessions === undefined
                ? {}
                : { sessions: bot.sessions.slice(0, limit), sessionCount: bot.sessions.length }),
            },
    };
  }
  if (command !== 'create' || create === undefined) usage('Unsupported online management command.');
  const steps: BotCreateStep[] = [{ name: 'validate', status: 'ok' }];
  let bot: { id: string; name: string } | undefined;
  let submitted = false;
  try {
    if (create.presetId !== undefined) {
      const result = await rpc<{ presets: ModelPreset[] }>('modelPresets', {});
      if (!result.presets.some((preset) => preset.id === create.presetId))
        throw new CliLiveError(
          'unknown-preset',
          'The specified Model Preset does not exist on this Host.',
        );
    }
    if ((create.source.kind === 'zip' || create.source.kind === 'dir') && bundle === undefined)
      usage('A validated local bundle is required.');
    submitted = true;
    const metadata = {
      ...(create.displayName === undefined ? {} : { displayName: create.displayName }),
      ...(create.roles === undefined ? {} : { roles: create.roles }),
      ...(create.description === undefined ? {} : { description: create.description }),
    };
    const result =
      create.source.kind === 'zip' || create.source.kind === 'dir'
        ? await importBotZip<{
            bot: PersonaBotDetail;
            httpsFallback?: BotCreateResult['httpsFallback'];
          }>(bundle!.archive, {
            ...metadata,
            ...(bundle!.name === undefined ? {} : { name: bundle!.name }),
          })
        : await rpc<{ bot: PersonaBotDetail; httpsFallback?: BotCreateResult['httpsFallback'] }>(
            create.source.kind === 'git' ? 'createFromGit' : 'create',
            {
              ...metadata,
              ...(create.source.kind === 'git'
                ? { gitUrl: create.source.gitUrl }
                : create.persona === undefined
                  ? {}
                  : { persona: create.persona }),
              ...(create.memoryLocation === undefined
                ? {}
                : { memoryLocation: create.memoryLocation }),
            },
          );
    if (!result.bot?.slug || !result.bot.displayName)
      throw new CliLiveError('host-protocol-error', 'The Host returned no created Bot identity.');
    bot = { id: result.bot.slug, name: result.bot.displayName };
    if (create.source.kind === 'git') steps.push({ name: 'clone', status: 'ok' });
    if (bundle !== undefined)
      steps.push({
        name: 'read-bundle',
        status: 'ok',
        ...(bundle.historySkipped
          ? { detail: 'Git history was unavailable; imported files only.' }
          : {}),
      });
    steps.push({ name: 'create-bot', status: 'ok' });
    if (create.presetId !== undefined) {
      await rpc('modelPresetApply', { slug: bot.id, presetId: create.presetId });
      steps.push({ name: 'model', status: 'ok' });
    } else steps.push({ name: 'model', status: 'deferred', code: 'no-model-yet' });
    const detail = await rpc<{ bot: PersonaBotDetail & { memoryDir: string } }>('get', {
      slug: bot.id,
    });
    if (typeof detail.bot?.memoryDir !== 'string')
      throw new CliLiveError('host-protocol-error', 'The Host returned no Bot Memory path.');
    const channelId = dmChannelId(bot.id);
    await rpc('channelDm', { slug: bot.id, displayName: bot.name });
    steps.push({ name: 'dm', status: 'ok' });
    const output: BotCreateResult = {
      bot,
      dm: { channelId },
      dataDir: detail.bot.memoryDir,
      steps,
      next: [
        ...(create.presetId === undefined
          ? [`Apply a Model Preset with deepseekbot model-preset-apply ${bot.id} --preset <id>.`]
          : []),
        `Run deepseekbot send ${bot.id} --body <text> against this Host to verify a real reply.`,
      ],
      ...(result.httpsFallback !== undefined ? { httpsFallback: result.httpsFallback } : {}),
    };
    return output;
  } catch (error) {
    if (error instanceof CliLiveError) {
      if (error.creation?.bot !== undefined) {
        bot = error.creation.bot;
        steps.push(...error.creation.steps);
      }
      throw new CliLiveError(error.code, error.message, undefined, undefined, {
        ...(bot === undefined ? {} : { bot }),
        steps,
        outcome: bot !== undefined ? 'created' : submitted ? 'unknown' : 'not-created',
      });
    }
    throw error;
  }
}
