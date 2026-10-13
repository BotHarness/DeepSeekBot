import { randomUUID } from 'node:crypto';

import {
  collectDiagnosticBundle,
  DiagnosticBundleError,
  diagnosticBundleZip,
  type DiagnosticBundle,
  type DiagnosticBundleSelection,
  type DiagnosticBundleSource,
} from './bundle.js';
import { createDiagnosticRedactor } from './redaction.js';

export const DIAGNOSTIC_BUNDLE_PATH = '/api/botharness/diagnostic-bundle';
export const DIAGNOSTIC_BUNDLE_PREVIEW_PATH = DIAGNOSTIC_BUNDLE_PATH + '/preview';

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const PREVIEW_TTL_MS = 5 * 60_000;
const MAX_PREVIEWS = 4;

export interface DiagnosticBundleHttpOptions {
  source: DiagnosticBundleSource;
  homes: ReadonlyArray<{ path: string; label: string }>;
  log?: (message: string) => void;
  now?: () => number;
}

async function json(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 4096) throw new DiagnosticBundleError('invalid-input', 'Request too large');
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new DiagnosticBundleError('invalid-input', 'Invalid request');
  return value as Record<string, unknown>;
}

export function createDiagnosticBundleHttp(options: DiagnosticBundleHttpOptions) {
  const now = options.now ?? Date.now;
  const previews = new Map<string, { bundle: DiagnosticBundle; expires: number }>();
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers });
      const url = new URL(request.url);
      const value = await json(request);
      for (const [token, entry] of previews) if (entry.expires < now()) previews.delete(token);
      if (url.pathname === DIAGNOSTIC_BUNDLE_PREVIEW_PATH) {
        const selection: DiagnosticBundleSelection = {
          channelId: value['channelId'] as string,
          fromMessageId: value['fromMessageId'] as string,
          ...(value['toMessageId'] === undefined
            ? {}
            : { toMessageId: value['toMessageId'] as string }),
          ...(value['messageIds'] === undefined
            ? {}
            : { messageIds: value['messageIds'] as string[] }),
          ...(value['paddingMinutes'] === undefined
            ? {}
            : { paddingMinutes: value['paddingMinutes'] as number }),
        };
        const bundle = await collectDiagnosticBundle(
          options.source,
          selection,
          createDiagnosticRedactor({ homes: options.homes }),
        );
        const token = randomUUID();
        while (previews.size >= MAX_PREVIEWS) previews.delete(previews.keys().next().value!);
        previews.set(token, { bundle, expires: now() + PREVIEW_TTL_MS });
        options.log?.(
          `diagnostic-bundle initiator=human phase=previewed channels=${bundle.summary.channels.length} sessions=${bundle.summary.sessions.length} bytes=${bundle.bytes}`,
        );
        return Response.json({ token, bytes: bundle.bytes, ...bundle.summary }, { headers });
      }
      if (url.pathname !== DIAGNOSTIC_BUNDLE_PATH)
        return new Response(null, { status: 404, headers });
      const token = value['token'];
      const entry = typeof token === 'string' ? previews.get(token) : undefined;
      if (entry === undefined)
        return Response.json(
          { error: { code: 'preview-stale', message: 'Review a fresh preview' } },
          { status: 400, headers },
        );
      previews.delete(token as string);
      const archive = diagnosticBundleZip(entry.bundle);
      const stamp = new Date(now()).toISOString().replace(/[:.]/gu, '-').slice(0, 19);
      options.log?.(
        `diagnostic-bundle initiator=human phase=exported channels=${entry.bundle.summary.channels.length} sessions=${entry.bundle.summary.sessions.length} bytes=${archive.length}`,
      );
      return new Response(new Uint8Array(archive), {
        headers: {
          ...headers,
          'content-type': 'application/zip',
          'content-length': String(archive.length),
          'content-disposition': `attachment; filename="deepseekbot-diagnostics-${stamp}.zip"`,
        },
      });
    } catch (error) {
      const code =
        error instanceof DiagnosticBundleError
          ? error.code
          : error instanceof SyntaxError
            ? 'invalid-input'
            : 'operation-failed';
      options.log?.(`diagnostic-bundle initiator=human phase=refused reason=${code}`);
      return Response.json(
        {
          error: {
            code,
            message:
              error instanceof DiagnosticBundleError
                ? error.message
                : 'Diagnostic export failed; inspect developer diagnostics',
          },
        },
        { status: 400, headers },
      );
    }
  };
}
