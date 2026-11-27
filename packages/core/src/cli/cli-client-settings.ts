import { CliLiveError } from './cli-live-error.js';

const DOMAINS = {
  preferences: 'theme, locale and the Device Notification Preference',
  layout: 'global layout, gap, members panel and one Channel workspace layout',
  shortcuts: 'navigation shortcut bindings',
} as const;
type Domain = keyof typeof DOMAINS;

const PATCHES: Record<Domain, string> = {
  preferences:
    'any of {"locale":"<locale.available id>","notifications":{"enabled":true|false}}; theme is written by appearance-set {"preference":"system|light|dark"}',
  layout:
    'any of {"global":{...},"rail":{...}} with keys from client-layout-get (global.column.heights sets panel ids to 120-4000 px or null), {"gap":0-16}, {"members":{"open":true|false,"ratio":0.2-0.6}}, plus {"channel":{"id":"<channel id>","open":true|false,"direction":"left|right|above|below","ratio":0.2-0.8}}; a Channel with splitSaved takes one of "move":{"panel","target","direction"}, "resize":{"path":"<0/1 steps>","ratio":0.2-0.8}, "split":<tree> or "split":null instead of direction/ratio',
  shortcuts:
    'one action: {"action":"<id>","binding":{"code":"KeyJ","mod":false,"alt":true,"shift":false}}, {"action":"<id>","binding":null} or {"action":"<id>","reset":true}',
};

export const CLIENT_SETTINGS_COMMANDS = (Object.keys(DOMAINS) as Domain[]).flatMap((domain) => [
  {
    command: `client-${domain}-get` as const,
    description: `read ${DOMAINS[domain]} and their revision from an explicit --client-id`,
  },
  {
    command: `client-${domain}-set` as const,
    description: `write ${domain === 'preferences' ? 'locale and the Device Notification Preference' : DOMAINS[domain]} to an explicit --client-id with --expected-revision; --patch-stdin takes ${PATCHES[domain]}`,
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
  values: {
    'client-id'?: string;
    'patch-stdin'?: boolean;
    'expected-revision'?: string;
  },
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
        ? `${command} needs --expected-revision from client-${target.domain}-get and --patch-stdin with ${PATCHES[target.domain]}.`
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
      throw new CliLiveError(
        'invalid-input',
        `Invalid JSON on stdin; send ${PATCHES[target.domain]}.`,
      );
    }
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
      throw new CliLiveError('invalid-input', `The patch must be ${PATCHES[target.domain]}.`);
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
