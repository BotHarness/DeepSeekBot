import { statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChannelAttachmentRef } from './ref.js';

export interface OriginalAttachmentInput {
  channelId?: string;
  messageId: string;
  fileId: string;
  access: 'read' | 'edit-original';
  signal?: AbortSignal;
}

export interface OriginalAttachmentTarget {
  path: string;
  source: ChannelAttachmentRef;
}

const fingerprint = (path: string): string | undefined => {
  try {
    const stat = statSync(path);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return undefined;
  }
};

export class OriginalAttachmentAccess {
  readonly #changed: ((fileId: string) => void) | undefined;

  constructor(changed?: (fileId: string) => void) {
    this.#changed = changed;
  }

  readonly #sessions = new Map<
    string,
    Map<
      string,
      {
        path: string;
        fileId: string;
        seen: string | undefined;
        writable: boolean;
        current(): OriginalAttachmentTarget;
      }
    >
  >();

  open(
    sessionId: string,
    input: OriginalAttachmentInput,
    current: () => OriginalAttachmentTarget,
  ): OriginalAttachmentTarget & { access: OriginalAttachmentInput['access'] } {
    input.signal?.throwIfAborted();
    const target = current();
    const entries = this.#sessions.get(sessionId) ?? new Map();
    entries.set(target.path, {
      path: target.path,
      fileId: input.fileId,
      seen: fingerprint(target.path),
      writable: input.access === 'edit-original',
      current,
    });
    this.#sessions.set(sessionId, entries);
    return { ...target, access: input.access };
  }

  #settle(sessionId: string): void {
    for (const entry of this.#sessions.get(sessionId)?.values() ?? []) {
      if (!entry.writable) continue;
      const now = fingerprint(entry.path);
      if (now === entry.seen) continue;
      entry.seen = now;
      this.#changed?.(entry.fileId);
    }
  }

  root(sessionId: string, path: string, kind: 'read' | 'write', shell = false): string | undefined {
    const entries = this.#sessions.get(sessionId);
    if (entries === undefined) return undefined;
    this.#settle(sessionId);
    for (const entry of entries.values()) {
      const root = dirname(entry.path);
      if (path !== (shell ? root : entry.path)) continue;
      const current = entry.current();
      if (current.path !== entry.path) throw new Error('Original attachment path is unavailable');
      if ((kind === 'write' || shell) && !entry.writable)
        throw new Error('Original attachment requires explicit edit-original access');
      return root;
    }
    return undefined;
  }

  clear(sessionId: string): void {
    this.#settle(sessionId);
    this.#sessions.delete(sessionId);
  }
}
