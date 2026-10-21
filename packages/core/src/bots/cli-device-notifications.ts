import { readFileSync } from 'node:fs';
import { parseSavedHost } from '../../../../apps/mobile/src/host/hosts.js';
import { parseNotificationPreferences } from '../../../../apps/mobile/src/host/device-notification-preferences.js';
import { createHostPush, PushRequestFailed } from '../../../../apps/mobile/src/host/push.js';
import { CliLiveError } from './cli-live-error.js';

export const DEVICE_NOTIFICATION_COMMANDS = [
  {
    command: 'device-notifications',
    description:
      'read or copy a paired device notification preference (--device-file, --preferences-stdin)',
  },
] as const;
export const DEVICE_NOTIFICATION_OPTIONS = {
  'device-file': { type: 'string' },
  'preferences-stdin': { type: 'boolean' },
} as const;

export async function runDeviceNotifications(
  rest: string[],
  values: { 'device-file'?: string; 'preferences-stdin'?: boolean },
  io: { readStdin?: () => Promise<string> },
): Promise<unknown> {
  if (rest.length || !values['device-file'])
    throw new CliLiveError('usage', 'Provide --device-file with the saved pairing JSON.');
  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(values['device-file'], 'utf8'));
  } catch {
    throw new CliLiveError('invalid-input', 'Cannot read the saved pairing JSON.');
  }
  const host = parseSavedHost(saved);
  if (!host) throw new CliLiveError('invalid-input', 'Invalid saved pairing JSON.');
  let preferences;
  if (values['preferences-stdin']) {
    try {
      preferences = parseNotificationPreferences(JSON.parse((await io.readStdin?.()) ?? ''));
    } catch {}
    if (!preferences)
      throw new CliLiveError(
        'invalid-input',
        'Provide all four boolean notification kinds on stdin.',
      );
  }
  const push = createHostPush({
    async request(url, init) {
      const response = await fetch(url, { ...init, redirect: 'error' });
      return { status: response.status, text: () => response.text() };
    },
    openSocket() {
      throw new Error('unary-only');
    },
  });
  try {
    return preferences === undefined
      ? await push.settings(host)
      : await push.setPreferences(host, preferences);
  } catch (error) {
    throw new CliLiveError(
      error instanceof PushRequestFailed ? error.code : 'unreachable',
      'Device notification request refused.',
    );
  }
}
