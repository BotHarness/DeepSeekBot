> Transfer note: this is the stopped child task's report. Statements saying “not pushed” describe its stop time; source checkpoints and the final trusted-ingress commit were subsequently pushed by the transfer session. Local log links are retained as provenance and are not Cloud-accessible. The latest Human instruction runs normal development/verification in Cloud and connects to the Mac only for iOS Simulator/physical-device work.

# Trusted managed Tailscale ingress — stopped for Claude Cloud migration

Stopped at the Human's request. No further implementation, publishing, push or PR was performed after that request. Preserve this worktree, all source and ignored verification material.

- Worktree: `/Users/doodlebear/.t3/worktrees/BotHarness/codex-team-trusted-ingress`
- Branch: `codex/team-trusted-ingress`
- HEAD: `149f6e4f9cea310bf9e54218152a75140955ab4a`
- Base: M8 `97d852cebd37d7045859fe5a08cd522098e6faf8`
- Git dirty files: none. All 22 task files are committed. Branch has NOT been pushed; no PR created.
- Task: `codex/local/01a1e2a5-5409-7841-b36b-fcc044900d36`
- Claim: https://github.com/BotHarness/DeepSeekBot/issues/4146#issuecomment-6907470249

## Implementation retained

Dedicated ephemeral `127.0.0.1` ingress; process-random tag distinct from Connect; exact HTTPS protocol required alongside the tag; arbitrary main-port forwarded headers/tags remain refused. HTTP and upgrades stream through the existing Host authority. Publisher owns listener lifecycle and exact mapping, retargets in place, and records a pending target to recover interrupted retargets. Manual mappings are neither adopted nor advertised. Invitations, pairing offers and public Team status share direct TLS/Connect/trusted managed routes. CLI status adds `managed.trustedIngress` and per-Tailscale `memberSignIn`.

ADR-0347, runtime/living architecture, bilingual CLI docs, release fragment and verification feature map are committed. No Client components or DSH upstream changed. No separate M8 runtime doc exists on this base; M8 transport details are in the M1 runtime document.

## Verification

- CI selection plus Team/device coverage: 343 files (339 CI-selected + 4 additional), final 4,237 passed / 0 unresolved failures / 19 skipped.
- Initial batch run: 4,235 passed / 2 timeouts / 19 skipped. Both entire timed-out files reran unchanged: 104 passed / 0 failed. Initial failures retained in `.tmp/trusted-ingress-batches/4.json`.
- Full focused run before later recovery cases: 231 tests / 5 files passed. Later recovery and Owner/Web Client ingress tests passed in the affected run.
- `pnpm typecheck`: passed, root and mobile.
- `pnpm format:check`: passed, 5,511 files.
- CI docs build/public surfaces: 1 passed; `pnpm slides:build` passed.
- `pnpm og:font`: passed; font hash unchanged.
- `pnpm e2e:smoke`: PASSED on this committed SHA, DSH 0.2.2-rc.1, including DM/history/restarts. It finished naturally while the stop request was being reconciled.
- `pnpm lint`: blocked by two proven unchanged M8-base violations. At migration generation 155, current main expects `channel-membership-basis`, while M8 has `member-devices`; also `apps/mobile/src/team/team-link-path.ts:4` has a prohibited code comment. Baseline evidence was read from immutable `97d852ceb`, not inferred. Oxlint and 11 other lint gates passed; total 12/14 gates passed, 2 baseline blockers. Do not silently claim full lint passed.

Unit summary: `.tmp/trusted-ingress-final-unit-summary.json`. Per-batch JSON/logs, baseline proofs and static/docs/smoke logs remain under `.tmp/trusted-ingress-*`.

## Process cleanup

No named `trusted-ingress` verification Host was launched. Real Tailscale publish/check was NOT started; no real Serve mapping was changed by this task. `m8ios`, its :8447 mapping and devices were not operated.

Smoke finished with exit 0. Its pnpm PID 54163, script PID 54924, launcher PID 55428, build PIDs 58732/58744 and observed CLI PID 98965 were absent at final check. Its Host listener :51442 was released. No task-path build/test process remained in the process inventory. No signal was delivered to a live process during stop reconciliation because these owned processes had already exited. No other task's processes were stopped.

Private ownership record: `.humanlayer/tasks/trusted-ingress-resources.json`. Sources, temporary profiles, build outputs and evidence were preserved; no deletion was performed in response to the stop request.

## Remaining work for the next owner

1. Resolve or explicitly account for the two M8-base lint blockers with the M8 orchestrator; they were deliberately not edited here.
2. Run the required real Mac check: named isolated Host `trusted-ingress`, publish its own route, verify Serve targets the loopback ingress, enable Team and sign in using the invitation fingerprint over real HTTPS, then disable and stop only that Host. Compare complete Serve configuration before/after; protect `m8ios` and :8447. The prepared PRIVATE helper `.tmp/check-managed-tailscale.mjs` has not been run. Read it before use and retain private permissions. It handles publish/sign-in/main-port refusal/disable/config comparison; launch, doctor and Host cleanup remain separate.
3. UI handoff to Claude: expose the new trust status and suggested en/zh copy in `docs/bot-cli*`. `paired-devices.tsx` `portOf` currently parses `serveCommand`; its final port now names ingress. Read the loopback route's port for the Host-port label. No UI components were edited here.
4. Push `codex/team-trusted-ingress` when resumed/authorized, no PR; orchestrator merges into M8. Record an issue outcome when the resumed handoff is complete. Native/Simulator acceptance remains the orchestrator's separate lane.
