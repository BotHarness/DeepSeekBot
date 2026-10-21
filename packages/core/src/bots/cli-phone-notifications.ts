import { connect } from './development-inspector.mjs';
import { parseNotificationPreferences } from '../../../../apps/mobile/src/host/device-notification-preferences.js';
import type { PushPreferences } from '../../../../apps/mobile/src/host/push.js';
import { CliLiveError } from './cli-live-error.js';

export function phoneNotificationExpression(preferences?: PushPreferences): string {
  return `(async () => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) throw Error('DEBUG_ONLY');
    if (typeof globalThis.__r?.getModules !== 'function') throw Error('NOTIFICATION_OWNER_UNAVAILABLE');
    const matches = [...globalThis.__r.getModules().values()].filter(m => m.isInitialized && m.publicModule?.exports?.notificationPreferences);
    if (matches.length !== 1) throw Error('NOTIFICATION_OWNER_UNAVAILABLE');
    const owner = matches[0].publicModule.exports.notificationPreferences;
    if (!owner.ready || typeof owner.getSnapshot !== 'function' || typeof owner.set !== 'function') throw Error('NOTIFICATION_OWNER_UNAVAILABLE');
    try { await owner.ready; } catch { throw Error('NOTIFICATION_OWNER_NOT_READY'); }
    const preferences = ${JSON.stringify(preferences ?? null)};
    if (preferences !== null) {
      try { await owner.set(preferences); } catch { throw Error('NOTIFICATION_SAVE_FAILED'); }
    }
    const current = owner.getSnapshot();
    if (current.preferences === undefined) throw Error('NOTIFICATION_OWNER_NOT_READY');
    return {
      owner: 'phone',
      developmentClient: true,
      saved: preferences !== null,
      preferences: current.preferences,
      syncing: current.syncing,
      failedHostIds: current.failed,
      syncStatus: current.syncing || current.failed.length ? 'pending' : 'complete'
    };
  })()`;
}

export async function runPhoneNotifications(
  rest: string[],
  values: {
    'metro-port'?: string;
    'target-id'?: string;
    'device-name'?: string;
    'preferences-stdin'?: boolean;
  },
  io: { readStdin?: () => Promise<string> },
): Promise<unknown> {
  const port = Number(values['metro-port']);
  if (
    rest.length ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !values['target-id'] ||
    !values['device-name']
  )
    throw new CliLiveError(
      'usage',
      'Provide --metro-port, --target-id and --device-name for the assigned development client.',
    );
  let preferences: PushPreferences | undefined;
  if (values['preferences-stdin']) {
    try {
      const value: unknown = JSON.parse((await io.readStdin?.()) ?? '');
      preferences = parseNotificationPreferences(value);
      if (
        preferences &&
        Object.keys(value as object).some((key) => !Object.hasOwn(preferences!, key))
      )
        preferences = undefined;
    } catch {}
    if (!preferences)
      throw new CliLiveError(
        'invalid-input',
        'Provide all four boolean notification kinds on stdin.',
      );
  }
  let client: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    client = await connect(port, values['target-id'], values['device-name']);
    const result = await client.send('Runtime.evaluate', {
      expression: phoneNotificationExpression(preferences),
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.result?.value === undefined) throw new Error('INSPECTOR_RESULT_REQUIRED');
    return result.result.value;
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message.toLowerCase().replaceAll('_', '-')
        : 'inspector-unreachable';
    throw new CliLiveError(
      code,
      'Phone notification operation refused; check the assigned development client.',
    );
  } finally {
    client?.close();
  }
}
