import { randomUUID } from 'node:crypto';

import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

export const TODO_TITLE_MAX = 500;
export const TODO_LIMIT = 1000;

const author = z.union([
  z.object({ kind: z.literal('human') }),
  z.object({ kind: z.literal('bot'), slug: z.string().min(1) }),
]);

export const todoRecord = z.object({
  title: z.string().min(1).max(TODO_TITLE_MAX),
  done: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: author,
});

export type TodoRecord = z.infer<typeof todoRecord>;
export type TodoAuthor = z.infer<typeof author>;

export interface Todo extends TodoRecord {
  id: string;
}

export const todoDomainSpec = defineDomain({
  name: 'botharness_todos',
  version: 1,
  layout: 'single',
  tables: { todos: domainTable<string, TodoRecord>(todoRecord) },
});

export type TodoErrorCode = 'invalid-input' | 'todo-not-found' | 'todo-limit';

export class TodoError extends Error {
  constructor(
    readonly code: TodoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TodoError';
  }
}

export interface TodoUpdate {
  title?: string;
  done?: boolean;
}

export interface TodoService {
  list(): Todo[];
  add(title: string, by: TodoAuthor): Promise<Todo>;
  update(id: string, change: TodoUpdate): Promise<Todo>;
  remove(id: string): Promise<Todo>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    todos: TodoService;
  }
}

function cleanTitle(title: unknown): string {
  if (typeof title !== 'string') throw new TodoError('invalid-input', 'title must be a string');
  const trimmed = title.trim();
  if (trimmed === '') throw new TodoError('invalid-input', 'title must not be empty');
  if (trimmed.length > TODO_TITLE_MAX)
    throw new TodoError('invalid-input', `title must be at most ${TODO_TITLE_MAX} characters`);
  return trimmed;
}

export function createTodoService(
  table: KvTable<string, TodoRecord>,
  now: () => Date = () => new Date(),
): TodoService {
  const find = (id: string): TodoRecord => {
    const record = typeof id === 'string' ? table.get(id) : undefined;
    if (record === undefined) throw new TodoError('todo-not-found', `Unknown to-do: ${id}`);
    return record;
  };
  return {
    list() {
      return [...table.entries()]
        .map(([id, record]) => ({ id, ...record }))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async add(title, by) {
      const clean = cleanTitle(title);
      if (table.size >= TODO_LIMIT)
        throw new TodoError('todo-limit', `The list already holds ${TODO_LIMIT} to-dos`);
      const at = now().toISOString();
      const id = randomUUID();
      const record: TodoRecord = {
        title: clean,
        done: false,
        createdAt: at,
        updatedAt: at,
        createdBy: by,
      };
      await table.put(id, record);
      return { id, ...record };
    },
    async update(id, change) {
      find(id);
      if (change.title === undefined && change.done === undefined)
        throw new TodoError('invalid-input', 'pass a new title, done, or both');
      if (change.done !== undefined && typeof change.done !== 'boolean')
        throw new TodoError('invalid-input', 'done must be true or false');
      const title = change.title === undefined ? undefined : cleanTitle(change.title);
      const next = await table.update(id, (current) => ({
        ...current,
        ...(title === undefined ? {} : { title }),
        ...(change.done === undefined ? {} : { done: change.done }),
        updatedAt: now().toISOString(),
      }));
      return { id, ...next };
    },
    async remove(id) {
      const record = find(id);
      await table.delete(id);
      return { id, ...record };
    },
  };
}
