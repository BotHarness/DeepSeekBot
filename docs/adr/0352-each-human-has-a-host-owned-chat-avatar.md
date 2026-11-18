---
Status: Proposed — the Human confirms at review of the implementing PR
Date: 2026-11-17
---

# Each Human has a Host-owned chat avatar, independent of any Tobs account

A Human could set a chat name on the Host (ADR-0103) but their picture came only from a signed-in Tobs (Connect) account, which exists to publish Bots to the marketplace. People who never sign in to Tobs had no picture, and in Team mode (ADR-0336) a Host can have many members whose messages and member lists all showed the same placeholder. We decided that every Human ID has an optional chat avatar stored on its Host, beside the chat name, and that the Tobs account picture is a separate marketplace identity.

- **Authority.** The `human-identity` module owns `human_avatars(human_id, avatar, version)`. The avatar is a bounded, sniffed `data:image/(png|jpeg|webp)` value with the Group avatar check (ADR-0081: at most 128 KiB as a data URL and 96 KiB decoded). The desktop app crops to a small WebP and the phone to 256×256 JPEG, both far below the limit. `version` is a content hash. Remote URLs are rejected. Clearing it deletes the row and the apps fall back to the initial-letter placeholder.
- **Who sets it.** A Human sets only their own avatar (`humanAvatarSet`), the same as their default name. In Team mode the signed-in member acts for themselves; no one sets another member's picture in this delivery.
- **Who reads it.** Read models carry only `avatarVersion` (the caller's `humanIdentity`, Channel `humanMembers`), never bytes, so message-driven refreshes stay small (the ADR-0086 trade-off). Clients fetch bytes with `humanAvatars({ humanIds })`, at most 64 per call, and cache them by `(humanId, version)`. A caller receives its own avatar and the avatars of Humans it currently shares a Channel with; any other ID is silently omitted. A bridge method rather than an HTTP route serves the bytes, so every transport a member can use (loopback, LAN, encrypted gateway, the Team browser RPC) reaches it through the same gateway authorization.
- **Lifecycle.** Content Purge of a member deletes the row. Profile backup carries it with the operational database.
- **Names are unchanged.** ADR-0103 still decides labels: a Channel nickname overrides the default name, which falls back to the member's Host display name. The Tobs account name and picture stay on Bots shared to the marketplace and are no longer the only way to get a chat picture.

## Considered Options

- **Use the Tobs account avatar as the chat avatar** — rejected: it requires a cloud sign-in that Team members and local-only Humans do not have, and a Host must not depend on Connect for identity (ADR-0336).
- **Inline the data URL in member lists** — rejected for the same reason as ADR-0086: a large Group would resend every member's picture on each refresh.
- **An authenticated HTTP read route like Bot avatars** — deferred: the Team member gateway allows only listed HTTP paths, and the encrypted mobile routes already turn route reads into bridge calls; a bridge method keeps one authorization path. It can move to a route later without changing the stored authority.
- **Per-Channel avatars** — rejected for now: the ask was per-Channel nicknames only, and a second picture per Channel would make a Human hard to recognize.

## Consequences

- The desktop app shows each Human's picture in messages, member lists and the profile entry, with or without a Tobs sign-in. The phone shows it on the profile entry and in Settings; phone message and member rows keep the initial-letter placeholder until #4446. Settings → Profile edits the chat name and picture on the Host first and shows the Tobs account below it.
- Team members can set their name and picture right after their first sign-in and at any time later; an admin creating a member sets the display name, and the member chooses the picture.
- First sign-in prompt (amended 2026-11-18 at the Human's request): while a non-Owner member has no picture and has neither finished nor skipped it, `humanIdentity` carries `profileSetup: 'pending'`. The desktop/browser Client and the phone then ask once for a name and picture, prefilled with the admin-set name. Done or Later calls `humanProfileSetupFinish`, recorded per Human in `human_profile_setup`, so no other device asks again. The Owner is never asked. A member who already has a picture is not asked.
- New CLI: `human-avatar-set (--file | --clear)`, `human-avatars <human-id>...` and `human-profile-setup-finish`.

## References

- ADR-0081, ADR-0086, ADR-0103, ADR-0336.
