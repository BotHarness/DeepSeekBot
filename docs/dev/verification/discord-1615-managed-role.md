# Discord managed-role mention qualification (#1615)

## Candidate and scope

This candidate recognizes only a native mention of the current authenticated Bot user or its own verified integration-managed role. It retains the existing checked Provider → canonical Source/Inbox → Orchestrator → source-bound Outbox/reply path. Role recognition is separate from Message Content permission and actual Gateway delivery.

Maintained Provider source: `1fc80010ab7cfd10ecc4f63c1d46c098e829c6a6` on DSH `0.2.0-rc.2`. Input runtime: 421 files, SHA-256 `8e9416fc17b44d5af993654794e8a795b1a01784bcda68115e1479b1f6695358`. Product candidate: independently versioned `4.32.0-botharness.22`; no publication or deployment is implied.

> **2026-11-02 sync:** the integration now pins Provider `518314f6cf495aea093c0a93b0107de25b66e60d` (`4.32.0-botharness.25`, 424 runtime files, SHA-256 `bc54309720ce66906b562d7afaae99669c2177d67717623f6999e906abe473d1`) on top of current main, including explicit mentions from other Bots. The native record below belongs to the earlier candidate; the requalification section covers this one.

## Automated proof

The original Runtime/Consumer regression failed with expected one admission, actual zero, before the fix. It now passes with unchanged ordinary collection opt-out. The complete affected Discord suite passes 96/96, including native-channel and existing-thread routes, unrelated roles, everyone/here, role ownership changes, exact IDs, forged message metadata, lifetime disposal, checked replies and existing ordinary intake. Provider build and package verification pass.

The Core regression additionally exercises a checked event with `mentionedAccount: true`, original role text and an empty user-mention list through canonical Inbox/Orchestrator/Outbox. It must not depend on text search or fabricate a user mention. Controlled tests are not live-model or native Discord proof.

## Installed-product and native qualification — 2026-10-16 JST

The Human confirmed machine-registered Discord QA1 was idle, then requested agent-operated testing in the built-in browser. The candidate used one isolated, task-owned packaged Host, with `consumerMode: external-consumer` set before credential binding. No prior receiver was stopped. A 30-minute cutoff guard was armed before connection. Official DeepSeek Flash was configured only for the isolated PersonaBot's Orchestrator and default Assignment; a real Web DM returned `42`, and canonical usage recorded `deepseek-official / deepseek-flash`.

The six installed product tarballs were verified as `1.3.0-test.1615.1`, with Provider `4.32.0-botharness.22` at the immutable source and digest above. Runtime-bearing Core code was built from `7b8a1da7`; subsequent integration commit `a1d49691` removed an unintended docs-site route/font change without changing runtime code. Local Core build, typecheck, lint, formatting, 80 integrated Core/packaging regressions and docs build passed. The integration CI at `a1d4969199049165615bd9c4554a35474c60297a` passed affected tests, build/type/lint, docs, isolated Host smoke and package preparation. No complete local Windows suite success is claimed.

The built-in browser signed in as the designated Human account and opened the registered **DeepSeekBot Cloud QA / 常规** destination. Both positive tests selected distinct native entries from Discord's `@` menu, rather than typing a display name as plain text.

| Native test                         | Native addressing evidence                                                         | Actual result                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `DISCORD_1615_USER_20261016_B`      | One Bot-user mention, no role mention                                              | Exactly one rendered `USER_OK`, one accepted Outbox, receipt references the original source |
| `DISCORD_1615_ROLE_20261016_B`      | One own managed-role mention, zero user mentions                                   | Exactly one rendered `ROLE_OK`, one accepted Outbox, receipt references the original source |
| `DISCORD_1615_UNRELATED_20261016_A` | One unmanaged unrelated role, also held by the Bot; its permission bitset was zero | No new Source, Admission, model usage or Outbox                                             |
| `DISCORD_1615_EVERYONE_20261016_A`  | Native everyone flag, zero user mentions                                           | No new Source, Admission, model usage or Outbox                                             |
| `DISCORD_1615_HERE_20261016_A`      | Native everyone flag, zero user mentions                                           | No new Source, Admission, model usage or Outbox                                             |

The Provider reported six actually received Human messages and a healthy Gateway: an initial setup-only bare mention, the two positive markers and the three negative markers. The setup-only mention came from a browser composer automation attempt that did not preserve the intended text; its normal explanatory reply is retained as separate evidence and excluded from marker acceptance. Only the B markers qualify the positive cases. Native API readback confirmed the exact author, destination, `mentions` / `mention_roles` / everyone fields, and original-message references of both successful receipts. The role Source retained `mentionedAccount: true` with an empty user-mention list.

The negative observation compared canonical table counts and settled usage across 101 seconds, starting before the three negative sends. All remained unchanged; the visible channel had no negative-case reply. Ordinary collection stayed mentions-only. This does not qualify content delivery without Message Content approval, which the current App already held.

The temporary unrelated role was deleted, and native readback confirmed the original two-role set and Bot membership were restored. The exact task-owned receiver Host was stopped at 04:46 JST, before the cutoff; QA1 returned to its original idle state. Other App receivers and production model settings were untouched. Private native facts, screenshots and the browser recording remain machine-local.

## Native requalification on the synced candidate — 2026-11-02 JST

Provider `518314f6cf495aea093c0a93b0107de25b66e60d` (`4.32.0-botharness.25`) ran from an isolated Host on DSH `0.2.1-rc.3` with QA1 in the **BotHarness QA1 / bot-qa1** channel. A real DM through `deepseek-v4.1-flash` returned `42`. The signed-in Human account sent each message from the built-in browser, selecting native `@` entries.

| Native test                       | Native addressing evidence            | Actual result                                       |
| --------------------------------- | ------------------------------------- | --------------------------------------------------- |
| `DISCORD_1615_USER_20261102`      | One user mention, no role mention     | One rendered `USER_OK` reply referencing the source |
| `DISCORD_1615_ROLE_20261102`      | One own managed-role mention, no user | One rendered `ROLE_OK` reply referencing the source |
| `DISCORD_1615_EVERYONE_20261102`  | Native everyone flag, no user or role | Received by the Provider, no Admission and no reply |
| `DISCORD_1615_HERE_20261102`      | Native everyone flag, no user or role | Received by the Provider, no Admission and no reply |
| `DISCORD_1615_UNRELATED_20261102` | One temporary role that nobody held   | Received by the Provider, no Admission and no reply |

`bot-attention` held exactly two handled `group-mention` records plus the setup DM. The negative observation lasted about one minute. The temporary role was deleted, the QA1 App was removed from the Host and the Host was stopped. Other-Bot role mentions have automated coverage only. The model's `ROLE_OK` reply repeated the role text, which rendered without pinging anyone.

## Remaining review and release gates

- Core #1927 and maintained Provider #30 remain draft; merge, public publication and deployment have not occurred.
- Current native screenshots/recording exist locally. A matched base/candidate visual pair and GitHub-rendered review evidence remain to be prepared; current evidence does not claim that PR presentation gate is complete.
- Head-bound HTML review aids and any reusable upstream contribution remain independent handoff work.

Earlier T3 snapshot/open attempts refused with no connected automation host, and a fallback browser reached Discord's login route. Those failures are retained as setup evidence. After the Human requested another built-in-browser attempt, T3 worked with the existing signed-in account and the qualification above completed. The earlier browser-access limit no longer blocks native testing.

References: [issue #1615](https://github.com/BotHarness/DeepSeekBot/issues/1615), [role tags](https://docs.discord.com/developers/topics/permissions#role-object), [message fields](https://docs.discord.com/developers/resources/message#message-object), [ADR-0128](../../adr/0128-discord-checked-replies-preserve-native-child-channel-routing.md).
