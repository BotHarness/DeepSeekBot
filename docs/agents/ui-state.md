# UI state subscriptions

[中文](ui-state.zh.md)

The desktop Client keeps one shared store (`ClientState` in `packages/client/src/client/store.ts`). It changes constantly while Bots work: streamed draft frames, Bot activity, roster previews, attention counts. A component re-renders on every change to whatever it subscribes to, so **a component subscribes to exactly the fields it reads, and nothing else.**

## Rules

1. **Select fields, typed.** Read the store through `useClientStore(selector, equal)` or `useClientFields(keys)`. The selector returns only what the component reads, typed as `Pick<ClientState, ...>` or a small derived value, and `equal` compares those fields (identity per field, `shallowEqual`, or a purpose-built comparison such as `sameBotFaces`). This is the zustand selector pattern; `useClientStore` implements DSH's `SnapshotSelectorHook`.
2. **Select the part of a large slice you show.** `humanInbox`, `conversation`, `roster` and similar objects change for many reasons. Select the sub-fields or a derived value (for example `state.humanInbox.channelUnread`, or `resolveChannelSidebarContext(state)?.botSlug`) rather than the whole object.
3. **Do not pass the whole state down.** A child that needs store data selects it itself, or receives the specific values as props. A function that takes several fields takes a `Pick<ClientState, ...>` (for example `ConversationStateView`), so the type checker lists what it reads and flags a new read that the subscriber did not select.
4. **Keep selections stable.** Define selectors and key lists at module level or memoise them, and return the previous value when nothing a component shows has changed. Store setters skip patches that change nothing; do not work around that by forcing new objects.
5. **Small dedicated stores are exempt.** A purpose-built store that holds only one view's state (preferences, a feed, a controller) may be read whole with `useSyncExternalStore`.

## Not allowed

`pnpm lint` (the source policy, `store-subscription` kind) rejects these in `packages/client/src`:

- `useSyncExternalStore(store.subscribe, store.getSnapshot)` on the Client store, including a parameter or property typed as `ClientStore`.
- `useClientStore(keepClientState, ...)`, `useStoreSlice(source, keepClientState, ...)`, or a selector that returns its argument unchanged.
- A prop or interface member `state: ClientState`.

The static rule catches these shapes; it cannot prove a selection is minimal. The render benchmarks (`client-store-main-render-bench`, `client-store-render-bench`, `client-store-inbox-render-bench`, and the sidebar render test in `bot-sidebar.test.ts`) assert that writes a surface does not show cause zero commits. A change that adds a subscriber to a hot surface extends the matching benchmark.

## Review gate

For each changed component that reads the Client store, verify:

- What does it render, and which store fields does that need? The selector returns those and no more.
- Does a streamed draft frame, another Bot's activity, an Inbox page load or a roster write re-render it when it shows none of them?
- If it passes store data to children, are they typed `Pick<...>` or specific values?
