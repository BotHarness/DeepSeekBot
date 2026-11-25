---
Status: Proposed
Date: 2026-11-26
---

# ADR-0369: A Bot attends a meeting as a call, through a browser on the Host

## Context

The Human wants a Bot to join a company meeting (Zoom first, then Google Meet, Teams and others), take notes, and take part in it the way a person would. Claude Meetings (beta, November 2026, Google Meet only) shows the shape: a visible participant, live transcription, answers in meeting chat, a recap afterwards.

The industry has four ways in:

1. **A browser on a server joins the web client** as a participant and takes audio, captions and chat from the page. Meeting-bot vendors run exactly this as a service.
2. **A vendor API** such as Recall.ai: one API for every platform, billed per hour, and the audio passes through the vendor's cloud.
3. **Each platform's own media API**: Zoom Realtime Media Streams (no participant, needs a reviewed Zoom App), the Google Meet Media API (Developer Preview, restricted scopes), Teams real-time media bots (Graph, Windows and .NET). One integration per platform.
4. **Local capture** of the Human's own meeting app audio (Granola). Nothing joins, so the Bot cannot post in the meeting.

Tobs Hosts already run on the Human's machine or their own VPS, already drive Chrome over CDP (Bot Browser, Container target), and already run calls: Host VAD, the Bot's ASR binding (streaming with Soniox), streamed voice replies, barge-in, and audio zeroed after transcription ([Voice and call decisions](../decisions/calls.md)).

## Decision

**Attending a meeting is a call.** A Meeting Attendance is a call whose far end is a meeting instead of the Human's phone or window. Meeting audio goes through the same call pipeline (Host VAD, the Bot's ASR, streaming when the binding supports it, the same Orchestrator input, "busy" speech heard on the next turn). Speaking, when it ships, reuses streamed call replies and barge-in unchanged. All speakers arrive as one audio input, like a call.

**The far end is a dedicated browser on the Host.** Each Meeting Attendance starts its own Chrome instance with its own profile and its own audio. The page joins the platform's web client as a guest whose display name says whose Bot it is. Remote meeting audio is taken from the page's media tracks and sent to the Host over CDP; system audio devices are never used, so attendances cannot hear one another. It runs on a desktop Host or in the Container target on a VPS. No paid service is involved, and no meeting audio leaves the Host except to the Bot's own ASR provider.

**A Bot is one person.** The Bot's one Orchestrator attends; there is no separate meeting Session and no wake rule. The Orchestrator hears the meeting continuously and decides by itself whether to post in meeting chat (`meeting_send_chat`), and it dispatches Assignment Sessions to look things up during the meeting. A Bot is in at most one call at a time, and a meeting counts as one: this replaces "one call per Host" ([calls §4](../decisions/calls.md#adr-0281)) with **one call per Bot**, at most three per Host.

**The meeting is not a conversation.** Meeting speech never becomes DM or Group messages. Each Meeting Attendance has its own page with the live transcript and the Bot's posts. The conversation the link came from (Tobs or an external IM chat) gets one message on join and one recap (summary, decisions, action items) on leave. The full transcript and the recap go into the Bot's Memory; audio is never stored.

**Joining is a capability.** The Human sends the Bot a meeting link; the Bot joins with its own CLI. Who may send a Bot to a meeting is the Host-checked capability `meeting.join`, resolved through the shared grants resolver (#5324) for Host Members and paired external IM people alike; anyone else's link is referred to the Owner. Only meeting domains of supported platforms are accepted. People in the meeting can talk to the Bot, but a request from an unpaired participant that needs private data or an outside action is confirmed in the dispatcher's conversation first.

## Considered options

- **Recall.ai or another vendor**: the fastest path to every platform, rejected because it is paid per hour and sends meeting audio to a third-party cloud, which a locally deployed Host exists to avoid. The join path keeps one seam, so a vendor or Zoom RTMS could be added later as another far end.
- **Platform media APIs**: three different integrations with app review and restricted scopes, and Zoom RTMS cannot post in the meeting by itself.
- **Local capture of the Human's meeting app**: cannot post in the meeting, ties the Bot to the Human's machine and being in the meeting.
- **A separate meeting Session with wake rules** (name mention, new chat message, a timer): cheaper per hour, rejected because the Bot would not be one person in the meeting and could not weigh the meeting against its other conversations.
- **Writing meeting speech into the dispatcher's DM**, as calls do: it would flood a conversation with other people's words and leak them into an external IM chat.

## Consequences

- Calls §4 is rewritten to "one call per Bot" before meetings ship; the readiness and `call-active` refusal move from Host to Bot, and the Human sees "in a meeting" when calling a Bot that is in one.
- An hour of meeting runs many Orchestrator turns. The first Zoom slice measures the cost of a real-length meeting with the latest DeepSeek model before it is turned on by default.
- Web clients change and some meetings block guests or bots. Each platform is its own issue with its own page driver; waiting rooms time out after 10 minutes and report back.
- No notice is posted in meeting chat; the guest display name is the only disclosure. Hosts in places that require recording consent need a per-Host setting later.
- `meeting.join` is added to the capability catalog; Owner gets it by default.
- Every new Bot tool ships its CLI command (`deepseekbot meeting join|leave|chat|status`).
