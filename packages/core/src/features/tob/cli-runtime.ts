import { randomUUID } from 'node:crypto';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { dmChannelId } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { HumanContext } from '../../humans/context.js';
import { requireSourceEffects } from '../../purge/fence.js';
import type {
  BotRuntimeOptions,
  DmMessageAdmission,
  HandleDmMessageInput,
} from '../../runtime/bot-runtime.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import { botOwner } from '../../team/bot-access.js';
import { TeamError } from '../../team/error.js';
import type {
  TobCliOutput,
  TobCliRequest,
  TobCliStatus,
  TobCliTurn,
} from '../../tob/cli-request.js';
import { TobError, type TobService } from '../../tob/service.js';
import { DirectBotToolError, type ActiveDirectTool } from '../sessions/direct-tools.js';

export interface TobCliRequestLease {
  humanId: string;
  botSlug: string;
  controller: AbortController;
  status: TobCliStatus;
  finishedAt: number | undefined;
}

export interface TobCliAuthority {
  (): void;

  markSideEffect(): void;
}

interface TobCliPorts {
  activeDirectTools: ReadonlyMap<string, ActiveDirectTool>;
  admitDmMessage: (
    human: HumanContext,
    input: HandleDmMessageInput,
    tobCliTurn: TobCliTurn,
  ) => DmMessageAdmission;
  channels: ChannelStore;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  markAdmissionsSideEffect: (botSlug: string, sourceEventIds: string[]) => void;
  memberBotEnabled: (bot: PersonaBotRecord) => boolean;
  now: () => Date;
  ownership: SessionOwnership;
  registry: PersonaBotRegistry;
  requireExecution: BotRuntimeOptions['requireExecution'];
  tails: ReadonlyMap<string, Promise<unknown>>;
  tob: TobService | undefined;
  tobCliRequests: Map<string, TobCliRequestLease>;
  turnSources: ReadonlyMap<string, { sessionId: string; acceptedEventIds: ReadonlySet<string> }>;
}

export function createTobCliRuntime(ports: TobCliPorts) {
  async function tobCli(human: HumanContext, input: TobCliRequest): Promise<TobCliStatus> {
    if (ports.closed()) throw new TobError('runtime-closed');
    for (const [id, request] of ports.tobCliRequests) {
      if (request.finishedAt !== undefined && Date.now() - request.finishedAt > 10 * 60 * 1000)
        ports.tobCliRequests.delete(id);
    }
    if (input.action !== 'start') {
      const request = ports.tobCliRequests.get(input.id);
      if (!request || request.humanId !== human.humanId)
        throw new TobError('cli-request-unavailable');
      if (input.action === 'cancel' && request.status.state === 'running') {
        request.status = { ...request.status, cancelRequested: true };
        request.controller.abort();
      }
      return structuredClone(request.status);
    }
    if (!ports.tob) throw new TobError('tob-authority-required');
    await ports.tob.ensure(human);
    if (ports.closed()) throw new TobError('runtime-closed');
    const bot = ports.registry
      .list()
      .find(
        (candidate) => ports.tob?.isTob(candidate.slug) && botOwner(candidate) === human.humanId,
      );
    if (!bot || bot.paused || !ports.memberBotEnabled(bot))
      throw new TobError('tob-authority-required');
    if (
      ports.tails.has(bot.slug) ||
      [...ports.activeDirectTools.values()].some((call) => call.botSlug === bot.slug) ||
      [...ports.tobCliRequests.values()].some((request) => request.status.state === 'running')
    )
      throw new TobError('bot-busy');
    if (ports.tobCliRequests.size >= 16) {
      const completed = [...ports.tobCliRequests].find(
        ([, request]) => request.finishedAt !== undefined,
      );
      if (completed) ports.tobCliRequests.delete(completed[0]);
      else throw new TobError('bot-busy');
    }
    const channel = ports.channels.getOrCreateDm(human, bot.slug, bot.displayName);
    if (!channel) throw new TobError('human-dm-required');
    const channelId = channel.id;
    const id = randomUUID();
    const messageId = 'human-' + randomUUID();
    const controller = new AbortController();
    const request: TobCliRequestLease = {
      humanId: human.humanId,
      botSlug: bot.slug,
      controller,
      status: {
        id,
        channelId,
        messageId,
        state: 'running',
        cancelRequested: false,
      },
      finishedAt: undefined,
    };
    ports.tobCliRequests.set(id, request);
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    timer.unref?.();
    let result: TobCliOutput | undefined;
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      request.finishedAt = Date.now();
      request.status = controller.signal.aborted
        ? {
            id,
            channelId,
            messageId,
            state: 'cancelled',
            cancelRequested: true,
            code: 'operation-cancelled',
          }
        : error !== undefined || result === undefined
          ? {
              id,
              channelId,
              messageId,
              state: 'failed',
              cancelRequested: false,
              code:
                error instanceof TobError ||
                error instanceof DirectBotToolError ||
                error instanceof TeamError
                  ? error.code
                  : 'operation-failed',
            }
          : { id, channelId, messageId, state: 'completed', cancelRequested: false, result };
    };
    try {
      ports.requireExecution?.(bot.slug);
      const body = 'Run a typed CLI command without a model: ' + input.command.argv[0];
      const appended = await ports.channels.appendMessageOnce(human, channelId, {
        id: messageId,
        at: ports.now().toISOString(),
        author: { kind: 'human', humanId: human.humanId },
        tobCliRequestId: id,
        body,
      });
      if (appended.status !== 'appended') throw new TobError('human-dm-required');
      controller.signal.throwIfAborted();
      const admission = ports.admitDmMessage(
        human,
        { channelId, messageId, body },
        {
          command: { argv: [...input.command.argv], stdin: input.command.stdin },
          signal: controller.signal,
          complete: (output) => {
            result = output;
          },
        },
      );
      if (!admission.admitted) throw new TobError(admission.reason);
      void admission.settled.then(() => finish(), finish);
      return structuredClone(request.status);
    } catch (error) {
      finish(error);
      throw error;
    }
  }

  function captureTobCliAuthority(sessionId: string): TobCliAuthority {
    const owner = ports.ownership.resolve(sessionId);
    if (
      ports.closed() ||
      !ports.ownership.contentAvailable(sessionId) ||
      owner?.rootRole !== 'orchestrator' ||
      owner.parentSessionId !== undefined ||
      !ports.tob?.isTob(owner.botSlug)
    )
      throw new TobError('tob-authority-required');
    const turn = ports.turnSources.get(owner.botSlug);
    if (turn?.sessionId !== sessionId || turn.acceptedEventIds.size === 0)
      throw new TobError('human-dm-required');
    const accepted = new Set(turn.acceptedEventIds);
    const dm = dmChannelId(owner.botSlug);
    const authorize = () => {
      const currentOwner = ports.ownership.resolve(sessionId);
      if (
        ports.closed() ||
        !ports.ownership.contentAvailable(sessionId) ||
        currentOwner?.botSlug !== owner.botSlug ||
        currentOwner.rootRole !== 'orchestrator' ||
        currentOwner.parentSessionId !== undefined ||
        !ports.tob?.isTob(owner.botSlug)
      )
        throw new TobError('tob-authority-required');

      if (
        ports.turnSources.get(owner.botSlug) !== turn ||
        turn.acceptedEventIds.size !== accepted.size ||
        [...accepted].some((id) => !turn.acceptedEventIds.has(id))
      )
        throw new TobError('human-dm-required');
      ports.database.read((db) => {
        for (const id of accepted) {
          const event = db
            .prepare(
              'SELECT source_kind, channel_id, human_id FROM source_events WHERE source_event_id = ?',
            )
            .get(id);
          if (
            event?.source_kind !== 'human-message' ||
            event.channel_id !== dm ||
            (event.human_id ?? 'local-human') !== botOwner(ports.registry.get(owner.botSlug)!)
          )
            throw new TobError('human-dm-required');
          requireSourceEffects(db, id, owner.botSlug);
        }
      });
    };
    authorize();
    return Object.assign(authorize, {
      markSideEffect: () => {
        authorize();
        ports.markAdmissionsSideEffect(owner.botSlug, [...accepted]);
      },
    });
  }

  return { tobCli, captureTobCliAuthority };
}
