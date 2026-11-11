import { nativeApplicationVersion } from 'expo-application';

export function installedAppVersion(): string | undefined {
  return nativeApplicationVersion ?? undefined;
}
