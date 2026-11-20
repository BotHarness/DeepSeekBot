import { AsyncLocalStorage } from 'node:async_hooks';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ResolvedToolSet, ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools';
import { tobCliCommandSchema, type TobCliCommand } from './cli-request.js';
import { TobError } from './service.js';

interface Registration {
  definition: ToolDefinition;
  captureAuthority(): () => void;
}
interface Invocation {
  agent: Agent;
  callId: ToolCallId;
  command: TobCliCommand;
  toolSet: ResolvedToolSet;
  signal: AbortSignal;
  requireCurrentTurn(): void;
}
interface Lease extends Invocation {
  registration: Registration;
  authorize(): void;
  nativeTurn: number;
  active: boolean;
  token: ToolExecution['token'] | undefined;
}
export class ModelFreeTobCliInvocation {
  readonly #registrations = new WeakMap<Agent, Registration>();
  readonly #invocation = new AsyncLocalStorage<Lease>();
  readonly #active = new WeakMap<Agent, Lease>();

  register(
    agent: Agent,
    definition: ToolDefinition,
    captureAuthority: () => () => void,
  ): () => void {
    const registration = { definition, captureAuthority };
    this.#registrations.set(agent, registration);
    return () => {
      if (this.#registrations.get(agent) === registration) this.#registrations.delete(agent);
    };
  }

  async run<T>(input: Invocation, execute: () => Promise<T>): Promise<T> {
    const registration = this.#registrations.get(input.agent);
    const nativeTurn = this.#nativeTurn(input.agent);
    if (
      !registration ||
      nativeTurn === null ||
      this.#active.has(input.agent) ||
      this.#invocation.getStore()?.active
    )
      throw new TobError('tob-authority-required');
    const lease: Lease = {
      ...input,
      command: { argv: [...input.command.argv], stdin: input.command.stdin },
      registration,
      authorize: registration.captureAuthority(),
      nativeTurn,
      active: true,
      token: undefined,
    };
    this.#active.set(input.agent, lease);
    try {
      this.#validate(lease);
      return await this.#invocation.run(lease, execute);
    } finally {
      lease.active = false;
      this.#active.delete(input.agent);
    }
  }
  delegate(execution: ToolExecution): 'unrelated' | 'delegated' | 'refused' {
    if (execution.name !== 'deepseekbot_cli') return 'unrelated';
    const active = this.#invocation.getStore();
    const owned = active !== undefined && execution.callId === active.callId;
    if (!owned) {
      const registration = execution.agent && this.#registrations.get(execution.agent);
      if (registration === undefined) return 'unrelated';
      if (!execution.agent || !execution.toolSet) return 'refused';
      try {
        const definition = execution.toolSet.view(execution.agent).get(execution.name);
        if (definition === undefined) return 'refused';
        if (definition !== registration.definition) return 'unrelated';
      } catch {
        return 'refused';
      }
    }
    try {
      const lease = this.#matching(execution);
      if (lease.token !== undefined && lease.token !== execution.token) return 'refused';
      lease.token = execution.token;
      return 'delegated';
    } catch {
      return 'refused';
    }
  }

  require(execution: ToolExecution): void {
    const lease = this.#matching(execution);
    if (lease.token !== execution.token) throw new TobError('tob-authority-required');
  }

  guard(execution: ToolExecution): string | undefined {
    const lease = this.#invocation.getStore();
    if (lease?.token !== execution.token) return undefined;
    try {
      this.require(execution);
      return undefined;
    } catch {
      return 'The owned CLI invocation authority changed before execution';
    }
  }

  #matching(execution: ToolExecution): Lease {
    const lease = this.#invocation.getStore();
    if (
      !lease ||
      execution.agent !== lease.agent ||
      execution.name !== 'deepseekbot_cli' ||
      execution.callId !== lease.callId ||
      execution.rootCallId !== lease.callId ||
      execution.parent !== undefined ||
      execution.schema !== undefined ||
      execution.toolSet !== lease.toolSet ||
      execution.signal !== lease.signal
    )
      throw new TobError('tob-authority-required');
    const parsed = tobCliCommandSchema.safeParse(execution.arguments);
    if (
      !parsed.success ||
      parsed.data.stdin !== lease.command.stdin ||
      parsed.data.argv.length !== lease.command.argv.length ||
      parsed.data.argv.some((value, index) => value !== lease.command.argv[index])
    )
      throw new TobError('tob-authority-required');
    this.#validate(lease);
    return lease;
  }

  #nativeTurn(agent: Agent): number | null {
    const agents = agent.ctx.get('agents');
    if (typeof agents?.turnBoundaryOf !== 'function') throw new TobError('tob-authority-required');
    return agents.turnBoundaryOf(agent.session).openTurnStartSeq;
  }

  #validate(lease: Lease): void {
    lease.signal.throwIfAborted();
    if (
      !lease.active ||
      this.#active.get(lease.agent) !== lease ||
      this.#registrations.get(lease.agent) !== lease.registration ||
      this.#nativeTurn(lease.agent) !== lease.nativeTurn ||
      lease.toolSet.view(lease.agent).get('deepseekbot_cli') !== lease.registration.definition
    )
      throw new TobError('tob-authority-required');
    lease.requireCurrentTurn();
    lease.authorize();
  }
}
