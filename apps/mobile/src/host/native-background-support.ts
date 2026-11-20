import { requireOptionalNativeModule } from 'expo';

import { BACKGROUND_NATIVE_MODULES, loadWithNativeModules } from './background-catch-up';

type NativeBackgroundCatchUp = typeof import('./native-background-catch-up');

export const nativeBackgroundCatchUp = loadWithNativeModules(
  (name) => requireOptionalNativeModule(name) !== null,
  BACKGROUND_NATIVE_MODULES,
  () => require('./native-background-catch-up') as NativeBackgroundCatchUp,
);
