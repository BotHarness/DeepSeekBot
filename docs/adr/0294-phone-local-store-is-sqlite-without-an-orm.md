# ADR-0294: The phone's local message store is SQLite without an ORM

- Status: Accepted
- Date: 2026-11-05
- Issue: #3550 (hub #3549)

## Context

Phase C keeps a local copy of what the phone has synced: messages, channel records and change cursors per paired Host. Today the phone keeps a JSON tail of about 50 messages per conversation in `Paths.cache` (`native-cache.ts`). Each file is read and rewritten whole, cannot be paged or searched, and can be evicted by the OS.

The store has to:

- page by revision;
- overwrite rows by message id;
- apply a page of `channelChanges` atomically with its cursor;
- support full-text search (C6).

Expo in this repository targets iOS and Android only, with no web build.

Options considered:

- **expo-sqlite:** Expo SDK module, FTS5 on by default, optional SQLCipher.
- **op-sqlite:** faster for large batches; third-party native setup.
- **WatermelonDB:** a model and sync layer on SQLite whose protocol duplicates the Host change log.
- **Realm:** deprecated.
- **MMKV:** key-value only.
- **Drizzle or Kysely** on top of SQLite, rather than hand-written SQL.

## Decision

- **Engine and file.** The phone uses `expo-sqlite`, with one database file per paired Host: `deepseekbot-store-<hostId>.db` in expo-sqlite's default directory under Documents, not Caches. It is configured for native platforms only, with no web wasm, Metro or COOP/COEP setup. Unpairing deletes the file (C7).
- **Connection and store.** Business code depends on `SqlConnection` (`exec`, `run`, `all`, `close`) and on `LocalStore` built over it (`src/host/local-store.ts`). `native-local-store.ts` adapts expo-sqlite, and tests adapt `node:sqlite`, so the same SQL, including FTS5 with the trigram tokenizer, runs in Vitest.
- **Connection settings.** On open: `journal_mode = wal`, `synchronous = normal` and `foreign_keys = on`.
- **Writes.** All writes go through `LocalStore.write`, a queue that runs one `begin immediate` … `commit` at a time on the single connection, and rolls back on error. Reads through `LocalStore` wait in the same queue, so they never see a write that has not committed. expo-sqlite's `withTransactionAsync` is not exclusive, and its `withExclusiveTransactionAsync` opens a second connection without the first one's pragmas, so neither is used directly. A page of changes and its cursor commit together.
- **Migrations.** Migrations are numbered SQL strings applied in order against `PRAGMA user_version`, each in its own write transaction. A store with a newer version than the app is refused with `local-store/newer-schema`.
- **No ORM.** There are about five tables, and the key statements are upserts by revision, gap ranges and FTS5 virtual tables. The Host already uses hand-written SQL on `node:sqlite`. Kysely or Drizzle is reconsidered if the store passes about 15 tables or needs dynamic queries.
- **No SQLCipher.** The store relies on iOS Data Protection and Android file-based encryption. If SQLCipher is added later, opening the store must check `PRAGMA cipher_version`, because a build without it silently stays unencrypted.

## Consequences

- Adding expo-sqlite is a native change, so installed development builds must be rebuilt.
- Swapping in op-sqlite later only replaces the adapter. That happens if C0's device timings miss the target of a first paint from local rows under 100 ms.
- Schema version 1 holds `channels`, `messages`, `cursors` and `gaps`. Version 2 adds `list_cursor`, the channel-list cursor (C3). The FTS table arrives with C6 as a new migration.
