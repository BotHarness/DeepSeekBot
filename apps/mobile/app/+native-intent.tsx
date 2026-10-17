import { cloudNativeIntent } from '../src/cloud/native-intent';
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return cloudNativeIntent(path);
}
