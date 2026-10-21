---
Status: Accepted
Date: 2026-10-21
Issues: [#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500), [#2180](https://github.com/BotHarness/DeepSeekBot/issues/2180)
Supersedes: ADR-0202's Host-owned per-kind switches
---

# Every client reads every Host through one Host Feed, and notification preferences belong to the device

A phone and a browser can now both reach Remote Hosts (ADR-0242), but the Web Client still reads This Host through its own bridge and store while phones and Remote Hosts go through the Host client and Remote stream. Every new piece of synced state (avatars, activity, unread, Activity Center) had to be built twice, and it was unclear who decides a notification when one device is paired with several Hosts. We decided that **every client reads every Host, This Host included, through one Host Feed; the Host decides what deserves attention; the Paired Device decides whether it is alerted.**

## Decision

- **One Host Feed.** The live state a Host serves to an admitted client (roster, avatars, activity, unread state, Human Inbox, conversations) is one contract over the device gateway and Remote stream. New state to sync is added to the Host Feed once; phone, browser and Desktop pick it up through the shared Host client (`apps/mobile/src/host/`).
- **This Host migrates in slices.** The Web Client moves its reads of This Host onto the Host Feed one area at a time: avatars, activity and unread first, then Activity Center. No single rewrite; until a slice moves, the bridge keeps serving it.
- **The Host decides attention.** What deserves a notification comes from that Host's Human Inbox, as ADR-0202 already does for phones. A client never re-derives attention from raw messages.
- **The device owns its Device Notification Preference.** Device A stores which kinds of item it wants from each Host and is the place the Human changes them. Because a Host sends phone pushes while the app is closed, A pushes a copy to each Host it is paired with; the Host uses that copy only to decide sends. After a re-pairing, A pushes its preference again.
- **A phone is only ever a Paired Device.** It never hosts PersonaBots. A browser on Host A is a Paired Device of Host B; A never relays B or stores B's credential.
- **Browser alerts while open.** The Web Client shows Remote Host alerts with browser notifications only while the page is open, honouring the Device Notification Preference. Web Push for a closed page is a later decision.
- **Remote Host parity follows the phone.** What a client can see and change on a Remote Host is the phone's per-Host list: chats with full message rendering (images, cards, approvals), Activity Center items with their actions, the Bot page (Memory, model, Routines, Workspace grants, per-Bot notifications), group settings, the Computer and Browser viewers, and Host-level models, usage and storage. Clients share the phone's platform-neutral `apps/mobile/src/host/` modules and supply their own adapters (carrier, storage) the way `native-*` modules do for the phone.
- **No full-client fallback on the desktop.** The Web Client does not open a Remote Host's full Web Client. Remote chats join the channel list and Remote Host attention is handled in Activity Center, so one machine is enough to answer every Host.
- **Host looks are device-local.** The icon, colour and name a device shows for a Host are that device's own setting, stored on the device; a Host never stores how other devices show it.
- **Language.** The glossary uses This Host and Remote Host; the Chinese UI says 本机 and 远程, never 电脑, so the Computer (the PersonaBots' shared desktop) keeps its meaning.

## Consequences

- The Remote Host slices (avatars, activity rings, unread counts, Activity Center items) are built once on the Host Feed and also serve This Host as it migrates.
- The device push settings endpoint becomes a write of the device's own preference; existing Host-stored switches are the initial copy until the device first pushes its own.
