const DEDICATED_ZONE = 'deepseekbot.dev';
const SHARED_ZONES = [
  'botharness.dev',
  'kite-u.com',
  'tobs.app',
  'deepseekbot.app',
  'botharness.ai',
] as const;

export const CONNECT_ZONES: readonly string[] = [DEDICATED_ZONE, ...SHARED_ZONES];

const escape = (zone: string) => zone.replaceAll('.', '\\.');

export const CONNECT_HOSTNAME = new RegExp(
  `^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${escape(DEDICATED_ZONE)}|h[a-z2-7]{12}\\.(?:${SHARED_ZONES.map(escape).join('|')}))$`,
  'u',
);

export function isConnectZoneHost(hostname: string): boolean {
  const name = hostname.toLowerCase();
  return (
    name === DEDICATED_ZONE || name.endsWith(`.${DEDICATED_ZONE}`) || CONNECT_HOSTNAME.test(name)
  );
}
