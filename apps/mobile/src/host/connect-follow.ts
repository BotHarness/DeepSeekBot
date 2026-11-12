import type { ConnectHost } from './connect-account';
import type { SavedHost } from './hosts';
import { isConnectRoute } from './route';

export interface ConnectFollow {
  hostId: string;
  credential: string;
  connectHost: string;
  routes: string[];
}

function label(route: string): string | undefined {
  try {
    return new URL(route).hostname.split('.')[0];
  } catch {
    return undefined;
  }
}

export function followConnectHosts(
  saved: readonly SavedHost[],
  listed: readonly ConnectHost[],
): ConnectFollow[] {
  const byId = new Map(listed.map((host) => [host.id, host]));
  return saved.flatMap((host) => {
    if (host.accountOwner === undefined || host.encryption?.privateRelay !== undefined) return [];
    const connectRoutes = host.routes.filter(isConnectRoute);
    if (connectRoutes.length === 0) return [];
    const match =
      (host.connectHost === undefined ? undefined : byId.get(host.connectHost)) ??
      connectRoutes.map((route) => byId.get(label(route) ?? '')).find(Boolean);
    if (match === undefined) return [];
    const target = `https://${match.hostname}`;
    if (!isConnectRoute(target)) return [];
    const routes = [
      ...new Set(host.routes.map((route) => (isConnectRoute(route) ? target : route))),
    ];
    if (
      host.connectHost === match.id &&
      routes.length === host.routes.length &&
      routes.every((route, index) => route === host.routes[index])
    )
      return [];
    return [{ hostId: host.hostId, credential: host.credential, connectHost: match.id, routes }];
  });
}
