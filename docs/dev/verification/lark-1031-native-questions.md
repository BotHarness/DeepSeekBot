# Lark native question qualification (#1031)

## Candidate and scope

A paired Lark management DM answers a native Bot question through a private form or an explicit text reply. The original session stays the one authority, and an unconfirmed submission is never replayed.

Provider: `34b53227d4dc6a1e32059a7489e4e0fe280aeeb4`, 425 runtime files. Core: this branch on DSH `0.2.1-rc.3`, with `deepseek-v4.1-flash` driving real model turns.

## Native qualification — 2026-11-03 JST

An isolated Host connected the dedicated `BotHarness Lark QA1` app, which is visible only to the test account. The app gained `im:chat:read`, `im:resource` and the long-connection `card.action.trigger` callback in published version 1.0.1. A `/pair` request from the real DM was approved with only the `answer` capability, then selected as the management route.

| Native test                | Actual action in Lark                                   | Result                                                                              |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Two-question form          | Chose `Red` and typed free text for the second question | One resolution with the actor recorded, the Bot continued, card updated to Answered |
| Single question, `/answer` | Sent `/answer <reference> Tuesday` in the DM            | One resolution, the Bot replied `LARK_TEXT_OK Tuesday`, card updated to Answered    |

Delivery records show `sent`, `accepted` and `updated` for both. Web shows the same answers, and the Management notifications panel lists both in light and dark.

## Not covered natively

Quoted-reply answers, cancelled or expired cards, a Web and Lark answer race, restart, and unconfirmed-submission repair have automated coverage only. The form's duplicated text in the first test came from the test typing it twice.

The QA binding was removed and the Host stopped. Screenshots are local evidence in the task's verify folder.
