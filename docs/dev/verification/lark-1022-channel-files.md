# Lark referenced files in Channel history — candidate #1022

## Scope and provenance

This is the first file tracer on current main, replacing the obsolete implementation closed in #1077 after the owner's cleanup instruction. It reuses the existing QQ/shared file card, canonical Source Event, Channel placement, Messaging authorization and AttachmentStore. The Provider pin and file contract are unchanged.

The current checked Lark Provider associates a text request with its exact quoted parent file, in the same native conversation and topic. Its descriptor supplies a filename but no MIME or size. This candidate projects that single file and enables its authorized acquisition without fabricating metadata or known text/file order. Direct native file messages and multi-file/mixed posts remain outside current Provider qualification.

## Implemented production path

Checked Provider parent descriptor → canonical Source Event → realtime and historical Channel file card → explicit Human download → existing authenticated attachment HTTP route → current Channel/placement/source and independent authorization checks → bounded checked Provider read → canonical AttachmentStore → forced original download.

The file-card Client reports loading, source refusal, unsupported/oversized content and retry. File requests share the existing image concurrency budget, capped at three, and have a 30-second deadline and 25 MiB default bound. Unmount and authorization-change notifications cancel pending Client work. Files never acquire on visibility.

When DSH reports native file opening available, an explicit action opens the existing application menu. The preliminary capability check resolves no file. `channelMediaTarget` uses the same Messaging access before resolving the managed Attachment target; each actual open resolves it afresh. It does not accept a Bot selector, Host path or provider URL. No new launcher, remote editing API, message store or Bot attention authority is added.

`deepseekbot channel-media-target` and `channel-media-download` exercise the same owner without a model. Download writes a new local `--out` file, refuses overwrite and returns byte count, MIME and SHA-256. Nested HTTP refusal codes remain coded source refusals instead of being mislabeled as login errors.

## Controlled regression evidence

The first native-shaped regression failed because the existing projection omitted the checked parent file with unknown MIME. An earlier fixture used a MIME/content-part shape the current Provider does not produce and failed the trust gate; it was corrected rather than weakening that gate.

Focused tests cover the actual single-parent descriptor shape, exact original CSV bytes, no resource-key disclosure, no new attention/model calls, retained projection and bytes after restart, stopped acquisition, unbind/revocation, independent paths, loss of Human membership, bounded downloads, explicit-only UI actions, capability-unavailable fallback, cancellation, safe application selection and CLI owner/byte/refusal behavior. Six focused files passed all 46 tests. A 153-test broader CLI/media run passed 152 tests and timed out in one existing image independent-path case; both image/file variants passed the immediate isolated rerun, and the complete media file then passed all 12 tests serially. The original timeout remains preserved and is not reported as a completely green broader run.

Lint/source policy, CLI parity, bilingual release-fragment validation, typecheck including mobile, formatting and production build passed during candidate preparation. The Windows top-level docs command failed at `sync-slides.mjs` spawning `pnpm`; the dedicated Astro docs-site build passed with 560 pages. Before connecting an App, both new CLI commands also returned one coded refusal against the real Host without writing a file. These checks are separate from native Lark and installed-product acceptance.

## Native window and remaining qualification

The Human confirmed registered **Lark QA2 / BotHarness Cloud QA** was idle and authorized this isolated window. After earlier browser failures, a fresh T3 preview tab restored control. The signed-in Human account and QA2's existing private chat and dedicated test group were checked before sending. Other Apps and receivers were left unchanged.

The task-owned Host used pinned DSH 0.2.0-rc.2 and the unchanged qualified Provider source `beaed4a6dabb583654d28fb09298716267039b4a`. Authenticated doctor checks passed before and after connection. Both model roles were set to official DeepSeek Flash; a real Web DM returned `42`, and canonical usage recorded the official route. A 30-minute stop guard was armed before binding QA2. The first management call rejected an internal `consumerMode` argument; the corrected public credential-binding call and normal Bot identity consumer transition then succeeded. No test message was sent during the intermediate setup.

The fresh native path passed on 2026-10-16 JST:

1. Distinct private/group setup requests produced provider-accepted `CONNECT_OK` and `GROUP_OK` receipts. The group request used the native Bot mention menu. The existing group was connected to a new local Channel through the public Channel Bridge owner, with mention-only collection.
2. A synthetic `LARK_1022_SOURCE_20261016_A.csv` was uploaded through Lark's Local files and Send File UI. Its original contents were `name,quantity\nalpha,17\nbeta,221\n` (32 bytes). A real quoted reply to that exact file, with the native Bot mention and marker `LARK_1022_FILE_20261016_A`, requested only `FILE_RECEIVED` and told the Bot not to acquire the file.
3. Canonical evidence contains the exact native parent association, `mentionedAccount=true`, one filename-only descriptor, one Channel placement and a provider-accepted `FILE_RECEIVED` receipt. The actual Channel rendered the filename and generic File label in the request bubble without inventing MIME or size. The genuine dark capture was inspected and retained privately.
4. Clicking the actual file card produced a forced-download Blob containing the exact original 32 bytes. The real CLI downloaded the same bytes to a new file. Both SHA-256 values were `e2b2f68acee5d6d6ed8d7353459e202ac1f618ed25a5cd23505e2f6c716f4821`. Native source MIME remained unknown; the HTTP acquisition sniffed text/plain and the browser download used application/octet-stream.
5. Before Human download there were no managed file records. Afterward there was one. Source Events (6), Inbox Admissions (4), Outbox intents (3), Outbox attempts (3) and settled usage were unchanged by viewing. Disabling this Channel Bridge still allowed the acquired original; unbinding the Bot identity then refused cached download with `source-unavailable` through the real CLI.
6. The browser connection disappeared again immediately after selecting the native application-menu action. Its visible result was not observed. The exact task-owned Host was stopped early at 05:24 JST, before the 05:44:53 cutoff, and QA2 returned to idle. Private Profile evidence and guard records were retained; other receivers were not restarted.

Those first-window gaps were retained rather than reported as complete. The following installed-product window supplies the additional evidence.

## Installed-product continuation

The Human authorized merging after qualification, then continuing the next ticket. The same task retained QA2's exclusive window and reused its existing designated group. A fresh isolated packaged Profile installed all six verified tarballs, DSH 0.2.0-rc.2 and maintained Provider `4.32.0-botharness.21`. The source pin remained unchanged. A new 30-minute cutoff was armed before connection.

Fresh native markers `LARK_1022_PACK_GROUP_20261016_B` and `LARK_1022_FILE_20261016_B` produced exactly one visible `PACK_GROUP_OK` and `FILE_B_OK`, with corresponding provider-accepted receipts. A newly uploaded `LARK_1022_SOURCE_20261016_B.csv` supplied the real parent resource. Native menu selection was checked before sending; incorrect composer drafts were cleared without sending. The original file, descriptor, author and message boundary remained intact.

The actual installed CLI initially failed before emitting JSON because its umbrella Core import loaded Host-only DSH peers. A dedicated `@botharness/core/cli` build now supplies the command entry without loading the Host entry; native binary dependencies remain external declared packages. The CLI regression builds the real entry into an isolated temporary package without Host-only modules, starts the shipped command entry, checks its help and verifies a coded usage refusal. The installed binary in product `1.3.0-test.1022.5` then started and downloaded the exact 32-byte original with the same SHA-256 as the browser. This was an actual installed command, not a workspace import. The new packaging regression and Channel/Bot CLI suites passed all 58 tests serially. An earlier parallel run passed 57/58 and returned a nonzero target-query exit in one test; the isolated Channel file and full serial run passed, while that initial failure remains preserved.

The same packaged Profile cold-restarted from `1.3.0-test.1022.4` to `.5`, retaining its real Channel, identity, authorization and acquired file. The actual Client still rendered the original card, and browser plus installed CLI downloaded the same original after restart. Page refresh was also exercised. After the original Bot turn settled, repeated viewing, refresh/restart and lifecycle checks left Source Events (5), Admissions (3), Outbox intents (2), attempts (2) and settled usage unchanged. The managed-file record remained one. Reception stop retained the acquired original in both UI and installed CLI; identity unbind then produced `source-unavailable`, a visible refusal and Retry. Retrying did not restore access.

The existing application menu was actually opened. On this Windows Host its native application query returned `file application query failed`; the menu showed that failure and retained Download to this device, which successfully downloaded the original. No application was launched. This qualifies the truthful query-failure/download fallback, not a positive native application-launch case or a declaration that Lark/native opening is unsupported.

One intervening Client appearance/Session lifecycle produced a blank page with native `SlotAssemblyError: scope 'session-maybe' rendered without an installed adapter` and a released/unknown Session. The first blank capture and console evidence were preserved; no cause was attributed to file handling and no fix is claimed. Fresh navigation and the later same-Profile cold restart recovered the Client; subsequent light/dark cards and actual file actions passed. This remains a separate observed Client lifecycle limitation.

Matched base/candidate light/dark message-area captures and two short genuine UI recordings are committed under [PR evidence](../../../.github/pr-screenshots/1022-lark-files/README.md). The baseline uses the same native Source Event and canonical history, copied locally with its required Content Purge authority, but without platform credentials or a receiver. The incomplete first snapshot was correctly refused by the owner; it was corrected without weakening that authority. Captures preserve the same viewport, locale, Channel, author, source and theme. No UI was fabricated or edited beyond cropping the same message-area rectangle.

The exact packaged receiver and receiver-free baseline Host were stopped at 06:03 JST, before the 06:12:19 cutoff; QA2 is idle. No other stack or App was restarted. Stop-before-first-acquisition, independent paths, cancellation, oversize and purge have controlled regression coverage; this run does not claim every case as a separate native platform test. Positive native application launch remains unqualified on this Host. Publication and deployment are not part of this local installed-product acceptance.
