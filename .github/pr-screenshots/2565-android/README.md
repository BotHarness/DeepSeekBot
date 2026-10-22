# Android Hermes notification acceptance — PARTIAL

Tested main/batch: `31f313fcdaf0d1758e3dd02285e6ba15a91bf884`, Android 16 physical phone, arm64, Expo 58.0.17 / React Native 0.88 / React 19.3. Strict native fingerprint `1d971f8f1e438ac99cb56339c9300cf53092be9f`.

Debug APK SHA256: `DB841DD80BEE8606B18150804CC0788A13761F87477D8138B0C47E745BDC7DC1`.

PASS for the sampled real Hermes cycle: validated owner/preferences/syncStatus read; save original four choices; set only reply=false; native UI and the isolated Host's persisted preference copy agree; force-stop/reopen/read retains false; restore all four original choices and verify UI/read/isolated Host copy. The copy audit was a read-only database query, not an owner API invocation. Normal completed calls left zero temporary inspector slots. OS notification permission was unchanged. No prompt or notification decision was automated.

UNTESTED: forced unknown write outcomes, timeout/disconnect/TTL/late completion countercases; second isolated Host; iOS. Two pre-existing offline Hosts remained pending; their copies were not claimed restored. This is not a full native acceptance or Release CLI parity claim.

Images are real-device crops: `reply-off.png` is the temporary test choice and `restored.png` is the original choice restored. Status bar, Host identity and unrelated content are excluded. No generated images.

Original APK hash, eight settings, original reverse mappings and two original pairings were preserved/restored. Own pairing was removed and its Host credential revoked. Lease/runtime released at 2026-10-22T10:27:07Z. Evidence publication commit is not a tested runtime input.
