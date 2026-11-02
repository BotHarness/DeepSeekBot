# Batch 41: native button theme repair

Source and batch: `b46dfdb6c75bc051de656d428c42b38efb3b579f`, CI [39160770289](https://github.com/BotHarness/DeepSeekBot/actions/runs/39160770289) passed. Installed native build `494a20f1e`, Expo UI 58.0.20, iOS 26 Simulator, 402 × 874 points, English. These captures PRECEDE the new request to make the creation panel itself native glass; its opaque surface is the before state, not final panel acceptance.

- Default, accessibility-medium and accessibility-extra-extra-extra-large: live light → dark → light without app restart. Both backdrop and selected/unselected native controls now update correctly; prior Batch38/40 failures remain published.
- Top source tabs remain bounded and single-line, with trailing ellipsis and retained Computer icon. Synthetic long app-local alias only; the Host name was unchanged.
- Left-aligned creation list, actual plus/close at each size, maximum-font Chats → Activity → Chats taps, and Computer tab selection with exactly two menu actions passed. All has three actions. No Channel/Bot creation in this run.
- `max-actions.mp4` is the unaltered 25-second actual native navigation/menu recording. The selected labels wrap within words at maximum size (Chats and Activity); controls are reachable. This is not a polished single-line navigation or VoiceOver claim.
- Reduce Transparency actual toggle **unverified**: heavy Settings AX capture timed out; bounded stale-ref/coordinate/own-driver recovery also refused or timed out. Original and final native value were both false, switch visibly off. Source tests of the fallback are not native proof.
- AX sometimes returned only three nodes after font/modal transitions; screenshot-grounded action taps were used, not JS callbacks. Nested native button nodes remain; no VoiceOver or accessibility-focus claim.

Cloud remained signed out. No WorkOS, Cloud resources, messages, model, Prod, phone, build/install or Host restart. Earlier authenticated Cloud create/open remains independently bound to edf7c31f. Android device, physical phone, older iOS and Human QA remain unverified.

Restoration: exact new Host test-device pairing revoked; original Channel and device states preserved. Original Cloud vault and saved Hosts restored; stopped app Documents and Preferences byte-identical. Original light/large and native transparency false restored/preserved. Only this task's driver and Metro stopped; original shared checkout branch and three untracked docs restored. Clipboard untouched. Lane explicitly released. No merge.
