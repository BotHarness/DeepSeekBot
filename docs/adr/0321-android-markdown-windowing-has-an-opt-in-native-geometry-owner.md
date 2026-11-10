# ADR-0321: Android Markdown windowing has an opt-in native geometry owner

Date: 2026-11-10

Status: Accepted for an opt-in experiment; default rollout requires native A/B evidence.

## Context

Android Markdown already windows completed blocks. Its JS path stores measured
heights and reacts to coarse viewport changes. The native-chat handoff requests a
native candidate that can be implemented before device measurement, retaining an
unchanged baseline. Issue: [#3926](https://github.com/BotHarness/DeepSeekBot/issues/3926).

## Decision

`EXPO_PUBLIC_MARKDOWN_WINDOW=native` selects the candidate only when the rebuilt
app provides `MarkdownBlockWindow`. The default and old-build path remain JS.
Each native block wrapper observes Fabric-assigned geometry and its enclosing
ScrollView's global transformed bounds, including inverted lists. It retains two
viewport heights of overscan and emits only visibility transitions, with measured
dimensions in logical pixels. React replaces hidden content with equal-size space.
The native wrappers stay mounted; expensive paragraph subtrees are removed.

The candidate does not run the JS viewport worklet or JS block-height callbacks.
Markdown parsing, rendering, links, selection and canonical text remain with the
existing renderer. The streaming tail never windows and retains its mounted key.
Completed source changes and viewport width/font changes discard cached geometry.
Unsupported completed blocks disable windowing for the document. Active Android
accessibility services retain all content. Before API 29, the native wrapper keeps
all content because global matrix mapping is unavailable.

## Consequences

No message, playback, Host or persistence authority moves. Native wrapper traversal
cost and separate empty wrappers may offset reduced JS work; no improvement is
claimed before measurement. The candidate requires a native rebuild and matched
native/JS ABBA runs, plus geometry, restored content, TalkBack and selection checks.
Do not enable it by default based on unit tests. Playback pacing, list replacement,
composer spacer and shrink compensation remain independent work.
