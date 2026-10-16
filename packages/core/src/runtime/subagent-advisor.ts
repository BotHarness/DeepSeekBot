import type { AgentOptions } from '@deepseek-ai/dsh-agent';

import type { SubagentDispatchAdvisor } from '../channels/subagent-dispatch.js';
import {
  assignmentModelsOf,
  selectAssignmentRoute,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import {
  resolveSubagentRoute,
  type SubagentModelRequest,
  type SubagentRouteDecision,
} from '../models/subagent-route.js';

export type SubagentAdvisorResolver = () => Promise<{ enabled: boolean; key?: string } | undefined>;

export async function adviseSubagentRoute(
  resolvePlan: () => PersonaBotModelPlan | undefined,
  parent: AgentOptions,
  request: SubagentModelRequest & { description: string; prompt: string },
  signal: AbortSignal,
  resolveAdvisor?: SubagentAdvisorResolver,
): Promise<SubagentRouteDecision & { advisor?: SubagentDispatchAdvisor }> {
  const plan = resolvePlan();
  let advisor: SubagentDispatchAdvisor | undefined;
  if (
    request.model === undefined &&
    request.provider === undefined &&
    request.reasoning_effort === undefined &&
    plan !== undefined &&
    resolveAdvisor !== undefined
  ) {
    const offered = assignmentModelsOf(plan).flatMap((option) =>
      option.allowedEfforts.map((effort) => ({
        route: { provider: option.provider, model: option.model, reasoningEffort: effort },
        description: `${option.model} effort ${effort || 'provider default'}: ${option.note ?? option.model}`,
      })),
    );
    if (offered.length >= 2) {
      try {
        const settings = await resolveAdvisor();
        if (settings?.enabled) {
          advisor = 'unavailable';
          if (settings.key !== undefined) {
            const response = await fetch('https://opencode.ai/inference/v1/systemone', {
              method: 'POST',
              redirect: 'error',
              headers: {
                Authorization: `Bearer ${settings.key}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
              body: JSON.stringify({
                model: 'jev-1.13-free',
                state: JSON.stringify({
                  task: `${request.description}\n${request.prompt}`,
                  trigger: 'selection',
                  history: [],
                }),
                questions: {
                  route: {
                    type: 'choice',
                    instructions:
                      'Which offered subagent route best fits this task? Prefer the cheapest route that can do it well.',
                    criteria: Object.fromEntries(
                      offered.map((entry, index) => [String(index), entry.description]),
                    ),
                  },
                },
              }),
            });
            if (response.ok) {
              const payload = (await response.json()) as {
                answers?: { route?: { choice?: unknown } };
              };
              const choice = payload?.answers?.route?.choice;
              const selected = offered.find((_, index) => String(index) === choice);
              const current = resolvePlan();
              if (selected !== undefined && current !== undefined) {
                const route = selectAssignmentRoute(current, selected.route);
                return {
                  route,
                  advisor: route,
                };
              }
            }
          }
        }
      } catch {
        advisor = 'unavailable';
      }
    }
  }
  return {
    ...resolveSubagentRoute(resolvePlan(), parent, request),
    ...(advisor === undefined ? {} : { advisor }),
  };
}
