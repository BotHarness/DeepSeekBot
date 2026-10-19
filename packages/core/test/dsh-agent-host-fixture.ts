import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import { createAssistantMessage, type Message, type UserMessage } from '@deepseek-ai/dsh-llm';
import type { TurnEndReason } from '@deepseek-ai/dsh-session';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import type { DshAgentHost } from '../src/runtime/dsh-bot-agent-adapter.js';

export interface FakeSession {
  id: string;
  header: { cwd?: string; createdAt: number };
  seq: number;
  append(type: string, data: unknown): void;
  snapshotEvents(
    fromSeq?: number,
    toSeqExclusive?: number,
  ): readonly {
    type: string;
    seq: number;
    time: number;
    data: unknown;
  }[];
}

export interface FakeAgentHostHooks {
  assignmentTurnEnd?: TurnEndReason;
  onTurn?(session: FakeSession, tools: readonly ToolDefinition[]): Promise<void>;
  onAgentCreated?(agent: unknown): void;

  onSessionEvent?(
    session: FakeSession,
    event: { type: string; seq: number; time: number; data: unknown },
  ): void;
}

interface FakeScope {
  tools: ToolDefinition[];
  restrictions: Array<{ allow?: readonly string[]; deny?: readonly string[] }>;
  guards: Array<(execution: { name: string }) => string | undefined>;
  sections: Array<{ name: string; text: string }>;
  listeners: Map<string, (...args: unknown[]) => unknown>;
}

interface FakeEvent {
  type: string;
  seq: number;
  time: number;
  data: unknown;
}

export class FakeAgentHost implements DshAgentHost {
  readonly createOptions: CreateAgentOptions[] = [];
  readonly resumeOptions: ResumeAgentOptions[] = [];
  readonly disposed: string[] = [];
  readonly scopes = new Map<string, FakeScope>();
  readonly sessions: FakeSession[] = [];
  readonly received = new Map<string, UserMessage[]>();
  readonly steered = new Map<string, UserMessage[]>();
  readonly cancelled: Array<{ sessionId: string; reason: unknown }> = [];
  readonly #cwdBySession = new Map<string, string | undefined>();
  readonly #live = new Map<string, Agent>();

  get(id: string): Agent | undefined {
    return this.#live.get(String(id));
  }

  list(): Agent[] {
    return [...this.#live.values()];
  }

  async selectedModel(sessionId: string): Promise<unknown> {
    const scope = this.scopes.get(sessionId);
    const assemble = scope?.listeners.get('system-prompt/assemble');
    const request = scope?.listeners.get('agent/request');
    if (assemble === undefined || request === undefined) {
      throw new Error(`Model selection listeners unavailable for ${sessionId}`);
    }
    await assemble({}, {}, async () => ({ variables: {} }));
    return request({}, async () => ({ provider: 'test', model: 'test' }));
  }

  constructor(
    private readonly orchestratorTurnEnd: TurnEndReason = { kind: 'completed' },
    private readonly hooks: FakeAgentHostHooks = {},
  ) {}

  async create(options: CreateAgentOptions): Promise<AgentHandle> {
    this.createOptions.push(options);
    const sessionId = String(options.sessionId);
    this.#cwdBySession.set(sessionId, options.meta?.cwd);
    return this.#start(sessionId, options.meta?.cwd, options.setup);
  }

  async resume(options: ResumeAgentOptions): Promise<AgentHandle> {
    this.resumeOptions.push(options);
    const sessionId = String(options.resumeSessionId);
    return this.#start(sessionId, this.#cwdBySession.get(sessionId), options.setup);
  }

  async #start(
    sessionId: string,
    cwd: string | undefined,
    setup: CreateAgentOptions['setup'] | ResumeAgentOptions['setup'],
  ): Promise<AgentHandle> {
    const scope: FakeScope = {
      tools: [],
      restrictions: [],
      guards: [],
      sections: [],
      listeners: new Map(),
    };
    const messages: Message[] = [];
    const events: FakeEvent[] = [];
    const effects = new Set<() => void>();
    const session: FakeSession = {
      id: sessionId,
      header: {
        ...(cwd === undefined ? {} : { cwd }),
        createdAt: Date.parse('2026-09-21T00:00:00.000Z'),
      },
      get seq() {
        return events.length;
      },
      append: (type, data) =>
        this.#emit(session, events, {
          type,
          data,
          seq: events.length,
          time: session.header.createdAt,
        }),
      snapshotEvents: (fromSeq = 0, toSeqExclusive = events.length) =>
        events.slice(fromSeq, toSeqExclusive),
    };
    let pending = Promise.resolve();
    let turn = 0;
    const fakeAgent = {
      id: sessionId,
      session,
      followup: (message: UserMessage) => {
        const received = this.received.get(sessionId) ?? [];
        received.push(message);
        this.received.set(sessionId, received);
        messages.push(message);
        const currentTurn = ++turn;
        session.append('turn/start', { turn: currentTurn });
        const isOrchestrator = scope.tools.some((tool) => tool.name === 'create_assignment');
        const reason = isOrchestrator
          ? this.orchestratorTurnEnd
          : (this.hooks.assignmentTurnEnd ?? { kind: 'completed' as const });
        pending = (
          reason.kind === 'error'
            ? Promise.resolve()
            : this.hooks.onTurn === undefined
              ? this.#drive(scope, messages)
              : this.hooks.onTurn(session, scope.tools)
        ).then(() => {
          this.#emit(session, events, {
            type: 'turn/end',
            seq: events.length,
            time: session.header.createdAt,
            data: { turn: currentTurn, reason },
          });
        });
      },
      steer: (message: UserMessage) => {
        const steered = this.steered.get(sessionId) ?? [];
        steered.push(message);
        this.steered.set(sessionId, steered);
      },
      cancel: (reason: unknown) => {
        this.cancelled.push({ sessionId, reason });
      },
      whenIdle: () => pending,
    };
    const fakeContext = {
      get: (_name: string) => undefined,
      effect: (setup: () => () => void) => {
        const dispose = setup();
        effects.add(dispose);
        return () => {
          if (effects.delete(dispose)) dispose();
        };
      },
      on: (event: string, listener: (...args: unknown[]) => unknown) => {
        scope.listeners.set(event, listener);
        return () => void scope.listeners.delete(event);
      },
      tools: {
        schemas: (viewingAgent: unknown) =>
          viewingAgent === undefined
            ? []
            : [
                'read',
                'read_image',
                'write',
                'edit',
                'str_replace_editor',
                'glob',
                'grep',
                'bash',
              ].map((name) => ({ name })),
        presentAs: (_mode: 'native') => () => undefined,
        guard: (guard: (execution: { name: string }) => string | undefined) => {
          scope.guards.push(guard);
          return () => void scope.guards.splice(scope.guards.indexOf(guard), 1);
        },
        restrict: (filter: { allow?: readonly string[]; deny?: readonly string[] }) => {
          scope.restrictions.push(filter);
          return () => void scope.restrictions.splice(scope.restrictions.indexOf(filter), 1);
        },
        register: (tool: ToolDefinition) => {
          scope.tools.push(tool);
          return () => void scope.tools.splice(scope.tools.indexOf(tool), 1);
        },
      },
      systemPrompt: {
        section: (section: { name: string; text: string }) => {
          scope.sections.push(section);
          return () => void scope.sections.splice(scope.sections.indexOf(section), 1);
        },
      },
    };
    Object.assign(fakeAgent, { ctx: fakeContext });
    await setup?.(fakeContext as unknown as Context, fakeAgent as unknown as Agent);
    this.scopes.set(sessionId, scope);
    this.sessions.push(session);
    this.#live.set(sessionId, fakeAgent as unknown as Agent);
    this.hooks.onAgentCreated?.(fakeAgent);
    return {
      agent: fakeAgent as unknown as Agent,
      dispose: async () => {
        this.disposed.push(sessionId);
        this.#live.delete(sessionId);
        for (const dispose of effects) dispose();
        effects.clear();
      },
    };
  }

  #emit(session: FakeSession, events: FakeEvent[], event: FakeEvent): void {
    events.push(event);
    this.hooks.onSessionEvent?.(session, event);
  }

  async #drive(scope: FakeScope, messages: Message[]): Promise<void> {
    const createAssignment = scope.tools.find((tool) => tool.name === 'create_assignment');
    if (createAssignment !== undefined) {
      await createAssignment.execute(
        { purpose: '核对发布状态', grant_id: 'grant-1' },
        {} as ToolRunContext,
      );
      const channelSend = scope.tools.find((tool) => tool.name === 'channel_send');
      await channelSend?.execute({ body: '发布状态已经核对完成。' }, {} as ToolRunContext);
      messages.push(
        createAssistantMessage({
          content: [{ type: 'text', text: 'private Orchestrator final' }],
          source: { provider: 'test', model: 'test' },
        }),
      );
      return;
    }
    const report = scope.tools.find((tool) => tool.name === 'report_to_orchestrator');
    await report?.execute({ state: 'completed', summary: '发布状态正常' }, {} as ToolRunContext);
  }
}

export const FAKE_BOT: PersonaBotRecord = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  workspaces: [],
  createdAt: '2026-09-21T00:00:00.000Z',
};
