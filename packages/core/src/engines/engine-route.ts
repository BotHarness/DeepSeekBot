import type { EngineHost } from './engine-host.js';
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

export interface EngineRouteDeps {
  host: EngineHost;
  botExists(slug: string): boolean;
  releaseQuotaHold?(slug: string): void;
  approvals?(): EngineApprovalCard[];
  tools?(bot: string): Promise<readonly EngineBotTool[]>;
  runTool?(bot: string, tool: string, args: Record<string, unknown>): Promise<unknown>;
}

export async function engineRouteFetch(request: Request, deps: EngineRouteDeps): Promise<Response> {
  const { host } = deps;
  if (request.method === 'GET') {
    return Response.json({
      engines: await host.status(),
      selections: host.store.selections().filter((entry) => deps.botExists(entry.botSlug)),
      approvals: deps.approvals?.() ?? [],
    });
  }
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
      if (!isEngineId(body['engine'])) return refusal('unknown-engine', 'Unknown engine');
      return Response.json(await host.login(body['engine']));
    }
    if (body['action'] === 'use') {
      const bot = body['bot'];
      const engine = body['engine'];
      if (typeof bot !== 'string' || !deps.botExists(bot))
        return refusal('unknown-bot', 'Unknown PersonaBot', 404);
      if (body['role'] !== 'orchestrator')
        return refusal('invalid-input', 'Only the orchestrator role can use an engine now');
      if (engine !== null && !isEngineId(engine))
        return refusal('unknown-engine', 'Unknown engine');
      const fallback = body['fallback'];
      if (fallback !== undefined && typeof fallback !== 'boolean')
        return refusal('invalid-input', 'fallback must be true or false');
      if (engine === null && fallback === true)
        return refusal('invalid-input', 'fallback needs an engine');
      host.use(bot, 'orchestrator', engine ?? undefined, { fallback: fallback === true });
      deps.releaseQuotaHold?.(bot);
      return Response.json({
        bot,
        role: 'orchestrator',
        engine,
        ...(engine === null ? {} : { fallback: fallback === true }),
      });
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
    return refusal('invalid-input', 'action must be login, use, tools or tool');
  } catch (error) {
    if (error instanceof EngineRefusal) return refusal(error.code, error.message, 409);
    throw error;
  }
}
