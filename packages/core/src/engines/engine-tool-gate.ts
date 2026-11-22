import { deviceToolAuthorization } from '../workspaces/grant-execution.js';
import type { EngineToolGate } from './engine-tools.js';

export interface EngineDeviceTools {
  ownsTool?(name: string): boolean;
  needsAuthorization?(sessionId: string): boolean;
  authorizationScope?(sessionId?: string): string;
  approvalScope?(sessionId: string): string;
  markAuthorized?(sessionId: string, scope?: string): boolean | void;
}

export interface EngineToolGateDeps {
  owner(sessionId: string): string | undefined;
  botExists(slug: string): boolean;
  fullAccess(sessionId: string): boolean;
  devices(): readonly {
    kind: 'computer' | 'browser';
    tools: EngineDeviceTools | undefined;
    reason: string;
  }[];
  approvalRequired(name: string, args: Record<string, unknown>): boolean;
}

const DEVICE_CHANGED =
  'Device authority changed while awaiting Human approval; request a new action.';

export function createEngineToolGate(deps: EngineToolGateDeps): EngineToolGate {
  return async ({ botSlug, session, toolName, args, signal, ask }) => {
    if (deps.owner(session.id) !== botSlug) return 'BotHarness Session has no durable owner';
    if (!deps.botExists(botSlug)) return 'PersonaBot identity is deleted or unavailable';
    for (const { kind, tools, reason } of deps.devices()) {
      if (tools?.ownsTool?.(toolName) !== true) continue;
      const authorization = deviceToolAuthorization(tools, session.id, deps.fullAccess(session.id));
      if (authorization === 'authorized') return undefined;
      if (authorization === 'changed') return DEVICE_CHANGED;
      const scope = tools.authorizationScope?.(session.id);
      const approvalScope = tools.approvalScope?.bind(tools);
      const outcome = await ask({
        toolName,
        input: args,
        reason,
        device: {
          kind,
          ...(approvalScope === undefined
            ? {}
            : { authorizationScope: () => approvalScope(session.id) }),
        },
      });
      if (outcome !== 'allowed-once') return `Human approval was ${outcome}`;
      return tools.markAuthorized?.(session.id, scope) === false ? DEVICE_CHANGED : undefined;
    }
    if (!deps.approvalRequired(toolName, args)) return undefined;
    signal.throwIfAborted();
    const outcome = await ask({ toolName, input: args });
    return outcome === 'allowed-once' ? undefined : `Human approval was ${outcome}`;
  };
}
