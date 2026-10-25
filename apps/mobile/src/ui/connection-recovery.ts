import { isConnectRoute, isLanRoute } from '../host/route';
import { t } from './strings';

export function connectionRecoveryText(route: string): string {
  if (isLanRoute(route)) return t.pairRefused['lan-unreachable'];
  if (isConnectRoute(route)) return t.connectionConnectHelp;
  try {
    const name = new URL(route).hostname;
    if (name.endsWith('.ts.net') || name.startsWith('100.')) return t.connectionTailscaleHelp;
  } catch {}
  return t.connectionNetworkHelp;
}
