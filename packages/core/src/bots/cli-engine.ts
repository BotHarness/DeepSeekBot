import { isEngineId } from '@botharness/host-protocol/subscription-engine';
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
    command: 'engine-accounts',
    description:
      'list subscription accounts and their revision, or use --grantable to list accounts granted to the caller',
  },
  { command: 'engine-account-add', description: 'add a named Codex or Claude Code account' },
  { command: 'engine-account-rename', description: 'rename a subscription account' },
  { command: 'engine-account-remove', description: 'remove an unused account and its home' },
  {
    command: 'engine-login',
    description: 'start sign-in on the Host or submit a Claude Code authorization code from stdin',
  },
  {
    command: 'engine-models',
    description:
      'list the models and effort levels the signed-in engine subscription offers (engine models codex|claude)',
  },
  {
    command: 'engine-use',
    description:
      'run a Bot Orchestrator or its Assignments on an engine, or none for the API model, and resume a Bot paused by the limit (engine use <bot> codex|claude --role orchestrator|assignment [--model <id>] [--effort <level>] [--fallback on])',
  },
] as const;

type Connect = () => Promise<{
  rpc?(name: string, args: Record<string, unknown>): Promise<unknown>;
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
  selection = false,
): Promise<Record<string, unknown>> {
  const host = await connect();
  if (selection && host.rpc) {
    const value = await host.rpc('engineSelection', { request: body ?? { action: 'status' } });
    if (!isObject(value)) throw protocolError();
    return value;
  }
  const result = await host.http(PATH, body);
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
  values: {
    role?: string[];
    name?: string;
    account?: string;
    as?: string;
    confirm?: boolean;
    'expected-revision'?: string;
    fallback?: string;
    query?: string;
    model?: string;
    effort?: string;
    'args-stdin'?: boolean;
    'code-stdin'?: boolean;
    grantable?: boolean;
  },
  connect: Connect,
  readStdin: () => Promise<string> = async () => '',
): Promise<unknown> {
  if (values['code-stdin'] && (command !== 'engine-login' || rest[0] !== 'claude'))
    throw new CliLiveError('usage', '--code-stdin requires engine login claude.');
  if (values.grantable && command !== 'engine-accounts')
    throw new CliLiveError('usage', '--grantable requires engine accounts.');
  if (command === 'engine-list' || command === 'engine-status') {
    if (rest.length > (command === 'engine-status' ? 1 : 0))
      throw new CliLiveError('usage', 'engine status accepts one optional engine or account ID.');
    const value = await call(
      connect,
      rest.length === 0 ? undefined : { action: 'status', engine: rest[0] },
      values.as !== undefined,
    );
    const engines = value['engines'];
    if (!Array.isArray(engines) || !engines.every(isObject) || !Array.isArray(value['selections']))
      throw protocolError();
    if (command === 'engine-list') {
      const byEngine = new Map<unknown, Record<string, unknown>>();
      for (const engine of engines) {
        const key = engine['engine'];
        if (!byEngine.has(key) || engine['available'] === true) byEngine.set(key, engine);
      }
      return {
        engines: [...byEngine.values()].map((engine) => ({
          engine: engine['engine'],
          displayName: engine['displayName'],
          available: engine['available'],
          ...(engine['reason'] === undefined ? {} : { reason: engine['reason'] }),
        })),
      };
    }
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
  if (
    command === 'engine-accounts' ||
    command.startsWith('engine-account-') ||
    command === 'engine-login'
  ) {
    const rpc = async (method: string, args: Record<string, unknown>) => {
      const host = await connect();
      if (!host.rpc) throw protocolError();
      return host.rpc(method, args);
    };
    if (command === 'engine-accounts') {
      if (rest.length)
        throw new CliLiveError('usage', 'engine accounts takes no positional arguments.');
      return rpc('engineAccounts', values.grantable ? { grantable: true } : {});
    }
    if (rest.length !== 1 || !rest[0])
      throw new CliLiveError('usage', `${command} needs one engine or account ID.`);
    const [id] = rest;
    if (command === 'engine-login') {
      if (values.account !== undefined && (!isEngineId(id) || values.account.trim() === ''))
        throw new CliLiveError(
          'usage',
          '--account needs an account ID and a codex or claude engine.',
        );
      const accountId = values.account ?? id;
      if (values['code-stdin']) {
        const code = (await readStdin()).trim();
        if (!/^[!-~]{1,2048}$/u.test(code))
          throw new CliLiveError('usage', '--code-stdin needs one authorization code on stdin.');
        const result = await rpc('engineAccountSubmitCode', { id: accountId, code });
        if (!isObject(result) || result['submitted'] !== true) throw protocolError();
        return { submitted: true };
      }
      const result = await rpc(
        'engineAccountLogin',
        values.account === undefined ? { id } : { id: accountId, engine: id },
      );
      if (!isObject(result) || result['started'] !== true || typeof result['engine'] !== 'string')
        throw protocolError();
      return result;
    }
    const rawRevision = values['expected-revision'];
    const expectedRevision = Number(rawRevision);
    if (
      rawRevision === undefined ||
      !/^\d+$/u.test(rawRevision) ||
      !Number.isSafeInteger(expectedRevision)
    )
      throw new CliLiveError('usage', 'Provide --expected-revision from engine accounts.');
    if (command === 'engine-account-remove') {
      if (!values.confirm)
        throw new CliLiveError('usage', 'engine account-remove requires --confirm.');
      return rpc('engineAccountRemove', { id, expectedRevision, confirm: true });
    }
    const name = values.name?.trim();
    if (!name) throw new CliLiveError('usage', `${command} needs --name.`);
    if (command === 'engine-account-add')
      return rpc('engineAccountAdd', { engine: id, name, expectedRevision });
    if (command === 'engine-account-rename')
      return rpc('engineAccountRename', { id, name, expectedRevision });
  }
  if (command === 'engine-models') {
    if (rest.length !== 1)
      throw new CliLiveError('usage', 'engine models needs one engine or account ID.');
    const value = await call(
      connect,
      { action: 'models', engine: rest[0] },
      values.as !== undefined,
    );
    if (!Array.isArray(value['models']) || !value['models'].every(isObject)) throw protocolError();
    return value;
  }
  if (command === 'engine-use') {
    if (rest.length !== 2)
      throw new CliLiveError(
        'usage',
        'engine use needs <bot> and an engine (codex, claude or none).',
      );
    const role = values.role ?? [];
    const chosen = role[0];
    if (role.length !== 1 || (chosen !== 'orchestrator' && chosen !== 'assignment'))
      throw new CliLiveError('usage', 'engine use needs --role orchestrator or --role assignment.');
    const [bot, engine] = rest as [string, string];
    const fallback = values.fallback;
    if (fallback !== undefined && fallback !== 'on' && fallback !== 'off')
      throw new CliLiveError('usage', 'engine use --fallback takes on or off.');
    if (fallback !== undefined && engine === 'none')
      throw new CliLiveError('usage', 'engine use none takes no --fallback.');
    if (fallback !== undefined && chosen === 'assignment')
      throw new CliLiveError('usage', 'engine use --role assignment takes no --fallback.');
    const { model, effort, account } = values;
    if ((model !== undefined || effort !== undefined || account !== undefined) && engine === 'none')
      throw new CliLiveError('usage', 'engine use none takes no --model, --effort or --account.');
    const value = await call(
      connect,
      {
        action: 'use',
        bot,
        role: chosen,
        engine: engine === 'none' ? null : engine,
        ...(fallback === undefined ? {} : { fallback: fallback === 'on' }),
        ...(model === undefined ? {} : { model }),
        ...(effort === undefined ? {} : { effort }),
        ...(account === undefined ? {} : { accountId: account }),
      },
      values.as !== undefined,
    );
    if (value['bot'] !== bot || value['role'] !== chosen) throw protocolError();
    return value;
  }
  throw new CliLiveError('usage', 'Unknown engine command.');
}
