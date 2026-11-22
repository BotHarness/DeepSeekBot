import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { TobCliCommand, TobCliStatus } from '../../tob/cli-request.js';
import type { DirectBotToolSpec } from '../../runtime/bot-runtime.js';
import type { TobAdapterMethods } from './methods.js';

export function tobHome(methods: TobAdapterMethods) {
  return unwrapAsync(methods.tobHome({}));
}

export async function tobCli(
  methods: TobAdapterMethods,
  action: 'start' | 'status' | 'cancel',
  command?: TobCliCommand,
  id?: string,
): Promise<TobCliStatus> {
  return unwrap(await methods.tobCli(action === 'start' ? { action, command } : { action, id }));
}

export function botTools(methods: TobAdapterMethods): {
  sessionId: 'direct';
  tools: DirectBotToolSpec[];
} {
  return unwrap(methods.botTools({}));
}

export function botToolRun(
  methods: TobAdapterMethods,
  slug: string,
  tool: string,
  args?: Record<string, unknown>,
  sessionId?: string,
  sourceEventId?: string,
): Promise<{
  slug: string;
  tool: string;
  sessionId: 'direct';
  result: unknown;
}> {
  return unwrapAsync(
    methods.botToolRun({
      slug,
      tool,
      ...(args === undefined ? {} : { args }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(sourceEventId === undefined ? {} : { sourceEventId }),
    }),
  );
}
