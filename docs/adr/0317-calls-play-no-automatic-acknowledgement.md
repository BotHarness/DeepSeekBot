# ADR-0317: Calls play no automatic acknowledgement

- Status: Accepted
- Date: 2026-11-10
- Issue: #3871 (amends ADR-0281)

## Context

ADR-0281 had the Host play a short "嗯" ("Mm-hm" for non-Chinese ASR) in the Bot's voice as soon as the VAD ended each Human sentence, without the model. In real calls this sounded like the Bot answering on its own: the Human heard "嗯" after every sentence, also when the Bot was busy or had nothing to say, and a noise segment that the VAD let through produced one too.

## Decision

The Host no longer synthesizes or plays any acknowledgement. Every sound a call plays is a reply the Bot wrote with `voice: true`. The `ack` call event and the `ackMs` field of `call-simulate` are removed.

The barge-in filler list (嗯, 啊, 呃, um, uh …) stays: a murmured "嗯" from the Human still does not interrupt the Bot.

## Consequences

- Between the end of a Human sentence and the first reply audio the line is silent; `firstAudioMs` measures that gap.
- Clients that read `ack` events or `ackMs` stop seeing them; nothing in BotHarness depended on them besides tests.
