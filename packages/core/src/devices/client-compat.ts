import { compareVersions, isReleaseVersion } from '../release/version.js';

export const APP_VERSION_HEADER = 'x-tobs-app-version';
export const MIN_PHONE_APP_VERSION = '1.6.0';
export const MIN_HOST_VERSION = '1.7.0';

export function belowMinimum(version: string | undefined, minimum: string): boolean {
  return (
    version !== undefined &&
    isReleaseVersion(version) &&
    !version.startsWith('0.') &&
    compareVersions(version, minimum) < 0
  );
}
