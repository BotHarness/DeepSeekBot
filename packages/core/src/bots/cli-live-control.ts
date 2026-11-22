import {
  readAssignmentAccess,
  writeAssignmentAccess,
} from '@botharness/host-client/access-readers';
import { isDeepStrictEqual } from 'node:util';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { channelOperationKey } from './cli-channels.js';
import { connectLiveHost, record } from './cli-live-host.js';
import { timeoutMs, usage, type LiveValues } from './cli-live-input.js';

export const CONTROL_COMMANDS = [
  'browser-access-set',
  'computer-access-set',
  'access',
  'access-set',
  'settings',
  'settings-set',
  'workspace-create',
  'group-create',
] as const;

export async function runControlCommand(
  command: (typeof CONTROL_COMMANDS)[number],
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one target.`);
  const target = rest[0].trim();
  let patch: Record<string, unknown> | undefined;
  let reviewed: ReviewedSettings | undefined;
  if (command === 'browser-access-set' || command === 'computer-access-set') {
    if (values.enabled === values.disabled)
      usage(`${command} needs exactly one of --enabled or --disabled.`);
  }
  if (command === 'access-set') {
    if (values.mode !== 'workspace-write' && values.mode !== 'danger-full-access')
      usage('--mode must be workspace-write or danger-full-access.');
    if (values.scope !== undefined && values.scope !== 'chat' && values.scope !== 'assignments')
      usage('--scope must be chat or assignments.');
    if (values.mode === 'danger-full-access' && values['acknowledge-risk'] !== true)
      usage(
        'Full access lets the Bot run any command and use the Browser and Computer without asking. Pass --acknowledge-risk to confirm.',
      );
  }
  if (command === 'settings-set') {
    if (values['patch-stdin'] !== true) usage('settings-set requires --patch-stdin.');
    try {
      const parsed: unknown = JSON.parse(await (io.readStdin?.() ?? Promise.resolve('')));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('not an object');
      patch = parsed as Record<string, unknown>;
    } catch {
      usage('--patch-stdin must be a JSON object of settings fields.');
    }
    reviewed = parseReviewedSettings(values, patch);
  }
  if (command === 'workspace-create' && !target.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(target))
    usage('workspace-create needs an absolute folder path.');
  const members = (values.member ?? []).map((member) => member.trim()).filter(Boolean);
  const operationKey =
    command === 'group-create' && values['operation-key'] !== undefined
      ? channelOperationKey(values['operation-key'])
      : undefined;
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const { rpc } = await connectLiveHost(values, io, signal);
  if (command === 'browser-access-set' || command === 'computer-access-set')
    return rpc(command === 'browser-access-set' ? 'browserAccessSet' : 'computerAccessSet', {
      slug: target,
      enabled: values.enabled === true,
    });
  if (command === 'access' || command === 'access-set') {
    const reader = { call: (method: string, args = {}) => rpc(method, args) };
    const mode = values.mode === 'danger-full-access' ? 'danger-full-access' : 'workspace-write';
    const scope =
      values.scope === 'chat' || values.scope === 'assignments' ? values.scope : undefined;
    const result = await (command === 'access'
      ? readAssignmentAccess(reader, target)
      : writeAssignmentAccess(reader, {
          slug: target,
          mode,
          ...(scope === undefined ? {} : { scope }),
          ...(mode === 'danger-full-access' ? { acknowledgeRisk: true } : {}),
        }));
    return result.preset.mode === 'danger-full-access'
      ? {
          ...result,
          warning:
            'The Bot can run commands that change or delete files anywhere without approval.',
        }
      : result;
  }
  if (command === 'workspace-create') return rpc('workspace/create', { request: { path: target } });
  if (command === 'group-create')
    return rpc('channelCreate', {
      name: target,
      members,
      ...(operationKey === undefined ? {} : { operationKey }),
    });
  const described = record(await rpc('settings/describe', {}));
  const namespaces = Array.isArray(described['namespaces']) ? described['namespaces'] : [];
  const found = namespaces.map(record).find((entry) => entry['ns'] === target);
  if (found === undefined)
    throw new CliLiveError('unknown-settings', `The Host has no settings namespace ${target}.`);
  if (command === 'settings')
    return { ns: target, revision: found['revision'], value: found['value'] };
  if (reviewed !== undefined) {
    const current = record(found['value']);
    if (
      found['revision'] !== reviewed.expectedRevision ||
      !Object.entries(reviewed.previousValue).every(([key, value]) =>
        isDeepStrictEqual(current[key], value),
      )
    )
      throw new CliLiveError(
        'stale-setting',
        'The reviewed settings changed; read and review the current value before retrying.',
      );
  }
  const updated = record(
    await rpc('settings/update', {
      ns: target,
      patch,
      expectedRevision: reviewed?.expectedRevision ?? found['revision'],
    }),
  );
  return { ns: target, revision: updated['revision'], value: updated['value'] };
}

export interface ReviewedSettings {
  expectedRevision: number;
  previousValue: Record<string, unknown>;
}

export function parseReviewedSettings(
  values: { 'expected-revision'?: string; 'previous-value'?: string },
  patch: Record<string, unknown>,
): ReviewedSettings | undefined {
  const revision = values['expected-revision'];
  const previous = values['previous-value'];
  if (revision === undefined && previous === undefined) return undefined;
  if (revision === undefined || previous === undefined)
    usage('--expected-revision and --previous-value must be supplied together.');
  if (!/^(0|[1-9][0-9]*)$/u.test(revision) || !Number.isSafeInteger(Number(revision)))
    usage('--expected-revision must be a nonnegative safe integer.');
  let previousValue: unknown;
  try {
    previousValue = JSON.parse(previous);
  } catch {
    usage('--previous-value must be a JSON object of the reviewed settings fields.');
  }
  if (typeof previousValue !== 'object' || previousValue === null || Array.isArray(previousValue))
    usage('--previous-value must be a JSON object of the reviewed settings fields.');
  const keys = Object.keys(patch).sort();
  if (keys.length === 0 || !isDeepStrictEqual(keys, Object.keys(previousValue).sort()))
    usage('--previous-value must contain exactly the fields in the nonempty patch.');
  return {
    expectedRevision: Number(revision),
    previousValue: previousValue as Record<string, unknown>,
  };
}
