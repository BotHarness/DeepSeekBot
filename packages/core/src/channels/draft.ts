import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { BlockAssembler } from '@deepseek-ai/dsh-llm';

export interface ChannelDraft {
  channelId: string;
  draftId: string;
  attemptId: string;
  botSlug: string;
  body: string;
}

export type ChannelDraftEvent =
  | { type: 'update'; draft: ChannelDraft }
  | { type: 'settled'; channelId: string; draftId: string; attemptId: string }
  | {
      type: 'abandoned';
      channelId: string;
      draftId: string;
      attemptId: string;
      reason: 'retargeted' | 'interrupted' | 'expired';
    };

interface DraftRun {
  channelId: string;
  botSlug: string;
  canAccess(channelId: string): boolean;
  currentAttemptId: string | undefined;
  attempts: Map<string, DraftAttempt>;
}

interface DraftAttempt {
  assembler: BlockAssembler;
  nextIndex: number;
  invalid: boolean;
  calls: Map<string, DraftCall>;
}

interface DraftCall {
  published: ChannelDraft | undefined;
}

function stringField(raw: string, key: string): { value: string; complete: boolean } | undefined {
  const segments: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') {
      depth += 1;
      if (depth === 1) start = index + 1;
    } else if (char === '}' && depth === 1) {
      segments.push(raw.slice(start, index));
      start = raw.length;
      break;
    } else if (char === '}') depth -= 1;
    else if (char === ',' && depth === 1) {
      segments.push(raw.slice(start, index));
      start = index + 1;
    }
  }
  if (start < raw.length) segments.push(raw.slice(start));
  for (const segment of segments) {
    const match = /^\s*"([^"\\]+)"\s*:\s*"/.exec(segment);
    if (match?.[1] !== key) continue;
    const valueStart = match[0].length;
    let end = valueStart;
    let escape = false;
    for (; end < segment.length; end += 1) {
      const char = segment[end];
      if (char === '"' && !escape) break;
      if (char === '\\' && !escape) escape = true;
      else escape = false;
    }
    const complete = end < segment.length;
    const content = segment.slice(valueStart, end);
    for (let length = content.length; length >= Math.max(0, content.length - 6); length -= 1) {
      try {
        const value: unknown = JSON.parse('"' + content.slice(0, length) + '"');
        if (typeof value === 'string')
          return { value, complete: complete && length === content.length };
      } catch {}
    }
    return undefined;
  }
  return undefined;
}

function partialBody(raw: string): string | undefined {
  return stringField(raw, 'body')?.value;
}

function explicitChannelId(raw: string): string | undefined {
  const field = stringField(raw, 'channel_id');
  return field?.complete === true && field.value.length > 0 ? field.value : undefined;
}

export class ChannelDraftTracker {
  readonly #runs = new Map<string, DraftRun>();
  readonly #publish: (event: ChannelDraftEvent) => void;

  constructor(publish: (event: ChannelDraftEvent) => void) {
    this.#publish = publish;
  }

  begin(sessionId: string, input: Pick<DraftRun, 'channelId' | 'botSlug' | 'canAccess'>): void {
    this.end(sessionId);
    this.#runs.set(sessionId, { ...input, currentAttemptId: undefined, attempts: new Map() });
  }

  accept(sessionId: string, frame: AssistantStreamFrame): void {
    const run = this.#runs.get(sessionId);
    if (run === undefined) return;
    if (frame.type === 'start') {
      this.#switchAttempt(run, frame.attemptId);
      return;
    }
    if (frame.type === 'end') {
      if (frame.outcome.kind === 'abandoned') {
        const attempt = run.attempts.get(frame.attemptId);
        if (attempt !== undefined) this.#abandonAttempt(attempt, 'interrupted');
        run.attempts.delete(frame.attemptId);
      }
      return;
    }
    this.#switchAttempt(run, frame.attemptId);
    let attempt = run.attempts.get(frame.attemptId);
    if (attempt === undefined) {
      attempt = { assembler: new BlockAssembler(), nextIndex: 0, invalid: false, calls: new Map() };
      run.attempts.set(frame.attemptId, attempt);
    }
    if (attempt.invalid || frame.index < attempt.nextIndex) return;
    if (frame.index !== attempt.nextIndex) {
      this.#abandonAttempt(attempt, 'interrupted');
      attempt.invalid = true;
      return;
    }
    attempt.nextIndex += 1;
    attempt.assembler.push(frame.chunk);
    for (const block of attempt.assembler.blocks()) {
      if (block.type !== 'tool-call' || block.name !== 'channel_send') continue;
      this.#acceptCall(run, attempt, frame.attemptId, block.id, block.arguments);
    }
  }

  settle(sessionId: string, channelId: string, body: string): void {
    const run = this.#runs.get(sessionId);
    if (run === undefined) return;
    const candidates: {
      attemptId: string;
      attempt: DraftAttempt;
      draftId: string;
      body: string;
    }[] = [];
    for (const [attemptId, attempt] of run.attempts) {
      for (const [draftId, call] of attempt.calls) {
        const draft = call.published;
        if (draft?.channelId === channelId) {
          candidates.push({ attemptId, attempt, draftId, body: draft.body });
        }
      }
    }
    const match =
      candidates.find((candidate) => body.startsWith(candidate.body)) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (match === undefined) return;
    this.#publish({
      type: 'settled',
      channelId,
      draftId: match.draftId,
      attemptId: match.attemptId,
    });
    match.attempt.calls.delete(match.draftId);
  }

  discard(sessionId: string, channelId: string): void {
    const run = this.#runs.get(sessionId);
    if (!run) return;
    for (const [attemptId, attempt] of run.attempts) {
      for (const [draftId, call] of attempt.calls) {
        if (call.published?.channelId !== channelId) continue;
        this.#publish({ type: 'abandoned', channelId, draftId, attemptId, reason: 'interrupted' });
        attempt.calls.delete(draftId);
      }
    }
  }

  end(sessionId: string): void {
    const run = this.#runs.get(sessionId);
    if (run === undefined) return;
    for (const attempt of run.attempts.values()) this.#abandonAttempt(attempt, 'expired');
    this.#runs.delete(sessionId);
  }

  #switchAttempt(run: DraftRun, attemptId: string): void {
    if (run.currentAttemptId === attemptId) return;
    for (const attempt of run.attempts.values()) this.#abandonAttempt(attempt, 'interrupted');
    run.attempts.clear();
    run.currentAttemptId = attemptId;
  }

  #acceptCall(
    run: DraftRun,
    attempt: DraftAttempt,
    attemptId: string,
    callId: string,
    args: string,
  ): void {
    const draftId = attemptId + ':' + callId;
    let call = attempt.calls.get(draftId);
    if (call === undefined) {
      call = { published: undefined };
      attempt.calls.set(draftId, call);
    }
    const body = partialBody(args);
    if (body === undefined || body.length === 0) return;
    const channelId = explicitChannelId(args) ?? run.channelId;
    if (!run.canAccess(channelId)) {
      this.#abandonCall(call, 'retargeted');
      return;
    }
    if (call.published !== undefined && call.published.channelId !== channelId) {
      this.#abandonCall(call, 'retargeted');
    }
    if (call.published?.body === body) return;
    const draft = { channelId, draftId, attemptId, botSlug: run.botSlug, body };
    call.published = draft;
    this.#publish({ type: 'update', draft });
  }

  #abandonAttempt(attempt: DraftAttempt, reason: 'interrupted' | 'expired'): void {
    for (const call of attempt.calls.values()) this.#abandonCall(call, reason);
    attempt.calls.clear();
  }

  #abandonCall(call: DraftCall, reason: 'retargeted' | 'interrupted' | 'expired'): void {
    const draft = call.published;
    if (draft === undefined) return;
    this.#publish({
      type: 'abandoned',
      channelId: draft.channelId,
      draftId: draft.draftId,
      attemptId: draft.attemptId,
      reason,
    });
    call.published = undefined;
  }
}
