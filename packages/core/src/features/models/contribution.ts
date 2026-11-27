import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { ModelInvocationDeps } from './deps.js';
import {
  createEngineAccountBridge,
  createEngineSelectionBridge,
  createModelProviderBridge,
  createModelsBridgeMethods,
  type EngineAccountBridgeMethods,
  type EngineSelectionBridgeMethods,
  type ModelProviderBridgeMethods,
  type ModelsBridgeMethods,
} from './methods.js';
import {
  mountEngines,
  mountProviders,
  mountRetry,
  mountSubscriptionEngineRoute,
} from './plugin.js';
import { modelConfigurationRpc, modelsRpcMethods } from './rpc.js';
import { pickSessionGroup } from './runtime-session-group.js';
import { createListAssignmentModelsTool, type AssignmentModelToolOptions } from './tools.js';

export interface ModelsBridgeContext {
  human: HumanContext;
  deps: ModelInvocationDeps;
  globalRegistry: PersonaBotRegistry;
  isHostOwner(): boolean;
  requireOwnedBot(slug: string): void;
  modelRouting: Parameters<typeof createModelsBridgeMethods>[5];
}

type ModelsBridgeSurface = ModelsBridgeMethods &
  EngineAccountBridgeMethods &
  EngineSelectionBridgeMethods &
  ModelProviderBridgeMethods;

export interface ModelsAgentContext {
  assignmentModelTool?: AssignmentModelToolOptions;
}

function bridgeMethods({
  human,
  deps,
  globalRegistry,
  isHostOwner,
  requireOwnedBot,
  modelRouting,
}: ModelsBridgeContext): ModelsBridgeSurface {
  const { modelInheritance, modelSettings, modelPlan } = createModelsBridgeMethods(
    human,
    deps,
    globalRegistry,
    isHostOwner,
    requireOwnedBot,
    modelRouting,
  );
  return {
    ...createModelProviderBridge(human, deps),
    ...createEngineAccountBridge(human, deps),
    ...createEngineSelectionBridge(human, { ...deps, registry: globalRegistry }),
    ...modelInheritance,
    ...modelSettings,
    ...modelPlan,
  };
}

export function createModelsContribution() {
  return {
    id: 'models',
    bridgeMethods: (context) => ({ ...bridgeMethods(context) }),
    rpc: { ...modelsRpcMethods, ...modelConfigurationRpc },
    runtimeServices: { pickSessionGroup },
    tools: ({ assignmentModelTool }, { register }) => {
      if (assignmentModelTool !== undefined)
        register(createListAssignmentModelsTool(assignmentModelTool), 'before-assignment-tools');
    },
    host: {
      subscriptionEngines: mountEngines,
      modelProviders: mountProviders,
      modelRetry: mountRetry,
      subscriptionEngineRoute: mountSubscriptionEngineRoute,
    },
  } satisfies FeatureContribution<
    ModelsBridgeContext,
    ModelsAgentContext,
    {
      subscriptionEngines: typeof mountEngines;
      modelProviders: typeof mountProviders;
      modelRetry: typeof mountRetry;
      subscriptionEngineRoute: typeof mountSubscriptionEngineRoute;
    }
  >;
}
