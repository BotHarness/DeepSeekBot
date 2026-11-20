import type {
  EngineId,
  EngineModelView,
  RoutingGroupEngineMember,
} from '@botharness/host-protocol/subscription-engine';

export {
  ENGINE_DEFINITIONS,
  ENGINE_IDS,
  isEngineId,
  type EngineId,
} from '@botharness/host-protocol/subscription-engine';

export type EngineAccount =
  | { kind: 'subscription'; engine: EngineId; plan: string }
  | { kind: 'metered'; engine: EngineId; detail: string }
  | { kind: 'signed-out'; engine: EngineId };

export interface EngineEffort {
  id: string;
  name: string;
}

export interface EngineModel extends EngineModelView {
  description?: string;
  resolvedModel?: string;
}

export function findEngineModel(models: readonly EngineModel[], id: string | undefined) {
  return id === undefined
    ? (models.find((entry) => entry.isDefault) ?? models[0])
    : (models.find((entry) => entry.id === id) ??
        models.find((entry) => entry.resolvedModel === id));
}

export interface EngineChoice {
  model?: string;
  effort?: string;
}

export function routingGroupEngineChoice(
  target: RoutingGroupEngineMember,
  sharedEffort: string | undefined,
  models: readonly EngineModel[],
): EngineChoice {
  const offered = findEngineModel(models, target.model);
  const inherited = offered?.efforts.find((effort) => effort.id === sharedEffort)?.id;
  const effort = target.reasoningEffort ?? inherited;
  return {
    ...(target.model === undefined ? {} : { model: target.model }),
    ...(effort === undefined ? {} : { effort }),
  };
}

export type EngineWorkspaceMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export function requireOfferedEngineChoice(
  engine: EngineId,
  choice: EngineChoice,
  models: readonly EngineModel[],
): void {
  if (choice.model === undefined && choice.effort === undefined) return;
  const picked = findEngineModel(models, choice.model);
  if (picked === undefined)
    throw new EngineRefusal(
      'unknown-model',
      `${choice.model ?? 'The default model'} is not offered by this ${engine} subscription. List them with deepseekbot engine models ${engine}`,
    );
  if (choice.effort !== undefined && !picked.efforts.some((option) => option.id === choice.effort))
    throw new EngineRefusal(
      'unknown-effort',
      picked.efforts.length === 0
        ? `${picked.id} takes no effort level`
        : `${picked.id} takes effort ${picked.efforts.map((option) => option.id).join(', ')}`,
    );
}

const EFFORT_NAMES: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

export function engineEffort(id: string): EngineEffort {
  return { id, name: EFFORT_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1) };
}

export type EngineEvent =
  | { kind: 'reasoning'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; callId: string; name: string; arguments: string }
  | { kind: 'tool-result'; callId: string; text: string; isError: boolean }
  | {
      kind: 'approval';
      approvalId: string;
      callId?: string;
      tool: string;
      summary: string;
      input: Record<string, unknown>;
    }
  | { kind: 'rate-limit'; usedPercent?: number; resetsAt?: number; limited: boolean };

export type EngineTurnEnd =
  | { status: 'completed' }
  | { status: 'interrupted' }
  | { status: 'failed'; message: string };

export type EngineApprovalDecision = 'accept' | 'decline';

export interface EngineGatewayEndpoint {
  url: string;
  token: string;
}

export interface EngineStartOptions {
  cwd: string;
  instructions: string;
  contextSeed?(): string | undefined;
  gateway: EngineGatewayEndpoint;
}

export interface EngineSendOptions {
  onEvent(event: EngineEvent): void;
  signal?: AbortSignal;
  verbatimInput?: boolean;
}

export interface EngineSession {
  readonly engine: EngineId;
  readonly ended: boolean;
  readonly model?: string | undefined;
  account(): Promise<EngineAccount>;
  start(resume?: string): Promise<string>;
  send(input: string, options: EngineSendOptions): Promise<EngineTurnEnd>;
  steer?(input: string): Promise<boolean>;
  answer(approvalId: string, decision: EngineApprovalDecision): void;
  models(): Promise<EngineModel[]>;
  close(): Promise<void>;
}

export interface EngineQuota {
  account?: string;
  usedPercent?: number;
  resetsAt?: string;
  limited: boolean;
  observedAt: string;
}

export class EngineLimitError extends Error {
  readonly code = 'ENGINE_LIMIT';
  constructor(
    readonly engine: EngineId,
    readonly account: string,
    readonly until: string,
    readonly inputRecorded = false,
  ) {
    super(`ENGINE_LIMIT: the ${engine} subscription (${account}) is used up until ${until}`);
    this.name = 'EngineLimitError';
  }

  get rests(): Array<{ provider: string; model: string; until: string; reason: 'quota' }> {
    return [{ provider: this.engine, model: this.account, until: this.until, reason: 'quota' }];
  }
}

export class EngineRefusal extends Error {
  constructor(
    readonly code:
      | 'engine-unavailable'
      | 'engine-not-installed'
      | 'engine-signed-out'
      | 'engine-not-subscription'
      | 'engine-thread-gone'
      | 'engine-failed'
      | 'unknown-model'
      | 'unknown-effort',
    message: string,
  ) {
    super(message);
    this.name = 'EngineRefusal';
  }
}

const PASSED_VARIABLES = new Set([
  'path',
  'pathext',
  'home',
  'user',
  'username',
  'logname',
  'shell',
  'lang',
  'language',
  'term',
  'tz',
  'tmpdir',
  'temp',
  'tmp',
  'systemroot',
  'systemdrive',
  'windir',
  'comspec',
  'userprofile',
  'appdata',
  'localappdata',
  'programdata',
  'programfiles',
  'programfiles(x86)',
  'homedrive',
  'homepath',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'ssl_cert_file',
  'ssl_cert_dir',
  'node_extra_ca_certs',
  '__cf_user_text_encoding',
]);

function passes(key: string): boolean {
  const name = key.toLowerCase();
  return PASSED_VARIABLES.has(name) || name.startsWith('lc_') || name.startsWith('xdg_');
}

export function engineEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  extra: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env))
    if (value !== undefined && passes(key)) out[key] = value;
  return { ...out, ...extra };
}
