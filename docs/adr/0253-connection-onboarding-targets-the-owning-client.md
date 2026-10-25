---
Status: Accepted
Date: 2026-10-26
Issue: https://github.com/BotHarness/DeepSeekBot/issues/2793
---

# Connection onboarding targets the owning Client

## Context

Devices and Connect split one user task across settings entries. A desktop browser is also a Paired Device: generating a credential in a CLI process does not add a Remote Host to that browser. The first delivery slice is LAN invitation and targeted browser enrollment, with actual Host Feed visibility before expanding the other setup paths.

## Decision

Use one Connections sidebar entry and an Add connection flow. Invite a device to This Host and join a Remote Host are distinct directions. LAN opt-in occurs in its preparation step. Tailscale publishing and Connect account/tunnel retain their existing owners; visual consolidation grants no additional authority.

The application-defined Client control relay carries a bounded connection command to an explicitly selected, currently registered Client. It has an operation identity and deadline. The Client runs the existing RemoteHosts owner and shared pairing carrier; only that Client's origin-local storage holds the resulting credential. This Host temporarily transports the command but never becomes a remote credential store or proxy. Re-registration/disposal cancels unfinished enrollment. An acknowledged asynchronous attempt has a five-minute lifetime; an expired request cannot start it. Status distinguishes saved credentials from a connected Host Feed. Cancel prevents a late redemption from being saved; if saving already completed, cancellation does not falsely promise rollback or revoke that existing pairing.

Invitations and approvals remain facts of Device Pairing. The invitation receipt identifies completion and filters its pending keys; a different device's enrollment cannot complete the current dialog. Closing the review dialog leaves the request pending. Exact Host fingerprints and device public keys remain required. There is no reciprocal Host grant, new durable pairing database or model-authorized approval path.

The restricted LAN listener now admits browser WebSocket Origins that are exact HTTP(S) origins recognized by the existing device route policy (loopback, private LAN, Tailscale or Connect). The fixed desktop origin `dsh-app://app` (ADR-0236/0237) is also eligible; other custom origins are refused. Native connections without Origin remain supported. Other origins, `null`, paths, credentials, cookies and subprotocol headers remain refused. This corrects a blanket Origin refusal that prevented browser pairing before Noise started. Origin is an eligibility filter, never identity: pinned Noise authentication, explicit exact-device approval and per-device admission still authorize every request. The listener still serves no operator HTTP or Web Client.

## Consequences

CLI start reads a private link file or stdin, returns only progress/identity, and requires both Client and operation IDs. A lost Client or relay re-registration invalidates its unfinished work. Retrying the same operation ID does not start a second enrollment; concurrent enrollment of the same Host is refused by RemoteHosts. Existing route learning and handover policy remain unchanged.

The first slice does not grant Tob new management permissions, implement Host federation or qualify native mobile networking. Human feedback on the runnable LAN/UI/CLI path precedes broader preparation variants. Runtime proof and screenshots are recorded separately from this decision.
