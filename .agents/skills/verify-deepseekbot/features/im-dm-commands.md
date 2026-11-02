# IM DM commands

## Sub-features

- Whole text-only DMs support `/commands`, `/help`, `/status`, `/model`, `/effort`, `/stop` and `/new`, including Chinese aliases and full-width slash.
- Group, attachment and malformed-command traffic retains the normal intake path.
- Mutations require current source authority and a management pairing with approval capability, except admitted Weixin owner DMs. Revocation during model lookup/validation or Session replacement prevents the unused mutation.
- Commands serialize per PersonaBot, preserve Assignment model inheritance, and reply through the canonical source-bound Outbox without model wakes or duplicate actions.
- `bot-new-session` reaches the same idle Session replacement owner and returns `bot-busy` while working.

## How to get to it (user POV)

Use the authorized test owner DM of a bound WeChat identity, or an admitted Feishu DM with an approved management pairing. Send `/commands`, `/status`, `/model`, then choose one displayed model and a supported effort. Stop active work before `/new`. Send an ordinary DM afterwards to verify the fresh Session. Other platforms without management pairing support return Web guidance for changes.

## Driving it with verify-app

Launch an isolated Host and run doctor. Verify an ordinary real-model DM first. Use `deepseekbot bot-new-session <Bot ID>` against that Host, send another ordinary DM, and compare `bot-sessions` with the first Session: it must be archived and the next message must own a new Orchestrator. Check a running turn produces `bot-busy` rather than retiring it.

For native IM, discover the current signed-in browser/account and authorized test conversation each run. Send uniquely marked test messages; correlate the visible replies with retained Source Events, handled Admissions and Outbox attempts/outcomes via `im-history` and `bot-attention`. Commands alone must not create a model turn. Use the Web pairing controls to revoke unused authority before a queued mutation, then confirm unchanged model settings. Compare a group command-shaped text and a DM attachment against their ordinary intake behavior. Do not acquire an exclusive production receiver without its separate authorization.

Automated intake tests exercise ordering, revocation, deduplication, unknown reply outcomes and long-catalog chunking through a real operational database and shared Provider consumer. An isolated Host with a controlled Provider qualifies the production command/runtime/Outbox seam; it does not prove native WeChat delivery or rendering.

## Gotchas

- An accepted Provider result does not establish native rendering; capture that separately.
- Unknown send results are retained and never blindly retried. Interrupted command work remains visible as an `im-command-*` Admission error; it is not replayed through the model.
- Real WeChat delivery requires the paired owner's connected account. An isolated synthetic Provider or Web DM is not that proof.
- Do not treat the Web composer's slash picker as the IM transport command path.
