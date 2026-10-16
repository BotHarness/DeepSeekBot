import type { DshSessionEvent } from '../sessions/source.js';
import {
  createSubagentDispatchRegistry,
  isTerminalSubagentDispatchStatus,
  sanitizeSubagentDispatchDescription,
  parseSubagentDispatchRoute,
  terminalSubagentStatus,
  type SubagentDispatchProjection,
  type SubagentDispatchRecord,
  type SubagentDispatchRegistry,
  type SubagentDispatchStatus,
  type SubagentDispatchRoute,
} from '../channels/subagent-dispatch.js';

const SUBAGENT_DISPATCH_TOOLS = ['subagent', 'subagent_fork', 'bot_subagent', 'bot_subagent_fork'];

export interface SubagentDispatchCommit {
  channelId: string;
  messageId: string;
  at: string;
  body: string;
  projection: SubagentDispatchProjection;
}

export interface SubagentDispatchProjectionOptions {
  registry?: SubagentDispatchRegistry;
  channelForSession(sessionId: string): string | undefined;
  commit(input: SubagentDispatchCommit): Promise<void> | void;
  publish(record: SubagentDispatchRecord): void;
  now?(): Date;
  warn?(message: string): void;
}

interface DispatchIntent {
  dispatchId: string;
  callId: string;
  parentSessionId: string;
  channelId: string;
  description: string;
  status: SubagentDispatchStatus;
  childSessionId?: string;
  jobId?: string;
  oneShot: boolean;
  settled: boolean;
  toolSettled: boolean;
}

interface DeferredChild {
  parentSessionId: string;
  started: boolean;
  oneShot: boolean;
  reason?: unknown;
  ended?: boolean;
  route?: SubagentDispatchRoute;
}

export interface ReportedJob {
  id: string;
  kind: string;
  owner?: string;
  status: string;
}

export interface SubagentDispatchProjectionHost {
  readonly registry: SubagentDispatchRegistry;
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;
  bindChild(
    childSessionId: string,
    parentSessionId: string,
    provenance?: string,
    descriptor?: unknown,
  ): void;
  bindDispatch(
    parentSessionId: string,
    callId: string,
    childSessionId: string,
    jobId?: string,
  ): void;
  handleJobEvent(event: { type: string; job?: ReportedJob }): void;
  handleSubagentEnd(info: unknown): void;
  handleSessionDisposed(sessionId: string): void;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function descriptionFromArguments(argumentsJson: unknown): string {
  if (typeof argumentsJson !== 'string' || argumentsJson.length === 0) return '';
  try {
    return (
      sanitizeSubagentDispatchDescription(asRecord(JSON.parse(argumentsJson))?.['description']) ??
      ''
    );
  } catch {
    return '';
  }
}

export function createSubagentDispatchProjection(
  options: SubagentDispatchProjectionOptions,
): SubagentDispatchProjectionHost {
  const registry = options.registry ?? createSubagentDispatchRegistry();
  const now = options.now ?? (() => new Date());
  const pendingBySession = new Map<string, DispatchIntent[]>();
  const intentsByChild = new Map<string, DispatchIntent>();
  const intentsByJob = new Map<string, DispatchIntent>();
  const deferred = new Map<string, DeferredChild>();
  const deferredJobs = new Map<string, ReportedJob>();
  const queues = new Map<string, Promise<void>>();

  const enqueue = (key: string, task: () => Promise<void> | void): void => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous
      .then(task, task)
      .catch((error: unknown) => options.warn?.(`subagent-dispatch: ${String(error)}`))
      .then(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
    queues.set(key, next);
  };

  const release = (intent: DispatchIntent): void => {
    const group = pendingBySession.get(intent.parentSessionId);
    if (group !== undefined) {
      const index = group.indexOf(intent);
      if (index !== -1) group.splice(index, 1);
      if (group.length === 0) pendingBySession.delete(intent.parentSessionId);
    }
    if (intent.childSessionId !== undefined) intentsByChild.delete(intent.childSessionId);
    if (intent.jobId !== undefined) intentsByJob.delete(intent.jobId);
  };

  const apply = (
    intent: DispatchIntent,
    status: SubagentDispatchStatus | undefined,
    resolvedRoute?: SubagentDispatchRoute,
  ): void => {
    const at = now().toISOString();
    enqueue(intent.dispatchId, async () => {
      const transition = {
        channelId: intent.channelId,
        dispatchId: intent.dispatchId,
        parentSessionId: intent.parentSessionId,
        status: status ?? intent.status,
        at,
        description: intent.description,
        ...(resolvedRoute === undefined ? {} : { resolvedRoute }),
      };
      const record = registry.preview(transition);
      if (record === undefined) return;
      await options.commit({
        channelId: record.channelId,
        messageId: record.messageId,
        at,
        body: dispatchCardBody(record.projection),
        projection: record.projection,
      });
      registry.apply(transition);
      intent.status = record.projection.status;
      if (isTerminalSubagentDispatchStatus(intent.status)) {
        intent.settled = true;
        release(intent);
      }
      options.publish(record);
    });
  };

  const settle = (intent: DispatchIntent, reason: unknown): void => {
    if (intent.jobId !== undefined || (intent.oneShot && !intent.toolSettled)) return;
    apply(intent, terminalSubagentStatus(reason));
  };

  const attach = (intent: DispatchIntent, childSessionId: string): void => {
    intent.childSessionId = childSessionId;
    intentsByChild.set(childSessionId, intent);
  };

  const attachDeferred = (
    intent: DispatchIntent,
    childSessionId: string,
    pending: DeferredChild,
  ): void => {
    deferred.delete(childSessionId);
    attach(intent, childSessionId);
    intent.oneShot = pending.oneShot;
    apply(intent, pending.started ? 'running' : 'queued', pending.route);
    if (pending.ended || (pending.reason !== undefined && intent.oneShot))
      settle(intent, pending.reason);
  };

  const attachJob = (intent: DispatchIntent, job: ReportedJob): void => {
    deferredJobs.delete(job.id);
    intent.jobId = job.id;
    intentsByJob.set(job.id, intent);
    apply(
      intent,
      job.status === 'running' ? undefined : job.status === 'completed' ? 'completed' : 'failed',
    );
  };

  const handleDeferred = (pending: DeferredChild, event: DshSessionEvent): void => {
    if (event.type === 'request/header') {
      const route = parseSubagentDispatchRoute(
        asRecord(asRecord(event.data)?.['header'])?.['config'],
      );
      if (route !== undefined) pending.route = route;
      return;
    }
    if (event.type === 'turn/start') {
      pending.started = true;
      return;
    }
    if (event.type === 'turn/end') {
      pending.reason = asRecord(event.data)?.['reason'];
      return;
    }
    if (event.type !== 'subagent/descriptor') return;
    const data = asRecord(event.data);
    if (data === undefined) return;
    pending.oneShot = data['mode'] === 'one-shot';
  };

  return {
    registry,
    handleSessionEvent(sessionId, event) {
      const child = intentsByChild.get(sessionId);
      if (child !== undefined) {
        if (child.settled) return;
        const data = asRecord(event.data);
        if (event.type === 'subagent/descriptor') {
          if (data === undefined) return;
          child.oneShot = data['mode'] === 'one-shot';
          return;
        }
        if (event.type === 'request/header') {
          const route = parseSubagentDispatchRoute(asRecord(data?.['header'])?.['config']);
          if (route !== undefined) apply(child, undefined, route);
        }
        if (event.type === 'turn/start') apply(child, 'running');
        else if (event.type === 'turn/end' && child.oneShot) settle(child, data?.['reason']);
        if (event.type !== 'tool/call' && event.type !== 'tool/result') return;
      }
      const waiting = deferred.get(sessionId);
      if (waiting !== undefined) {
        handleDeferred(waiting, event);
        return;
      }
      const group = pendingBySession.get(sessionId);
      if (event.type === 'tool/call') {
        const data = asRecord(event.data);
        const { name, callId } = data ?? {};
        if (typeof name !== 'string' || !SUBAGENT_DISPATCH_TOOLS.includes(name)) return;
        if (typeof callId !== 'string' || callId.length === 0) return;
        const dispatchId = JSON.stringify([sessionId, event.seq, event.time, callId]);
        if ((group ?? []).some((intent) => intent.dispatchId === dispatchId)) return;
        const channelId = options.channelForSession(sessionId) ?? child?.channelId;
        if (channelId === undefined) return;
        const intent: DispatchIntent = {
          dispatchId,
          callId,
          parentSessionId: sessionId,
          channelId,
          description: descriptionFromArguments(data?.['arguments']),
          status: 'queued',
          oneShot: false,
          settled: false,
          toolSettled: false,
        };
        if (group === undefined) pendingBySession.set(sessionId, [intent]);
        else group.push(intent);
        return;
      }
      if (event.type !== 'tool/result' || group === undefined) return;
      const message = asRecord(asRecord(event.data)?.['message']);
      const intent = group.find(
        (candidate) => candidate.callId === message?.['toolCallId'] && !candidate.toolSettled,
      );
      if (intent === undefined) return;
      if (message?.['isError'] === true) {
        apply(
          intent,
          intent.childSessionId === undefined && intent.jobId === undefined ? 'declined' : 'failed',
        );
        return;
      }
      const content = message?.['content'];
      if (Array.isArray(content)) {
        for (const block of content) {
          const part = asRecord(block);
          if (part?.['type'] !== 'text' || typeof part['text'] !== 'string') continue;
          const match =
            /^(?:Started (background )?Subagent (?:Job )?(\S+)(?: on |$)|Subagent (\S+) completed\.)/im.exec(
              part['text'],
            );
          const id = match?.[2] ?? match?.[3];
          if (id === undefined) continue;
          if (match?.[1] !== undefined) {
            const job = deferredJobs.get(id);
            if (job?.owner === sessionId) attachJob(intent, job);
          } else {
            const pending = deferred.get(id);
            if (pending?.parentSessionId === sessionId) attachDeferred(intent, id, pending);
          }
          break;
        }
      }
      intent.toolSettled = true;
      if (intent.oneShot) settle(intent, 'completed');
    },
    bindChild(childSessionId, parentSessionId, provenance, descriptor) {
      if (intentsByChild.has(childSessionId) || deferred.has(childSessionId)) return;
      if (provenance !== undefined && provenance !== 'subagent' && provenance !== 'fork') return;
      const data = asRecord(descriptor);
      deferred.set(childSessionId, {
        parentSessionId,
        started: false,
        oneShot: data?.['mode'] === 'one-shot',
      });
    },
    bindDispatch(parentSessionId, callId, childSessionId, jobId) {
      const intent = pendingBySession
        .get(parentSessionId)
        ?.findLast((candidate) => candidate.callId === callId);
      if (intent === undefined || intent.settled) return;
      if (jobId !== undefined) {
        intent.jobId = jobId;
        intentsByJob.set(jobId, intent);
      }
      const pending = deferred.get(childSessionId);
      if (pending !== undefined) attachDeferred(intent, childSessionId, pending);
      else attach(intent, childSessionId);
      const job = jobId === undefined ? undefined : deferredJobs.get(jobId);
      if (job !== undefined) attachJob(intent, job);
    },
    handleJobEvent(event) {
      const job = event.job;
      if (event.type === 'registered') {
        if (job === undefined || job.kind !== 'subagent' || job.owner === undefined) return;
        if (intentsByJob.has(job.id)) return;
        deferredJobs.set(job.id, job);
        return;
      }
      if (event.type !== 'settled' || job === undefined) return;
      const intent = intentsByJob.get(job.id);
      if (intent === undefined) {
        if (deferredJobs.has(job.id)) deferredJobs.set(job.id, job);
        return;
      }
      if (intent.settled) return;
      apply(intent, job.status === 'completed' ? 'completed' : 'failed');
    },
    handleSubagentEnd(info) {
      const childSessionId = asRecord(info)?.['id'];
      if (typeof childSessionId !== 'string') return;
      const intent = intentsByChild.get(childSessionId);
      if (intent === undefined) {
        const pending = deferred.get(childSessionId);
        if (pending !== undefined) {
          pending.ended = true;
          pending.reason = asRecord(info)?.['stopReason'];
        }
        return;
      }
      if (intent.settled) return;
      settle(intent, asRecord(info)?.['stopReason']);
    },
    handleSessionDisposed(sessionId) {
      for (const [id, pending] of deferred)
        if (pending.parentSessionId === sessionId) deferred.delete(id);
      for (const [id, job] of deferredJobs) if (job.owner === sessionId) deferredJobs.delete(id);
      for (const intent of [...(pendingBySession.get(sessionId) ?? [])])
        if (intent.settled || (intent.childSessionId === undefined && intent.jobId === undefined))
          release(intent);
    },
  };
}

function dispatchCardBody(projection: SubagentDispatchProjection): string {
  return projection.description.length === 0
    ? 'Subagent delegation'
    : `Subagent: ${projection.description}`;
}

export interface SubagentDispatchJobEvents {
  subscribe(filter: SubagentDispatchJobFilter, listener: (event: unknown) => void): () => void;
}

export type SubagentDispatchJobFilter = { owner: string } | { owners: 'scope' | 'all' };

export interface SubagentDispatchJobs {
  events?: SubagentDispatchJobEvents;
}

function reportedJob(value: unknown): ReportedJob | undefined {
  const job = asRecord(value);
  const { id, kind, status, owner } = job ?? {};
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof kind !== 'string' || typeof status !== 'string') return undefined;
  return {
    id,
    kind,
    status,
    ...(typeof owner === 'string' && owner.length > 0 ? { owner } : {}),
  };
}

export function subscribeSubagentJobs(
  events: SubagentDispatchJobEvents | undefined,
  filter: SubagentDispatchJobFilter,
  sink: (event: { type: string; job?: ReportedJob }) => void,
): () => void {
  if (events === undefined) return () => undefined;
  return events.subscribe(filter, (event) => {
    const record = asRecord(event);
    const type = record?.['type'];
    if (type !== 'registered' && type !== 'settled') return;
    const job = reportedJob(record?.['job']);
    if (job !== undefined) sink({ type, job });
  });
}
