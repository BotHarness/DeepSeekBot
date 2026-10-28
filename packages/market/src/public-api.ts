export const PUBLIC_ORIGINS: readonly string[] = [
  'https://tobs.app',
  'https://deepseekbot.app',
  'https://deepseekbot.dev',
  'https://deepseekbot.botharness.ai',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export const PUBLIC_CACHE_CONTROL = 'public, max-age=60';
export const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

export function isPublicRead(pathname: string): boolean {
  return (
    pathname === '/v1/bots' ||
    pathname === '/v1/topics' ||
    /^\/v1\/sections\/[^/]+$/u.test(pathname) ||
    pathname === '/v1/digests' ||
    /^\/v1\/digests\/[^/]+$/u.test(pathname) ||
    /^\/v1\/bots\/[^/]+$/u.test(pathname) ||
    /^\/v1\/bots\/[^/]+\/(files|view)\/.+$/u.test(pathname) ||
    /^\/v1\/authors\/[^/]+\/avatar\/[^/]+$/u.test(pathname)
  );
}

function grant(request: Request, headers: Headers): void {
  headers.append('vary', 'Origin');
  const origin = request.headers.get('origin');
  if (origin !== null && PUBLIC_ORIGINS.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
  }
}

export function preflight(request: Request): Response {
  const headers = new Headers();
  grant(request, headers);
  if (headers.has('access-control-allow-origin')) {
    headers.set('access-control-allow-methods', 'GET');
    headers.set('access-control-allow-headers', 'accept');
    headers.set('access-control-max-age', String(PREFLIGHT_MAX_AGE_SECONDS));
  }
  return new Response(null, { status: 204, headers });
}

export function publicResponse(request: Request, response: Response): Response {
  grant(request, response.headers);
  response.headers.set(
    'cache-control',
    response.status === 200 ? PUBLIC_CACHE_CONTROL : 'no-store',
  );
  return response;
}
