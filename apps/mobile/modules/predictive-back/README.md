# Android predictive back at the root

React Native 0.88 adds an `OnBackPressedCallback` to `ReactActivity` that is always
enabled, so Android routes every Back gesture to JavaScript and never plays the
system's predictive back-to-home preview. This module exposes `setIntercept(enabled)`,
which turns that callback on or off. `src/ui/shell/predictive-back.android.ts` keeps it
on only while something in the app can go back: a pushed or tab history entry, an
open drawer, or an open search field. At the root, Android handles Back itself and
shows the preview.

It reads React Native's private field by reflection and does nothing when the field is
missing. Remove it once react-native#59292 (`BackHandler.setInterceptEnabled`) ships.

## Conversation route preview

`PredictivePageView` adapts Android 14+ Back progress to a horizontal page translation. Conversation routes use transparent native-stack presentation with an opaque child so the actual preceding route remains drawable. The native view handles progress/cancel/settle; only its completion event asks the existing navigation stack to pop. It has no screenshot cache or route history. IME visibility and local Back owners suspend this callback; profile panels retain overlay priority. Reduced Motion skips translation. Android 13 and older keep the existing navigation Back path. This native source change requires a fresh app binary.
