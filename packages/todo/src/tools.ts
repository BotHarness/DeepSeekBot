import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';

import type { TodoService } from './service.js';

export const TODO_TOOL_NAMES = ['todos_list', 'todos_add', 'todos_update', 'todos_remove'] as const;

const LIST =
  "the Human's shared to-do list, the one shown in the To-do panel. It lasts across Sessions and Channels. It is not your own plan for this task: keep that with todo_write.";

const text = {
  schema: { type: 'string' },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
} as const;

export function createTodoTools(service: TodoService, botSlug: string): ToolDefinition[] {
  return [
    defineTool({
      name: 'todos_list',
      description: `Read ${LIST} Returns every to-do with its id, title and whether it is done.`,
      parameters: {},
      output: text,
      execute: async () => JSON.stringify({ todos: service.list() }),
    }),
    defineTool({
      name: 'todos_add',
      description: `Add one item to ${LIST} Use it when the Human asks you to remember or track something for them.`,
      parameters: {
        title: { type: 'string', required: true, description: 'What needs doing, in one line.' },
      },
      output: text,
      execute: async (args) =>
        JSON.stringify({ todo: await service.add(args.title, { kind: 'bot', slug: botSlug }) }),
    }),
    defineTool({
      name: 'todos_update',
      description: `Rename an item on ${LIST} or mark it done or not done. Take the id from todos_list.`,
      parameters: {
        id: { type: 'string', required: true, description: 'The to-do id from todos_list.' },
        title: { type: 'string', description: 'The new title.' },
        done: { type: 'boolean', description: 'true when it is done, false to reopen it.' },
      },
      output: text,
      execute: async (args) =>
        JSON.stringify({
          todo: await service.update(args.id, {
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.done === undefined ? {} : { done: args.done }),
          }),
        }),
    }),
    defineTool({
      name: 'todos_remove',
      description: `Delete an item from ${LIST} Only when the Human asks; mark finished work done instead.`,
      parameters: {
        id: { type: 'string', required: true, description: 'The to-do id from todos_list.' },
      },
      output: text,
      execute: async (args) => JSON.stringify({ removed: await service.remove(args.id) }),
    }),
  ];
}
