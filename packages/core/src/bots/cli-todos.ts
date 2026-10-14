import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';

type LiveHost = Awaited<ReturnType<typeof connectLiveHost>>;

export const TODO_OPTIONS = {
  done: { type: 'boolean' },
  'not-done': { type: 'boolean' },
} as const;

export const TODO_COMMANDS = [
  { command: 'todos', description: 'list the shared to-do list (needs the to-do plugin)' },
  { command: 'todo-add', description: 'add a to-do as the Human (--title)' },
  { command: 'todo-update', description: 'rename a to-do or mark it --done / --not-done' },
  { command: 'todo-remove', description: 'delete one to-do' },
  { command: 'todo-tools', description: 'list the to-do Bot tools with their input schemas' },
  {
    command: 'todo-tool',
    description: 'run one to-do Bot tool directly for a Bot, without the model (args from stdin)',
  },
] as const;

type Command = (typeof TODO_COMMANDS)[number]['command'];

export interface TodoValues {
  title?: string;
  done?: boolean;
  'not-done'?: boolean;
  'args-stdin'?: boolean;
}

export function isTodoCommand(command: string): command is Command {
  return TODO_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

const POSITIONALS: Record<Command, number> = {
  todos: 0,
  'todo-add': 0,
  'todo-update': 1,
  'todo-remove': 1,
  'todo-tools': 0,
  'todo-tool': 2,
};

export async function runTodoCommand(
  command: Command,
  rest: string[],
  values: TodoValues,
  io: BotCreateCliIo,
  connect: () => Promise<LiveHost>,
): Promise<unknown> {
  const count = POSITIONALS[command];
  if (rest.length !== count || rest.some((value) => !value.trim()))
    usage(
      count === 0
        ? `${command} takes no positional arguments.`
        : command === 'todo-tool'
          ? 'todo-tool needs a bot id and a tool name.'
          : `${command} needs exactly one to-do id.`,
    );
  const title = values.title?.trim();
  if (command === 'todo-add' && !title) usage('todo-add needs --title <text>.');
  if (values.done === true && values['not-done'] === true)
    usage('Pass at most one of --done and --not-done.');
  if (command === 'todo-update' && title === undefined && !values.done && !values['not-done'])
    usage('todo-update needs --title, --done or --not-done.');
  let args: Record<string, unknown> = {};
  if (command === 'todo-tool' && values['args-stdin'] === true) {
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      args = parsed as Record<string, unknown>;
    } catch {
      usage('--args-stdin must be a JSON object of tool arguments.');
    }
  }
  const { http } = await connect();
  const json = async (path: string, body?: Record<string, unknown>): Promise<unknown> => {
    let bytes: Uint8Array;
    try {
      ({ bytes } = await http(path, body));
    } catch (error) {
      if (
        error instanceof CliLiveError &&
        error.code === 'host-refused' &&
        error.message.includes('HTTP 404')
      )
        throw new CliLiveError(
          'todo-plugin-missing',
          'This Host does not run the to-do plugin (@botharness/todo).',
        );
      throw error;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new CliLiveError('host-protocol-error', `The Host returned no JSON for ${path}.`);
    }
  };
  const id = rest[0]?.trim() ?? '';
  switch (command) {
    case 'todos':
      return json('/api/todos');
    case 'todo-add':
      return json('/api/todos/add', { title });
    case 'todo-update':
      return json('/api/todos/update', {
        id,
        ...(title === undefined ? {} : { title }),
        ...(values.done === true ? { done: true } : {}),
        ...(values['not-done'] === true ? { done: false } : {}),
      });
    case 'todo-remove':
      return json('/api/todos/remove', { id });
    case 'todo-tools':
      return json('/api/todos/tools');
    case 'todo-tool':
      return json('/api/todos/tool', { slug: id, tool: rest[1]!.trim(), args });
  }
}
