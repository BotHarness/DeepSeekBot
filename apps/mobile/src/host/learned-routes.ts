import type { SavedHost } from './hosts';
import { checkRoute, isConnectRoute, isLanRoute } from './route';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function preferredRoutes(routes: readonly string[]): string[] {
  const priority = (route: string) => (isLanRoute(route) ? 0 : isConnectRoute(route) ? 2 : 1);
  return [...new Set(routes)].sort((a, b) => priority(a) - priority(b));
}

export function learnedRoutes(
  host: Pick<SavedHost, 'hostId' | 'routes' | 'encryption'>,
  input: unknown,
): string[] {
  const value = record(input);
  if (record(value['host'])['id'] !== host.hostId) return host.routes;
  const identity = record(record(value['connect'])['encryption']);
  if (host.encryption && identity['publicKey'] !== host.encryption.hostKey) return host.routes;
  const advertised = record(value['routes'])['routes'];
  if (!Array.isArray(advertised)) return host.routes;
  const added: string[] = [];
  for (const entry of advertised.slice(0, 32)) {
    const item = record(entry);
    if (item['ready'] !== true || typeof item['url'] !== 'string') continue;
    const checked = checkRoute(item['url']);
    if (!checked.ok) continue;
    const url = new URL(checked.origin);
    if (isLanRoute(checked.origin) || isConnectRoute(checked.origin)) {
      if (!host.encryption) continue;
    } else if (!url.hostname.endsWith('.ts.net')) continue;
    added.push(checked.origin);
  }
  return preferredRoutes([...new Set([...added, ...host.routes])].slice(0, 12));
}
