---
Status: Accepted
Date: 2026-10-31
---

# QQ ordinary collection retains negotiated direct attachments

## Context

The ordinary QQ collection slice was explicitly text-only. Provider `.23` accepts
eligible ordinary group messages as text but labels their supported direct images
and files unreadable and drops attachment metadata, even when its exclusive
Consumer negotiated the corresponding attachment capability. Issue #3221 reproduces
that loss with synthetic SDK-normalized input through the published Provider.
This does not establish the cause of the original live incident or a regression
from 1.5.2: its `.22` Provider rejected the same ordinary-media input entirely.

The Human explicitly authorized extending this text-only slice to retain supported
direct image/file attachments on already eligible ordinary group messages.

## Decision

The application-defined QQ Provider applies the existing negotiated source image
and generic-file capabilities to addressed **or eligible ordinary** messages.
Eligibility still requires its ordinary collection opt-in, group event type, and
non-Bot/non-self author checks. Neither the list of receiving groups nor author
authorization changes. Core still owns identity/Grant, sender, intake boundary,
conversation collection and route authorization before durable Source Event writes.
Mentions-only collection does not persist ordinary media, including permission probes.

The Provider keeps private source tickets in its bounded process-local proof store.
The canonical Source Event retains safe attachment metadata and contentParts through
the existing Core adapter. AttachmentStore acquisition still revalidates source and
identity, private URL allowlist, size and content. Unsupported MIME and disabled
capabilities remain unreadable; ordinary quoted attachments and voice are unchanged.
Ordinary media is not a mention and does not gain passive reply authority. Proactive
speech remains an independently authorized Outbox operation.

The maintained transport source owner is `DoodleBears/dsh-im`. This repository
derives the product Provider from immutable source
`7505ce6fcda26c02810781fde9d4da81dab28a68`, the input of published `.23`.
`scripts/product-provider/qq-ordinary-media.mjs` makes three checked source-gate
changes during `stageProvider`, after immutable-input verification and before Host
compilation. A changed or ambiguous seam fails closed. The transformation hash is
recorded in the artifact's managedSources provenance. Candidate `.24` is a new
artifact; published `.23` bytes and historical release qualification are not edited.
Release CI exercises the actual pinned Provider with the repository's regression
runner after installing its dependencies. Publishing still requires the usual
explicit release authorization and fresh artifact qualification.

## Consequences and verification

Existing explicit all-message collection now includes negotiated supported direct
images/files; the UI does not require a second group consent switch for media.
This is an explicit extension of text-only scope, not a silent permission migration.
No new durable store, bridge method, tool, route or CLI command is introduced.

Synthetic real-Provider regressions must preserve the identical ordinary input
before/after the source change and retain addressed, disabled-capability, unsupported
MIME, uncollected, Bot/self-author, host-allowlist and no-passive-reply controls.
Core tests verify persistence only for the authorized group while collection is all.
These tests do not qualify native QQ delivery, image download/understanding or the
original incident. Those live checks remain explicitly outstanding.
