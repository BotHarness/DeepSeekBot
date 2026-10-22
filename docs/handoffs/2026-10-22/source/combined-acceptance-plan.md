# 合并后整体验收计划 (Combined acceptance plan)

Updated 2026-10-21 15:30Z. Runs **once**, after everything under "Gate" is merged, on one fresh `main` build per platform. Base: `pending-acceptance-checks.md` in this folder (its setup notes still apply).

## Handoff (2026-10-22 03:15Z)

Claude stopped tracking this plan; final integration, device acceptance and the iOS/Android release move to other sessions. Nothing here has uncommitted code: this file and `pending-acceptance-checks.md` are the whole deliverable.

Next owner:

1. Get the Gate below to empty. Vain merges #2433. Check whether #2538 already covers #2533 (close it if so). Finish or drop drafts #2546 and #2547. #2519 and #2521 have no PR yet.
2. Build latest `main` once per platform, then run Pass 1 to 5 in order. Setup notes (Simulators, XS Max, ports) are in `pending-acceptance-checks.md`.
3. Pass 4 needs Vain with both phones in one sitting. Pass 5 saves screenshots to a folder on Vain's Mac (ask which one).
4. Post results on each PR or issue, then close #2521 and #2524 if they pass.

## Gate: must merge first

Status at 02:33Z (Oct 22).

Open PRs:

- #2433 1.5.0 release docs (no change since 15:29Z)
- #2533 Track 5, remote chats render images and cards (no change since 17:19Z; #2538 merged in the same area, so it may be superseded)
- #2546 (draft) #2541: Connect refuses secret entry and the phone full client (WebView) is retired
- #2547 (draft) #2542: paired-device traffic encrypted with pinned Noise XK

No PR yet:

- #2519 Track B, swipe row actions
- #2521 first-reply auto-scroll (open until reproduced on main)

Merged since the plan started: #2527, #2492, #2528, #2529, #2525, #2535, #2532, #2531, #2537, #2539, #2540, #2538, #2534, #2549, #2550.

Already merged and only waiting for the device run: #2402, #2487/#2502, #2510, #2512, #2513, #2514, #2516, #2508.

## Pass 1: iOS 27 Simulator (no taps from Vain)

Build latest main once. Use loopback Host, not Connect, unless noted.

1. **Fresh install** on "QA iOS 27 Fresh" (#2402, #2512): empty home, chooser opens itself; Account page with Back; Tailscale page (pasted link, Pair); close then "Pair a computer" reopens; deep link and pasted link. en+zh, light+dark. Note guide step 2 "coming soon" wording. Shots → `.github/pr-screenshots/2512-pair/`.
2. **After pairing** (#2512, #2518): drawer pair entry opens the chooser with guide collapsed; drawer All row and Host rows filter the list; title icon/colour; account rows open `/pair/account?account=…`; iOS edge swipe opens drawer.
3. **Swipe actions** (#2519): pin, section, mute on a row; edge zone still opens drawer.
4. **Header at AX5** (#2487/#2502): Chats and Activity with a filter, light+dark.
5. **New DM, recorded** (#2510, #2521): short send then long send. Working row stays under the question; never blank; reply scrolls into view above the composer. If it all passes, close #2521.
6. **Cold-open 50+ message chat, recorded** (#2514): lands on latest, no visible scroll, no top spinner; scrolling up loads history.
7. **Pull-to-refresh** on Chats and Activity (#2516).

## Pass 2: Desktop web (no taps)

Two-Host rig from the handoff note, Playwright, light+dark.

1. #2508 Host strip, Add remote, Change icon / Remove.
2. Tracks 1–3, 5 (#2533): remote avatars, activity ring and unread, Activity Center with 远程 items and inline approve/answer, full message rendering with images, files, and approval, question and secret cards.
3. Track 4: Notification API alert for remote attention while the page is open.
4. #2098 / #2528: CLI list devices, create offer, revoke; Devices UI matches.
5. #2526 / #2529: sign isolated Host in to a throwaway account, delete it, `connect-status` leaves Connected within the stated bound and `cloudflared` is gone.

## Pass 3: Android (Windows machine, one sitting)

1. #2525: sign out, then sign in from the pairing sheet; must offer provider choice, not reuse Chrome's Google session. Same for cloud-instance sign-in.
2. #2518 Android accent follows the chosen Host colour; All keeps default.
3. #2519 swipe actions; #2487 max-font recheck; #2514, #2516, #2510/#2521 same as iOS 5–7.
4. #2512 first-run chooser matches iOS.

## Pass 4: Physical phones together (Vain's taps, one session)

Do these back to back so Vain picks up the phones only once.

1. **XS Max header** (#2513, #2466 nit): islands opaque, chip title text readable in dark, no message text showing behind the title.
2. **#2524 two-phone push and Remove**, on Prod Connect with the throwaway Apple hidden-email account (kept by Connect, `t4dp…`):
   - Android = phone A, XS Max = phone B.
   - Pair A through the account, then B. A gets "New device paired" within a minute; **Remove it** moves B to "Your computer refused this app"; Host Devices shows B revoked.
   - XS Max may spin after Pair (#2498 open): force-quit and relaunch; a retry uses up the link. Keep its QA Host pairing "测试".
   - If the build lacks #2525, clear Chrome site data for `*.authkit.app` and workos.com first.
3. **Connect test-account deletion** last: delete the same throwaway account from the phone, then confirm the Host leaves Connected within about 60s and `cloudflared` stops (#2526 / #2529).

## Pass 5: Feature-intro screenshots (iOS 27 Simulator, end-to-end run)

During the final end-to-end run, simulate group chats based on three blog cases. Capture raw screenshots on the iOS 27 Simulator to use as feature-intro images. Vain will turn them into intro art with ChatGPT image generation.

- Blue Archive AI roleplay: https://deepseekbot.app/blog/blue-archive-ai-roleplay-soul/
- AI group writing workflow: https://deepseekbot.app/blog/ai-bot-group-writing-workflow/
- AI companion preference memory: https://deepseekbot.app/blog/ai-companion-preference-memory/

Also simulate everyday use for each main feature, one or two shots each:

- an approval card and answering a Bot's question
- Activity with items waiting on you
- a routine (detail page and a run)
- Remote Hosts (drawer views, a remote chat)
- the Computer and Browser viewers
- memory (a Bot remembering a preference)
- pairing by account or Tailscale
- images and files in chat

Rules:

- No screenshots of the WebView full client. WebView is being dropped, so every shot is a native screen.
- Bots use the latest DeepSeek model.
- Take raw Simulator screenshots in light and dark.
- Save them to a local folder on Vain's Mac. Ask Vain which folder when the run starts. Approved options include /Users/doodlebear/Movies/BotHarness and /Users/doodlebear/Documents/code/BotHarness.

## Still open, not in the gate

- #2498 pairing sheet spins after redeem.
- #2515 DM empty until Host restart.
- #2368 auto-reject card: waiting on Vain's message.
