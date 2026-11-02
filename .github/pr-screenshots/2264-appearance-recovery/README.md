# T7 appearance recovery evidence

Baseline T6 57e5e0f28d277846f04825327569880d244acba3, Web Chromium 1440×1000, generated color-bar image/video and task-owned Bot data. Before settings has no recovery entry; after settings adds readable controls, current-mode scope and explicit full-reset confirmation. macOS official DSH 0.2.1-rc.2 captures are 2560×1640 from the identified main application window.

Web proof covers two independently configured modes and parent/nested overrides, current-mode-only clear, canceled confirmation, rejected preference writes, media deletion failure with explicit partial status and successful retry, image/video reset, accepted and preview decoder release, unsaved-preview cleanup with an empty store, explicit Client CLI confirmation/unknown-target refusals, a separate Client remaining unchanged, reload and mode reentry. DSH body attributes and Bot records remain unchanged. Layout is byte-identical during recovery; after reload compare the same topology and fields with at most one pixel of existing Dock rounding, not serialized key order.

macOS proof covers current-mode scope, cancellation, image/media-failure retry, video plus open-preview disposal, unchanged layout/DSH and a real application restart using the same local app storage. Defaults and absent media persist. Both accepted journeys have no page errors or warning/error console entries. Earlier script-only failures (selection before render; raw Dock JSON after reload) remain private and are not passing evidence.

68 focused tests in 11 files passed, plus lint, root/mobile types, formatting and build. CI remains a separate PR gate. PNG and VP9 WebM are the tested fixtures, not a universal codec claim. Windows native, mobile/narrow-screen adaptation and Human QA are not claimed. No merge or deployment.

## Spec acceptance audit

| #2256 scenario                                                       | Owning proof                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Independent light/dark palettes, globals and Primary                 | T1 #2271, T2 #2275; T7 both-mode preservation/reset      |
| DeepSeekBot/DSH mode, accent and portal isolation; exit/reentry      | T1 #2271; T7 DSH invariants/reentry                      |
| Per-field override and global inheritance                            | T3 #2276                                                 |
| Parent/child independence and transparent composition                | T4 #2277                                                 |
| Shared Memory details across file/commit/working changes             | T4 #2277                                                 |
| Header-only nested context menu and scoped modal                     | T3 #2276, T4 #2277                                       |
| Preset replaces globals, retains Panel overrides and other mode      | T2 #2275, T3 #2276; wallpaper is a separate shared owner |
| Local media/crop, resize, source deletion and restart                | T5 #2279, T6 #2281                                       |
| Muted loops, background/minimize pause, resume and poster fallback   | T6 #2281: actual clocks/frames and native minimize       |
| Unsupported/oversized/quota failures preserve media                  | T5 #2279, T6 #2281                                       |
| Separate Web/Desktop; Desktop changes Host without losing appearance | T1 #2271, T5 #2279, T6 #2281                             |
| Attribute/Panel/all-Panel/full recovery scopes                       | T3 #2276, T4 #2277, T7 this PR                           |

This audit links independent evidence; it does not relabel screenshots or unit tests as native or Human QA. T4 verified actual Browser embedded pixels and third-party wrapper registration; its container Computer remote-view pixels remain unrun because the local Docker probe hung. Local Computer status was checked. Review each slice's evidence and exact-head CI before merging in stack order. The user explicitly authorized all seven Draft PRs after the original first-slice QA boundary; Human QA remains required before any merge.
