# Native cache-wait fault evidence

Physical POCO Android16,1220x2712,Chinese,dark,font scale1.3;same isolated Host and121-message Stable test fixture. Open from list with stationary180ms press; capture after10seconds. No message sends. These are **Release builds with the same task-only cache fault adapter**, not unmodified production screenshots and not a latency benchmark.

- Before:b.png, parent25042c590e1f plus local diagnosticdc4bc90d0. APK SHA2561831269C815B45072A8C39170D88C72060F6C1E09B5484D2CAE2F819387A68DB. Latest message absent; skeleton persists in a second capture53seconds later.
- After:a.png, productionb6bc52d12995 plus same local diagnostica9dc0b4ae. APK SHA256BD56A8938FFBADB5FE4FE77C85AECECF53C2BC64788574785F0E128912226B6D. Latest AX3257 visible above enabled composer.

The identical injected line in nativeConversationCache.read is:

```ts
if (key.includes('channel:group-ax3257-stable')) return new Promise<undefined>(() => {});
```

It affects only the dedicated test Channel; it does not remove or change cache files or pairing data. Diagnostic commits are local only and excluded from this PR. The production Releaseb6bc52d12995/APK1282DF31AC844816DB4769D4CCC39B63A98DB9D1D058139F6C126265897AFFAF also passed an ordinary native open check and was restored after the experiment. Matching signer verified for all builds. Original captures and UI snapshots retained in the shared QA evidence store.

Scope: one controlled unresolved-cache case on Android; does not prove all network failure modes, production failure frequency, p95,3x speedup,iOS,or Human acceptance.
