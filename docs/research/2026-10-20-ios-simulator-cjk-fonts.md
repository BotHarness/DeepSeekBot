# iOS 26 Simulator: blank Chinese text and CJK tofu

## 0. Meta

| Item     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question | Can the iOS 26 Simulator render CJK text? On a Mac with Xcode and the iOS 26.0 Simulator runtime, a Release build of `apps/mobile` (system font, no `fontFamily`) shows "小测" as blank in RN `Text` / `UILabel`, the keyboard suggestion bar shows tofu for CJK, and the log repeats `CoreText: *** Unmapped "小测" <UICTFont …> font-family: ".PingFangUITextSC-Regular"`. Latin is fine. Earlier runtimes were fine.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Date     | 2026-10-20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sources  | Apple Developer Forums threads [817957](https://developer.apple.com/forums/thread/817957), [817228](https://developer.apple.com/forums/thread/817228), [758189](https://developer.apple.com/forums/thread/758189); Xcode 26.0–26.6 and 27 release notes and iOS 26.0–26.4 release notes (Apple's JSON doc endpoints, grepped); Apple's [Xcode components doc](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components); GitHub issues [react-native#56183](https://github.com/react/react-native/issues/56183), [xcodes#468](https://github.com/XcodesOrg/xcodes/issues/468), [feedback-assistant/reports#772](https://github.com/feedback-assistant/reports/issues/772), [pdfcraft#1716](https://github.com/storytold/pdfcraft/issues/1716); RN `RCTFont.mm` (v0.81.0 and `main`); `expo-font` config plugin source (`main`). |
| Limits   | Researched from a Linux sandbox: no Mac, so no `simctl` was run and no runtime image was inspected. Unity's tracker, docs.expo.dev and some vendor pages could not be reached. GitHub-wide issue search was unavailable; issues were found by web search.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Bottom line.** No Apple release note or known issue names CJK fonts in the iOS 26 Simulator (§1.1). What Apple does acknowledge is a class of iOS 26.x **Simulator runtime** bugs where a system font is present but fails to load. Text then renders as blanks or boxes in the Simulator and SwiftUI Canvas, while a physical device renders it fine. An Apple DTS engineer called that a bug, and users confirmed that the iOS 26.4 runtime fixed the emoji case ([817957](https://developer.apple.com/forums/thread/817957)). Your symptoms fit that class (inference): system-wide, including the system keyboard, so not the app; tied to one runtime; and CoreText names the system Chinese UI face `.PingFangUITextSC` but cannot map glyphs from it. **Most likely cause: the 26.0 runtime image or its font data is broken or not loading on this Mac.** The less likely cause is a PingFang file that is downloaded on demand and missing (§1.3). **Fix, in order:** (1) create a fresh simulator on the newest iOS runtime, installed through Xcode, not a third-party tool; (2) erase the device and reinstall the 26.0 runtime; (3) add Chinese to the simulator's languages so the system fetches PingFang. Before blaming the app, check whether Safari in the same simulator also fails (§4).

**Outcome (2026-10-20, verified on the QA Mac).** A fresh device on the iOS 26.0 (23A343) runtime stayed broken. A new device on the iOS 27.0 (24A434) runtime, installed through Xcode 27, rendered the 小测 Chats row title in light and dark and a Chinese Safari page, with zero `Unmapped` log lines. Fix 1 worked; QA now uses iOS 27.

## 1. Evidence

### 1.1 Apple release notes: nothing on CJK fonts

I pulled Apple's machine-readable release notes (`developer.apple.com/tutorials/data/documentation/xcode-release-notes/<ver>.json` and the `ios-ipados-release-notes` equivalents) for Xcode 26, 26.0.1, 26.1, 26.2, 26.3, 26.4, 26.4.1, 26.5, 26.6 and 27, and for iOS 26.0–26.4, and grepped them for `font|emoji|unicode|glyph|chinese|cjk|pingfang`. **No Simulator entry mentions fonts, emoji or CJK**, not even the emoji bug that Apple fixed in 26.4. The Simulator entries that do matter:

- Xcode 26.1, known issue: simulators may fail to boot after a macOS upgrade; workaround `xcrun simctl runtime dyld_shared_cache update --all` (152328794).
- Xcode 26.4, fixed: "simdiskimaged jetsam-looping which could manifest as `simctl` or `xcodebuild -runFirstLaunch` hanging or failures to install simulator runtimes from within Xcode" (172343027). That bug could leave a runtime installed only partly. **Inferred** link to this case; not verified.
- Xcode 26.4, fixed: `xcodebuild -downloadPlatform iOS -exportPath …` now writes an `.exportedBundle` for `xcodebuild -importPlatform`.
- Xcode 27, known issue: "Some simulator runtimes are not completely deleted when removed, re-appearing after a reboot" (141290052, FB16083602). This matters for fix 2.

So the absence of a note does not mean there is no bug: the confirmed emoji bug below has no release note either.

### 1.2 The confirmed analogue: system fonts fail to load in iOS 26.x Simulator runtimes

- [Apple Forums 817957](https://developer.apple.com/forums/thread/817957), "Xcode 26.3 not rendering Unicode/Emoji in Simulator or Canvas" (March 2026): under the iOS 26.2 and 26.3.1 Simulator runtimes, Unicode and emoji render as blanks or boxes in Simulator and Canvas but fine on a device, and the system emoji keyboard is blank. This is the same system-wide pattern as the CJK tofu in your suggestion bar. Apple DTS engineer Albert Pascual: "…it means the Color Emoji font is missing and this is corrupted, or failing to load inside the Simulator Runtime… We identified this a bug." He suggested deleting the runtime in Xcode > Settings and reinstalling it, or using a device or the newer runtime. The original poster reports that **reinstalling the same 26.3 runtime did not help**. The **iOS 26.4 runtime fixed it** (accepted answer, confirmed by several users), and the **26.1 runtime** worked as a fallback. Feedback: FB22206123 ([public mirror](https://github.com/feedback-assistant/reports/issues/772)).
- [Apple Forums 817228](https://developer.apple.com/forums/thread/817228): emoji showed as `[?]` on iOS 26.4 beta 1 and the 26.3.1 Simulator; the poster reports it fixed in 26.4 beta 2.
- [react-native#56183](https://github.com/react/react-native/issues/56183) (RN 0.84, Xcode 26.3): the same emoji symptom in RN `Text`. The emoji font file is present in the runtime and Safari renders emoji, yet RN does not. Users report that 26.1 and 26.4+ work. No maintainer reply, no root cause.
- [xcodes#468](https://github.com/XcodesOrg/xcodes/issues/468): the 26.3.1 and 26.4 runtimes **installed with `xcodes runtimes install`** render all emoji as `?` boxes system-wide, while the same runtimes installed through Xcode > Settings > Platforms render fine on the same Mac. This is third-party evidence that the install path can break fonts in the runtime. No root cause yet.

**What applies to you (inferred):** these reports cover emoji on 26.2–26.4 beta 1, not CJK on 26.0. I found **no public report of the exact CJK `Unmapped … .PingFangUITextSC` symptom** on any iOS 26 runtime. The mechanism and fixes carry over by analogy; nothing confirms them for CJK.

### 1.3 PingFang on iOS 18+ is split, and part of it is downloaded on demand

From [Apple Forums 758189](https://developer.apple.com/forums/thread/758189):

- Apple Frameworks Engineer (2024): "PingFang.ttc is no longer in /System/Library/Fonts/Core. iOS 18 has a new Chinese UI font." Don't hard-code font paths; use CoreText.
- A developer found the UI font in the **iOS 18.0 simulator runtime** at `…/iOS 18.0.simruntime/Contents/Resources/RuntimeRoot/System/Library/PrivateFrameworks/FontServices.framework/CorePrivate/PingFangUI.ttc`. That file holds the `.PingFangUIText*` faces the system font cascades to, which are the faces in your log. On macOS 26 the equivalent is `FontServices.framework/Resources/Reserved/PingFangUI.ttc`, and the public `PingFang.ttc` lives in `/System/Library/AssetsV2/com_apple_MobileAsset_Font8/<id>.asset/AssetData/` ([pdfcraft#1716](https://github.com/storytold/pdfcraft/issues/1716), a third-party report).
- Apple Frameworks Engineer (December 2024): "If you are running your device in Chinese or even if Chinese is in the list of user languages, your application will get access to a version of PingFang that is parsable by third party libraries. PingFang.ttc is downloaded automatically for those users."
- A developer (December 2024) reports that on an en-US device, "菱" falls back to last-resort tofu "as the PingFang.ttc MobileAsset isn't downloaded" (FB15161959).
- Apple Frameworks Engineer (April 2025): `CTFontDescriptorMatchFontDescriptorsWithProgressHandler` "allows you to get any downloadable OS font. You can use it to download `PingFangSC-Regular`…"

**Reading (inferred):** the face your log names, `.PingFangUITextSC-Regular`, is the **built-in** private UI font (`PingFangUI.ttc`), not the downloadable `PingFang.ttc`. An en-US user who lacks the MobileAsset loses only some rarer characters (菱), not common ones like 小 and 测. Common characters going blank, together with "Unmapped" on the built-in UI face, therefore point to the runtime's built-in font data failing (§1.2), more than to a missing download. I could not confirm whether the iOS 26 runtime moved `PingFangUI.ttc` into a MobileAsset, or whether it is still in `RuntimeRoot` (§5).

### 1.4 Can the Simulator download font MobileAssets?

**Unverified.** No Apple source says whether `mobileassetd` inside a simulator fetches `com.apple.MobileAsset.Font*` assets, or which hosts it needs. If it does, it would use the Mac's network, so a proxy or firewall that blocks Apple's asset hosts would block it (inference). Runtime downloads themselves do fail on MobileAsset catalog errors when the network is restricted (several forum threads, for example [792700](https://developer.apple.com/forums/thread/792700)).

### 1.5 React Native and Expo constraints for app-side workarounds

- RN iOS has no `fontFamily` fallback list. `RCTFont.mm` (checked at [v0.81.0](https://github.com/facebook/react-native/blob/v0.81.0/packages/react-native/React/Views/RCTFont.mm) and `main`) resolves a single family name with `+[UIFont fontNamesForFamilyName:]`, logs "Unrecognized font family" otherwise, and does not split on commas. NativeWind's docs say the same ("no fallback font stacks"). I did not check RN 0.88 (our version) line by line; `main` has no change.
- RN does expose a native hook, `RCTSetDefaultFontHandler(RCTFontHandler)`, which replaces the default system font for `Text` with no `fontFamily`. A handler could return a `UIFont` whose descriptor has a `.cascadeList` that includes a bundled CJK font. **Untested.** The reporter of #56183 says a handler that cascaded to AppleColorEmoji did not fix the emoji case.
- `expo-font` (we use `~58.0.9`) has a config plugin that embeds fonts at build time through `fonts: string[]` ([source](https://github.com/expo/expo/blob/main/packages/expo-font/plugin/src/withFonts.ts)).

## 2. Ranked fixes

Run each from Terminal on the Mac, then check with §4. The commands follow Apple's docs and `simctl` usage I know, but **none were run for this note**: check `xcrun simctl help runtime` on your Xcode first.

### Fix 1: fresh device on the newest runtime, installed by Xcode (confidence: medium-high)

The newest runtime fixed the closest known bug (§1.2), and it costs only a download.

```sh
xcodebuild -version                       # Xcode 26.4 or later (27 if installed)
xcodebuild -downloadPlatform iOS          # latest runtime for this Xcode (Apple doc)
xcrun simctl list runtimes                # note the new runtime identifier
xcrun simctl create "CJK test" "iPhone 17" com.apple.CoreSimulator.SimRuntime.iOS-26-4   # use the id printed above
xcrun simctl boot "CJK test"
```

Install with Xcode or `xcodebuild`, not `xcodes` ([xcodes#468](https://github.com/XcodesOrg/xcodes/issues/468)). If the default Apple-silicon variant still fails, try the universal variant: `xcodebuild -downloadPlatform iOS -architectureVariant universal` ([Apple doc](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components)). That this helps is **my guess only**; no source ties the variant to fonts. To get a specific older runtime that worked before, use `xcodebuild -downloadPlatform iOS -buildVersion <ver>`. In 817957, 26.1 worked as a fallback for emoji.

### Fix 2: erase the device, then reinstall the 26.0 runtime (confidence: low-medium)

Erasing clears a corrupted font cache in the device; reinstalling replaces a runtime image that was installed only partly (see the Xcode 26.4 simdiskimaged fix in §1.1). Apple DTS suggested the reinstall, but it did **not** fix the emoji bug, because that bug was in the image itself.

```sh
xcrun simctl shutdown all
xcrun simctl erase <device-udid>          # or: xcrun simctl erase all
# test again; if still broken:
xcrun simctl runtime list                 # find the 26.0 runtime's identifier
xcrun simctl runtime delete <runtime-identifier>
# Xcode 27 known issue: deleted runtimes can reappear after reboot; confirm with `xcrun simctl runtime list`
xcodebuild -downloadPlatform iOS -buildVersion 26.0
```

Or use Xcode > Settings > Components, delete the runtime, and click Get. After installing, run `xcrun simctl runtime dyld_shared_cache update --all` (Xcode 26.1 known issue).

### Fix 3: put Chinese in the simulator's languages (confidence: low for this symptom)

Apple says PingFang.ttc downloads automatically when Chinese is among the user's languages (§1.3). This would help if the missing piece is the downloadable asset. It needs the Mac to reach Apple's asset servers without a blocking proxy (unverified, §1.4).

```sh
xcrun simctl spawn booted defaults write -g AppleLanguages -array zh-Hans en
xcrun simctl spawn booted defaults write -g AppleLocale -string zh_CN
xcrun simctl shutdown booted && xcrun simctl boot <device-udid>
```

You can do the same in the simulator: Settings > General > Language & Region, and add a Chinese keyboard. A vendor help page also points iPhone users to Settings > General > Fonts to install the "PingFang" system fonts ([Sparkful](https://sparkful.app/help/articles/my-app-on-iphone-with-ios-18-ios-26-or-later-is-missing-chinese-characters), page not reachable from here, so not verified). Check whether that screen exists in the simulator.

### Fix 4: test on a physical device (confidence: high that it renders, but it is a sidestep)

Every report in §1.2 says the device renders correctly. Use it to confirm that the app is not at fault.

### Not recommended: copying fonts into the runtime

Do not copy font files into the runtime or `CTFontManagerRegisterFontsForURL` an Apple font. Nobody has tested it (#56183), Apple says not to rely on font paths (§1.3), and it does not fix the system keyboard.

## 3. App-side workarounds (only if the Simulator cannot be fixed)

1. **Simulator-only bundled CJK font through the default font handler.** Bundle Noto Sans SC (SIL OFL; subset it, since the full font is large), embedded with the `expo-font` plugin in `app.config.js` and only when an env flag is set, for example `DEEPSEEKBOT_SIM_CJK=1`. Then, in native code guarded by `#if targetEnvironment(simulator)`, call `RCTSetDefaultFontHandler` and return the system font with a `UIFontDescriptor.AttributeName.cascadeList` containing Noto Sans SC. In Expo this needs a small config plugin or an `AppDelegate` subscriber. **Untested; may not work** (§1.5). It also does not fix the system keyboard.
2. **Explicit `fontFamily` on CJK text.** RN has no fallback list (§1.5), so setting `fontFamily: 'NotoSansSC'` also replaces Latin glyphs with Noto's Latin. Acceptable only in a debug build.

Neither belongs in Release builds: on devices, the system font renders Chinese.

## 4. How to verify

1. **Is it the runtime or the app?** In the same simulator, open a page with Chinese in Safari:
   `xcrun simctl openurl booted "https://zh.wikipedia.org/wiki/%E6%B1%89%E5%AD%97"`
   If Safari also shows blanks or tofu, the runtime is at fault (§1.2). In the emoji case Safari worked while RN failed, so test both.
2. **Watch the CoreText message while the app shows the test string:**
   `xcrun simctl spawn booted log stream --level debug --predicate 'eventMessage CONTAINS "Unmapped"'`
   A fixed simulator prints nothing. Use `log show --last 5m` with the same predicate for history.
3. **Test string:** `小测 中文 汉字 菱 龘 ｜ 繁體 ｜ かな ｜ 한글 ｜ 😀`. 小测中文汉字 are common characters, which the built-in UI font must cover. 菱 is the character Apple-forum users saw fall back when the PingFang asset was missing. 龘 is rare. The kana, Hangul and emoji check the other CJK and emoji fallbacks.
4. **Font presence (diagnostic only):** `xcrun simctl list runtimes --json` gives each runtime's bundle path. Then run `find "<bundlePath>/Contents/Resources/RuntimeRoot/System/Library/PrivateFrameworks/FontServices.framework" -iname '*PingFang*' -exec ls -la {} +`. A missing or zero-size `PingFangUI.ttc` would confirm a broken image. The path comes from the 18.0 runtime (§1.3); **iOS 26 layout not verified**.
5. **Screenshot for the PR or issue:** `xcrun simctl io booted screenshot ~/Desktop/cjk.png`.

## 5. Open questions and what to file

- Where the iOS 26.0 runtime keeps `.PingFangUITextSC` (still `RuntimeRoot/.../FontServices.framework`, or a MobileAsset): run §4.4 on the Mac.
- Whether a fresh install of 26.0 also fails on another Mac. If it does, the image is broken for everyone, so skip 26.0. If it does not, the local install is broken.
- If the newest runtime also fails: file a Feedback in Feedback Assistant under Simulator with the `Unmapped` log line, the runtime build (`xcrun simctl runtime list`) and the Safari result. Post the FB number on [Apple Forums 817957](https://developer.apple.com/forums/thread/817957), as the DTS engineer asked there.
