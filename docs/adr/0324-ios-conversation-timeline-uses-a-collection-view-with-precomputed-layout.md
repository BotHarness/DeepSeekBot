# ADR-0324: The iOS Conversation Timeline uses a collection view with precomputed layout

Status: accepted for the iOS native timeline spec

## Context

The iOS Conversation Timeline is moving from React Native `FlatList` rows to a native list in a local Expo module. Leading iOS messengers differ on the container: Telegram built its own virtualized list and scroll engine (CoreList) after years on an AsyncDisplayKit-based list; Signal uses `UICollectionView` with a custom `UICollectionViewLayout`; Discord uses a native `UITableView`. What they share is that row height and text layout are not measured on the main thread during scrolling.

## Decision

Use `UICollectionView` with a custom layout, not self-sizing cells and not a custom scroll engine. Markdown is parsed with the md4c parser already used by the app's native Markdown renderer, turned into attributed text and laid out off the main thread; the result is cached per message identity, displayed-content generation, width, font scale and theme. The generation changes on every displayed body change, including streamed playback and drafts that have no Host revision, so a cache entry never outlives the text it was laid out from. The layout reads only cached sizes, and binding a row only assigns cached layout. Background work never creates UIKit views.

## Considered options

- Self-sizing cells: rejected because they measure on the main thread exactly when fast scrolling needs the frame budget.
- A custom virtualized list and scroll engine like Telegram's CoreList: deferred. It is justified only if the iOS baseline and A/B runs show the remaining hitches come from `UICollectionView` or `UIScrollView` themselves, not from our measurement, commits or JavaScript. That would be a separate spec.

## Consequences

On iOS, the LatestAnchor and StreamSurface implementations are folded into this layout and their iOS code is removed once their slices are accepted. Their Android implementations stay and are governed by #3955. Telegram's CoreList anchoring rules (hold while dragging, follow streaming growth at the newest edge, preserve the visible row on prepend) are the reference behaviour for the layout's anchoring.
