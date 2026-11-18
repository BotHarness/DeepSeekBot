import { CliLiveError } from './cli-live-error.js';

export const ENGINE_COMMANDS = [
  {
    command: 'engine-list',
    description:
      'list the Subscription Engines this Host offers (engine list); a Cloud or VPS Host lists none',
  },
  {
    command: 'engine-status',
    description:
      'show each engine with install, sign-in and subscription quota, and which Bots run on it (engine status)',
  },
  {
    command: 'engine-approvals',
    description:
      'list the approval cards engine Sessions are waiting on; answer one with tool-approval-decide (engine approvals)',
  },
  {
    command: 'engine-tools',
    description:
      'list or search the Bot tools an engine-backed Bot reaches through tool_search (engine tools <bot> --query memory)',
  },
  {
    command: 'engine-tool',
    description:
      'run an engine-only Bot tool such as memory_write without the model (engine tool <bot> memory_read --args-stdin)',
  },
  {
    command: 'engine-login',
    description:
      'start the Bot engine sign-in on the Host computer and print its URL (engine login codex|claude)',
  },
  {
    command: 'engine-use',
    description:
      'run a Bot Orchestrator on an engine, or none for its API model, and resume a Bot paused by the limit (engine use <bot> codex|claude --role orchestrator [--fallback on])',
  },
] as const;

type Connect = () => Promise<{
  http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
}>;

const PATH = '/api/botharness/engines';

const protocolError = () =>
  new CliLiveError('host-protocol-error', 'The Host returned an unexpected engine response');

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function call(
  connect: Connect,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await (await connect()).http(PATH, body);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(result.bytes));
  } catch {
    throw protocolError();
  }
  if (!isObject(value)) throw protocolError();
  const error = value['error'];
  if (error !== undefined) {
    const detail = isObject(error) ? error : {};
    throw new CliLiveError(
      typeof detail['code'] === 'string' ? detail['code'] : 'engine-failed',
      typeof detail['message'] === 'string' ? detail['message'] : 'The engine request failed',
    );
  }
  return value;
}

export async function runEngineCommand(
  command: string,
  rest: string[],
  values: { role?: string[]; fallback?: string; query?: string; 'args-stdin'?: boolean },
  connect: Connect,
  readStdin: () => Promise<string> = async () => '',
): Promise<unknown> {
  if (command === 'engine-list' || command === 'engine-status') {
    if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
    const value = await call(connect);
    const engines = value['engines'];
    if (!Array.isArray(engines) || !engines.every(isObject) || !Array.isArray(value['selections']))
      throw protocolError();
    if (command === 'engine-list')
      return {
        engines: engines.map((engine) => ({
          engine: engine['engine'],
          available: engine['available'],
          ...(engine['reason'] === undefined ? {} : { reason: engine['reason'] }),
        })),
      };
    return value;
  }
  if (command === 'engine-approvals') {
    if (rest.length)
      throw new CliLiveError('usage', 'engine approvals takes no positional arguments.');
    const approvals = (await call(connect))['approvals'];
    if (!Array.isArray(approvals) || !approvals.every(isObject)) throw protocolError();
    return { approvals };
  }
  if (command === 'engine-tools') {
    if (rest.length !== 1) throw new CliLiveError('usage', 'engine tools needs one Bot ID.');
    const value = await call(connect, {
      action: 'tools',
      bot: rest[0],
      ...(values.query === undefined ? {} : { query: values.query }),
    });
    if (!Array.isArray(value['tools']) || !value['tools'].every(isObject)) throw protocolError();
    return value;
  }
  if (command === 'engine-tool') {
    if (rest.length !== 2)
      throw new CliLiveError('usage', 'engine tool needs a Bot ID and a tool name.');
    let args: unknown = {};
    if (values['args-stdin'] === true) {
      try {
        args = JSON.parse(await readStdin());
      } catch {
        args = undefined;
      }
      if (!isObject(args))
        throw new CliLiveError('usage', '--args-stdin must be a JSON object of tool arguments.');
    }
    const [bot, tool] = rest as [string, string];
    const value = await call(connect, { action: 'tool', bot, tool, args });
    if (value['bot'] !== bot || value['tool'] !== tool || !('result' in value))
      throw protocolError();
    return value;
  }
  if (command === 'engine-login') {
    if (rest.length !== 1)
      throw new CliLiveError('usage', 'engine login needs one engine: codex or claude.');
    const value = await call(connect, { action: 'login', engine: rest[0] });
    if (value['started'] !== true || typeof value['engine'] !== 'string') throw protocolError();
    return value;
  }
  if (command === 'engine-use') {
    if (rest.length !== 2)
      throw new CliLiveError(
        'usage',
        'engine use needs <bot> and an engine (codex, claude or none).',
      );
    const role = values.role ?? [];
    if (role.length !== 1 || role[0] !== 'orchestrator')
      throw new CliLiveError('usage', 'engine use needs --role orchestrator.');
    const [bot, engine] = rest as [string, string];
    const fallback = values.fallback;
    if (fallback !== undefined && fallback !== 'on' && fallback !== 'off')
      throw new CliLiveError('usage', 'engine use --fallback takes on or off.');
    if (fallback !== undefined && engine === 'none')
      throw new CliLiveError('usage', 'engine use none takes no --fallback.');
    const value = await call(connect, {
      action: 'use',
      bot,
      role: 'orchestrator',
      engine: engine === 'none' ? null : engine,
      ...(fallback === undefined ? {} : { fallback: fallback === 'on' }),
    });
    if (value['bot'] !== bot || value['role'] !== 'orchestrator') throw protocolError();
    return value;
  }
  throw new CliLiveError('usage', 'Unknown engine command.');
}
