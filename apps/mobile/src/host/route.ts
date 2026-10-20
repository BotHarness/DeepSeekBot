export type RouteCheck = { ok: true; origin: string } | { ok: false; reason: string };

export function checkRoute(input: string): RouteCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return {
      ok: false,
      reason: 'Enter the Host address, for example https://my-mac.tailnet.ts.net',
    };
  }
  const name = url.hostname;
  const loopback = name === 'localhost' || name === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(name);
  const tailnet =
    name.endsWith('.ts.net') || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(name);
  const connect = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.deepseekbot\.dev$/u.test(name);
  const allowed =
    (loopback && (url.protocol === 'http:' || url.protocol === 'https:')) ||
    ((tailnet || (connect && url.port === '')) && url.protocol === 'https:');
  if (
    !allowed ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    return {
      ok: false,
      reason:
        'Use a Tailscale HTTPS address (*.ts.net), a Connect address (*.deepseekbot.dev) or a loopback address, without a path.',
    };
  return { ok: true, origin: url.origin };
}

export function socketOrigin(origin: string): string {
  return origin.replace(/^http/u, 'ws');
}
