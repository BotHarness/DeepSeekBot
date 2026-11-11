# ADR-0323: The iOS Conversation Timeline stays top-down

Status: accepted for the iOS native timeline spec

## Context

Android's native Conversation Timeline keeps inverted coordinates, with the newest message at offset zero (ADR-0320). Telegram iOS and Stream's iOS SDK also invert their history list by rotating or mirroring the scroll view and every row. Signal iOS keeps a top-down `UICollectionView` with a custom layout. Our iOS timeline is top-down today.

## Decision

The iOS native Conversation Timeline stays top-down: oldest first, newest at the bottom of the content, with no transform on the scroll view or its rows. Its custom layout owns the two jobs inversion would give for free: keeping the newest message in view while it grows, and keeping the reader's row still when older history is inserted above it.

The JavaScript-to-native timeline contract never exposes direction. It places messages by identity ("after message X", "at the oldest end", "at the newest end"), so Android and iOS share one contract and one set of fixtures while drawing in opposite directions.

## Considered options

Inverting iOS to match Android and Telegram. Rejected because a flipped scroll view fights the system pieces the mobile design keeps native: the iOS 26 scroll edge effect under the transparent navigation header, automatic safe-area insets, the scroll indicator, VoiceOver reading order, context-menu previews, interactive keyboard dismissal and the existing pull-up-to-type gesture. Telegram accepts those costs because it draws its own header, menus and scroll physics.

## Consequences

Anchoring correctness lives in the iOS layout and is tested against the shared fixtures (history prepend, streaming growth, send, jump). A future reader comparing the two platforms will see opposite coordinate systems on purpose.
