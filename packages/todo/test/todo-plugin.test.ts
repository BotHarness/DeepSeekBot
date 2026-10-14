import { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { afterEach, describe, expect, it } from 'vitest';

import { apply, createTodoService, TodoError, type TodoService } from '../src/index.js';
import type { TodoRecord } from '../src/service.js';

function memoryTable() {
  const rows = new Map<string, TodoRecord>();
  return {
    rows,
    table: {
      get: (key: string) => rows.get(key),
      entries: () => rows.entries(),
      keys: () => rows.keys(),
      get size() {
        return rows.size;
      },
      put: async (key: string, value: TodoRecord) => void rows.set(key, value),
      delete: async (key: string) => rows.delete(key),
      update: async (key: string, fn: (current: TodoRecord) => TodoRecord) => {
        const next = fn(rows.get(key)!);
        rows.set(key, next);
        return next;
      },
    },
  };
}

describe('to-do Service', () => {
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 9, 14, 0, 0, clock++));

  it('adds, renames, completes and removes to-dos in creation order', async () => {
    const service = createTodoService(memoryTable().table, now);
    const first = await service.add('  Buy milk ', { kind: 'human' });
    const second = await service.add('Ship #1792', { kind: 'bot', slug: 'ada' });
    expect(first).toMatchObject({ title: 'Buy milk', done: false, createdBy: { kind: 'human' } });
    expect(service.list().map((todo) => todo.id)).toEqual([first.id, second.id]);

    const done = await service.update(second.id, { done: true, title: 'Ship it' });
    expect(done).toMatchObject({ id: second.id, title: 'Ship it', done: true });
    expect(done.updatedAt > done.createdAt).toBe(true);

    expect(await service.remove(first.id)).toMatchObject({ id: first.id, title: 'Buy milk' });
    expect(service.list().map((todo) => todo.title)).toEqual(['Ship it']);
  });

  it('refuses empty titles, empty updates and unknown ids with codes', async () => {
    const service = createTodoService(memoryTable().table, now);
    const added = await service.add('x', { kind: 'human' });
    const code = async (run: () => Promise<unknown>) =>
      run().then(
        () => 'ok',
        (error: unknown) => (error instanceof TodoError ? error.code : String(error)),
      );
    expect(await code(() => service.add('   ', { kind: 'human' }))).toBe('invalid-input');
    expect(await code(() => service.add('a'.repeat(501), { kind: 'human' }))).toBe('invalid-input');
    expect(await code(() => service.update(added.id, {}))).toBe('invalid-input');
    expect(await code(() => service.update('nope', { done: true }))).toBe('todo-not-found');
    expect(await code(() => service.remove('nope'))).toBe('todo-not-found');
  });
});

interface Route {
  path: string;
  fetch(request: Request): Promise<Response>;
}

const contexts: Context[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
});

async function setup() {
  const ctx = new Context();
  contexts.push(ctx);
  const storage = memoryTable();
  let closed = 0;
  const routes = new Map<string, Route>();
  const hostTools = new Set<string>();
  let contribute: ((scope: Context, agent: unknown, info: { botSlug: string }) => void) | undefined;
  ctx.provide('storageDomain', {
    open: async () => ({
      table: () => storage.table,
      close: async () => void closed++,
    }),
  } as never);
  ctx.provide('connection', {
    fetch: {
      register: (route: Route) => {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  } as never);
  ctx.provide('botharness', {
    registry: { get: (slug: string) => (slug === 'ada' ? { slug } : undefined) },
    hostTools,
    contributeBotAgentSetup: (callback: typeof contribute) => {
      contribute = callback;
      return () => {
        contribute = undefined;
      };
    },
  } as never);
  apply(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const agentTools = new Map<string, ToolDefinition>();
  contribute?.(
    {
      tools: {
        register: (tool: ToolDefinition) => {
          agentTools.set(tool.name, tool);
          return () => agentTools.delete(tool.name);
        },
      },
    } as unknown as Context,
    {},
    { botSlug: 'ada' },
  );
  const call = async (path: string, input?: unknown) => {
    const response = await routes.get(path)!.fetch(
      new Request(`http://localhost${path}`, {
        method: input === undefined ? 'GET' : 'POST',
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const runTool = async (name: string, args: unknown) =>
    JSON.parse(
      (await agentTools.get(name)!.execute(args, {
        signal: new AbortController().signal,
      } as ToolRunContext)) as string,
    ) as Record<string, unknown>;
  return {
    ctx,
    storage,
    routes,
    hostTools,
    agentTools,
    call,
    runTool,
    closed: () => closed,
    service: () => ctx.get('todos') as TodoService | undefined,
  };
}

describe('to-do plugin', () => {
  it('serves the todos Service from the storage domain and gives every Bot the tools', async () => {
    const h = await setup();
    expect(h.service()).toBeDefined();
    expect([...h.agentTools.keys()]).toEqual([
      'todos_list',
      'todos_add',
      'todos_update',
      'todos_remove',
    ]);
    expect([...h.hostTools]).toEqual([...h.agentTools.keys()]);

    const added = await h.runTool('todos_add', { title: 'Water the plants' });
    expect(added['todo']).toMatchObject({
      title: 'Water the plants',
      createdBy: { kind: 'bot', slug: 'ada' },
    });
    const listed = await h.call('/api/todos');
    expect(listed.body).toMatchObject({ ok: true, todos: [{ title: 'Water the plants' }] });
    const id = (added['todo'] as { id: string }).id;
    expect(await h.runTool('todos_update', { id, done: true })).toMatchObject({
      todo: { id, done: true },
    });
    expect(await h.runTool('todos_list', {})).toMatchObject({ todos: [{ id, done: true }] });
    await h.runTool('todos_remove', { id });
    expect(h.storage.rows.size).toBe(0);
  });

  it('lets the Human add, update and remove through the Host routes with coded refusals', async () => {
    const h = await setup();
    const added = await h.call('/api/todos/add', { title: 'Call mum' });
    expect(added.body).toMatchObject({ ok: true, todo: { createdBy: { kind: 'human' } } });
    const id = (added.body['todo'] as { id: string }).id;
    expect((await h.call('/api/todos/update', { id, done: true })).body).toMatchObject({
      todo: { done: true },
    });
    expect(await h.call('/api/todos/add', { title: ' ' })).toMatchObject({
      status: 400,
      body: { ok: false, code: 'invalid-input' },
    });
    expect(await h.call('/api/todos/update', { id: 'nope', done: true })).toMatchObject({
      status: 404,
      body: { code: 'todo-not-found' },
    });
    expect((await h.call('/api/todos/remove', { id })).body).toMatchObject({ removed: { id } });
  });

  it('runs a Bot tool directly as a Bot, without the model', async () => {
    const h = await setup();
    const catalog = await h.call('/api/todos/tools');
    expect((catalog.body['tools'] as { name: string }[]).map((tool) => tool.name)).toContain(
      'todos_add',
    );
    const run = await h.call('/api/todos/tool', {
      slug: 'ada',
      tool: 'todos_add',
      args: { title: 'Direct' },
    });
    expect(run.body).toMatchObject({
      ok: true,
      slug: 'ada',
      tool: 'todos_add',
      result: { todo: { title: 'Direct', createdBy: { kind: 'bot', slug: 'ada' } } },
    });
    expect(
      await h.call('/api/todos/tool', { slug: 'ada', tool: 'todos_add', args: {} }),
    ).toMatchObject({ status: 400, body: { code: 'invalid-args' } });
    expect(
      await h.call('/api/todos/tool', { slug: 'ghost', tool: 'todos_list', args: {} }),
    ).toMatchObject({ status: 404, body: { code: 'unknown-bot' } });
    expect(
      await h.call('/api/todos/tool', { slug: 'ada', tool: 'todos_fly', args: {} }),
    ).toMatchObject({ status: 400, body: { code: 'invalid-input' } });
  });

  it('removes the tools, routes and domain when it unloads', async () => {
    const h = await setup();
    await h.ctx.fiber.dispose();
    contexts.splice(contexts.indexOf(h.ctx), 1);
    expect(h.agentTools.size).toBe(0);
    expect(h.routes.size).toBe(0);
    expect(h.hostTools.size).toBe(0);
    expect(h.closed()).toBe(1);
  });
});
