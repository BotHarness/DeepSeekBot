# #1406 — authorization groups and real Lark decisions

Qualification date: 2026-10-11. Product PR: [#1407](https://github.com/BotHarness/DeepSeekBot/pull/1407). Task: `codex/local/01a12734-8226-7ae3-8d1b-db08bde64d76`; [claim and repair scope](https://github.com/BotHarness/DeepSeekBot/issues/1406#issuecomment-6107579833).

## Environment and authority

The Human assigned QA1 exclusively to this task until acceptance ended. A separate DSH `0.2.0-rc.1` Host/Profile used the machine-local shared App registry. Before each start, the task checked existing claims and receiver/process evidence. No production receiver, other QA App, application permission or credential store outside this isolated Profile was changed.

The ordinary paired person kept one primary behavior Role with no management capabilities and belonged to two authorization groups. Both groups allowed Approve/Reject. The temporary private management pairing stored **Reject only**, so successful Approve authority came from the groups. This management pairing remained necessary for the eligible private approval destination; group membership alone did not create that destination.

## Native results and visible replies

The first four scenarios ran on product `550898dd4cc3f11198e1eab904755826906381f1` with the previously qualified Provider `bddd7d93e1c1b969ce137721c2494f6d72bfa8bc`. Commands only printed uniquely marked strings and did not read/write files or access the network.

| Scenario                          | Native evidence                                                                                                         | Actual Lark behavior                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Group Allow once                  | decision seq 93, successful result seq 94                                                                               | One `BH1406_GROUP_ALLOW_ONCE_1811` stdout; actual reply visible   |
| Independent Reject                | decision seq 117, rejected error result seq 118                                                                         | No execution or stdout; actual refusal reply visible              |
| Delayed group Deny                | Call seq 135 remained pending after the old Allow once click; later Reject decision seq 137 and rejected result seq 138 | No execution; Reject on the same card remained usable             |
| New request after Profile restart | decision seq 157, successful result seq 158                                                                             | One `BH1406_RESTART_ALLOW_ONCE_1819` stdout; actual reply visible |

For delayed Deny, the actual Client edited QA Reviewers to Approve Deny/Reject Allow while Flow Reviewers still allowed Approve. The person's direct exception was empty during this test. Separate saved readbacks before Reject confirmed that the old Allow click produced neither a decision nor a native result. No refusal toast was observed; the evidence establishes blocked execution, not a specific toast.

All four source Admissions reached handled state, and their reply Outbox records were provider-accepted. Actual private replies were read in the signed-in Lark web client; API acceptance alone was not counted as visible delivery.

## Original-card display defect and repair

The first run exposed a separate presentation defect: settled cards still displayed waiting text and two buttons in Lark Web after page reload, although service readback was final. A display-only diagnostic with shared mode showed the updated text in the same conversation. This diagnostic contained no operation, authority or approval and was not product acceptance evidence.

[Provider repair PR #20](https://github.com/DoodleBears/dsh-im/pull/20) at `1bf6baa8ad09b337f80f119961d10c4783ea702e` sets `config.update_multi: true` on both initial approval creation and later patches. Its checked create→patch regression failed before this change and passed afterwards. The built Host differs only by this flag and trailing whitespace; the built Client is unchanged. Current actor, private-route, receipt, lifecycle and authorization fences are unchanged. See the [platform card-update reference](https://open.larksuite.com/document/server-docs/im-v1/message-card/patch).

The isolated Host installed and digest-verified this exact Provider: 412 runtime files, SHA-256 `1d2dcc7d4548cf74edfac7934eb065aa9b1fae99fb0b9309931ae285d932d6c5`. Two fresh real requests then verified the repaired path:

| Scenario               | Native evidence                                 | Original card and reply                                                                   |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shared-card Allow once | decision seq 181, successful result seq 182     | `BH1406_SHARED_CARD_ALLOW_1835`; final execution state, zero buttons, actual stdout reply |
| Shared-card Reject     | decision seq 201, rejected error result seq 202 | No execution; final rejected state, zero buttons, actual refusal reply                    |

Source Events for these final two scenarios are `im-ed3109e3e4467c845f7a431bd780ee54b88f14ccccc60886374061597669c4da` and `im-425f27f45c2c442a67c6a5dd3dc5e6041ed5754908323bdbf39e64a011bc5f1f`. Both Admissions were handled and replies provider-accepted. Screenshots of the real before/after cards are embedded in both PR bodies with unrelated conversations, person names and local paths masked. Older non-shared cards are historical evidence; the repair does not replay their operations or claim to retrofit their private copies.

## Checks and cleanup

- Provider: 105 relevant public Delivery/Lark/controller regressions, build and package verification passed. This does not claim a complete Provider CI pass.
- Product: the earlier 164 focused/regression tests and complete Linux CI at `550898dd` passed; after pin adoption, 46 relevant pin/artifact/approval tests, lint, formatting, typecheck and build passed. An additional unchanged POSIX directory-fsync probe has nine `EPERM` failures on native Windows; no full Windows-suite pass is claimed. New-head Linux CI is tracked in PR #1407.
- After all native requests settled, both groups retained their original Allow choices, the personal Approve Deny was restored at revision 9, all temporary management pairings were revoked, the notification route was turned off, and no native approval remained pending. The exact task-owned Host was stopped; QA1's receiver window was released.
- Human feedback on this first tracer remains required before expanding sibling group/provider features. No merge, publication or production deployment occurred.
