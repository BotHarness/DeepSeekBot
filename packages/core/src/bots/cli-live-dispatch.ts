import { createGrant, readWorkspaceGrants } from '@botharness/host-client/access-readers';
import {
  answerUserQuestion,
  decideToolApproval,
  readToolApprovalStatus,
  readUserQuestionStatus,
} from '@botharness/host-client/approval-readers';
import type { QuestionAnswer } from '@botharness/host-protocol/wire';
import { parseQuotesInput, type ChannelQuote } from '../channels/quotes.js';
import { toolEffectLabels } from '../workspaces/tool-effect-labels.js';
import type { ChannelMessage } from '../channels/channel.js';
import { TEAM_COMMANDS, runTeamCommand } from './cli-team.js';
import { runDeviceActivity } from './cli-live-activity.js';
import { GENUI_COMMANDS, runGenuiCommand } from './cli-genui.js';
import { runHostLook } from './cli-host-look.js';
import { isProfileBackupCommand, runProfileBackupCommand } from './cli-profile-backup.js';
import { runPhoneNotifications } from './cli-phone-notifications.js';
import { WINDOW_ZOOM_COMMANDS, runWindowZoomCommand } from './cli-window-zoom.js';
import { DESKTOP_WINDOW_COMMANDS, runDesktopWindowCommand } from './cli-desktop-window.js';
import { PRESENCE_COMMANDS, runPresenceCommand } from './cli-presence.js';
import { ENGINE_COMMANDS, runEngineCommand } from './cli-engine.js';
import { PHONE_ROUTE_COMMANDS, runPhoneRouteCommand } from './cli-phone-route.js';
import { isDevicesCommand, runDevicesCommand } from './cli-devices.js';
import { runRelationshipCommand } from './cli-relationships.js';
import { DEVICE_CLIENT_COMMANDS, runDeviceClientCommand } from './cli-device-client.js';
import { runDeviceNotifications } from './cli-device-notifications.js';
import {
  BROWSER_NOTIFICATION_COMMANDS,
  runBrowserNotifications,
} from './cli-browser-notifications.js';
import { FEEDBACK_COMMANDS, runFeedbackCommand } from './cli-feedback.js';
import { DIAGNOSTIC_LOG_COMMANDS, runDiagnosticLogCommand } from './cli-diagnostic-logs.js';
import { runDoctor } from './cli-doctor.js';
import { runBugReport } from './cli-bug-report.js';
import { APPEARANCE_COMMANDS, runAppearanceCommand } from './cli-appearance.js';
import { prepareCloud, prepareCloudWork } from './cli-cloud.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveBotDm } from './cli-bot-dm.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { CONNECTION_COMMANDS, runConnectionCommand } from './cli-connection.js';
import { runTobCli } from './cli-tob.js';
import { BOT_TOOL_COMMANDS, runBotToolCommand } from './cli-bot-tool.js';
import { isCallTimelineCommand, runCallTimelineCommand } from './cli-call-timeline.js';
import { isTakeoverCommand, runTakeoverCommand } from './cli-takeover.js';
import { isChannelCommand, runChannelCommand } from './cli-channels.js';
import { isBrowserComputerCommand, runBrowserComputerCommand } from './cli-browser-computer.js';
import { IM_COMMANDS, prepareImAuthorization, runImAuthorization } from './cli-im-authorization.js';
import {
  MESSAGING_COMMANDS,
  prepareMessaging,
  runMessaging,
  type MessagingCommand,
} from './cli-messaging.js';
import { isModelsUsageCommand, runModelsUsage } from './cli-models-usage.js';
import { isHostAdminCommand, runHostAdminCommand } from './cli-host-admin.js';
import { isInboxCommand, runInboxCommand } from './cli-inbox.js';
import { isScheduleCommand, prepareScheduleCommand, runScheduleCommand } from './cli-schedules.js';
import { isProfileCommand, runProfileCommand } from './cli-profile.js';
import { isTodoCommand, runTodoCommand } from './cli-todos.js';
import { isApprovalTemplateCommand, runApprovalTemplateCommand } from './cli-approval-templates.js';
import { isPromptPresetCommand, runPromptPresetCommand } from './cli-prompt-presets.js';
import { isApprovalReviewerCommand, runApprovalReviewerCommand } from './cli-approval-reviewer.js';
import { isVoiceCommand, runVoiceCommand } from './cli-voice.js';
import { isCallCommand, runCallCommand } from './cli-call.js';
import {
  isSkillCommand,
  runSkillCommand,
  skillInvocationTokens,
  type SkillValues,
} from './cli-skills.js';
import { VOICE_CALL_PATH, type VoiceCallResult } from '../voice/call-contract.js';
import { isStorageCommand, runStorageCommand, type StorageValues } from './cli-storage.js';
import { isIdleCompactionCommand, runIdleCompactionCommand } from './cli-idle-compaction.js';
import { isBotModeCommand, runBotModeCommand } from './cli-bot-modes.js';
import { isConnectCommand, runConnectCommand } from './cli-connect.js';
import { isShareDraftCommand, runShareDraftCommand } from './cli-share-draft.js';
import { PRIVATE_FIELD_ID } from '../credentials/references.js';
import { DEVICE_COMMANDS, runDeviceCommand } from './cli-browser-computer-operations.js';
import { CONTROL_COMMANDS, runControlCommand } from './cli-live-control.js';
import { connectLiveHost, record } from './cli-live-host.js';
import { cliQuote, timeoutMs, usage, type LiveValues } from './cli-live-input.js';
import { IM_CONTROL_COMMANDS, runImControlCommand } from './cli-live-im-control.js';
import { MEMORY_COMMANDS, runMemoryCommand } from './cli-live-memory.js';

export async function runLiveCli(
  command: string,
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (
    values.as !== undefined &&
    (['relationships', 'device-activity', 'device-notifications', 'phone-notifications'].includes(
      command,
    ) ||
      DEVICE_CLIENT_COMMANDS.some((entry) => entry.command === command))
  )
    throw new CliLiveError('as-command-unsupported', 'as-command-unsupported');
  if (
    TEAM_COMMANDS.some((entry) => entry.command === command) ||
    command === 'channels' ||
    (command === 'devices' && values.member !== undefined)
  ) {
    const host = await connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout)));
    return runTeamCommand(command, rest, values, io, host.rpc);
  }
  if (isProfileBackupCommand(command))
    return runProfileBackupCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (CONNECTION_COMMANDS.some((entry) => entry.command === command))
    return runConnectionCommand(
      command,
      rest,
      {
        ...(values['client-id'] === undefined ? {} : { 'client-id': values['client-id'] }),
        ...(values['connection-id'] === undefined
          ? {}
          : { 'connection-id': values['connection-id'] }),
        ...(values['link-file'] === undefined ? {} : { 'link-file': values['link-file'] }),
        ...(values.fingerprint === undefined ? {} : { fingerprint: values.fingerprint }),
        ...(values.confirm === undefined ? {} : { confirm: values.confirm }),
        ...(values['confirm-disconnect'] === undefined
          ? {}
          : { 'confirm-disconnect': values['confirm-disconnect'] }),
        ...(values.handover === undefined ? {} : { handover: values.handover }),
        ...(values['connection-route-id'] === undefined
          ? {}
          : { 'connection-route-id': values['connection-route-id'] }),
        ...(values['expected-route-revision'] === undefined
          ? {}
          : { 'expected-route-revision': values['expected-route-revision'] }),
      },
      io,
      () => connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'host-look') {
    const duration = timeoutMs(values.timeout);
    const expiresAt = Date.now() + duration;
    const signal = AbortSignal.timeout(duration);
    return runHostLook(rest, values, io, () => connectLiveHost(values, io, signal), expiresAt);
  }
  if (command === 'device-activity') return runDeviceActivity(rest, values, io);
  if (command === 'device-notifications') return runDeviceNotifications(rest, values, io);
  if (command === 'phone-notifications') return runPhoneNotifications(rest, values, io);
  if (BROWSER_NOTIFICATION_COMMANDS.some((entry) => entry.command === command))
    return runBrowserNotifications(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'bug-report')
    return runBugReport(values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'doctor')
    return runDoctor(values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (DIAGNOSTIC_LOG_COMMANDS.some((entry) => entry.command === command))
    return runDiagnosticLogCommand(command, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (FEEDBACK_COMMANDS.some((entry) => entry.command === command))
    return runFeedbackCommand(command, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (IM_COMMANDS.some((entry) => entry.command === command)) {
    const operation = await prepareImAuthorization(command, rest, values, io);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    try {
      return await runImAuthorization(
        operation,
        (await connectLiveHost(values, io, signal)).rpc,
        signal,
      );
    } catch (error) {
      if (
        error instanceof CliLiveError &&
        !error.authorization &&
        command !== 'im-apps' &&
        command !== 'im-authorize'
      )
        throw new CliLiveError(error.code, error.message, undefined, {
          attemptId: operation.target,
        });
      throw error;
    }
  }
  if (MEMORY_COMMANDS.has(command)) return runMemoryCommand(command, rest, values, io);
  if (isModelsUsageCommand(command))
    return runModelsUsage(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isConnectCommand(command))
    return runConnectCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (DESKTOP_WINDOW_COMMANDS.some((entry) => entry.command === command))
    return runDesktopWindowCommand(rest, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (WINDOW_ZOOM_COMMANDS.some((entry) => entry.command === command))
    return runWindowZoomCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (ENGINE_COMMANDS.some((entry) => entry.command === command))
    return runEngineCommand(
      command,
      rest,
      values,
      () => connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
      () => io.readStdin?.() ?? Promise.resolve(''),
    );
  if (PRESENCE_COMMANDS.some((entry) => entry.command === command))
    return runPresenceCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (PHONE_ROUTE_COMMANDS.some((entry) => entry.command === command))
    return runPhoneRouteCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isDevicesCommand(command))
    return runDevicesCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'relationships') {
    const duration = timeoutMs(values.timeout);
    const expiresAt = Date.now() + duration;
    const signal = AbortSignal.timeout(duration);
    return runRelationshipCommand(
      rest,
      values,
      () => connectLiveHost(values, io, signal),
      signal,
      expiresAt,
    );
  }
  if (DEVICE_CLIENT_COMMANDS.some((entry) => entry.command === command))
    return runDeviceClientCommand(command, rest, values);
  if (command === 'cloud-work') {
    const input = await prepareCloudWork(rest, values, io);
    const host = await connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout)));
    return host.rpc('cloudWork', input);
  }
  if (command === 'cloud') {
    const input = await prepareCloud(rest, values, io);
    const host = await connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout)));
    return host.rpc('cloudConnections', { input });
  }
  if (MESSAGING_COMMANDS.some((entry) => entry.command === command)) {
    const operation = await prepareMessaging(command as MessagingCommand, rest, values, io);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runMessaging(operation, (await connectLiveHost(values, io, signal)).rpc);
  }
  if (isInboxCommand(command))
    return runInboxCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isScheduleCommand(command)) {
    const prepared = prepareScheduleCommand(command, rest, values);
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runScheduleCommand(prepared, (await connectLiveHost(values, io, signal)).rpc);
  }
  if (isBrowserComputerCommand(command))
    return runBrowserComputerCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (APPEARANCE_COMMANDS.some((entry) => entry.command === command))
    return runAppearanceCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isProfileCommand(command))
    return runProfileCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isVoiceCommand(command))
    return runVoiceCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isCallCommand(command))
    return runCallCommand(command, rest, values, async () => {
      const signal = AbortSignal.timeout(
        values.timeout === undefined && command === 'call-simulate'
          ? 600_000
          : timeoutMs(values.timeout),
      );
      const { http, rpc } = await connectLiveHost(values, io, signal);
      return {
        async post(body) {
          const { bytes } = await http(VOICE_CALL_PATH, body);
          let parsed: Record<string, unknown>;
          try {
            parsed = record(JSON.parse(new TextDecoder().decode(bytes)));
          } catch {
            throw new CliLiveError(
              'host-protocol-error',
              'The Host returned no JSON for the call.',
            );
          }
          if (typeof parsed['ok'] !== 'boolean')
            throw new CliLiveError('host-protocol-error', 'The Host returned no call result.');
          return parsed as unknown as VoiceCallResult;
        },
        text: async (input) => record(await rpc('channelSend', input)),
      };
    });
  if (isCallTimelineCommand(command))
    return runCallTimelineCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isApprovalReviewerCommand(command))
    return runApprovalReviewerCommand(command, rest, values, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isSkillCommand(command))
    return runSkillCommand(command, rest, values as SkillValues, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isStorageCommand(command))
    return runStorageCommand(command, rest, values as StorageValues, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isIdleCompactionCommand(command))
    return runIdleCompactionCommand(command, rest, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isBotModeCommand(command))
    return runBotModeCommand(
      command,
      rest,
      async () => {
        const signal = AbortSignal.timeout(timeoutMs(values.timeout));
        return (await connectLiveHost(values, io, signal)).rpc;
      },
      values.id === undefined ? {} : { id: values.id },
    );
  if (isPromptPresetCommand(command))
    return runPromptPresetCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isApprovalTemplateCommand(command))
    return runApprovalTemplateCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isTodoCommand(command))
    return runTodoCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (isTakeoverCommand(command))
    return runTakeoverCommand(command, rest, values, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'tob-cli')
    return runTobCli(rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (BOT_TOOL_COMMANDS.some((entry) => entry.command === command))
    return runBotToolCommand(
      command as (typeof BOT_TOOL_COMMANDS)[number]['command'],
      rest,
      values,
      io,
      () => connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'bot-trace' || command === 'bot-turn-input') {
    if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one bot id.`);
    const turns = values.turns === undefined ? undefined : Number(values.turns);
    if (turns !== undefined && (!Number.isInteger(turns) || turns < 1 || turns > 20))
      usage('--turns must be an integer from 1 to 20.');
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    if (command === 'bot-turn-input' && values.session === 'direct')
      usage('bot-turn-input reads a model Session, not direct tool calls.');
    return (await connectLiveHost(values, io, signal)).rpc(
      command === 'bot-trace' ? 'botToolTrace' : 'botTurnInput',
      {
        slug: rest[0].trim(),
        ...(values.session === undefined ? {} : { sessionId: values.session }),
        ...(turns === undefined ? {} : { turns }),
      },
    );
  }
  if (isChannelCommand(command))
    return runChannelCommand(command, rest, values, io, connectLiveHost);
  if (isShareDraftCommand(command))
    return runShareDraftCommand(command, rest, values, io, async () => {
      const signal = AbortSignal.timeout(timeoutMs(values.timeout));
      return (await connectLiveHost(values, io, signal)).rpc;
    });
  if (isHostAdminCommand(command)) {
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    return runHostAdminCommand(command, rest, values, io, {
      connect: async () => (await connectLiveHost(values, io, signal)).rpc,
      signal,
    });
  }
  if (DEVICE_COMMANDS.some((entry) => entry === command))
    return runDeviceCommand(command as (typeof DEVICE_COMMANDS)[number], rest, values, io);
  if (command === 'folder-browse') {
    if (rest.length > 1) usage('folder-browse takes at most one folder path.');
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    const path = rest[0]?.trim();
    const offset = values.offset === undefined ? undefined : Number(values.offset);
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000))
      usage('--offset must be an integer from 0 to 1000000.');
    return (await connectLiveHost(values, io, signal)).rpc('folderBrowse', {
      ...(path ? { path } : {}),
      ...(offset === undefined ? {} : { offset }),
    });
  }
  if (GENUI_COMMANDS.some((entry) => entry.command === command))
    return runGenuiCommand(command, rest, values, io, () =>
      connectLiveHost(values, io, AbortSignal.timeout(timeoutMs(values.timeout))),
    );
  if (command === 'grants') {
    if (rest.length !== 1 || !rest[0]?.trim()) usage('grants needs exactly one bot id.');
    const signal = AbortSignal.timeout(timeoutMs(values.timeout));
    const { rpc } = await connectLiveHost(values, io, signal);
    return readWorkspaceGrants(
      { call: (method, args = {}) => rpc(method, args) },
      { slug: rest[0].trim() },
    );
  }
  if (IM_CONTROL_COMMANDS.some((entry) => entry === command))
    return runImControlCommand(command as (typeof IM_CONTROL_COMMANDS)[number], rest, values, io);
  if (CONTROL_COMMANDS.some((entry) => entry === command))
    return runControlCommand(command as (typeof CONTROL_COMMANDS)[number], rest, values, io);
  const noTarget = command === 'release-info' || command === 'workspace-options';
  if (rest.length !== (noTarget ? 0 : 1))
    usage(
      `${command} ${noTarget ? 'takes no positional arguments' : 'needs exactly one target id'}.`,
    );
  const target = rest[0]?.trim() ?? '';
  if (!noTarget && !target) usage(`${command} requires a nonempty target id.`);
  const messageId = values['message-id'];
  if (
    [
      'send-status',
      'tool-approval-status',
      'tool-approval-decide',
      'user-question-status',
      'user-question-answer',
      'ask-secret-status',
      'ask-secret-submit',
      'ask-secret-cancel',
      'ask-secret-account-status',
      'ask-secret-replace',
      'ask-secret-revoke',
    ].includes(command) &&
    !messageId?.trim()
  )
    usage('--message-id is required.');
  let body: string | undefined;
  let skillTokens: ReturnType<typeof skillInvocationTokens> = [];
  let quotes: ChannelQuote[] = [];
  let answer: unknown;
  let confidential: Record<string, string> | undefined;
  if (command === 'ask-secret-submit') {
    if (!values['values-stdin']) usage('ask-secret-submit requires --values-stdin.');
    try {
      const input = await (io.readStdin?.() ?? Promise.resolve(''));
      if (input.length > 140_000) throw new Error('Private input exceeds the limit');
      const parsed: unknown = JSON.parse(input);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('Invalid private input');
      const entries = Object.entries(parsed);
      if (
        entries.length < 1 ||
        entries.length > 8 ||
        entries.some(
          ([key, value]) =>
            !PRIVATE_FIELD_ID.test(key) || typeof value !== 'string' || value.length > 16_384,
        )
      )
        throw new Error('Invalid private fields');
      confidential = Object.fromEntries(entries);
    } catch {
      usage('Private input stdin must be a JSON object with 1–8 declared string fields.');
    }
  }
  if (command === 'send') {
    if ((values.body !== undefined) === (values['body-stdin'] === true))
      usage('send requires exactly one of --body or --body-stdin.');
    body = values['body-stdin'] ? await (io.readStdin?.() ?? Promise.resolve('')) : values.body;
    if (!body?.trim()) usage('send requires a nonempty message.');
    if (
      messageId !== undefined &&
      !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(messageId)
    )
      usage('--message-id must be human- followed by a UUID.');
    if (values['reply-to'] !== undefined && !values['reply-to'].trim())
      usage('--reply-to needs a message id.');
    const notes = values['quote-note'] ?? [];
    if (notes.length > (values.quote?.length ?? 0))
      usage('--quote-note pairs with the --quote at the same position.');
    const parsedQuotes = parseQuotesInput(
      values.quote?.map((value, index) => ({
        ...cliQuote(value),
        ...(notes[index] ? { note: notes[index] } : {}),
      })),
    );
    if (typeof parsedQuotes === 'string') usage(`--quote: ${parsedQuotes}.`);
    quotes = parsedQuotes as ChannelQuote[];
    skillTokens = skillInvocationTokens(body, values.skill);
  }
  if (
    command === 'tool-approval-decide' &&
    values.outcome !== 'allowed-once' &&
    values.outcome !== 'allowed-always-tool' &&
    values.outcome !== 'allowed-always-kind' &&
    values.outcome !== 'rejected'
  )
    usage('--outcome must be allowed-once, allowed-always-tool, allowed-always-kind or rejected.');
  if (command === 'user-question-answer') {
    if (!values['answer-stdin']) usage('user-question-answer requires --answer-stdin.');
    try {
      answer = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
    } catch {
      usage('Question answers must be valid JSON on stdin.');
    }
    const answers = record(answer)['answers'];
    if (
      !Array.isArray(answers) ||
      !answers.every((entry) => {
        const item = record(entry);
        return (
          typeof item['id'] === 'string' &&
          Array.isArray(item['selected']) &&
          item['selected'].every((choice) => typeof choice === 'string') &&
          (item['custom'] === undefined || typeof item['custom'] === 'string')
        );
      })
    )
      usage(
        'Answer JSON requires answers with id, selected string array and optional custom text.',
      );
  }
  if (command === 'grant-create' && !values.workspace?.trim()) usage('--workspace is required.');
  const duration = timeoutMs(values.timeout);
  const deadline = Date.now() + duration;
  const signal = AbortSignal.timeout(duration);
  const { rpc } = await connectLiveHost(values, io, signal);
  if (command.startsWith('ask-secret-')) {
    let refusal: unknown;
    try {
      if (command === 'ask-secret-accounts') {
        const result = await rpc<{
          status?: unknown;
          accounts?: unknown;
          replaceable?: unknown;
        }>('privateAccounts', {
          slug: target,
        });
        if (
          (result.status !== 'ready' && result.status !== 'unavailable') ||
          !Array.isArray(result.accounts)
        )
          throw new Error('Invalid private accounts');
        const optional = (value: unknown) => (typeof value === 'string' ? value : undefined);
        const accounts = result.accounts.map((entry: unknown) => {
          const row = record(entry);
          const status = row['status'];
          if (
            typeof row['account'] !== 'string' ||
            (status !== 'configured' && status !== 'replacing' && status !== 'unavailable') ||
            !Array.isArray(row['fields'])
          )
            throw new Error('Invalid private account');
          return {
            account: row['account'],
            purpose: optional(row['purpose']),
            fields: row['fields'].map((value: unknown) => {
              const field = record(value);
              if (
                typeof field['id'] !== 'string' ||
                typeof field['label'] !== 'string' ||
                typeof field['required'] !== 'boolean'
              )
                throw new Error('Invalid private field');
              return {
                id: field['id'],
                label: field['label'],
                required: field['required'],
              };
            }),
            status,
            configuredAt: optional(row['configuredAt']),
            channelId: optional(row['channelId']),
            messageId: optional(row['messageId']),
            replacementMessageId: optional(row['replacementMessageId']),
          };
        });
        return {
          status: result.status,
          accounts,
          ...(typeof result.replaceable === 'boolean' ? { replaceable: result.replaceable } : {}),
        };
      }
      if (command === 'ask-secret-status' || command === 'ask-secret-account-status') {
        const result = await rpc<{ status?: unknown }>(
          command === 'ask-secret-status' ? 'privateInputStatus' : 'privateAccountStatus',
          {
            channelId: target,
            messageId,
          },
        );
        const statuses =
          command === 'ask-secret-status'
            ? ['pending', 'configured', 'cancelled', 'expired']
            : ['configured', 'revoked', 'superseded', 'unavailable'];
        if (typeof result.status !== 'string' || !statuses.includes(result.status))
          throw new Error('Invalid private status');
        return { status: result.status };
      }
      if (command === 'ask-secret-replace') {
        const result = await rpc<{ messageId?: unknown }>('privateInputReplace', {
          channelId: target,
          messageId,
        });
        if (
          typeof result.messageId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(result.messageId)
        )
          throw new Error('Invalid replacement card');
        return { messageId: result.messageId };
      }
      if (command === 'ask-secret-revoke') {
        const result = await rpc<{
          accepted?: unknown;
          stopped?: unknown;
          completed?: unknown;
          uncertain?: unknown;
        }>('privateAccountRevoke', { channelId: target, messageId });
        if (
          result.accepted !== true ||
          [result.stopped, result.completed, result.uncertain].some(
            (count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0,
          )
        )
          throw new Error('Invalid revocation result');
        return {
          accepted: true,
          stopped: result.stopped,
          completed: result.completed,
          uncertain: result.uncertain,
        };
      }
      const method = command === 'ask-secret-submit' ? 'privateInputSubmit' : 'privateInputCancel';
      const result = await rpc<{ accepted?: unknown; reason?: unknown }>(method, {
        channelId: target,
        messageId,
        ...(confidential === undefined ? {} : { values: confidential }),
      });
      if (result.accepted !== true) refusal = result.reason;
      else return { accepted: true };
    } catch {
      refusal = undefined;
    } finally {
      if (confidential !== undefined)
        for (const key of Object.keys(confidential)) delete confidential[key];
    }
    throw new CliLiveError(
      'private-input-not-accepted',
      'Private input operation was not accepted' +
        (typeof refusal === 'string' && /^[a-z-]{1,40}$/.test(refusal)
          ? ` (reason: ${refusal})`
          : '') +
        '. Check Owner authentication and request status before retrying.',
    );
  }
  if (command === 'send') {
    const channelId = await resolveBotDm(rpc, target);
    const receipt = {
      channelId,
      messageId: messageId ?? `human-${randomUUID()}`,
    };
    let sent: unknown;
    try {
      sent = await rpc('channelSend', {
        channelId,
        body,
        messageId: receipt.messageId,
        ...(values['reply-to'] === undefined ? {} : { replyTo: values['reply-to'].trim() }),
        ...(quotes.length === 0 ? {} : { quotes }),
        ...(skillTokens.length === 0 ? {} : { skillInvocations: skillTokens }),
      });
      while (Date.now() < deadline) {
        const status = await rpc<{ state: string; replies: unknown[] }>(
          'channelSendStatus',
          receipt,
        );
        if (!status || !Array.isArray(status.replies) || typeof status.state !== 'string')
          throw new CliLiveError(
            'host-protocol-error',
            'The Host returned an invalid send status.',
          );
        if (status.state === 'handled' && status.replies.length > 0)
          return { receipt, ...record(sent), ...status };
        if (status.state === 'handled' || status.state === 'needs-repair')
          throw new CliLiveError(
            status.state === 'handled' ? 'reply-not-produced' : 'send-needs-repair',
            'The Host has no committed Bot reply for this request.',
            receipt,
          );
        await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
      }
    } catch (error) {
      if (error instanceof CliLiveError) throw new CliLiveError(error.code, error.message, receipt);
      throw new CliLiveError(
        'reply-timeout',
        'The command deadline elapsed; inspect send-status with this receipt before retrying.',
        receipt,
      );
    }
    throw new CliLiveError(
      'reply-timeout',
      'No reply before the deadline; inspect send-status with this receipt before retrying.',
      receipt,
    );
  }
  if (command === 'send-status')
    return rpc('channelSendStatus', {
      channelId: await resolveBotDm(rpc, target),
      messageId,
    });
  if (command === 'channel-messages') {
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200))
      usage('--limit must be 1–200.');
    const result = await rpc<{ messages: ChannelMessage[]; revision: number }>('channelMessages', {
      channelId: target,
      ...(limit === undefined ? {} : { limit }),
      ...(values.before === undefined ? {} : { before: values.before }),
    });
    return {
      ...result,
      messages: result.messages.map((message) => {
        const effects = message.toolApprovalRequest?.effects;
        return effects === undefined
          ? message
          : {
              ...message,
              effectLabels: {
                en: toolEffectLabels(effects, 'en'),
                zh: toolEffectLabels(effects, 'zh'),
              },
            };
      }),
    };
  }
  const reader = { call: (method: string, args = {}) => rpc(method, args) };
  if (command === 'tool-approval-status') return readToolApprovalStatus(reader, target, messageId!);
  if (command === 'tool-approval-decide')
    return decideToolApproval(
      reader,
      target,
      messageId!,
      values.outcome as Parameters<typeof decideToolApproval>[3],
    );
  if (command === 'user-question-status') return readUserQuestionStatus(reader, target, messageId!);
  if (command === 'user-question-answer')
    return answerUserQuestion(reader, target, messageId!, answer as QuestionAnswer);
  if (command === 'workspace-options') return rpc('workspaceOptions', {});
  if (command === 'grant-create')
    return createGrant(reader, { slug: target, workspaceId: values.workspace! });
  return rpc('releaseInfo', values.since === undefined ? {} : { since: values.since });
}
