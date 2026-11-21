import { TeamError } from '../team/error.js';
import type { EngineHost } from './engine-host.js';
import type { EngineSelectionBridgeMethods } from './engine-selection-bridge.js';
import { EngineRefusal, isEngineId } from './engine-session.js';
import { type EngineBotTool, searchEngineTools } from './engine-tools.js';

export const ENGINES_PATH = '/api/botharness/engines';

const refusal = (code: string, message: string, status = 400) =>
  Response.json({ error: { code, message } }, { status });

export interface EngineApprovalCard {
  botSlug: string;
  sessionId: string;
  channelId: string;
  messageId: string;
  toolName: string;
  input: string;
  expiresAt: string;
}

export interface EngineRouteDeps extends EngineSelectionBridgeMethods {
  host: EngineHost;
  botExists(slug: string): boolean;
  authorizeLogin?(): void;
  approvals?(): EngineApprovalCard[];
  tools?(bot: string): Promise<readonly EngineBotTool[]>;
  runTool?(bot: string, tool: string, args: Record<string, unknown>): Promise<unknown>;
}

export async function engineRouteFetch(request: Request, deps: EngineRouteDeps): Promise<Response> {
  const { host } = deps;
  const select = async (input: object, includeApprovals = false) => {
    const result = await deps.engineSelection(input);
    if (!result.ok) {
      const { code, message } = result.error;
      if (code === 'bot-not-found') return refusal('unknown-bot', 'Unknown PersonaBot', 404);
      if (code === 'model-not-allowed' || code === 'permission-required')
        return refusal(code, message, 403);
      return refusal(
        code,
        message,
        ['invalid-input', 'unknown-engine', 'unknown-model', 'unknown-effort'].includes(code)
          ? 400
          : 409,
      );
    }
    return Response.json(
      includeApprovals ? { ...result.value, approvals: deps.approvals?.() ?? [] } : result.value,
    );
  };
  if (request.method === 'GET') return select({ action: 'status' }, true);

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return refusal('invalid-input', 'Expected a JSON object');
    body = parsed as Record<string, unknown>;
  } catch {
    return refusal('invalid-input', 'Expected a JSON object');
  }
  try {
    if (body['action'] === 'login') {
      if (!deps.authorizeLogin) return refusal('permission-required', 'modelSources.manage', 403);
      deps.authorizeLogin();
      if (typeof body['engine'] !== 'string') return refusal('unknown-engine', 'Unknown engine');
      const account = host.target(body['engine']);
      return Response.json(await host.login(account.engine, account.id));
    }
    if (body['action'] === 'models' || body['action'] === 'status') {
      if (typeof body['engine'] !== 'string' || body['engine'] === '')
        return refusal('unknown-engine', 'Unknown engine');
      return select(body, body['action'] === 'status');
    }
    if (body['action'] === 'use') {
      if (typeof body['bot'] !== 'string' || body['bot'] === '')
        return refusal('unknown-bot', 'Unknown PersonaBot', 404);
      if (body['engine'] !== null && !isEngineId(body['engine']))
        return refusal('unknown-engine', 'Unknown engine');
      return select(body);
    }
    if (body['action'] === 'tools' || body['action'] === 'tool') {
      const bot = body['bot'];
      if (typeof bot !== 'string' || !deps.botExists(bot))
        return refusal('unknown-bot', 'Unknown PersonaBot', 404);
      if (deps.tools === undefined || deps.runTool === undefined)
        return refusal('engine-unavailable', 'Engine Bot tools are unavailable', 409);
      if (body['action'] === 'tools') {
        const query = body['query'];
        if (query !== undefined && typeof query !== 'string')
          return refusal('invalid-input', 'query must be a string');
        return Response.json(
          JSON.parse(searchEngineTools(await deps.tools(bot), { query: query ?? '', limit: 20 })),
        );
      }
      const tool = body['tool'];
      const args = body['args'] ?? {};
      if (typeof tool !== 'string' || tool === '')
        return refusal('invalid-input', 'tool is required');
      if (typeof args !== 'object' || args === null || Array.isArray(args))
        return refusal('invalid-input', 'args must be an object');
      try {
        return Response.json({
          bot,
          tool,
          result: await deps.runTool(bot, tool, args as Record<string, unknown>),
        });
      } catch (error) {
        return refusal('tool-failed', error instanceof Error ? error.message : String(error), 409);
      }
    }
    return refusal('invalid-input', 'action must be status, login, models, use, tools or tool');
  } catch (error) {
    if (error instanceof TeamError) return refusal(error.code, error.message, 403);
    if (error instanceof EngineRefusal)
      return refusal(
        error.code,
        error.message,
        ['unknown-engine', 'unknown-model', 'unknown-effort'].includes(error.code) ? 400 : 409,
      );
    throw error;
  }
}
