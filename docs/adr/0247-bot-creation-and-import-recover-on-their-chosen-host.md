---
Status: Accepted
Date: 2026-10-23
---

# Bot creation and import recover on their chosen Host

Native mobile creation must survive a lost response without creating another Bot. The Human chose to include durable recovery for blank creation, Marketplace, Git-link and Bot Zip imports in the same delivery scope. The chosen Host owns that recovery; the phone retains enough information to find the original operation after reconnection or app restart.

## Decision

Extend the application-defined creation capability and durable coordination established by [ADR-0225](0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md). Blank creation and pinned Git import share its stable-key coordination in managed Memory storage. Each import source must obtain the same recovery guarantee before its native flow is qualified. Delivery and qualification are tracked independently in [#2634](https://github.com/BotHarness/DeepSeekBot/issues/2634).

- A submitted operation binds one Host, accepted creation input and a stable operation identity. Source content accepted for an import remains bound to that operation during recovery. A retry must not silently pick a newer repository revision, another file or another Host.
- The Host durably coordinates creation and readback through the existing Registry, Memory and Channel owners. Repeating the same operation reconciles its existing identity and result. Input changes under the same identity refuse. Recovering a partially completed operation uses its reserved or created Bot; it never guesses that a lost response means nothing happened.
- The operation record is coordination state in the existing operational persistence boundary, not another authority for PersonaBots or Memory. The phone stores a recovery reference and local form state, not an authoritative completion result. Each read or mutation remains subject to the selected Host's current authentication and authorization.
- Changing a target before submission preserves the draft; after submission, the target is fixed. An unavailable Host leaves the operation unresolved until it can be checked there. Automatic failover to a different Host or a fresh creation identity would violate the Human's selected destination and is excluded.
- Bot and Human DM recovery must tolerate the filesystem/database boundary. A known Bot whose remaining creation steps are incomplete is reconciled through those owners. Existing conflict and repair refusals remain explicit; recovery does not delete canonical data to make a retry look clean.
- Durable Host acceptance is an observable operation state. Accepted processing continues when the phone disconnects or the Human leaves; leaving a page is not server cancellation. This scope has no hard-cancel action for accepted processing. An unsubmitted draft is never automatically submitted merely because a Host becomes reachable.
- Zip transfer and accepted processing are separate phases. The phone retains the selected file as needed for recovery; an interrupted transfer may resend identical content under the same operation after checking its state. The Host binds the accepted artifact to that operation and reconciles repeat delivery without another Bot. Byte-range resumption and continuous background uploading are not required.
- An explicit request to import another copy starts a separate operation and can create another Bot from the same source. Repeating an existing operation returns its original result. Display name and source equality do not deduplicate independent Human requests.
- A usable model is not a prerequisite for committing the Bot and its Human DM. The new Bot follows its Host's default model settings; the client directs the Human to model setup when needed. Model failure does not roll back creation, and creation does not send an automatic test message.
- New or changed Host methods ship equivalent CLI commands, coded refusals, documentation and a real Host verification path under the repository's CLI parity rules. This extension does not grant Tob new import permissions.

The [mobile design](../../apps/mobile/DESIGN.md#native-bot-creation-and-import) owns native entry points, destination selection, confirmation, draft retention and progress presentation. Browsing the public Marketplace does not require a paired or reachable Host; creation still requires explicit submission to the chosen Host. Success automatically opens the new DM only while the Human is on the progress page. After they leave, completion retains an Open Bot action and never takes over their current page. Product decisions are settled; stacked implementation and native qualification remain tracked separately.

## Trade-off and qualification

Simply retrying the desktop import calls would keep the mobile work smaller, but a lost response can then produce two identities. Durable Host coordination adds lifecycle and persistence work and was chosen as part of the feature's required behavior.

Qualification must lose a response after the Host durably accepts the request, reconnect or restart the client, and recover the same Bot and DM for each source. Host restart and partial-write recovery must preserve the chosen identity or return an explicit repair refusal. Interrupted Zip transfer may resend the same artifact without a second identity. Source/target changes must not be mistaken for retries; an explicitly requested additional copy must receive a distinct operation and Bot. Native interaction and real Host/CLI evidence must each name their verified candidate; source completion alone does not qualify either surface.
