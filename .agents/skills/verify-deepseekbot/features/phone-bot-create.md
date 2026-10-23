# Native blank Bot creation

A Human creates a blank Bot on a chosen paired Host. The phone retains the exact creation operation before sending it; reconnecting recovers the original PersonaBot and Human DM.

## Sub-features

- `target`: All explicitly chooses from every paired Host; a scoped Host is inherited. Changing the target preserves the draft and does not switch browsing.
- `form`: native name/persona fields, optional Bio/tags, validation and keyboard-safe submission.
- `receipt`: the original Host, pairing identity, operation key and input survive app restart. Repeated taps and uncertain replies cannot create another Bot.
- `completion`: active progress opens the new DM on its Host; leaving progress retains an Open Bot action without taking over navigation.
- `refusal`: unsupported Hosts refuse before mutation; unavailable/revoked targets, changed input and archived results never fall back to another Host or fresh operation.

## How to get to it (user POV)

On the phone, open New → Create Bot from All or a selected Computer. Choose the Computer when needed, enter a name and persona, optionally expand more details, and create. Pending or completed creation remains reachable after leaving the form.

## Driving it with verify-app

Use the designated [shared device QA runner](../../../../docs/agents/device-qa.md). This journey needs two isolated paired Hosts, no model, and a compatible native development build. Submit it to the Windows queue for Android; iOS has its own queue. Web screenshots do not qualify the native form.

1. Record the candidate and native-build SHA. Capture the previous creation entry on the compatible base before loading the candidate. Use synthetic Host names and redact addresses and pairing data.
2. Browse All → New → Create Bot. Verify both paired Computers, including a fixture with identical display names, remain distinguishable. Confirm a target explicitly. Enter name/persona/Bio/tags, change A to B, and check the draft remains and browsing has not switched.
3. Submit twice rapidly. The active form opens the new DM on B. Read the Bot list and creation receipt through B's CLI; compare A before/after. Exactly one new identity and its original DM must exist on B and none on A. A new deliberate operation with the same name may create another identity.
4. Browse A and create again: A is already selected without another mandatory picker. Repeat with no model configured; creation still succeeds and the DM offers model setup without a test message.
5. Disconnect before submitting: retain the draft and require an explicit retry after reconnect. For a submitted operation, drop the create response after Host commitment using a task-local transport fixture. Restart the app, resume the retained operation and compare the receipt, Bot slug and DM with canonical Host state. Restart the owning Host and repeat recovery; there must be no second identity.
6. Leave progress before completion. Confirm the current page remains in place; use the completion action to open the same Bot on B. Repeat after app restart.
7. In task-owned fixtures only, revoke the paired device, unpair/re-pair it, archive the result, and change input under the same key. Each must show the appropriate refusal without creation on another Host. An old Host without the lookup method must receive no create mutation.
8. Check English and Chinese, light/dark, default/intermediate/maximum text size, real keyboard focus changes, multiline growth, accessible control names and reachable actions. Capture matched PNG/XML and the actual create/recovery interactions. Preserve the Human's settings, pairings and data.

Pair visible evidence with CLI `create-status` using the saved operation key and exact submitted input, canonical Bot/DM reads, and bounded redacted transport logs. Source tests cover deterministic lost-response and storage-failure branches; do not report those as native fault-injection results unless actually driven.

## Gotchas

- The operation key is bound to one Host and exact input. Never substitute a new key, pairing or target to make a failed journey pass.
- Before starting a mutation, lookup must establish recovery support. A missing method is a compatibility refusal, not a reason to call legacy create.
- Leaving the page does not cancel work already accepted by the Host.
- Record Android, iOS, CLI, injected transport faults and Human acceptance separately. Unrun cases remain untested.
