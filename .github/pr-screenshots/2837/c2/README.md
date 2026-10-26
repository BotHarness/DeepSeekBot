# Final-source iOS continuation — 2026-10-26

Frozen merged source `e2cee221af78e1c1a0d90395757c0cdd4c3a9d01`. Same compatible local Simulator binary; production JavaScript verified through actual Debugger source = HTTP bundle and same-build source-map contents. This mode differs from the previous development-JS run; no performance comparison is claimed. See [hashes](manifest.json).

## Three observed failures

1. Pending send disappears after leaving and reopening the chat. Real pending bubble at video19.310s; absent on return24.685s through30.093333s. Host later persisted exactly one message; a subsequent reopening shows it. That does not qualify pending lifecycle retention. [Before](q1-remount-before.png) / [missing on return](q1-remount-missing.png). Source review identifies last-subscriber Conversation eviction and instance-local outgoing state; regression must exercise actual route lifecycle, not reuse the same Conversation in a bubble test.
2. First explicit old-message focus misses. Initial040 request briefly shows026–030, then settles at115–121 from14.5967s through55.6933s. Later distinct requests to040,090,040 succeed. [First request at tail](q4-first-focus-tail.png) / [repeat040 succeeds](q4-repeat040.png). Source hypotheses include consuming focus before native scroll acknowledgement and follow/failed-index races; no cause is proven by static review alone.
3. Maximum accessibility text in creation overlaps the wrapped environment name with the Name label in both themes. With keyboard open, the scrolled Create button is still partly covered. Default/intermediate layouts are clear. [Light](create-max-light.png), [dark](create-max-dark.png), [scrolled keyboard](create-max-dark-scrolled.png). Do not infer complete reachability from an accessibility hittable flag.

## Additional passed observations

- Pending background/return retains elapsed delay: normal62.800s, Settings foreground, return transition66.801667 already muted, full page67.211667 muted, delivered72.511667; exactly one canonical message. [Return](q1-bg-return-muted.png). First unsuccessful input attempt excluded.
- Actual Reduce Motion ON and sustained skeleton13.246667–22.340000s; skeleton region remains static. VFR display-time samples include held frames, not70 independent original frames. [Skeleton](reduce-motion-skeleton.png).
- A freshly isolated second Host truly starts empty, without the first Host rows. [Empty](q3-second-empty.png).
- Creation target B→A→B preserves the draft; only B receives the created Bot. Cross-Host chat drafts are isolated and restored on return. [Draft](source-draft-return.png).
- Cached refresh failure retains the old list and exposes error/Retry. All excludes offline B while showing A; after B recovery both sources appear. [Cached failure](source-cached-paused.png). All-source screenshot contains a private machine name and is intentionally excluded.
- Revoking only the current test pairing presents explicit refusal with cached content. Real re-pairing and subsequent Retry restore the list. [Refusal](source-revoked.png) / [recovered](source-repaired-settled.png).
- One real model request produces native Markdown, including code and a table; Human revision3, Bot revision4. [Markdown](q4-markdown-middle.png). Static rendering does not establish held-reading during streaming.
- Home has visible navigation/search/create controls at all three sizes in both themes. This does not establish VoiceOver speech.

## Text/theme captures

| Screen / size | Light | Dark |
|---|---|---|
| Home default | [View](home-large-light.png) | [View](home-large-dark.png) |
| Home intermediate | [View](home-xxxl-light.png) | [View](home-xxxl-dark.png) |
| Home maximum | [View](home-max-light.png) | [View](home-max-dark.png) |
| Create default | [View](create-large-light.png) | [View](create-large-dark.png) |
| Create intermediate | [View](create-xxxl-light.png) | [View](create-xxxl-dark.png) |
| Create maximum — FAIL | [View](create-max-light.png) | [View](create-max-dark.png) |

System sizes are large, extra-extra-extra-large and accessibility-extra-extra-extra-large. Original screenshot pixels are unchanged.

## Limits

Empty model catalog was disproved as a missing-model fixture by an actual successful reply. The default native provider remains executable; no public disable/remove setting exists in the qualified runtime. Genuine missing-model repair remains untested, and the isolated catalog was restored. No shared credentials were changed. Selectively late media/page failure, accepted-but-response-lost creation, broader keyboard/font/history reconciliation, spoken accessibility, Android and physical/Human acceptance remain tracked in #2837. These screenshots do not establish all native acceptance.
