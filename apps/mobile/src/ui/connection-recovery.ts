import { isLanRoute } from '../host/route';
import { t } from './strings';

export function connectionRecoveryText(route: string): string {
  return isLanRoute(route) ? t.pairRefused['lan-unreachable'] : t.connectionNetworkHelp;
}
