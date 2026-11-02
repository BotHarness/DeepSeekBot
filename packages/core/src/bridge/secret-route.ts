export const SECRET_ROUTE_METHODS = [
  'botharness/privateInputSubmit',
  'botharness/privateInputReplace',
  'botharness/cloudConnections',
  'credentials/set',
  'settings/update',
  'settings/replace',
  'settings/mutate',
  'dsh-im/app-setup',
] as const;

const methods = new Set<string>(SECRET_ROUTE_METHODS);

export const SECRET_ROUTE_REFUSAL = Object.freeze({
  code: 'secret-route-refused',
  message: 'Enter secrets on this Host or over Tailscale. Connect is not end-to-end encrypted.',
  details: {},
});

export function secretRouteRefusal(endpoint: string): typeof SECRET_ROUTE_REFUSAL | undefined {
  return methods.has(endpoint) ? SECRET_ROUTE_REFUSAL : undefined;
}
