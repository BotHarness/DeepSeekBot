import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import { ToolArgsError, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';

import { TodoError, createTodoService, todoDomainSpec, type TodoService } from './service.js';
import { TODO_TOOL_NAMES, createTodoTools } from './tools.js';

export {
  TodoError,
  createTodoService,
  todoDomainSpec,
  type Todo,
  type TodoService,
} from './service.js';
export { TODO_TOOL_NAMES, createTodoTools } from './tools.js';

export const name = 'botharness-todo';

interface Route {
  path: string;
  methods: readonly ('GET' | 'POST')[];
  requestBody: 'buffered';
  fetch(request: Request): Promise<Response>;
}

interface HostConnection {
  fetch: { register(route: Route): () => void };
}

type BotAgentSetup = (agentCtx: Context, agent: unknown, info: { botSlug: string }) => void;

interface BotHarnessCore {
  registry: { get(slug: string): unknown };
  hostTools: Set<string>;
  contributeBotAgentSetup(contribute: BotAgentSetup): () => void;
}

const json = (value: unknown, status = 200): Response =>
  Response.json(value as Record<string, unknown>, { status });

function refusal(error: unknown): Response {
  if (error instanceof TodoError) {
    const status = error.code === 'todo-not-found' ? 404 : error.code === 'todo-limit' ? 409 : 400;
    return json({ ok: false, code: error.code, error: error.message }, status);
  }
  if (error instanceof ToolArgsError)
    return json({ ok: false, code: 'invalid-args', error: error.message }, 400);
  return json({ ok: false, code: 'todo-failed', error: String(error) }, 500);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function route(path: string, method: 'GET' | 'POST', handle: Route['fetch']): Route {
  return {
    path,
    methods: [method],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return await handle(request);
      } catch (error) {
        return refusal(error);
      }
    },
  };
}

async function runDirect(
  service: TodoService,
  slug: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const definition = createTodoTools(service, slug).find((entry) => entry.name === tool);
  if (definition === undefined) throw new TodoError('invalid-input', `Unknown to-do tool ${tool}`);
  const value = await definition.execute(args, {
    callId: `direct-${tool}`,
    rootCallId: `direct-${tool}`,
    name: tool,
    arguments: args,
    signal: AbortSignal.timeout(30_000),
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  } as unknown as ToolRunContext);
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export function apply(ctx: Context): void {
  ctx.inject(['storageDomain'], async (storageCtx) => {
    const domain = await storageCtx.storageDomain.open(todoDomainSpec);
    storageCtx.effect(() => () => void domain.close(), 'botharness-todo: storage domain');
    storageCtx.provide('todos', createTodoService(domain.table('todos')));
  });

  ctx.inject(['todos', 'botharness'], (toolsCtx) => {
    const core = toolsCtx.get('botharness') as unknown as BotHarnessCore;
    for (const tool of TODO_TOOL_NAMES) core.hostTools.add(tool);
    const registered = new Set<() => void>();
    const remove = core.contributeBotAgentSetup((agentCtx, _agent, info) => {
      const tools: ToolDefinition[] = createTodoTools(toolsCtx.todos, info.botSlug);
      for (const tool of tools) registered.add(agentCtx.tools.register(tool));
    });
    return () => {
      remove();
      for (const unregister of registered) unregister();
      registered.clear();
      for (const tool of TODO_TOOL_NAMES) core.hostTools.delete(tool);
    };
  });

  ctx.inject(['todos', 'connection'], (routesCtx) => {
    const connection = routesCtx.get('connection') as unknown as HostConnection;
    const service = routesCtx.todos;
    const core = (): BotHarnessCore | undefined =>
      routesCtx.get('botharness') as unknown as BotHarnessCore | undefined;
    const routes = [
      route('/api/todos', 'GET', async () => json({ ok: true, todos: service.list() })),
      route('/api/todos/add', 'POST', async (request) => {
        const input = await body(request);
        return json({
          ok: true,
          todo: await service.add(input['title'] as string, { kind: 'human' }),
        });
      }),
      route('/api/todos/update', 'POST', async (request) => {
        const input = await body(request);
        return json({
          ok: true,
          todo: await service.update(input['id'] as string, {
            ...(input['title'] === undefined ? {} : { title: input['title'] as string }),
            ...(input['done'] === undefined ? {} : { done: input['done'] as boolean }),
          }),
        });
      }),
      route('/api/todos/remove', 'POST', async (request) =>
        json({ ok: true, removed: await service.remove((await body(request))['id'] as string) }),
      ),
      route('/api/todos/tools', 'GET', async () =>
        json({
          ok: true,
          tools: createTodoTools(service, '').map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters,
          })),
        }),
      ),
      route('/api/todos/tool', 'POST', async (request) => {
        const input = await body(request);
        const slug = typeof input['slug'] === 'string' ? input['slug'].trim() : '';
        const tool = typeof input['tool'] === 'string' ? input['tool'].trim() : '';
        const args = input['args'] ?? {};
        if (
          slug === '' ||
          tool === '' ||
          typeof args !== 'object' ||
          args === null ||
          Array.isArray(args)
        )
          throw new TodoError('invalid-input', 'slug, tool and an args object are required');
        if (core()?.registry.get(slug) === undefined)
          return json({ ok: false, code: 'unknown-bot', error: `Unknown bot: ${slug}` }, 404);
        return json({
          ok: true,
          slug,
          tool,
          result: await runDirect(service, slug, tool, args as Record<string, unknown>),
        });
      }),
    ];
    for (const entry of routes)
      routesCtx.effect(() => connection.fetch.register(entry), `botharness-todo: ${entry.path}`);
  });
}
