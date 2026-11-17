import type { DshSessionEvent } from '../sessions/source.js';

export type SessionGoalPhase = 'active' | 'paused' | 'blocked' | 'complete';
export type SessionTodoStatus = 'pending' | 'in_progress' | 'completed';

export interface SessionGoalProgress {
  objective: string;
  phase: SessionGoalPhase;
  roundsStarted: number;
  maxGoalRounds: number;
  blockedReason?: string;
}

export interface SessionTodoItem {
  content: string;
  status: SessionTodoStatus;
}

export interface SessionProgress {
  goal?: SessionGoalProgress;
  todos?: SessionTodoItem[];
  lastEventAt?: number;
}

export const PROGRESS_TODOS = 50;
export const PROGRESS_TEXT_CHARS = 280;

const PHASES: readonly string[] = ['active', 'paused', 'blocked', 'complete'];
const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed'];

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= PROGRESS_TEXT_CHARS
    ? trimmed
    : `${trimmed.slice(0, PROGRESS_TEXT_CHARS - 1)}…`;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function goalOf(data: unknown): SessionGoalProgress | null | undefined {
  const change = object(data);
  if (change?.['kind'] !== 'goal/change') return undefined;
  if (change['operation'] === 'clear') return null;
  const goal = object(change['goal']);
  const objective = goal?.['objective'];
  const phase = goal?.['phase'];
  const max = count(goal?.['maxGoalRounds']);
  const rounds = count(change['roundsStarted']);
  if (typeof objective !== 'string' || objective.trim() === '') return undefined;
  if (typeof phase !== 'string' || !PHASES.includes(phase)) return undefined;
  if (max === undefined || rounds === undefined) return undefined;
  const reason = object(goal?.['blockedReason'])?.['message'];
  return {
    objective: clip(objective),
    phase: phase as SessionGoalPhase,
    roundsStarted: rounds,
    maxGoalRounds: max,
    ...(phase === 'blocked' && typeof reason === 'string' && reason.trim() !== ''
      ? { blockedReason: clip(reason) }
      : {}),
  };
}

function todosOf(data: unknown): SessionTodoItem[] | undefined {
  const list = object(data)?.['todos'];
  if (!Array.isArray(list)) return undefined;
  const todos: SessionTodoItem[] = [];
  for (const item of list) {
    const content = object(item)?.['content'];
    const status = object(item)?.['status'];
    if (typeof content !== 'string' || content.trim() === '') return undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status)) return undefined;
    todos.push({ content: clip(content), status: status as SessionTodoStatus });
  }
  return todos.slice(0, PROGRESS_TODOS);
}

export function summarizeSessionProgress(events: readonly DshSessionEvent[]): SessionProgress {
  let goal: SessionGoalProgress | undefined;
  let todos: SessionTodoItem[] | undefined;
  let lastEventAt: number | undefined;
  for (const event of events) {
    if (typeof event.time === 'number' && Number.isFinite(event.time)) lastEventAt = event.time;
    if (event.type === 'goal/change') {
      const next = goalOf(event.data);
      if (next === null) goal = undefined;
      else if (next !== undefined) goal = next;
    } else if (event.type === 'todo/write') {
      todos = todosOf(event.data) ?? todos;
    } else if (event.type === 'turn/start') {
      todos = undefined;
    }
  }
  return {
    ...(goal === undefined ? {} : { goal }),
    ...(todos === undefined || todos.length === 0 ? {} : { todos }),
    ...(lastEventAt === undefined ? {} : { lastEventAt }),
  };
}
