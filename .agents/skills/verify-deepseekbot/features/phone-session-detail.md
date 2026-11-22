# Native Bot Session detail

## Sources

- `apps/mobile/app/session/*.tsx`
- `apps/mobile/src/ui/chat/{session-detail-screen,session-transcript-row,session-link-chips,session-model-composer}.tsx`
- `apps/mobile/src/ui/chat/{session-model-label,use-session-transcript,session-navigation}.ts`
- `apps/mobile/src/host/session-detail.ts`
- `packages/host-client/src/session-{detail,model,links}.ts`

## Terms

- Orchestrator Session
- Assignment Session
- Model Choice

## Sub-features

Bot profile Session rows, Session links from chat messages, and the Group Assignment entry all open one Session detail page. The transcript shows messages, activity, live updates, and model switches. The Session composer can send a follow-up, stop an active Session, and choose its next-turn model.

## How to get to it (user POV)

Open a Bot's profile, choose **Work**, and tap a Session under **Sessions**. Alternatively, tap an Assignment Session chip next to a Bot message or open an Assignment from a Group profile.

## Driving it with verify-app

Use the assigned device in `docs/agents/device-qa.md` and a paired isolated Host with a working model. Use `deepseekbot bot-sessions`, `session-transcript`, and `session-model` to read the same canonical state. Compare a DM with a short draft to the base. Open a current Orchestrator, send a marked follow-up with the keyboard open, and verify it reaches the selected Session. Open a linked Assignment and verify its details, follow-up, and Stop. Open `composer-session-model`, save an allowed choice during an active Turn, and verify the pending label and the subsequent Turn's recorded model. Check English and Chinese, both themes, and a large-text logo-only chip beside Send.

## Observable proof

Back returns to the origin of each entry. The Work list and detail navigation bar show the Session title. A direct message shows the Human’s words, and an Inbox-only wake opens as an Inbox disclosure. The selected Session ID and Bot agree with the Host transcript, follow-up, and saved Model Choice. The model switch appears in the timeline and the DM composer lacks a Model Choice chip. An unauthorized Team member cannot read or send to the Session through its route.

## Gotchas

- A historical Orchestrator can be read. The Host only accepts direct sends to the Bot's current Orchestrator.
- Direct Session commands accept text. The Session composer displays an unavailable attachment control.
- An iOS Simulator capture only covers that Simulator and its installed binary.
