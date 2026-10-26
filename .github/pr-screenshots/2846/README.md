# iOS Simulator regression for PR #2846

Source comparison: base `d488ae9b8f074311c741eb636b935d028268f755`, initial candidate `d0540529ae0d31fc554e5c018a86db8935834ac6`, final product `3e0e3c68f6f3e738ed7ff06ebdac6fa06c86d469`.

Same existing iPhone 18 Pro Max Simulator, iOS 27, Chinese, 1320×2868. Same locally built Debug native app with production JavaScript. Loaded debugger source equals served bundle and six changed runtime sources match the stated commit. No physical-device or performance claim. Synthetic test conversations only. The candidate development gear remains visible at top right; it overlays the folder entry, not the messages being checked.

## Send navigation

Base: the pending bubble disappears after leaving and returning; later canonical readback contains zero matching messages. The initial d054 candidate retains data but the screen can remain covered by history-loading skeletons and Retry. Those failures are retained separately.

Final candidate: a new empty conversation displays the outgoing bubble normally, then muted approximately three seconds later. It stays muted and visible after Back and re-entry, without skeleton/Retry; it returns to normal after transport recovery. Independent video review: first bubble 19.718333s, muted 22.693333s, complete returned chat 26.211667s, normal after recovery 26.543333s. Canonical readback confirms one matching message, revision 1.

Failed-send sequence independently passes: separate empty conversation; failed row survives Back/re-entry (35.011667s); actual Retry click removes the failure label (36.411667s), re-mutes after about three seconds (39.430000s), and shows Delivered after recovery (40.523333s). The Retry action receipt precedes transport restoration. Unique same-ID canonical outcome is separate from Retry click evidence: the original queued request and retry can both resume, so this does not prove which request wrote first.

## History and creation

Final history independently passes: first 040 becomes centered at 14.821667s and stays until the next request; 090 centers at 42.208333s; repeated 040 centers at 66.175s and remains through the recording end. No LATEST120 return. Initial frames briefly show partial/blank target content, so this is not first-readable-frame centering. Ordinary entry first reveals LATEST120 at 24.446667s and stays at bottom through 36.423333s (about 11.98 seconds), without a visible top/middle-to-bottom jump.

Creation was captured at d054; its three creation runtime files and native inputs are unchanged at final product. Default/intermediate/maximum × light/dark all show separated environment/name layout and a reachable whole Create button with the keyboard open (scroll required at maximum). Native environment A→B→A and optional-details toggles retain the name draft; one actual creation opens its DM and yields one canonical Bot. Base maximum text overlaps environment/name, but a correct outer-form swipe already makes its Create button reachable: button reachability is a regression check, not a newly proven improvement.

Manual-drag cancellation also passes the bounded delayed-history scenario: preload the latest page, request old 040 while transport is paused, then perform a real fling. The viewport stays around 099–108 for about 10.5 seconds through the recorded recovery sequence without jumping to 040 or 120. This combines the gesture/action receipts with video; it does not qualify every scroll-to-index or streaming race.

## Screenshots

| View                         | Before                                              | After / observed states                                                                        |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pending navigation           | [Missing on return](send-before.png)                | [Retained on return](send-after.png), [normal](send-normal.png), [muted](send-muted.png)       |
| Failed Retry                 | Historical failed row disappeared                   | [Retained failure](retry.png), [Retry pressed](retry-pending.png), [delivered](retry-done.png) |
| Old-message focus            | [Returned to tail](focus-before.png)                | [040 retained](focus-after.png)                                                                |
| Ordinary entry               | Already passed on base                              | [Skeleton](skeleton.png), [bottom](bottom.png)                                                 |
| Maximum text                 | [Overlapping label](create-before.png)              | [Separated fields](create-after.png)                                                           |
| Dark maximum keyboard action | [Already reachable by scrolling](action-before.png) | [Still reachable](action-after.png)                                                            |

The chat failure screenshot also shows the iOS activity indicator after the name inside the header chip, with no transient banner. Creation captures use `large`, `extra-extra-extra-large`, `accessibility-extra-extra-extra-large`; public main comparison is maximum light with the Name field focused, and maximum dark action with Persona focused.

[Image hashes](images.json) · [Build provenance](provenance.json) · [Explanation](explainer.md) · [Downloadable HTML explanation](explainer.html). Browser visual inspection was blocked by the local Work browser setting; HTML is a review aid, not runtime evidence.

## Remaining scope

Android, physical devices, spoken accessibility, Human QA, missing-model/response-loss/late-media fixtures and import acceptance remain on #2837 or their existing implementation issues. Cloud is deferred as requested. This report does not close #2837.
