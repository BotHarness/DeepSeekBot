import { CliLiveError } from './cli-live-error.js';

export const PHONE_ROUTE_COMMANDS = [
  {
    command: 'phone-route',
    description: 'show whether a paired phone can reach this Host over Tailscale',
  },
  {
    command: 'phone-route-publish',
    description: 'run tailscale serve so phones can reach this Host (needs --confirm)',
  },
  {
    command: 'phone-route-disable',
    description:
      'disable managed Tailscale publishing while keeping other routes (needs --confirm)',
  },
] as const;

export async function runPhoneRouteCommand(
  command: string,
  rest: string[],
  values: { confirm?: boolean },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
): Promise<unknown> {
  if (rest.length) throw new CliLiveError('usage', `${command} takes no arguments.`);
  const publish = command === 'phone-route-publish' || command === 'phone-route-disable';
  if (publish && values.confirm !== true)
    throw new CliLiveError(
      'confirm-required',
      `${command} changes Tailscale publishing on the Host computer. Pass --confirm.`,
    );
  const host = await connect();
  const { bytes } = publish
    ? await host.http('/api/botharness/devices/serve', {
        confirm: true,
        ...(command === 'phone-route-disable' ? { action: 'disable' } : {}),
      })
    : await host.http('/api/botharness/devices');
  const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  return publish ? value : { routes: value['routes'] };
}
