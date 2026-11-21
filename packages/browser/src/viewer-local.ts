import type { IncomingMessage, ServerResponse } from 'node:http';

import type { BrowserViewerHost } from './viewer.js';
import type { BotBrowserRuntimes } from './runtimes.js';
import { createFrameFeeds } from './frame-feed.js';
import type { TakeoverCompletion, TakeoverService } from './takeover.js';

import { viewerPage } from './viewer-local-page.js';
import { viewerLocaleOf } from './viewer-local-strings.js';

export {
  VIEWER_STRINGS,
  viewerLocaleOf,
  type ViewerLocale,
  type ViewerStrings,
} from './viewer-local-strings.js';

export const LOCAL_VIEWER_PREFIX = '/botharness-browser/viewer/local';

export function localViewerUrl(slug: string): string {
  return `${LOCAL_VIEWER_PREFIX}/?slug=${encodeURIComponent(slug)}`;
}

function headersOf(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

function readBody(request: IncomingMessage, limit = 32_768): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('input too large'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.once('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid input'));
      }
    });
    request.once('error', reject);
  });
}

function boundedAmount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 600;
  return Math.max(100, Math.min(2000, Math.round(value)));
}

function validCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000;
}

export interface LocalViewerOptions {
  runtimes: BotBrowserRuntimes;
  currentTab: (slug: string) => string | undefined;
  isTakeover: (slug: string) => boolean;
  touch: (slug: string) => void;
  hasAccess: (slug: string) => boolean;
  note: (detail: string) => void;
  takeover: TakeoverService;
  frameWaitMs?: number;
}

export type ViewerFrameResult =
  | {
      status: 200;
      seq: number;
      mode: 'stream' | 'snapshot';
      mimeType: string;
      data: string;
      viewport?: { width: number; height: number };
    }
  | { status: 204 }
  | { status: 400 | 403 | 404 | 409 | 503; error: string };

export type ViewerInputResult =
  | { status: 200; url: string; title: string }
  | { status: 400 | 403 | 409; error: string };

export interface LocalViewerActions {
  frame(slug: string, after: string | null): Promise<ViewerFrameResult>;
  input(slug: string, body: Record<string, unknown>): Promise<ViewerInputResult>;
  close(): Promise<void>;
}

export function createLocalViewerActions(options: LocalViewerOptions): LocalViewerActions {
  const feeds = createFrameFeeds(
    options.frameWaitMs === undefined ? {} : { waitMs: options.frameWaitMs },
  );
  const refuse = <S extends 400 | 403 | 404 | 409 | 503>(status: S, error: string) => ({
    status,
    error,
  });
  return {
    async frame(slug, afterText) {
      if (slug === '') return refuse(400, 'slug is required');
      if (!options.hasAccess(slug)) return refuse(403, 'Browser Access is off for this PersonaBot');
      const runtime = options.runtimes.for(slug);
      if (!runtime.isRunning()) return refuse(404, 'browser not running');
      const tabId = options.currentTab(slug);
      if (tabId === undefined) return refuse(404, 'no browser tab');
      const after =
        afterText !== null && /^\d{1,15}$/u.test(afterText) ? Number(afterText) : undefined;
      const next = await feeds.next(slug, tabId, runtime, after);
      if (!options.hasAccess(slug)) return refuse(403, 'Browser Access is off for this PersonaBot');
      if (!runtime.isRunning()) return refuse(404, 'browser not running');
      if (options.runtimes.for(slug) !== runtime)
        return refuse(409, 'Browser authority changed during frame');
      if (options.currentTab(slug) !== tabId) return { status: 204 };
      if (next === undefined) {
        if (after !== undefined) return { status: 204 };
        return refuse(503, 'frame unavailable');
      }
      return {
        status: 200,
        seq: next.seq,
        mode: next.mode,
        mimeType: next.frame.mimeType,
        data: next.frame.data,
        ...(next.frame.viewport === undefined ? {} : { viewport: next.frame.viewport }),
      };
    },

    async input(slug, body) {
      if (slug === '') return refuse(400, 'slug is required');
      if (!options.hasAccess(slug)) return refuse(403, 'Browser Access is off for this PersonaBot');
      if (!options.isTakeover(slug)) return refuse(409, 'Pause the bot before human input');
      const runtime = options.runtimes.for(slug);
      if (!runtime.isRunning()) return refuse(409, 'browser not running');
      const tabId = options.currentTab(slug);
      if (tabId === undefined) return refuse(409, 'no browser tab');
      const done = (page: { url: string; title: string }, input: string) => {
        options.takeover.recordInput(slug, input);
        return { status: 200 as const, url: page.url, title: page.title };
      };
      const kind = body['kind'];
      try {
        if (kind === 'click') {
          const x = body['x'];
          const y = body['y'];
          if (!validCoord(x) || !validCoord(y)) return refuse(400, 'x and y are required');
          const button = body['button'];
          if (button !== undefined && button !== 'left' && button !== 'right')
            return refuse(400, 'button must be left or right');
          options.touch(slug);
          const page = await runtime.clickAt(tabId, x, y, button === 'right' ? 'right' : 'left');
          options.note(`viewer click slug=${slug} button=${button === 'right' ? 'right' : 'left'}`);
          return done(page, `click x=${x} y=${y}`);
        }
        if (kind === 'scroll') {
          const direction = body['direction'] === 'up' ? 'up' : 'down';
          const amount = boundedAmount(body['amount']);
          options.touch(slug);
          const page = await runtime.scroll(tabId, direction, amount);
          options.note(`viewer scroll slug=${slug} direction=${direction} amount=${amount}`);
          return done(page, `scroll ${direction} ${amount}`);
        }
        if (kind === 'type') {
          const text = body['text'];
          if (typeof text !== 'string' || text === '' || text.length > 4000)
            return refuse(400, 'text must be 1-4000 characters');
          options.touch(slug);
          const page = await runtime.insertText(tabId, text);
          options.note(`viewer type slug=${slug} chars=${text.length}`);
          return done(page, `type chars=${text.length}`);
        }
        if (kind === 'key') {
          const key = body['key'];
          if (typeof key !== 'string' || key === '') return refuse(400, 'key is required');
          options.touch(slug);
          const modifiers = Array.isArray(body['modifiers'])
            ? body['modifiers'].filter(
                (entry): entry is 'alt' | 'ctrl' | 'meta' | 'shift' =>
                  entry === 'alt' || entry === 'ctrl' || entry === 'meta' || entry === 'shift',
              )
            : [];
          const page = await runtime.pressKey(tabId, key, modifiers);
          const modText = modifiers.length === 0 ? '' : `+${modifiers.join('+')}`;
          options.note(`viewer key slug=${slug} key=${key.slice(0, 32)}${modText}`);
          return done(page, `key ${key.slice(0, 32)}${modText}`);
        }
      } catch (error) {
        return refuse(409, error instanceof Error ? error.message.slice(0, 200) : 'input failed');
      }
      return refuse(400, 'unknown input kind');
    },

    close: () => feeds.close(),
  };
}

export function registerLocalViewer(
  options: LocalViewerOptions & {
    host: BrowserViewerHost;
    rejection: (headers: Headers) => number | undefined;
    actions?: LocalViewerActions;
  },
): () => void {
  const owned = options.actions === undefined ? createLocalViewerActions(options) : undefined;
  const actions = options.actions ?? owned!;
  const text = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(body);
  };
  const release = options.host.register({
    kind: 'prefix',
    path: LOCAL_VIEWER_PREFIX,
    async handler(request, response) {
      const rejection = options.rejection(headersOf(request));
      if (rejection !== undefined) {
        response.writeHead(rejection);
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname.endsWith('/handoff/accept') || url.pathname.endsWith('/handoff/complete')) {
        if (request.method !== 'POST') return text(response, 405, 'method not allowed');
        let handoffBody: Record<string, unknown>;
        try {
          handoffBody = (await readBody(request)) as Record<string, unknown>;
        } catch {
          return text(response, 400, 'invalid handoff request');
        }
        const token = typeof handoffBody['token'] === 'string' ? handoffBody['token'] : '';
        if (token === '') return text(response, 400, 'token is required');
        const completing = url.pathname.endsWith('/handoff/complete');
        if (completing) {
          const reason = handoffBody['reason'];
          if (reason !== 'done' && reason !== 'failed')
            return text(response, 400, 'reason must be done or failed');
          const finished = options.takeover.complete(token, reason as TakeoverCompletion);
          if (finished === undefined)
            return text(response, 410, 'takeover link expired or already used');
          options.note(`takeover complete slug=${finished.slug} reason=${reason}`);
          response.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        const accepted = options.takeover.accept(token);
        if (accepted === undefined)
          return text(response, 410, 'takeover link expired or already used');
        if (!options.hasAccess(accepted.slug))
          return text(response, 403, 'Browser Access is off for this PersonaBot');
        options.note(`takeover accept slug=${accepted.slug}`);
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(
          JSON.stringify({
            ok: true,
            slug: accepted.slug,
            instructions: accepted.instructions,
            expiresAt: accepted.expiresAt,
          }),
        );
        return;
      }
      if (url.pathname.endsWith('/handoff')) {
        if (request.method !== 'GET') return text(response, 405, 'method not allowed');
        const token = url.searchParams.get('token') ?? '';
        const record = token === '' ? undefined : options.takeover.describe(token);
        if (record === undefined || (record.state !== 'pending' && record.state !== 'accepted'))
          return text(response, 410, 'takeover link expired or already used');
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(
          JSON.stringify({
            ok: true,
            slug: record.slug,
            instructions: record.instructions,
            expiresAt: record.expiresAt,
            state: record.state,
          }),
        );
        return;
      }
      if (url.pathname.endsWith('/input')) {
        if (request.method !== 'POST') return text(response, 405, 'method not allowed');
        let body: Record<string, unknown>;
        try {
          body = (await readBody(request)) as Record<string, unknown>;
        } catch {
          return text(response, 400, 'invalid input');
        }
        const slug =
          typeof body['slug'] === 'string' && body['slug'] !== ''
            ? body['slug']
            : (url.searchParams.get('slug') ?? '');
        const result = await actions.input(slug, body);
        if (result.status !== 200) return text(response, result.status, result.error);
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ ok: true, url: result.url, title: result.title }));
        return;
      }
      if (request.method !== 'GET') return text(response, 405, 'method not allowed');
      const slug = url.searchParams.get('slug') ?? '';
      if (url.pathname.endsWith('/frame')) {
        const result = await actions.frame(slug, url.searchParams.get('after'));
        if (result.status === 204) {
          response.writeHead(204, { 'cache-control': 'no-store' });
          response.end();
          return;
        }
        if (result.status !== 200) return text(response, result.status, result.error);
        const body = Buffer.from(result.data, 'base64');
        response.writeHead(200, {
          'content-type': result.mimeType,
          'content-length': String(body.length),
          'cache-control': 'no-store',
          'x-frame-seq': String(result.seq),
          'x-frame-mode': result.mode,
          ...(result.viewport === undefined
            ? {}
            : {
                'x-viewport-width': String(result.viewport.width),
                'x-viewport-height': String(result.viewport.height),
              }),
        });
        response.end(body);
        return;
      }
      if (slug === '') return text(response, 400, 'slug is required');
      if (!options.hasAccess(slug))
        return text(response, 403, 'Browser Access is off for this PersonaBot');
      const page = viewerPage(viewerLocaleOf(request.headers));
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(Buffer.byteLength(page)),
        'cache-control': 'no-store',
      });
      response.end(page);
    },
  });
  return () => {
    release();
    void owned?.close();
  };
}
