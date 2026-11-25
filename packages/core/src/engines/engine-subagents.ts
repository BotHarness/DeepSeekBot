import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { foldSubagentDescriptor, SUBAGENT_DESCRIPTOR_VERSION } from '@deepseek-ai/dsh-subagent';

import { type OpenedEngineDshSession, openEngineDshSession } from './engine-dsh-session.js';
import type { EngineHostOptions } from './engine-host-types.js';
import { EngineTurnLog } from './engine-log.js';
import {
  type EngineEvent,
  type EngineId,
  type EngineTurnEnd,
  EngineRefusal,
} from './engine-session.js';

export interface EngineSubagentHost {
  engine: EngineId;
  account(): string;
  sessionIds: Map<string, string>;
  open(sessionId: string): Promise<OpenedEngineDshSession>;
  claim?(sessionId: string): void;
  warn?(error: unknown): void;
}

interface Run {
  dsh: OpenedEngineDshSession;
  log: EngineTurnLog;
  hasText: boolean;
}

type SubagentEvent = Extract<
  EngineEvent,
  { kind: 'subagent-start' | 'subagent-step' | 'subagent-end' }
>;

const UNTITLED = 'Subagent';

const SESSION_IDS = new WeakMap<object, Map<string, string>>();

function sessionIdsOf(live: object): Map<string, string> {
  let ids = SESSION_IDS.get(live);
  if (ids === undefined) {
    ids = new Map();
    SESSION_IDS.set(live, ids);
  }
  return ids;
}

export class EngineSubagentLogs {
  readonly #host: EngineSubagentHost;
  readonly #runs = new Map<string, Promise<Run | undefined>>();
  #queue: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(host: EngineSubagentHost) {
    this.#host = host;
  }

  accept(event: EngineEvent): void {
    if (
      this.#closed ||
      (event.kind !== 'subagent-start' &&
        event.kind !== 'subagent-step' &&
        event.kind !== 'subagent-end')
    )
      return;
    this.#queue = this.#queue.then(
      () => this.#handle(event),
      () => this.#handle(event),
    );
  }

  async end(parent: EngineTurnEnd): Promise<void> {
    this.#closed = true;
    await this.#queue.catch(() => undefined);
    const open = [...this.#runs.keys()];
    for (const id of open) await this.#finish(id, parent);
  }

  async #handle(event: SubagentEvent): Promise<void> {
    try {
      switch (event.kind) {
        case 'subagent-start':
          await this.#start(event.subagentId, event.title, event.prompt);
          return;
        case 'subagent-step': {
          const run = await (this.#runs.get(event.subagentId) ??
            this.#start(event.subagentId, UNTITLED));
          if (run === undefined) return;
          if (event.step.kind === 'text') run.hasText = true;
          run.log.accept(event.step);
          return;
        }
        case 'subagent-end': {
          const run = await this.#runs.get(event.subagentId);
          if (run === undefined) return;
          if (event.result !== undefined && event.result !== '' && !run.hasText)
            run.log.accept({ kind: 'text', text: event.result });
          await this.#finish(event.subagentId, event.end);
          return;
        }
      }
    } catch (error) {
      this.#host.warn?.(error);
    }
  }

  #start(subagentId: string, title: string, prompt?: string): Promise<Run | undefined> {
    const existing = this.#runs.get(subagentId);
    if (existing !== undefined) return existing;
    const opening = (async (): Promise<Run | undefined> => {
      let sessionId = this.#host.sessionIds.get(subagentId);
      if (sessionId === undefined) {
        sessionId = randomUUID();
        this.#host.sessionIds.set(subagentId, sessionId);
      }
      this.#host.claim?.(sessionId);
      const dsh = await this.#host.open(sessionId);
      const name = title.trim() === '' ? UNTITLED : title.trim();
      try {
        const log = new EngineTurnLog(
          dsh,
          this.#host.engine,
          this.#host.account(),
          prompt === undefined || prompt.trim() === '' ? name : prompt,
          name,
        );
        if (foldSubagentDescriptor(dsh.session.snapshotEvents()) === undefined)
          dsh.session.append('subagent/descriptor', {
            version: SUBAGENT_DESCRIPTOR_VERSION,
            mode: 'one-shot',
            provider: this.#host.engine,
            label: name,
          });
        return { dsh, log, hasText: false };
      } catch (error) {
        await dsh.close().catch(() => undefined);
        throw error;
      }
    })();
    const guarded = opening.catch((error: unknown) => {
      this.#host.warn?.(error);
      return undefined;
    });
    this.#runs.set(subagentId, guarded);
    return guarded;
  }

  async #finish(subagentId: string, end: EngineTurnEnd): Promise<void> {
    const pending = this.#runs.get(subagentId);
    this.#runs.delete(subagentId);
    const run = await pending;
    if (run === undefined) return;
    try {
      await run.log.end(end);
    } catch (error) {
      this.#host.warn?.(error);
    } finally {
      await run.dsh.close().catch(() => undefined);
    }
  }
}

export function engineSubagentLogs(
  options: Pick<EngineHostOptions, 'root' | 'sessions' | 'persistence' | 'claimSubagent' | 'warn'>,
  live: {
    botSlug: string;
    account: string;
    dsh: OpenedEngineDshSession;
  },
  parentSessionId: string,
  engine: EngineId,
): EngineSubagentLogs {
  const parent = live.dsh.session.header;
  const cwd = parent.cwd ?? join(options.root, 'workdirs', live.botSlug);
  return new EngineSubagentLogs({
    engine,
    account: () => live.account,
    sessionIds: sessionIdsOf(live),
    claim: (sessionId) => options.claimSubagent?.(sessionId, parentSessionId),
    open: async (sessionId) => {
      const sessions = options.sessions();
      const persistence = options.persistence();
      if (sessions === undefined || persistence === undefined)
        throw new EngineRefusal('engine-unavailable', 'DSH Session Persistence is unavailable');
      return openEngineDshSession(sessions, persistence, sessionId, cwd, {
        parentSession: parentSessionId,
        delegationDepth: (parent.delegationDepth ?? 0) + 1,
      });
    },
    warn: (error) => options.warn?.('engine-subagent-log-failed', error),
  });
}
