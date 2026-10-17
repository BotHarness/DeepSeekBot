# Long-run validation observer

The observer watches the four-week multi-Bot validation run tracked in [#1593](https://github.com/BotHarness/DeepSeekBot/issues/1593). Prefer a machine other than the validation Host. In this run it shares the validation machine as a separate user-level cron: a stopped Host is still reported, but a whole-machine outage produces no alert.

## What it does

- `check` reads the validation Host once through the `deepseekbot` CLI (`list`, `bot-activity`, `bot-attention`, `bot-sessions`) and applies fixed rules. A new finding opens one issue labelled `long-run-validation` plus a severity label. A finding that disappears gets a "cleared" comment, which feeds the recovery metric.
- `daily` turns one UTC day of checks and events into a short report and posts it to a Discord webhook.
- `intervene --note "<what you did>"` records a Human intervention (restart, unsticking, correcting a Bot) for the daily count.
- `setup` creates the labels once.

| Rule                     | Severity | Fires when                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| `host-unreachable`       | critical | two checks in a row cannot reach the Host                           |
| `bot-blocked`            | major    | a PersonaBot stays `blocked` for 120 minutes                        |
| `session-stalled`        | major    | a `thinking` or `working` Session shows no activity for 120 minutes |
| `assignment-error`       | major    | an Assignment Session reports `error`                               |
| `attention-needs-repair` | major    | an Attention Unit is in `needs-repair`                              |
| `attention-backlog`      | minor    | open Attention Units are older than 120 minutes                     |

## Public-safety rule

DeepSeekBot is a public repository, and Attention summaries and external origins carry names of people the Bots talk to on X and by email. Issue bodies therefore contain only ids, enums, counts and timestamps. Raw snapshots (`snapshots/*.jsonl`) and Diagnostic Bundles (`bundles/*.zip`) stay in the observer's state directory; an issue names the bundle file, not its content. A bundle is exported only for findings anchored on a Channel message.

## Setup on the observer machine

1. Build or install the `deepseekbot` CLI at the same tag the validation Host runs.
2. Export `DEEPSEEKBOT_HOST` (the validation Host's tailnet HTTPS origin), `DEEPSEEKBOT_HOST_TOKEN` (its launch token), `LONG_RUN_HARNESS_TAG` and `DISCORD_WEBHOOK_URL` in a private env file (mode 0600). The launch token carries full Host authority, not read-only access, so keep it on this machine only.
3. Authenticate `gh` with an account that can open issues in `BotHarness/DeepSeekBot`, then run `node scripts/long-run-observer.mjs setup` once.
4. Try one `check --dry-run`, then schedule:

```cron
*/30 * * * * . ~/.config/long-run-observer.env && node ~/DeepSeekBot/scripts/long-run-observer.mjs check >> ~/.local/state/long-run-observer/cron.log 2>&1
5 0 * * * . ~/.config/long-run-observer.env && node ~/DeepSeekBot/scripts/long-run-observer.mjs daily >> ~/.local/state/long-run-observer/cron.log 2>&1
```

When `host-unreachable` fires, SSH to the validation machine and read the process and system logs; the CLI cannot see a stopped Host.

## Not covered yet

Token use and rate-limit hits are not readable through these CLI commands, and the weekly Memory spot-check is manual. Record both by hand until a CLI read exists.
