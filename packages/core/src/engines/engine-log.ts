import { randomUUID } from 'node:crypto';

import {
  type ContentBlock,
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
import { type ApprovalOutcome, ApprovalRequestId } from '@deepseek-ai/dsh-user-approval';

import type { EngineEvent, EngineId, EngineTurnEnd } from './engine-session.js';

type AssistantBlock = Extract<ContentBlock, { type: 'text' | 'reasoning' | 'tool-call' }>;

export interface EngineLogTarget {
  session: Session;
  flush(): Promise<unknown>;
}

export function nextTurnNumber(events: readonly SessionEvent[]): number {
  let last = 0;
  for (const event of events)
    if (event.type === 'turn/start') last = Math.max(last, event.data.turn);
  return last + 1;
}

export class EngineTurnLog {
  readonly #target: EngineLogTarget;
  readonly #source: { provider: string; model: string };
  readonly #turn: number;
  #step = 1;
  #stepHasResults = false;
  #pending: AssistantBlock[] = [];
  readonly #open = new Set<string>();
  readonly #approvals = new Set<string>();
  #ended = false;

  constructor(target: EngineLogTarget, engine: EngineId, account: string, input: string) {
    this.#target = target;
    this.#source = { provider: engine, model: account };
    this.#turn = nextTurnNumber(target.session.snapshotEvents());
    const session = target.session;
    session.append('turn/start', { turn: this.#turn });
    session.append('step/start', { turn: this.#turn, step: this.#step });
    session.append(
      'user/message',
      createUserMessage({ content: [{ type: 'text', text: input }], source: { kind: 'user' } }),
      { surfaceOp: 'append' },
    );
  }

  get turn(): number {
    return this.#turn;
  }

  accept(event: EngineEvent): void {
    if (this.#ended) return;
    switch (event.kind) {
      case 'reasoning':
      case 'text':
        this.#continueStep();
        this.#pending.push(
          event.kind === 'text'
            ? { type: 'text', text: event.text }
            : { type: 'reasoning', text: event.text },
        );
        return;
      case 'tool-call': {
        this.#continueStep();
        const id = ToolCallId(event.callId);
        this.#assistant([
          ...this.#pending,
          { type: 'tool-call', id, name: event.name, arguments: event.arguments },
        ]);
        this.#pending = [];
        this.#target.session.append('tool/call', {
          turn: this.#turn,
          step: this.#step,
          callId: id,
          name: event.name,
          arguments: event.arguments,
        });
        this.#open.add(event.callId);
        return;
      }
      case 'tool-result':
        if (!this.#open.delete(event.callId)) return;
        this.#result(event.callId, event.text, event.isError);
        return;
      case 'approval':
      case 'rate-limit':
        return;
      default: {
        const unhandled: never = event;
        return unhandled;
      }
    }
  }

  approvalAsked(request: { toolName: string; callId?: string; reason?: string }): string {
    const id = ApprovalRequestId(randomUUID());
    if (this.#ended) return id;
    this.#approvals.add(id);
    this.#target.session.append('approval/asked', {
      id,
      toolName: request.toolName,
      ...(request.callId === undefined ? {} : { callId: ToolCallId(request.callId) }),
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    });
    return id;
  }

  approvalDecided(id: string, outcome: ApprovalOutcome): void {
    if (this.#ended || !this.#approvals.delete(id)) return;
    this.#target.session.append('approval/decided', { id: ApprovalRequestId(id), outcome });
  }

  async end(end: EngineTurnEnd): Promise<void> {
    for (const id of [...this.#approvals]) this.approvalDecided(id, 'cancelled');
    this.#ended = true;
    if (this.#pending.length) this.#assistant(this.#pending);
    this.#pending = [];
    for (const callId of this.#open)
      this.#result(callId, 'The engine turn ended before this tool finished.', true);
    this.#open.clear();
    const session = this.#target.session;
    session.append('step/end', { turn: this.#turn, step: this.#step });
    session.append('turn/end', {
      turn: this.#turn,
      reason:
        end.status === 'completed'
          ? { kind: 'completed' }
          : end.status === 'interrupted'
            ? { kind: 'aborted', reason: { kind: 'user' } }
            : { kind: 'error', error: { message: end.message, code: 'engine-failed' } },
    });
    await this.#target.flush().catch((error: unknown) => {
      throw new Error('Writing the engine turn to the DSH Session failed', { cause: error });
    });
  }

  #continueStep(): void {
    if (!this.#stepHasResults || this.#open.size > 0) return;
    const session = this.#target.session;
    session.append('step/end', { turn: this.#turn, step: this.#step });
    this.#step += 1;
    this.#stepHasResults = false;
    session.append('step/start', { turn: this.#turn, step: this.#step });
  }

  #assistant(content: AssistantBlock[]): void {
    this.#target.session.append(
      'assistant/message',
      {
        turn: this.#turn,
        step: this.#step,
        message: createAssistantMessage({ content, source: this.#source }),
        stream: [],
      },
      { surfaceOp: 'append' },
    );
  }

  #result(callId: string, text: string, isError: boolean): void {
    this.#target.session.append(
      'tool/result',
      {
        turn: this.#turn,
        step: this.#step,
        message: createToolResultMessage({
          callId: ToolCallId(callId),
          content: [{ type: 'text', text }],
          isError,
        }),
      },
      { surfaceOp: 'append' },
    );
    this.#stepHasResults = true;
  }
}
