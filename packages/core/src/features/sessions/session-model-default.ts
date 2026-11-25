import {
  sessionModelChoice,
  type SessionModelChoice,
} from '@botharness/host-protocol/session-model';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import { DEFAULT_MODEL_PRESET_ID } from '../../models/presets.js';
import { sessionRouteChoice } from '../../runtime/session-model-choices.js';
import type { SessionRootRole } from '../../sessions/ownership.js';

type Bot = NonNullable<ReturnType<BridgeMethodsDeps['registry']['get']>>;

export function sessionDefaultChoice(
  deps: Pick<
    BridgeMethodsDeps,
    'defaultModel' | 'engineSelection' | 'modelCatalog' | 'modelPresets' | 'runtime'
  >,
  slug: string,
  bot: Bot,
  role: SessionRootRole,
  sessionId?: string,
): SessionModelChoice | null {
  const plan = bot.modelPlan;
  const defaultPreset = deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID);
  const assignmentOwnDefault =
    role === 'assignment' && defaultPreset?.assignmentFollowsMain !== true;
  const inheritsPreset =
    !(plan === undefined && bot.model !== undefined) &&
    (role === 'orchestrator' ? plan === undefined : plan?.assignmentDefault === undefined);
  const engine =
    deps.engineSelection?.store
      .selections()
      .find((entry) => entry.botSlug === slug && entry.role === role) ??
    (inheritsPreset
      ? assignmentOwnDefault
        ? defaultPreset?.assignmentEngine
        : defaultPreset?.orchestratorEngine
      : undefined);
  const inherited =
    defaultPreset === undefined
      ? undefined
      : {
          groupId: defaultPreset.orchestratorGroupId,
          effort: defaultPreset.orchestratorGroupEffort,
        };
  const assignment =
    role === 'assignment' && sessionId !== undefined
      ? deps.runtime?.getAssignment(slug, sessionId)
      : undefined;
  const group =
    role === 'assignment'
      ? (assignment?.modelGroupId ?? plan?.assignmentDefaultGroupId)
      : plan === undefined
        ? inherited?.groupId
        : plan.orchestratorGroupId;
  const groupEffort =
    role === 'orchestrator'
      ? plan === undefined
        ? inherited?.effort
        : plan.orchestratorGroupEffort
      : assignment?.modelGroupEffort;
  const route =
    (role === 'assignment'
      ? (assignment?.modelRoute ?? plan?.assignmentDefault)
      : plan?.orchestrator) ??
    (assignmentOwnDefault ? defaultPreset?.assignmentDefault : defaultPreset?.orchestrator) ??
    deps.defaultModel?.currentSelection() ??
    deps.modelCatalog?.defaultRoute?.();
  if (engine !== undefined)
    return (
      sessionModelChoice({ ...engine, kind: 'engine', model: engine.model ?? 'default' }) ?? null
    );
  if (group !== undefined)
    return {
      kind: 'group',
      id: group,
      ...(groupEffort === undefined ? {} : { effort: groupEffort }),
    };
  return route === undefined ? null : sessionRouteChoice(route);
}
