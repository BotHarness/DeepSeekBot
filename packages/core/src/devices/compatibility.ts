export const DEVICE_COMPATIBILITY_PATH = '/api/botharness/devices/compatibility';

export interface DeviceCompatibility {
  schemaVersion: 1;
  protocol: { min: number; max: number };
  host: { version: string; source: string; platform: string; arch: string };
  features: { push: boolean };
}

declare const __BOTHARNESS_HOST_BUILD__: { sha: string; time: string } | undefined;

export function deviceCompatibility(version: string, push: boolean): DeviceCompatibility {
  return {
    schemaVersion: 1,
    protocol: { min: 1, max: 1 },
    host: {
      version,
      source:
        typeof __BOTHARNESS_HOST_BUILD__ === 'undefined'
          ? 'unknown'
          : __BOTHARNESS_HOST_BUILD__.sha,
      platform: process.platform,
      arch: process.arch,
    },
    features: { push },
  };
}
