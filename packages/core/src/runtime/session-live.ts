import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { BlockAssembler } from '@deepseek-ai/dsh-llm';

import { toolTargets } from './session-transcript.js';

export type SessionLiveItem =
  | { kind: 'reasoning'; text: string; at: string }
  | { kind: 'reply'; text: string; at: string }
  | {
      kind: 'tool';
      id: string;
      tool: string;
      at: string;
      command?: string;
      path?: string;
      url?: string;
    };

export interface SessionLiveSnapshot {
  revision: number;
  seq: number;
  items: SessionLiveItem[];
}

export const LIVE_WAIT_MS = 12_000;
export const LIVE_FLUSH_MS = 60;
const LIVE_TEXT_CHARS = 8_000;

interface LiveAttempt {
  id: string;
  assembler: BlockAssembler;
  next: number;
  starts: Map<number, number>;
}

interface LiveSession {
  revision: number;
  seq: number;
  attempt: LiveAttempt | undefined;
  waiters: Set<() => void>;
  flush: ReturnType<typeof setTimeout> | undefined;
}

function iso(time: number): string {
  return new Date(Number.isSafeInteger(time) ? time : 0).toISOString();
}

function clipTail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= LIVE_TEXT_CHARS
    ? trimmed
    : `…${trimmed.slice(trimmed.length - LIVE_TEXT_CHARS + 1)}`;
}

function partialArgs(raw: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const key of ['command', 'cmd', 'file_path', 'path', 'filePath', 'url']) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 'u').exec(raw);
    if (match?.[1] === undefined) continue;
    try {
      found[key] = JSON.parse(`"${match[1].replace(/\\$/u, '')}"`) as string;
    } catch {}
  }
  return found;
}

export class SessionLiveStreams {
  readonly #sessions = new Map<string, LiveSession>();

  #session(sessionId: string): LiveSession {
    let session = this.#sessions.get(sessionId);
    if (session === undefined) {
      session = { revision: 0, seq: 0, attempt: undefined, waiters: new Set(), flush: undefined };
      this.#sessions.set(sessionId, session);
    }
    return session;
  }

  #changed(session: LiveSession): void {
    session.revision += 1;
    if (session.waiters.size === 0 || session.flush !== undefined) return;
    session.flush = setTimeout(() => {
      session.flush = undefined;
      const waiters = [...session.waiters];
      session.waiters.clear();
      for (const wake of waiters) wake();
    }, LIVE_FLUSH_MS);
  }

  accept(sessionId: string, frame: AssistantStreamFrame): void {
    const session = this.#session(sessionId);
    if (frame.type === 'start') {
      session.attempt = {
        id: frame.attemptId,
        assembler: new BlockAssembler(),
        next: 0,
        starts: new Map(),
      };
      this.#changed(session);
      return;
    }
    if (frame.type === 'end') {
      if (session.attempt?.id === frame.attemptId) session.attempt = undefined;
      if (frame.outcome.kind === 'committed')
        session.seq = Math.max(session.seq, Number(frame.outcome.seq));
      this.#changed(session);
      return;
    }
    let attempt = session.attempt;
    if (attempt?.id !== frame.attemptId) {
      attempt = {
        id: frame.attemptId,
        assembler: new BlockAssembler(),
        next: 0,
        starts: new Map(),
      };
      session.attempt = attempt;
    }
    if (frame.index !== attempt.next) {
      if (frame.index > attempt.next) session.attempt = undefined;
      this.#changed(session);
      return;
    }
    attempt.next += 1;
    const chunk = frame.chunk as { type: string; index?: number };
    if (chunk.type === 'block-start' && typeof chunk.index === 'number')
      attempt.starts.set(chunk.index, frame.time);
    try {
      attempt.assembler.push(frame.chunk);
    } catch {
      session.attempt = undefined;
    }
    this.#changed(session);
  }

  observe(sessionId: string, event: { type: string; seq?: number }): void {
    const session = this.#session(sessionId);
    if (typeof event.seq === 'number') session.seq = Math.max(session.seq, event.seq);
    if (event.type === 'turn/end') session.attempt = undefined;
    this.#changed(session);
  }

  forget(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return;
    if (session.flush !== undefined) clearTimeout(session.flush);
    for (const wake of session.waiters) wake();
    this.#sessions.delete(sessionId);
  }

  snapshot(sessionId: string): SessionLiveSnapshot {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return { revision: 0, seq: 0, items: [] };
    const attempt = session.attempt;
    const items: SessionLiveItem[] = [];
    if (attempt !== undefined) {
      let blocks: ReturnType<BlockAssembler['blocks']> = [];
      try {
        blocks = attempt.assembler.blocks();
      } catch {
        blocks = [];
      }
      blocks.forEach((block, index) => {
        const at = iso(attempt.starts.get(index) ?? Date.now());
        if (block.type === 'reasoning' || block.type === 'text') {
          const text = clipTail(block.text);
          if (text !== '')
            items.push({ kind: block.type === 'text' ? 'reply' : 'reasoning', text, at });
        } else if (block.type === 'tool-call' && block.name !== '') {
          items.push({
            kind: 'tool',
            id: block.id,
            tool: block.name,
            at,
            ...toolTargets(block.name, partialArgs(block.arguments)),
          });
        }
      });
    }
    return { revision: session.revision, seq: session.seq, items };
  }

  async wait(sessionId: string, after: number, timeoutMs = LIVE_WAIT_MS): Promise<void> {
    const session = this.#session(sessionId);
    if (session.revision !== after) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        session.waiters.delete(wake);
        resolve();
      }, timeoutMs);
      const wake = (): void => {
        clearTimeout(timer);
        resolve();
      };
      session.waiters.add(wake);
    });
  }
}
