import { unwrap, unwrapAsync } from '../../kernel/rpc-result.js';
import type { TobCliCommand, TobCliStatus } from '../../kernel/tob-cli-request.js';
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

export const tobRpcMethods = {
  managementGrants(slug?: string) {
    return unwrap(this.methods.managementGrants(slug === undefined ? {} : { slug }));
  },

  managementGrantSet(
    slug: string,
    capability: 'manage-app' | 'manage-bots',
    enabled: boolean,
    confirm: boolean,
  ) {
    return unwrap(this.methods.managementGrantSet({ slug, capability, enabled, confirm }));
  },

  tobHome() {
    return tobHome(this.methods);
  },

  async tobCli(
    action: 'start' | 'status' | 'cancel',
    command?: TobCliCommand,
    id?: string,
  ): Promise<TobCliStatus> {
    return tobCli(this.methods, action, command, id);
  },
} satisfies ThisType<{ readonly methods: TobAdapterMethods }>;

export const directBotToolRpc = {
  botTools(): { sessionId: 'direct'; tools: DirectBotToolSpec[] } {
    return botTools(this.methods);
  },

  botToolRun(
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
    return botToolRun(this.methods, slug, tool, args, sessionId, sourceEventId);
  },
} satisfies ThisType<{ readonly methods: TobAdapterMethods }>;
