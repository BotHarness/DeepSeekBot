import { connectionKey, parseInstance, type InstanceConfig } from './instance-contract';
import { fail, requestJson } from './client-transport';

export function parseCloudQr(text: string): InstanceConfig {
  if (text.length > 4096) return fail('INVALID_INSTANCE_CONFIG');
  try {
    return parseInstance(JSON.parse(text));
  } catch {
    return fail('INVALID_INSTANCE_CONFIG');
  }
}
export function configurationChanges(previous: InstanceConfig, next: InstanceConfig) {
  const fields = (c: InstanceConfig): Record<string, string> => ({
    server: c.server,
    instanceId: c.instanceId,
    environment: c.environment,
    clientId: c.auth.clientId,
    issuer: c.auth.issuer,
    authkitDomain: c.auth.authkitDomain,
    deviceAuthorizationEndpoint: c.auth.deviceAuthorizationEndpoint,
    tokenEndpoint: c.auth.tokenEndpoint,
    jwksUri: c.auth.jwksUri,
    mobileRedirectUris: c.auth.mobileRedirectUris.join(', '),
  });
  const before = fields(previous),
    after = fields(next);
  return Object.keys(before)
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, previous: before[field], next: after[field] }));
}

export async function checkDiscovery(
  json: (url: string) => ReturnType<typeof requestJson>,
  config: InstanceConfig,
) {
  const r = await json(config.server + '/.well-known/open-cloud-groups');
  if (!r.ok) return fail('INSTANCE_UNAVAILABLE');
  if (connectionKey(parseInstance(r.value)) !== connectionKey(config))
    return fail('INSTANCE_CONFIG_CHANGED');
}
