import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Service, type Context } from '@deepseek-ai/cordis';
import type { DshSessionEvent } from '../sessions/source.js';
import type { SessionOwnershipRecord } from '../sessions/ownership.js';
import type { ActivitySourceRole } from './tool-activity.js';

import { ACTIVE_FIBER_STATE } from '../runtime/cordis-fiber-state.js';

export const TOOL_DETAIL_TTL_MS = 5 * 60_000;
export const TOOL_DETAIL_MAX_REFS = 256;
export const TOOL_DETAIL_MAX_BYTES = 64 * 1024;

export type ToolDetailRefusal = 'unauthorized' | 'unavailable' | 'too-large';
export type ToolDetailRead =
  | { ok: false; reason: ToolDetailRefusal }
  | { ok: true; detail: ToolDetail; bytes: number };

export interface ToolDetail {
  botSlug: string;
  role: ActivitySourceRole;
  toolName: string;
  arguments: string;
  result?: unknown;
}

export interface ToolDetailIndex {
  observe(sessionId: string, event: DshSessionEvent): string | undefined;
  read(reference: string): ToolDetailRead;
  revokeSession(sessionId: string): void;
  clear(): void;
}

interface Locator {
  sessionId: string;
  seq: number;
  callId: string;
  owner: string;
  repairRevision: number;
  expires: number;
}

function ownerIdentity(owner: SessionOwnershipRecord): string {
  return JSON.stringify([owner.botSlug, owner.rootRole, owner.provenance, owner.createdAt]);
}

function dataOf(event: DshSessionEvent): Record<string, unknown> {
  return typeof event.data === 'object' && event.data !== null
    ? (event.data as Record<string, unknown>)
    : {};
}

export function createToolDetailIndex(options: {
  owner(sessionId: string): SessionOwnershipRecord | undefined;
  events(sessionId: string): readonly DshSessionEvent[] | undefined;
  repairRevision(sessionId: string): number;
  now?: () => number;
}): ToolDetailIndex {
  const entries = new Map<string, Locator>();
  const now = options.now ?? Date.now;
  const prune = () => {
    for (const [reference, entry] of entries) if (entry.expires <= now()) entries.delete(reference);
  };
  const revokeSession = (sessionId: string) => {
    for (const [reference, entry] of entries)
      if (entry.sessionId === sessionId) entries.delete(reference);
  };
  return {
    observe(sessionId, event) {
      if (event.type === 'turn/start' || event.type === 'turn/end') revokeSession(sessionId);
      const owner = options.owner(sessionId);
      if (event.type !== 'tool/call' || owner === undefined) return undefined;
      const data = dataOf(event);
      if (!Number.isSafeInteger(event.seq) || event.seq! < 0 || typeof data['callId'] !== 'string')
        return undefined;
      prune();
      for (const [reference, entry] of entries)
        if (
          entry.sessionId === sessionId &&
          entry.seq === event.seq &&
          entry.owner === ownerIdentity(owner) &&
          entry.repairRevision === options.repairRevision(sessionId)
        )
          return reference;
      if (entries.size >= TOOL_DETAIL_MAX_REFS) entries.delete(entries.keys().next().value!);
      const reference = `tool-detail-${randomUUID()}`;
      entries.set(reference, {
        sessionId,
        seq: event.seq!,
        callId: data['callId'],
        owner: ownerIdentity(owner),
        repairRevision: options.repairRevision(sessionId),
        expires: now() + TOOL_DETAIL_TTL_MS,
      });
      return reference;
    },
    read(reference) {
      prune();
      const entry = entries.get(reference);
      const unavailable = (): ToolDetailRead => {
        entries.delete(reference);
        return { ok: false, reason: 'unavailable' };
      };
      const owner = entry === undefined ? undefined : options.owner(entry.sessionId);
      if (
        entry === undefined ||
        owner === undefined ||
        entry.owner !== ownerIdentity(owner) ||
        entry.repairRevision !== options.repairRevision(entry.sessionId)
      ) {
        return unavailable();
      }
      const events = options.events(entry.sessionId);
      const index = events?.findIndex(
        (event) => event.seq === entry.seq && event.type === 'tool/call',
      );
      if (events === undefined || index === undefined || index < 0) return unavailable();
      const call = dataOf(events[index]!);
      if (
        call['callId'] !== entry.callId ||
        typeof call['name'] !== 'string' ||
        typeof call['arguments'] !== 'string'
      )
        return unavailable();
      let result: unknown;
      for (const event of events.slice(index + 1)) {
        if (event.type === 'turn/end' || event.type === 'turn/start') return unavailable();
        if (event.type !== 'tool/result') continue;
        const data = dataOf(event);
        const message = data['message'];
        if (
          typeof message === 'object' &&
          message !== null &&
          'toolCallId' in message &&
          message.toolCallId === entry.callId
        ) {
          result ??= data;
        }
      }
      try {
        const encoded = JSON.stringify({
          botSlug: owner.botSlug,
          role: owner.provenance === 'subagent' ? 'subagent' : owner.rootRole,
          toolName: call['name'],
          arguments: call['arguments'],
          ...(result === undefined ? {} : { result }),
        } satisfies ToolDetail);
        const bytes = Buffer.byteLength(encoded);
        if (bytes > TOOL_DETAIL_MAX_BYTES) return { ok: false, reason: 'too-large' };
        return { ok: true, detail: JSON.parse(encoded) as ToolDetail, bytes };
      } catch {
        return unavailable();
      }
    },
    revokeSession,
    clear() {
      entries.clear();
    },
  };
}

export interface ToolDetailAudit {
  consumer: string;
  outcome: 'allowed' | ToolDetailRefusal;
  bytes: number;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    botharnessActivityDetails: ActivityToolDetails;
  }
}

export class ActivityToolDetails extends Service {
  constructor(
    ctx: Context,
    private readonly index: ToolDetailIndex,
    private readonly consumers: readonly string[],
    private readonly audit: (event: ToolDetailAudit) => void,
  ) {
    super(ctx, 'botharnessActivityDetails');
  }

  read(reference: string): ToolDetailRead {
    const fiber = this.ctx.fiber;
    const name = fiber.runtime?.name;
    const consumer =
      typeof name === 'string' && /^[A-Za-z0-9_.:/-]{1,128}$/.test(name) ? name : 'unknown';
    const result: ToolDetailRead =
      fiber.state === ACTIVE_FIBER_STATE &&
      consumer !== 'unknown' &&
      this.consumers.includes(consumer)
        ? this.index.read(reference)
        : { ok: false, reason: 'unauthorized' };
    this.audit({
      consumer,
      outcome: result.ok ? 'allowed' : result.reason,
      bytes: result.ok ? result.bytes : 0,
    });
    return result;
  }
}
