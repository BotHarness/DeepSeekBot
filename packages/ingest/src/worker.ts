import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { normalizeCaptureBody } from './taxonomy.js';

export const API_HOST = 'us.i.posthog.com';
export const ASSET_HOST = 'us-assets.i.posthog.com';
const ALLOWED_ORIGIN =
  /^(https:\/\/tobs\.app|https:\/\/deepseekbot\.(?:app|dev|botharness\.ai)|https:\/\/[a-z0-9-]+-deepseekbot-site\.[a-z0-9-]+\.workers\.dev|http:\/\/localhost:\d+)$/;
const CAPTURE_PATHS = /^\/(?:batch|e|capture|track|i\/v0\/e)\/?$/u;
const DROPPED = [
  'cookie',
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-real-ip',
];

export const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => (ALLOWED_ORIGIN.test(origin) ? origin : null),
    credentials: true,
    maxAge: 86400,
  }),
);

app.get('/', (c) => c.text('BotHarness telemetry ingest. See https://tobs.app/privacy/\n'));

app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const assets = url.pathname.startsWith('/static/') || url.pathname.startsWith('/array/');
  url.protocol = 'https:';
  url.hostname = assets ? ASSET_HOST : API_HOST;
  url.port = '';

  const headers = new Headers(c.req.raw.headers);
  for (const name of DROPPED) headers.delete(name);
  const client = c.req.header('cf-connecting-ip');
  if (client) headers.set('x-forwarded-for', client);
  else headers.delete('x-forwarded-for');

  const method = c.req.method;
  let body: BodyInit | null =
    method === 'GET' || method === 'HEAD' ? null : await c.req.arrayBuffer();
  if (
    body !== null &&
    method === 'POST' &&
    CAPTURE_PATHS.test(url.pathname) &&
    !url.searchParams.has('compression') &&
    !headers.has('content-encoding')
  ) {
    const normalized = normalizeCaptureBody(new TextDecoder().decode(body));
    if (normalized !== undefined) {
      body = normalized;
      headers.delete('content-length');
    }
  }
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
  });
  const out = new Response(response.body, response);
  out.headers.delete('set-cookie');
  return out;
});

export default app;
