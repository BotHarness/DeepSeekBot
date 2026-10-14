import type { SavedHost } from '../src/host/saved-host';
import { parsePairingLink, redeemPairing } from '../src/host/pairing';
import { nodeCarrier } from './node-carrier';

export async function pairWithLiveHost(
  live: string,
  deviceName: string,
): Promise<{ route: string; operator: ReturnType<typeof nodeCarrier>; host: SavedHost }> {
  const [route, token] = live.split('/?token=') as [string, string];
  const operator = nodeCarrier();
  await operator.request(`${route}/?token=${token}`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  });
  const offer = await operator.request(`${route}/api/botharness/devices/offer`, {
    method: 'POST',
    body: JSON.stringify({ origin: route }),
    signal: AbortSignal.timeout(5000),
  });
  const parsed = parsePairingLink((JSON.parse(await offer.text()) as { link: string }).link);
  if (!parsed.ok) throw new Error(parsed.code);
  const paired = await redeemPairing({
    payload: parsed.payload,
    deviceName,
    carrier: nodeCarrier(),
  });
  if (!paired.ok) throw new Error(paired.code);
  return { route, operator, host: paired.host };
}
