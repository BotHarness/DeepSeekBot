import type { AgentOptions } from '@deepseek-ai/dsh-agent';

import { selectAssignmentRoute, type ModelRoute, type PersonaBotModelPlan } from './presets.js';

export interface SubagentModelRequest {
  provider?: string;
  model?: string;
  reasoning_effort?: string;
}

export interface SubagentRouteDecision {
  route: ModelRoute;
  notice?: string;
}

function routeFromParent(parent: AgentOptions): ModelRoute {
  if (parent.provider === undefined || parent.model === undefined) {
    throw new Error('The parent Agent has no effective provider/model route');
  }
  return {
    provider: parent.provider,
    model: parent.model,
    ...(parent.reasoningEffort === undefined ? {} : { reasoningEffort: parent.reasoningEffort }),
  };
}

function sameRoute(left: ModelRoute, right: ModelRoute): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    (left.reasoningEffort ?? '') === (right.reasoningEffort ?? '')
  );
}

export function resolveSubagentRoute(
  plan: PersonaBotModelPlan | undefined,
  parent: AgentOptions,
  request: SubagentModelRequest,
): SubagentRouteDecision {
  if ((request.provider === undefined) !== (request.model === undefined)) {
    throw new Error('Subagent provider and model must be specified together');
  }
  if (request.provider === '' || request.model === '' || request.reasoning_effort === '') {
    throw new Error('Subagent model selection fields must be non-empty');
  }
  const inherited = routeFromParent(parent);
  const explicit =
    request.provider !== undefined ||
    request.model !== undefined ||
    request.reasoning_effort !== undefined;
  if (plan?.assignmentDefault === undefined) {
    if (explicit) throw new Error('Apply a Model Preset before selecting a Subagent model');
    return { route: inherited };
  }
  if (explicit) {
    return {
      route: selectAssignmentRoute(plan, {
        provider: request.provider ?? inherited.provider,
        model: request.model ?? inherited.model,
        ...(request.reasoning_effort === undefined
          ? request.provider === undefined && inherited.reasoningEffort !== undefined
            ? { reasoningEffort: inherited.reasoningEffort }
            : {}
          : { reasoningEffort: request.reasoning_effort }),
      }),
    };
  }
  const allowed = (() => {
    try {
      return selectAssignmentRoute(plan, inherited);
    } catch {
      return undefined;
    }
  })();
  if (allowed !== undefined && sameRoute(allowed, inherited)) return { route: inherited };
  const fallback = selectAssignmentRoute(plan, plan.assignmentDefault);
  return {
    route: fallback,
    notice: `Parent route ${inherited.provider}/${inherited.model} is outside the current Assignment set; this Subagent uses the current Assignment default ${fallback.provider}/${fallback.model}${fallback.reasoningEffort === undefined ? '' : ` (${fallback.reasoningEffort})`}.`,
  };
}
