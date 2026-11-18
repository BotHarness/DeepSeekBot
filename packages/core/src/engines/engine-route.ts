import type { EngineHost } from './engine-host.js';
import { EngineRefusal, isEngineId } from './engine-session.js';

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
    return refusal('invalid-input', 'action must be login or use');
  } catch (error) {
    if (error instanceof EngineRefusal) return refusal(error.code, error.message, 409);
    throw error;
  }
}
