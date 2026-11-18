export type EngineId = 'codex';

export const ENGINE_IDS: readonly EngineId[] = ['codex'];

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value);
}

export type EngineAccount =
  | { kind: 'subscription'; engine: EngineId; plan: string }
  | { kind: 'metered'; engine: EngineId; detail: string }
  | { kind: 'signed-out'; engine: EngineId };

export type EngineEvent =
  | { kind: 'reasoning'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; callId: string; name: string; arguments: string }
  | { kind: 'tool-result'; callId: string; text: string; isError: boolean }
  | { kind: 'approval'; approvalId: string; tool: string; summary: string }
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
  gateway: EngineGatewayEndpoint;
}

export interface EngineSendOptions {
  onEvent(event: EngineEvent): void;
  signal?: AbortSignal;
}

export interface EngineSession {
  readonly engine: EngineId;
  account(): Promise<EngineAccount>;
  start(resume?: string): Promise<string>;
  send(input: string, options: EngineSendOptions): Promise<EngineTurnEnd>;
  answer(approvalId: string, decision: EngineApprovalDecision): void;
  close(): Promise<void>;
}

export class EngineRefusal extends Error {
  constructor(
    readonly code:
      | 'engine-unavailable'
      | 'engine-not-installed'
      | 'engine-signed-out'
      | 'engine-not-subscription'
      | 'engine-failed',
    message: string,
  ) {
    super(message);
    this.name = 'EngineRefusal';
  }
}

const KEY_VARIABLE =
  /^(OPENAI_.*|CODEX_API_KEY|CODEX_ACCESS_TOKEN|CODEX_HOME|ANTHROPIC_.*|CLAUDE_CODE_.*|AZURE_OPENAI_.*|AWS_BEARER_TOKEN_BEDROCK|GEMINI_API_KEY|GOOGLE_API_KEY|DEEPSEEK_API_KEY)$/u;

export function engineEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  extra: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env))
    if (value !== undefined && !KEY_VARIABLE.test(key)) out[key] = value;
  return { ...out, ...extra };
}
