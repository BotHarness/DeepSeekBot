import { CliLiveError } from './cli-live-error.js';

const DOMAINS = {
  preferences: 'theme, locale and this-Host notification preferences',
  layout: 'global layout and one Channel workspace layout',
  shortcuts: 'navigation shortcut bindings',
} as const;
type Domain = keyof typeof DOMAINS;

export const CLIENT_SETTINGS_COMMANDS = (Object.keys(DOMAINS) as Domain[]).flatMap((domain) => [
  {
    command: `client-${domain}-get` as const,
    description: `read ${DOMAINS[domain]} and their revision from an explicit --client-id`,
  },
  {
    command: `client-${domain}-set` as const,
    description: `write --patch-stdin ${DOMAINS[domain]} to an explicit --client-id with --expected-revision`,
  },
]);

const domainOf = (command: string): { domain: Domain; write: boolean } | undefined => {
  const match = /^client-(preferences|layout|shortcuts)-(get|set)$/u.exec(command);
  return match ? { domain: match[1] as Domain, write: match[2] === 'set' } : undefined;
};

export const isClientSettingsCommand = (command: string): boolean =>
  domainOf(command) !== undefined;

const UNKNOWN_AFTER = [
  'host-unreachable',
  'host-protocol-error',
  'appearance-client-timeout',
  'appearance-client-stale',
  'appearance-request-stale',
];

export async function runClientSettings(
  command: string,
  rest: string[],
  values: { 'client-id'?: string; 'patch-stdin'?: boolean; 'expected-revision'?: string },
  io: { readStdin?: () => Promise<string> },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  expiresAt: number,
) {
  const target = domainOf(command);
  if (!target || rest.length || !values['client-id'])
    throw new CliLiveError('usage', 'Select exactly one --client-id from appearance-clients.');
  if (target.write !== !!values['patch-stdin'] || target.write !== !!values['expected-revision'])
    throw new CliLiveError(
      'usage',
      target.write
        ? `${command} needs --patch-stdin and --expected-revision from client-${target.domain}-get.`
        : `${command} is read-only; use client-${target.domain}-set to write.`,
    );
  const check = () => {
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt)
      throw new CliLiveError('appearance-request-stale', 'The Client request deadline has passed.');
  };
  check();
  let patch: unknown;
  if (target.write) {
    try {
      patch = JSON.parse((await io.readStdin?.()) ?? '');
    } catch {
      throw new CliLiveError('invalid-input', 'Invalid JSON patch on stdin.');
    }
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
      throw new CliLiveError('invalid-input', 'The patch must be a JSON object.');
  }
  check();
  const host = await connect();
  check();
  try {
    const result = await host.http('/api/botharness/appearance-control', {
      action: 'request',
      clientId: values['client-id'],
      expiresAt,
      settings: { domain: target.domain, ...(target.write ? { patch } : {}) },
      ...(target.write ? { expectedRevision: values['expected-revision'] } : {}),
    });
    return JSON.parse(new TextDecoder().decode(result.bytes)) as unknown;
  } catch (error) {
    if (target.write && (!(error instanceof CliLiveError) || UNKNOWN_AFTER.includes(error.code)))
      throw new CliLiveError(
        'client-settings-outcome-unknown',
        `The write result is unknown. Run client-${target.domain}-get on the same Client before retrying; disconnecting does not cancel a delivered command before its deadline.`,
      );
    throw error;
  }
}
