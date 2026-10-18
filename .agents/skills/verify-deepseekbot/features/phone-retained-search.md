# Retained Computer search on mobile

## Sub-features

Search inherits Chats scope, groups retained conversation names and message excerpts, opens the exact source/paired-identity message and preserves query/scroll on Back. New Search entry resets. Cache loss is explicit, and online recovery is an action. Cloud search is outside this slice.

## How to get to it (user POV)

Pair the assigned UAT Computer, open a known text conversation online, then select Search in the bottom navigation. The create button disappears. Search a distinctive phrase, select its result and verify the original message is highlighted. Back returns to the results. Switching through Chats and entering Search begins a new query in the selected environment.

## Driving it with verify-app

Use the shared-device queue before touching a Simulator, Metro, pairing or Host. Reuse the assigned native build for these JavaScript-only changes. Seed or read the known message through the owning Host public API/CLI, then load it via the actual conversation UI. Disconnect only the task-owned test route, search offline and open the cached message. Evict only that test cache file and reopen the result: observe the missing-content notice, then explicitly load from the Computer when online. A revoked task-owned device must disappear from search without affecting another paired identity. Do not fake a successful transport or patch the rendered UI.

Capture the prior navigation entry point, Search results and highlighted message at the same viewport/theme/locale, plus a short Search → result → Back recording. Exercise keyboard and maximum system text; restore preferences, original app data and exact task-owned pairing changes. Retain failures and report native/iOS, Android, physical, accessibility and Human checks separately.

The public createRetainedSearch controller and createConversation retained-only mode are agent-testable without a model. Tests do not replace the native route/scroll proof.

## Gotchas

Only identity-qualified caches created after this feature are searchable; legacy Host-only files cannot be safely adopted into a paired identity. Opening a conversation online fills the new cache naturally. The operating system may evict it. Queries never fetch remote history; online recovery after a missing message is deliberate and may still report that the original message cannot be found.
