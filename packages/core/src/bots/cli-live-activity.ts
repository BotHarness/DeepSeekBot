import { readFileSync } from 'node:fs';
import { parseSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import {
  ActivityRequestFailed,
  createHostActivity,
} from '../../../../apps/mobile/src/host/live-activity.js';
import { CliLiveError } from './cli-live-error.js';

export async function runDeviceActivity(
  rest: string[],
  values: { 'device-file'?: string; 'activity-stdin'?: boolean },
  io: { readStdin?: () => Promise<string> },
): Promise<unknown> {
  const operation = rest[0] ?? 'capability';
  if (
    rest.length > 1 ||
    !['capability', 'prepare', 'register', 'stop'].includes(operation) ||
    !values['device-file']
  )
    throw new CliLiveError(
      'usage',
      'Use device-activity capability|prepare|register|stop --device-file <pairing.json>; mutations require --activity-stdin.',
    );
  let host;
  let body: Record<string, unknown> = {};
  try {
    host = parseSavedHost(JSON.parse(readFileSync(values['device-file'], 'utf8')));
    if (operation !== 'capability') {
      if (!values['activity-stdin']) throw new Error('stdin required');
      const value: unknown = JSON.parse((await io.readStdin?.()) ?? '');
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid input');
      body = value as Record<string, unknown>;
    }
  } catch {
    throw new CliLiveError(
      'invalid-input',
      'Read pairing credentials from a file and activity data from stdin.',
    );
  }
  if (!host) throw new CliLiveError('invalid-input', 'Invalid saved pairing.');
  const activity = createHostActivity({
    async request(url, init) {
      const result = await fetch(url, { ...init, redirect: 'error' });
      return { status: result.status, text: () => result.text() };
    },
    openSocket() {
      throw new Error('unary-only');
    },
  });
  try {
    return await activity.request(
      host,
      operation as 'capability' | 'prepare' | 'register' | 'stop',
      body,
    );
  } catch (error) {
    throw new CliLiveError(
      error instanceof ActivityRequestFailed ? error.code : 'unreachable',
      'Lock Screen status request refused.',
    );
  } finally {
    delete body['token'];
  }
}
