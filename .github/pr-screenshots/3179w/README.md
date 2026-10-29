# Physical Android Group Disband acceptance

Task: codex/local/01a1877d-c8fa-78e0-aa3f-d0af1007be34. Batch: windows-3171-disband. PR #3179; acceptance #3170; fix #3171; ADR-0274. Captured 2026-10-29.

Source: final PR head f4a3da7d0e98934559cde0da65fbb1b192f33710, combined with frozen main82a115c17b55358cd29c9574a840aa8da76deba9 at batch7d68e5db7f35e1f38feb556a8a13f9c45eb62bb3. PR #3179 merged elsewhere during QA; this batch incorporated its final presentation fix and excludes #3117. No duplicate feature implementation or source push.

Physical POCO 24069PC21G, Android16, arm64-v8a, 1220x2712 native captures. Expo58.0.21 / RN0.88.1 Debug development APK, rebuilt with #3163/#3182 native inputs. Actual APK signature matched the previously installed dev app; in-place installation preserved data. APK SHA256:168f5ee0fa864c266407a917e35ff1b752b08c589d4623ebb5deb50b880defc0. Built at batch3f7da759b0f2f9c83cac042a7b3fb475920a924b. Final PR changes only JS/tests/evidence; native inputs unchanged. Task Metro restarted and client cold-started for final source. Source file hashes in source.json; native build provenance in binary.json. Private raw XML, fingerprints and logs retained outside Git.

## Results

| Case | Result |
| --- | --- |
| Long-press menu / confirmation / actual Cancel, en/zh x light/dark x font1/1.3/2 | PASS,12 combinations |
| Group profile Settings / native confirmation / actual Cancel, same matrix | PASS,12 combinations |
| Phone confirms Disband from Group profile Settings on final source | PASS; profile-host.json |
| Desktop confirms Disband while phone conversation stays open | PASS; dark-before/after.png, desktop-host.json |
| Actual input in deleted group | PASS; Send is natively disabled; send-disabled.png |
| Cached deleted-group conversation | PASS; desktop cache1 before,0 after |
| Phone offline, desktop disbands, phone reconnects | PASS; cached message visible offline, removed after reconnect; cache1 to0; offline-host.json |
| Conversation retained behind Group profile during desktop Disband | PASS; light-before/after.png, light-host.json |
| Back to Chats and old deep link | PASS; group absent, old route shows missing group with no old messages; old-route.png |
| Final conversation/navigation regressions | PASS,60/60 |
| Configuration-change Debug runtime | KNOWN FAILURE #3001: duplicate linking registration after font/theme changes; warning visible in captures, cold process restart recovers |
| Release performance, heap GC, equal Channel ID on another Host, Human acceptance | UNTESTED; no claims |

No model is required. Fixtures use only disposable groups/messages on a dedicated Host. Canonical reads refuse channel details and timeline after deletion; ended history is empty. The screenshots compare states before/after the action on the final candidate, not base-versus-candidate binaries. Old-candidate long-press deletion was also observed, but is not substituted for final-source evidence.

## Matrix captures

Each file named `<locale>-<theme>-<font>-long.png` or `-profile.png` is a native confirmation capture; font1p3 means actual system scale1.3. Both paths were cancelled before the next case. All24 images inspected. Warnings from #3001 remain visible; no warning suppression or data reset.

## Interaction evidence

- dark-before.png / dark-after.png: phone remains on the conversation while desktop disbands.
- light-before.png / light-after.png: conversation retained behind Profile, then returned to after desktop disband.
- offline-before.png / offline-after.png: cached messages offline, then deleted-group state after reconnect.
- old-route.png: deleted route cannot recover the stopped conversation.
- send-disabled.png: typed test input cannot be sent.

Cleanup result is recorded in the linked PR/issue outcome. Raw screenshots contain only synthetic QA content; private serial/camera/pairing/Host-address captures are excluded.
