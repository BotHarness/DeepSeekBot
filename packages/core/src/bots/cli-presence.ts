import { CliLiveError } from './cli-live-error.js';
export const PRESENCE_COMMANDS = [
  {
    command: 'presence-status',
    description: 'read whether a desktop Client is active, which holds reply pushes to phones',
  },
  {
    command: 'presence-report',
    description: 'report --client-id as --active (90 s lease) or --idle',
  },
] as const;
export const PRESENCE_OPTIONS = {
  active: { type: 'boolean' },
  idle: { type: 'boolean' },
} as const;
export async function runPresenceCommand(
  command: string,
  rest: string[],
  values: { 'client-id'?: string; active?: boolean; idle?: boolean },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
): Promise<unknown> {
  const report = command === 'presence-report';
  if (rest.length) throw new CliLiveError('usage', `${command} takes no positional arguments.`);
  if (!report && (values['client-id'] || values.active || values.idle))
    throw new CliLiveError('usage', 'presence-status takes no Client or state.');
  if (report && !values['client-id'])
    throw new CliLiveError('usage', 'presence-report requires --client-id.');
  if (report && !values.active === !values.idle)
    throw new CliLiveError('usage', 'presence-report needs exactly one of --active or --idle.');
  const result = await (
    await connect()
  ).http(
    '/api/botharness/presence',
    report ? { clientId: values['client-id'], active: values.active === true } : undefined,
  );
  return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
}
