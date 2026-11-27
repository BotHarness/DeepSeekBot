import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { RuntimeHost } from './runtime-host.js';

export type FeaturePromptSlot =
  | 'inbox-coordination'
  | 'assignment-coordination'
  | 'reply-contract'
  | 'memory-working-tree'
  | 'memory-branch'
  | 'group-collaboration'
  | 'channel-files'
  | 'reply-delivery'
  | 'peer-review';

export type FeaturePromptSection =
  | { placement: 'role'; text: () => string }
  | {
      placement: 'slot';
      slot: FeaturePromptSlot;
      text: (renderSlot: (name: FeaturePromptSlot) => string) => string;
    }
  | {
      placement: 'system';
      name: string;
      order: number;
      text: string | (() => string);
      condition?: 'external-messaging-connected';
    };

export type FeatureToolPlacement =
  | 'before-assignment-tools'
  | 'create-assignment'
  | 'workspace-tools'
  | 'assignment-tools'
  | 'after-assignment-tools'
  | 'bridge'
  | 'before-inbox-tools'
  | 'inbox-tools'
  | 'after-inbox-tools'
  | 'before-source-attention-tools'
  | 'source-attention-tools'
  | 'after-channel-tools'
  | 'after-schedule-tools';

export interface FeatureToolRegistrar {
  register(tool: ToolDefinition, placement?: FeatureToolPlacement): void;
  guard(refuse: (name: string) => string | undefined): void;
}

export interface FeatureContribution<
  BridgeContext = never,
  AgentContext = never,
  HostHooks = never,
  AssignmentHooks = never,
> {
  readonly id: string;
  readonly bridgeMethods?: (
    context: BridgeContext,
  ) => Readonly<Record<string, (payload: unknown) => unknown>>;
  readonly rpc?: Readonly<Record<string, (...args: never[]) => unknown>>;
  readonly streams?: Readonly<Record<string, (...args: never[]) => AsyncIterable<unknown>>>;
  readonly runtime?: (host: RuntimeHost) => void;
  readonly runtimeServices?: Readonly<Record<string, unknown>>;
  readonly host?: HostHooks;
  readonly assignmentAgent?: AssignmentHooks;
  readonly promptSections?: (context: AgentContext) => readonly FeaturePromptSection[];
  readonly tools?: (context: AgentContext, registrar: FeatureToolRegistrar) => void;
}
