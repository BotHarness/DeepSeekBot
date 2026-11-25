import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const expoUi = dirname(createRequire(import.meta.url).resolve('@expo/ui/package.json'));
const expoUiModule = readFileSync(
  join(expoUi, 'android/src/main/java/expo/modules/ui/ExpoUIModule.kt'),
  'utf8',
);

it('still needs the guard: ExpoUIModule OnDestroy calls expo-modules-core natives without loading the library (#5317)', () => {
  const onDestroy = /OnDestroy \{([\s\S]*?)\n {4}\}/.exec(expoUiModule)?.[1] ?? '';
  expect(onDestroy).toContain('NativeStatePropsGetter().clearAllContentOrigins()');
  expect(onDestroy).not.toContain('loadLibrary');
});

it('loads expo-modules-core in OnCreate, which every module receives before any OnDestroy, so a teardown before the JSI install cannot throw UnsatisfiedLinkError (#5317)', () => {
  const config = JSON.parse(read('../modules/expo-ui-teardown/expo-module.config.json'));
  expect(config.android.modules).toEqual(['expo.modules.expouiteardown.ExpoUiTeardownModule']);
  const module = read(
    '../modules/expo-ui-teardown/android/src/main/java/expo/modules/expouiteardown/ExpoUiTeardownModule.kt',
  );
  expect(module).toMatch(/OnCreate \{\s*SoLoader\.loadLibrary\("expo-modules-core"\)\s*\}/);
});
