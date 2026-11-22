import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { hasCliDeclaration } from './cli-effects.js';
import { basename } from 'node:path';
import { parseBotCliArgs } from './cli-options.js';
import { ZIP_UPLOAD_COMMANDS, runZipUploadCli } from './cli-zip-upload.js';
import { OperationalDatabaseError } from '../database/owner.js';
import { readBotZip, BOT_ZIP_HISTORY_PATH } from './bot-zip.js';
import { writeZip } from './zip-archive.js';
import { INBOX_HOST_COMMANDS } from './cli-inbox.js';
import { canonicalCliCommandName } from './cli-command-names.js';
import { runMarketplaceBlocklist } from './cli-marketplace-blocklist.js';
import { CliLiveError, LIVE_COMMANDS, runLiveCli } from './cli-live.js';
import { isActivityCommandName } from './cli-inbox.js';
import { hasAgentCliContext, runAgentCli } from './cli-agent.js';
import { runVoiceLocalKit, VOICE_LOCAL_KIT_HELP } from './cli-voice.js';
import { runSshCli, SSH_COMMANDS } from './cli-ssh.js';
import { PROFILE_ONLINE_COMMANDS } from './cli-profile.js';
import { isScheduleCommand } from './cli-schedules.js';
import {
  DIAGNOSTIC_COMMANDS,
  LIFECYCLE_COMMANDS,
  ONLINE_MANAGEMENT_COMMANDS,
  runOnlineManagement,
} from './cli-management.js';
import { BOT_CREATE_HELP } from '../features/personabots/cli-help.js';
export { BOT_CREATE_HELP } from '../features/personabots/cli-help.js';
import type { BotCreateCliIo, BotCreateFailure } from '../features/personabots/cli-types.js';
export {
  type BotCreateCliIo,
  type BotCreateStep,
  type BotCreateResult,
  type BotCreateFailure,
  type CreateValues,
} from '../features/personabots/cli-types.js';
import { CliFailure, usageError } from '../features/personabots/cli-errors.js';
import {
  validatedCreate,
  runCreate,
  readZipBundle,
  readDirBundle,
} from '../features/personabots/cli-create.js';
export {
  expandGitHubRef,
  type ValidatedCreate,
  validatedCreate,
} from '../features/personabots/cli-create.js';
import {
  runList,
  runShow,
  runPause,
  runUpdate,
  runHumanNameSet,
  runChannelHumanNameSet,
  runChannels,
  runChannelMessages,
  runPairings,
} from '../features/personabots/cli-lifecycle.js';
import {
  runModelPresets,
  runModelPresetCreate,
  runModelPresetApply,
  runModelPlan,
} from '../features/personabots/cli-models.js';
import {
  runMemorySnapshot,
  runMemoryFile,
  runMemoryHistory,
  runMemoryDiff,
  runMemorySave,
} from '../features/personabots/cli-memory.js';
import {
  runGrants,
  runGrantRevoke,
  runGrantWriteSet,
  runSchedules,
  runScheduleCreate,
  runScheduleUpdate,
  runScheduleDelete,
  runScheduleHistory,
  runScheduleRunNow,
  runSchedulePreview,
} from '../features/personabots/cli-schedules-grants.js';
import {
  rejectSecretArgv,
  runSecretList,
  runSecretPut,
  runSecretUnset,
} from '../features/personabots/cli-secrets.js';

const LOCAL_MEMORY_COMMANDS: ReadonlySet<string> = new Set([
  'memory-snapshot',
  'memory-file',
  'memory-history',
  'memory-diff',
  'memory-save',
]);

const LOCAL_LOG_COMMANDS = new Set([
  'doctor',
  'diagnostic-logs',
  'diagnostic-logs-export',
  'bug-report',
]);

const SEARCH_INDEX: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'bots', description: 'bots list|create|show|delete' },
  {
    command: 'engine',
    description:
      'engine list|status|accounts|account-add|account-rename|account-remove|approvals|tools|tool|login|models|use: Subscription Engines',
  },
  ...ZIP_UPLOAD_COMMANDS.map((command) => ({
    command,
    description: 'transfer, inspect or recover a portable Bot Zip on a chosen Host',
  })),
  ...SSH_COMMANDS,
  {
    command: 'marketplace-blocklist',
    description: 'moderate a Marketplace entry / 封禁或恢复市场条目',
  },
  ...LIVE_COMMANDS,
  ...DIAGNOSTIC_COMMANDS,
  ...LIFECYCLE_COMMANDS,
  { command: 'create', description: 'create a PersonaBot blank, from a bundle, or from git' },
  { command: 'list', description: 'list PersonaBots' },
  { command: 'show', description: 'inspect one PersonaBot' },
  { command: 'model-presets', description: 'list model presets' },
  { command: 'model-preset-create', description: 'create a model preset from provider routes' },
  { command: 'model-preset-apply', description: 'apply a model preset to a bot' },
  { command: 'model-plan', description: 'show a bot model plan' },
  { command: 'memory-snapshot', description: 'read a bot memory snapshot' },
  { command: 'memory-file', description: 'read one bot memory file' },
  { command: 'memory-history', description: 'list bot memory commits' },
  { command: 'memory-diff', description: 'diff a bot memory commit' },
  { command: 'memory-save', description: 'write and commit one bot memory file' },
  { command: 'pause', description: 'pause a bot' },
  { command: 'resume', description: 'resume a bot' },
  { command: 'update', description: 'update bot name description roles' },
  { command: 'human-name-set', description: 'set the Human display name' },
  { command: 'channel-human-name-set', description: 'set the per-channel Human nickname' },
  {
    command: 'channels',
    description:
      'list channels | add-member <id> <username> | member-candidates <id> [--query <text>]',
  },
  { command: 'channel-messages', description: 'read channel messages' },
  { command: 'grants', description: 'list bot workspace grants' },
  { command: 'grant-revoke', description: 'revoke a workspace grant' },
  { command: 'grant-write-set', description: 'set grant orchestrator write' },
  { command: 'schedules', description: 'list bot schedules' },
  { command: 'schedule-create', description: 'create a bot schedule' },
  { command: 'schedule-update', description: 'update a bot schedule' },
  { command: 'schedule-delete', description: 'delete a bot schedule' },
  { command: 'schedule-history', description: 'list schedule firings' },
  { command: 'schedule-run-now', description: 'record a manual schedule firing' },
  { command: 'schedule-preview', description: 'preview trigger occurrences' },
  { command: 'pairings', description: 'list bot IM pairing requests' },
  { command: 'secret-put', description: 'store a secret from stdin' },
  { command: 'secret-list', description: 'list secret names without values' },
  { command: 'secret-unset', description: 'delete a secret' },
  { command: 'search', description: 'search CLI commands by words' },
];

function runSearch(rest: readonly string[]): {
  query: string;
  matches: Array<{ command: string; description: string }>;
} {
  const query = rest.join(' ').trim();
  if (query.length === 0) throw usageError('search needs words to look for.');
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) throw usageError('search needs words to look for.');
  const scored = SEARCH_INDEX.filter((entry) => {
    const text = `${entry.command} ${entry.description}`.toLowerCase();
    return tokens.every((token) => text.includes(token));
  }).map((entry) => {
    const name = entry.command.toLowerCase().replaceAll('-', ' ');
    return {
      entry,
      score:
        tokens.filter((token) => name.includes(token)).length +
        (entry.command === tokens.join('-') ? 1000 : 0),
    };
  });
  scored.sort(
    (left, right) =>
      right.score - left.score || left.entry.command.localeCompare(right.entry.command),
  );
  return { query, matches: scored.map((item) => item.entry) };
}

function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

export async function runBotCreateCli(
  argv: readonly string[],
  io: BotCreateCliIo,
): Promise<number> {
  const readStdin = io.readStdin ?? (async () => '');
  let compactOutput = false;
  const out: BotCreateCliIo = {
    ...io,
    stdout: (text: string): void => {
      io.stdout(compactOutput ? compactJson(text) : text);
    },
  };
  try {
    rejectSecretArgv(argv);
    const { values, positionals } = parseBotCliArgs(argv);
    let [command, ...rest] = positionals;
    if (values['migration-dry-run'] && command !== 'model-default')
      throw usageError('--migration-dry-run requires model-default.');
    if (command === 'bots') {
      const [action, ...targets] = rest;
      const aliases: Record<string, string> = {
        list: 'list',
        show: 'show',
        create: 'create',
        delete: 'bot-delete-confirm',
      };
      if (
        action &&
        ['visibility', 'visibility-set', 'switches', 'reachable', 'proactive-opt-out'].includes(
          action,
        )
      ) {
        command = 'bot-access';
      } else {
        if (!action || !aliases[action]) throw usageError('invalid-input');
        command = aliases[action];
        rest = targets;
      }
    } else if (command === 'engine') {
      const [action, ...targets] = rest;
      if (
        action !== undefined &&
        [
          'list',
          'status',
          'accounts',
          'quota',
          'account-add',
          'account-rename',
          'account-remove',
          'approvals',
          'tools',
          'tool',
          'login',
          'login-cancel',
          'models',
          'use',
        ].includes(action)
      ) {
        command = `engine-${action}`;
        rest = targets;
      } else if (values.help !== true)
        throw usageError(
          'engine needs list, status, accounts, quota, account-add, account-rename, account-remove, approvals, tools, tool, login, login-cancel, models or use.',
        );
    } else if (command === 'activity' && rest[0] === 'list') rest = rest.slice(1);
    if (values.administration && command !== 'list') throw usageError('invalid-input');
    if (
      values.json &&
      command !== 'engine-quota' &&
      (command !== 'engine-login' || !values['device-auth'])
    )
      throw usageError('--json requires engine quota or engine login codex --device-auth.');
    compactOutput = values.compact === true || values.json === true;
    if (command === 'voice-local-kit') {
      out.stdout(
        JSON.stringify(
          values.help === true ? VOICE_LOCAL_KIT_HELP : runVoiceLocalKit(rest, values),
          null,
          2,
        ),
      );
      return 0;
    }
    if (hasAgentCliContext(io.env)) {
      out.stdout(JSON.stringify(await runAgentCli(command, rest, values, io, argv), null, 2));
      return 0;
    }
    if (command !== undefined) command = canonicalCliCommandName(command);
    if (values.help === true || command === undefined || command === 'help') {
      out.stdout(BOT_CREATE_HELP.trimEnd());
      return 0;
    }
    if (!hasCliDeclaration(command)) throw usageError('Unknown command.');
    if (command === 'marketplace-blocklist') {
      out.stdout(JSON.stringify(await runMarketplaceBlocklist(rest, io.env), null, 2));
      return 0;
    }
    if (command === 'ssh-tunnel') return await runSshCli(rest, values, out);
    const online = values.host !== undefined || io.env['DEEPSEEKBOT_HOST'] !== undefined;
    const teamChannels = command === 'channels' && (online || rest.length > 0);
    if (
      values.as !== undefined &&
      (!online ||
        (!teamChannels &&
          command !== 'channel-messages' &&
          !ONLINE_MANAGEMENT_COMMANDS.some((entry) => entry === command) &&
          !ZIP_UPLOAD_COMMANDS.some((entry) => entry === command) &&
          !LIFECYCLE_COMMANDS.some((entry) => entry.command === command) &&
          !DIAGNOSTIC_COMMANDS.some((entry) => entry.command === command) &&
          !LOCAL_MEMORY_COMMANDS.has(command) &&
          !PROFILE_ONLINE_COMMANDS.some((entry) => entry === command) &&
          !LIVE_COMMANDS.some((entry) => entry.command === command)))
    )
      throw usageError('as-online-required');
    if (teamChannels || (values.as !== undefined && command === 'channel-messages')) {
      if (!online) throw usageError('host-required');
      if (values.home !== undefined)
        throw usageError('Do not combine --home and an online Host target.');
      out.stdout(JSON.stringify(await runLiveCli(command, rest, values, io), null, 2));
      return 0;
    }
    if (ZIP_UPLOAD_COMMANDS.some((entry) => entry === command)) {
      if (!online) throw usageError('Zip transfer commands require --host.');
      out.stdout(JSON.stringify(await runZipUploadCli(command, rest, values, io), null, 2));
      return 0;
    }
    if (values['from-bot'] !== undefined && command !== 'marketplace-avatar-publish')
      throw usageError('--from-bot only applies to marketplace-avatar-publish.');
    if (
      values['operation-key'] !== undefined &&
      (!online ||
        ![
          'create',
          'create-status',
          'group-create',
          'group-invite',
          'marketplace-install',
          'marketplace-avatar-publish',
          'marketplace-avatar-apply',
        ].includes(command))
    )
      throw usageError(
        '--operation-key is supported only for online Bot creation or status, Marketplace install, Avatar publish or apply, group creation or group invitation.',
      );
    if (
      values['expected-channel'] !== undefined &&
      ![
        'group-invite',
        'group-invite-cancel',
        'group-join-decide',
        'channel-rename',
        'group-avatar-set',
        'group-wake-set',
        'group-member-remove',
      ].includes(command)
    )
      throw usageError('--expected-channel is supported only for reviewed group changes.');
    if (
      values['expected-commit'] !== undefined &&
      (!online || !['create', 'create-status'].includes(command))
    )
      throw usageError('--expected-commit is supported only for online Git creation or status.');
    if (
      DIAGNOSTIC_COMMANDS.some((entry) => entry.command === command) ||
      LIFECYCLE_COMMANDS.some((entry) => entry.command === command) ||
      (online && ONLINE_MANAGEMENT_COMMANDS.some((entry) => entry === command))
    ) {
      if (['create', 'create-status'].includes(command) && rest.length > 0)
        throw usageError(`${command} takes no positional arguments.`);
      const input = ['create', 'create-status'].includes(command)
        ? await validatedCreate(values, readStdin)
        : undefined;
      let bundle;
      if (input?.source.kind === 'zip') {
        const contents = readZipBundle(input.source.path);
        bundle = {
          archive: contents.archive,
          name: basename(input.source.path),
          historySkipped: contents.historySkipped,
        };
      } else if (input?.source.kind === 'dir') {
        const contents = readDirBundle(input.source.path);
        const archive = writeZip([
          ...contents.files.map((file) => ({ ...file, path: `bot-bundle/${file.path}` })),
          ...(contents.history === undefined
            ? []
            : [{ path: `bot-bundle/${BOT_ZIP_HISTORY_PATH}`, data: contents.history }]),
        ]);
        readBotZip(archive);
        bundle = { archive, historySkipped: contents.historySkipped };
      }
      out.stdout(
        JSON.stringify(
          await runOnlineManagement(command, rest, values, io, input, bundle),
          null,
          2,
        ),
      );
      return 0;
    }
    if (
      ((LIVE_COMMANDS.some((entry) => entry.command === command) ||
        isActivityCommandName(command)) &&
        (!['pause', 'resume'].includes(command) || online)) ||
      (([
        'channel-messages',
        'grants',
        ...LOCAL_MEMORY_COMMANDS,
        ...PROFILE_ONLINE_COMMANDS,
      ].includes(command) ||
        isScheduleCommand(command)) &&
        (values.host !== undefined || io.env['DEEPSEEKBOT_HOST'] !== undefined)) ||
      (online && INBOX_HOST_COMMANDS.some((entry) => entry === command))
    ) {
      if (values.home !== undefined && !LOCAL_LOG_COMMANDS.has(command))
        throw usageError('Do not combine --home and an online Host target.');
      out.stdout(JSON.stringify(await runLiveCli(command, rest, values, io), null, 2));
      return 0;
    }
    if (
      values.host !== undefined ||
      values['token-file'] !== undefined ||
      (online && !['search', 'secret-put', 'secret-list', 'secret-unset'].includes(command))
    )
      throw usageError(
        'This command has no online adapter yet; use its explicit offline maintenance mode.',
      );
    if (command === 'list') {
      if (rest.length > 0) throw usageError('list takes no bot id.');
      out.stdout(JSON.stringify(runList(values, io), null, 2));
      return 0;
    }
    if (command === 'show') {
      if (rest.length !== 1) throw usageError('show needs exactly one bot id.');
      out.stdout(JSON.stringify(runShow(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-presets') {
      if (rest.length > 0) throw usageError('model-presets takes no bot id.');
      if (values['include-usage'])
        throw usageError('--include-usage requires an online Host target.');
      out.stdout(JSON.stringify(runModelPresets(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-create') {
      if (rest.length > 0) throw usageError('model-preset-create takes no positional arguments.');
      out.stdout(JSON.stringify(runModelPresetCreate(values, io), null, 2));
      return 0;
    }
    if (command === 'model-preset-apply') {
      if (rest.length !== 1) throw usageError('model-preset-apply needs exactly one bot id.');
      out.stdout(JSON.stringify(runModelPresetApply(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'model-plan') {
      if (rest.length !== 1) throw usageError('model-plan needs exactly one bot id.');
      out.stdout(JSON.stringify(runModelPlan(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'channel-human-name-set') {
      if (rest.length !== 1)
        throw usageError('channel-human-name-set needs exactly one channel id.');
      out.stdout(JSON.stringify(runChannelHumanNameSet(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'channels') {
      if (rest.length > 0) throw usageError('channels takes no bot id.');
      out.stdout(JSON.stringify(runChannels(values, io), null, 2));
      return 0;
    }
    if (command === 'channel-messages') {
      if (rest.length !== 1) throw usageError('channel-messages needs exactly one channel id.');
      out.stdout(JSON.stringify(runChannelMessages(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grants') {
      if (rest.length !== 1) throw usageError('grants needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrants(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grant-revoke') {
      if (rest.length !== 1) throw usageError('grant-revoke needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrantRevoke(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'grant-write-set') {
      if (rest.length !== 1) throw usageError('grant-write-set needs exactly one bot id.');
      out.stdout(JSON.stringify(runGrantWriteSet(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedules') {
      if (rest.length !== 1) throw usageError('schedules needs exactly one bot id.');
      out.stdout(JSON.stringify(runSchedules(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-create') {
      if (rest.length !== 1) throw usageError('schedule-create needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleCreate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-update') {
      if (rest.length !== 1) throw usageError('schedule-update needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleUpdate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-delete') {
      if (rest.length !== 1) throw usageError('schedule-delete needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleDelete(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-history') {
      if (rest.length !== 1) throw usageError('schedule-history needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleHistory(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-run-now') {
      if (rest.length !== 1) throw usageError('schedule-run-now needs exactly one bot id.');
      out.stdout(JSON.stringify(runScheduleRunNow(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'schedule-preview') {
      if (rest.length > 0) throw usageError('schedule-preview takes no bot id.');
      out.stdout(JSON.stringify(runSchedulePreview(values), null, 2));
      return 0;
    }
    if (command === 'pairings') {
      if (rest.length !== 1) throw usageError('pairings needs exactly one bot id.');
      out.stdout(JSON.stringify(runPairings(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'secret-put') {
      if (rest.length > 1)
        throw new CliFailure(
          'secret-in-argv',
          'secret-put values must arrive on stdin, never in arguments.',
          2,
        );
      if (rest.length !== 1) throw usageError('secret-put needs exactly one secret name.');
      out.stdout(JSON.stringify(await runSecretPut(rest[0]!, values, io, readStdin), null, 2));
      return 0;
    }
    if (command === 'secret-list') {
      if (rest.length > 0) throw usageError('secret-list takes no secret name.');
      out.stdout(JSON.stringify(runSecretList(values, io), null, 2));
      return 0;
    }
    if (command === 'secret-unset') {
      if (rest.length !== 1) throw usageError('secret-unset needs exactly one secret name.');
      out.stdout(JSON.stringify(await runSecretUnset(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'search') {
      out.stdout(JSON.stringify(runSearch(rest), null, 2));
      return 0;
    }
    if (command === 'pause' || command === 'resume') {
      if (rest.length !== 1) throw usageError('pause and resume need exactly one bot id.');
      out.stdout(JSON.stringify(runPause(rest[0]!, command === 'pause', values, io), null, 2));
      return 0;
    }
    if (command === 'update') {
      if (rest.length !== 1) throw usageError('update needs exactly one bot id.');
      out.stdout(JSON.stringify(runUpdate(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'human-name-set') {
      if (rest.length > 0) throw usageError('human-name-set takes no positional arguments.');
      out.stdout(JSON.stringify(runHumanNameSet(values, io), null, 2));
      return 0;
    }
    if (command === 'memory-snapshot') {
      if (rest.length !== 1) throw usageError('memory-snapshot needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemorySnapshot(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-file') {
      if (rest.length !== 1) throw usageError('memory-file needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryFile(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-history') {
      if (rest.length !== 1) throw usageError('memory-history needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryHistory(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-diff') {
      if (rest.length !== 1) throw usageError('memory-diff needs exactly one bot id.');
      out.stdout(JSON.stringify(runMemoryDiff(rest[0]!, values, io), null, 2));
      return 0;
    }
    if (command === 'memory-save') {
      if (rest.length !== 1) throw usageError('memory-save needs exactly one bot id.');
      out.stdout(JSON.stringify(await runMemorySave(rest[0]!, values, io, readStdin), null, 2));
      return 0;
    }
    if (command !== 'create') throw usageError('Unknown command.');
    if (rest.length > 0) throw usageError('create takes no positional arguments.');
    const startedAt = performance.now();
    const result = await runCreate(values, io, readStdin);
    out.stdout(JSON.stringify(result, null, 2));
    io.stderr(
      `tobs: created ${result.bot.id} ("${result.bot.name}") in ${Math.round(performance.now() - startedAt)}ms`,
    );
    return 0;
  } catch (error) {
    if (error instanceof HostAnswerInvalid) {
      out.stdout(
        JSON.stringify({ error: { code: 'host-protocol-error', message: error.message } }, null, 2),
      );
      io.stderr(`tobs: ${error.message}`);
      return 1;
    }
    if (error instanceof CliLiveError) {
      out.stdout(
        JSON.stringify(
          {
            error: {
              code: error.code,
              message: error.message,
              ...(error.details === undefined ? {} : { details: error.details }),
              ...(error.operation === undefined ? {} : { operation: error.operation }),
            },
            ...(error.receipt === undefined ? {} : { receipt: error.receipt }),
            ...(error.authorization === undefined ? {} : { authorization: error.authorization }),
            ...(error.creation === undefined ? {} : error.creation),
          },
          null,
          2,
        ),
      );
      io.stderr(`tobs: ${error.message}`);
      return error.code === 'usage' ? 2 : 1;
    }
    if (error instanceof CliFailure) {
      const failure: BotCreateFailure = {
        error: { code: error.code, message: error.message },
        ...(error.steps.length === 0 ? {} : { steps: error.steps }),
        ...(error.bot === undefined ? {} : { bot: error.bot }),
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`tobs: ${error.message}`);
      return error.exitCode;
    }
    if (
      error instanceof TypeError &&
      'code' in error &&
      String(error.code).startsWith('ERR_PARSE_ARGS')
    ) {
      const failure: BotCreateFailure = {
        error: {
          code: 'usage',
          message: `${error.message} Run tobs create --help for usage.`,
        },
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`tobs: ${error.message}`);
      return 2;
    }
    if (error instanceof OperationalDatabaseError) {
      const failure: BotCreateFailure = {
        error: { code: error.code, message: error.message },
      };
      out.stdout(JSON.stringify(failure, null, 2));
      io.stderr(`tobs: ${error.message}`);
      return 1;
    }
    const failure: BotCreateFailure = {
      error: { code: 'internal-error', message: 'The command failed before producing a result.' },
    };
    out.stdout(JSON.stringify(failure, null, 2));
    io.stderr(`tobs: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
