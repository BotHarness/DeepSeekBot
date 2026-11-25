# Expo UI teardown guard (Android)

`@expo/ui` 58.0.29 clears its content-origin registry in `ExpoUIModule`'s `OnDestroy` by calling
`NativeStatePropsGetter().clearAllContentOrigins()`. Those JNI methods are registered by
`libexpo-modules-core.so`, which expo-modules-core 58.1.0 loads only as a side effect of the JSI
install (`MainRuntimeInstaller`) or the Fabric components registry.

`NativeModulesProxy.getConstants()` runs every module's `OnCreate` even when that JSI install
returned early, for example because the React instance was not active yet. If that React
instance is then torn down (relaunch, reload, the dev launcher replacing the bundle) before any
later install loads the library, `ExpoUIModule`'s `OnDestroy` throws `UnsatisfiedLinkError` on
React Native's module-destroy thread and the app crashes (#5317).

This module has no JavaScript API. Its `OnCreate` loads `expo-modules-core`. The module registry
delivers `OnCreate` to every module before any `OnDestroy`, so the natives are registered by the
time `ExpoUIModule` uses them. `SoLoader.loadLibrary` is idempotent, and every launch loads the
library within seconds anyway, so this only moves the load earlier.

`@expo/ui` ships as a prebuilt AAR, so a pnpm patch to its Kotlin source would not be compiled.
Remove this module once `@expo/ui` or expo-modules-core loads the library before calling these
natives.
