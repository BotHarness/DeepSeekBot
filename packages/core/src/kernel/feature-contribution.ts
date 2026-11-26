import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { RuntimeHost } from './runtime-host.js';

export type FeaturePromptSection =
  | { placement: 'role'; text: () => string }
  | { placement: 'system'; name: string; order: number; text: string | (() => string) };

export interface FeatureToolRegistrar {
  register(tool: ToolDefinition, placement?: 'after-channel-tools'): void;
  guard(refuse: (name: string) => string | undefined): void;
}

export interface FeatureContribution<BridgeContext = never, AgentContext = never> {
  readonly id: string;
  readonly bridgeMethods?: (
    context: BridgeContext,
  ) => Readonly<Record<string, (payload: unknown) => unknown>>;
  readonly rpc?: Readonly<Record<string, (...args: never[]) => unknown>>;
  readonly runtime?: (host: RuntimeHost) => void;
  readonly promptSections?: (context: AgentContext) => readonly FeaturePromptSection[];
  readonly tools?: (context: AgentContext, registrar: FeatureToolRegistrar) => void;
}
