import { createDirectTools } from './direct-tools.js';
import { createOrchestratorTurns } from './runtime-orchestrator-turns.js';
import { createOrchestratorSessions } from './runtime-orchestrator-sessions.js';
import {
  channelToolFeatures,
  createOrchestratorServices,
  voiceAdmissionNotes,
} from './runtime-orchestrator-services.js';
import { createTurnFailures } from './runtime-turn-failures.js';
import { createNativeOrchestratorStep } from './native-orchestrator-step.js';
import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { asObject, type BridgeResult } from '../../kernel/method-utils.js';
import { botInChannel } from '../channels/methods.js';
import type { ModelsBridgeContext } from '../models/contribution.js';
import type { SessionsBridgeDeps } from './bridge-deps.js';
import { createHostSessionsMethods } from './host-sessions.js';
import { createSessionsAdapterMethods, createSessionsBridgeMethods } from './methods.js';
import {
  createCompactionPolicy,
  mountContextOverflowRecovery,
  mountIdleCompaction,
  mountLifecycle,
  mountPreStep,
} from './plugin.js';
import {
  botSessionRpc,
  compactionSettingsRpc,
  sessionControlRpc,
  sessionDetailsRpc,
  sessionListRpc,
  sessionOwnerRpc,
  sessionsRpcMethods,
} from './rpc.js';
import { createSessionBotMethods } from './session-bot-methods.js';
import { sessionBotRpc } from './session-bot-rpc.js';

export interface SessionsBridgeContext {
  human: HumanContext;
  deps: SessionsBridgeDeps;
  globalRegistry: SessionsBridgeDeps['registry'];
  isHostOwner(): boolean;
  detailOf: Parameters<typeof createSessionBotMethods>[3];
  channelSend: Parameters<typeof createSessionBotMethods>[4];
  modelRouting: ModelsBridgeContext['modelRouting'];
}

export type SessionSendResult = BridgeResult<
  { sourceEventId: string; requestId?: never } | { requestId: string; sourceEventId?: never }
>;

function bridgeMethods({
  human,
  deps,
  globalRegistry,
  isHostOwner,
  detailOf,
  channelSend,
  modelRouting,
}: SessionsBridgeContext) {
  const sessions = createSessionsBridgeMethods(human, deps, botInChannel, modelRouting);
  const adapter = createSessionsAdapterMethods(human, deps);
  const { sessionTranscript, sessionModel, sessionSend, ...host } = createHostSessionsMethods(
    human,
    deps,
    globalRegistry,
    isHostOwner,
  );
  return {
    ...sessions,
    ...host,
    ...createSessionBotMethods(human, deps, isHostOwner, detailOf, channelSend),
    sessionTranscript: (payload: unknown) =>
      asObject(payload)['slug'] === null
        ? sessionTranscript(payload)
        : sessions.sessionTranscript(payload),
    sessionModel: (payload: unknown) =>
      asObject(payload)['slug'] === null ? sessionModel(payload) : sessions.sessionModel(payload),
    sessionMessageSend: (payload: unknown): Promise<SessionSendResult> =>
      asObject(payload)['botSlug'] === null
        ? sessionSend(payload)
        : adapter.sessionMessageSend(payload),
  };
}

export function createSessionsContribution() {
  return {
    id: 'sessions',
    runtimeServices: {
      createDirectTools,
      createOrchestratorTurns,
      createOrchestratorSessions,
      channelToolFeatures,
      createOrchestratorServices,
      voiceAdmissionNotes,
      createTurnFailures,
      createNativeOrchestratorStep,
    },
    bridgeMethods,
    rpc: {
      ...sessionsRpcMethods,
      ...botSessionRpc,
      ...sessionControlRpc,
      ...compactionSettingsRpc,
      ...sessionDetailsRpc,
      ...sessionListRpc,
      ...sessionOwnerRpc,
      ...sessionBotRpc,
    },
    host: {
      sessionCompactionPolicy: createCompactionPolicy,
      sessionPreStep: mountPreStep,
      sessionOverflowRecovery: mountContextOverflowRecovery,
      sessionIdleCompaction: mountIdleCompaction,
      sessionLifecycle: mountLifecycle,
    },
  } satisfies FeatureContribution<
    SessionsBridgeContext,
    never,
    {
      sessionCompactionPolicy: typeof createCompactionPolicy;
      sessionPreStep: typeof mountPreStep;
      sessionOverflowRecovery: typeof mountContextOverflowRecovery;
      sessionIdleCompaction: typeof mountIdleCompaction;
      sessionLifecycle: typeof mountLifecycle;
    }
  >;
}
