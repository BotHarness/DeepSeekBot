export const CONNECT_ZONES: readonly string[] = ['deepseekbot.dev'];

export const CONNECT_HOSTNAME = new RegExp(
  `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(?:${CONNECT_ZONES.map((zone) => zone.replaceAll('.', '\\.')).join('|')})$`,
  'u',
);

export function isConnectZoneHost(hostname: string): boolean {
  const name = hostname.toLowerCase();
  return CONNECT_ZONES.some((zone) => name === zone || name.endsWith(`.${zone}`));
}
