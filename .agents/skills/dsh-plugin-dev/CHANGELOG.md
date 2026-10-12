# DSH Skill Changelog

Notable changes to the installable DSH/Cordis Context and Decision Tree are recorded here. Skill
SemVer identifies this artifact; the DSH version and upstream revision record what its claims were
verified against.

## [Unreleased]

Preparing the next DSH Skill release independently from downstream product releases.

### Documentation

- Recorded audited Windows-to-Linux Profile path migration and non-root workspace permission prerequisites in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH `0.2.0-rc.1` and the real isolated Linux Host; DSH/Cordis Context and Skill behavior remain unchanged ([#1386](https://github.com/BotHarness/DeepSeekBot/issues/1386), [qualification](../../../docs/research/2026-10-12-private-input-linux-qualification.md)).

- Documented the qualified private-reference MCP consumer, native adapter/SDK boundary and trusted-server limits; DSH/Cordis Context and Skill behavior remain unchanged ([#1384](https://github.com/BotHarness/DeepSeekBot/issues/1384), [guide](../../../docs/dev/guides/private-input-mcp.md)).

- Documented Owner CLI private-input lifecycle parity using the existing authenticated Host carrier; DSH/Cordis Context and Skill behavior remain unchanged ([#1416](https://github.com/BotHarness/DeepSeekBot/issues/1416), [guide](../../../docs/dev/guides/private-input-cli.md)).

- Recorded actual model-route matching, Request body overrides and Windows probe imports in the [local development guide](../dsh-dev/SKILL.md), verified against pinned RC1 Go requests and passive-probe regressions; DSH/Cordis Context is unchanged ([#1383](https://github.com/BotHarness/DeepSeekBot/issues/1383)).

- Documented post-commit credential response failures and startup-recovery ordering in the [local development guide](../dsh-dev/SKILL.md), verified against the pinned RC1 native Provider and private-account regression tests; DSH/Cordis Context is unchanged ([#1382](https://github.com/BotHarness/DeepSeekBot/issues/1382)).

- Recorded fresh RC1 Profile initialization, native credential-record object ownership and recovery quiescence in the [local development guide](../dsh-dev/SKILL.md), verified with the pinned native Provider and real private-input Host; DSH/Cordis vocabulary and Skill behavior remain unchanged ([#1381](https://github.com/BotHarness/DeepSeekBot/issues/1381)).

- Recorded deferred Node environment reads in browser dependencies, compile-time browser constants and real native-dialog verification in the [local development guide](../dsh-dev/SKILL.md), verified against DSH 0.2.0 RC1 ([#1373](https://github.com/BotHarness/DeepSeekBot/issues/1373)).

- Recorded RC1 native MCP stdio lifecycle, shared Scope module identity, Windows Subprocess argv, and inherited Registry visibility traps in the [local development guide](../dsh-dev/SKILL.md), verified with concurrent native Agent Scopes and real Docker; DSH/Cordis vocabulary and Skill behavior remain unchanged ([#1380](https://github.com/BotHarness/DeepSeekBot/issues/1380)).

- Recorded native Windows cold-install progress starvation from the duplicate localhost development-refresh SSE, explicit refresh opt-in, first-window CDP readiness, and verified mark-of-web/quarantined-binary outcomes in the [local development guide](../dsh-dev/SKILL.md), verified against DSH 0.2.0 RC1 and Chrome 154.0.8037.57 ([#1339](https://github.com/BotHarness/DeepSeekBot/issues/1339)).

- Recorded the isolated RC2 timed-question foreground/continued distinction, native late-answer wire verification, the original application-card incompatibility, and the verified application run-lifecycle trap in the [debugging playbook](../dsh-dev/references/debugging-playbook.md); production RC1, DSH/Cordis Context and Decision Tree remain unchanged ([#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220), [report](../../../docs/research/1220-native-timed-question-experiment.md)).

- Recorded RC1 native Human waits holding the current Agent step, the difference between Inbox acceptance and model processing, and exact-call decision/result verification in the [debugging playbook](../dsh-dev/references/debugging-playbook.md); DSH/Cordis Context and Decision Tree remain unchanged ([#1036](https://github.com/BotHarness/DeepSeekBot/issues/1036), [#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220)).

- Recorded RC1 streaming GET request rejection and the real authenticated Host verification path in the [debugging playbook](../dsh-dev/references/debugging-playbook.md); DSH/Cordis Context and Decision Tree remain unchanged ([#886](https://github.com/BotHarness/DeepSeekBot/issues/886)).

- Recorded proactive real Client console/DOM verification, bounded diagnostics, background-tab limits and exact native root/Session guard reproductions in the [local development guide](../dsh-dev/SKILL.md), verified against DSH 0.2.0 RC1; DSH/Cordis Context and Decision Tree remain unchanged ([#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184)).

- Recorded Windows native Sandbox provisioning rights and the installed ACL diagnostic skill's scoped repair/verification path in the [local development guide](../dsh-dev/SKILL.md), verified with an actual DSH 0.2.0 RC1 native pwsh wait; platform vocabulary and Skill behavior remain unchanged ([#911](https://github.com/BotHarness/BotHarness/issues/911)).

- Recorded terminal EventSource closure after temporary HTTP refusal and application-owned bounded retry/resume cleanup in the [debugging playbook](../dsh-dev/references/debugging-playbook.md), observed with the installed DSH 0.2.0 RC1 Profile; platform vocabulary and authentication ownership remain unchanged ([#1141](https://github.com/BotHarness/DeepSeekBot/issues/1141)).

- Recorded Windows physical AppData paths, isolated Profile package-manager qualification, native Shell result checks and process timestamp guards in the [debugging playbook](../dsh-dev/references/debugging-playbook.md), verified with DSH 0.2.0 RC1; platform vocabulary and Skill behavior remain unchanged ([#1029](https://github.com/BotHarness/BotHarness/issues/1029)).

- Recorded the native Go Session header requirement and the qualified DSH 0.2.0 RC1 adapter patch in the [local development guide](../dsh-dev/SKILL.md), verified with an actual model call and committed DM reply; DSH/Cordis vocabulary and Skill behavior remain unchanged ([#1079](https://github.com/BotHarness/BotHarness/issues/1079), [AX guide](../../../docs/agents/ax-model.md)).

- Linked the application-defined Human Channel media authority and candidate Lark image guide; DSH/Cordis vocabulary, API Gateway ownership and Skill behavior remain unchanged ([#1021](https://github.com/BotHarness/BotHarness/issues/1021), [guide](../../../docs/lark-connection.md), [ADR](../../../docs/adr/0135-human-bridge-media-uses-channel-source-authority.md)).

- Recorded the distinction between edited application role files and frozen instructions in a persisted QA Session in the [local development guide](../dsh-dev/SKILL.md), verified from real DSH 0.2.0 RC1 model events; platform vocabulary and Skill behavior remain unchanged ([#905](https://github.com/BotHarness/BotHarness/issues/905)).

- Updated the downstream Discord verification guide with the real deleted-source classification defect, fresh patched-model source/permission refusals, exact restoration, native App/Bot and wrong-guild boundaries, and development-source mention/reply qualification; DSH vocabulary and Skill behavior are unchanged ([#855](https://github.com/BotHarness/BotHarness/issues/855), [verification](../../../docs/dev/verification/discord-855-mention-reply.md)).

- Linked the downstream illustrated Channel sidebar feature guides, verified with public DeepSeekBot on DSH 0.2.0 RC1; platform vocabulary and Skill behavior remain unchanged ([#893](https://github.com/BotHarness/BotHarness/issues/893), [guide](../../../docs/channel-sidebar/index.md)).

- Linked the downstream illustrated public npm installation, model setup and non-IM settings guides, verified with DSH 0.2.0 RC1; platform vocabulary and Skill runtime behavior remain unchanged ([#887](https://github.com/BotHarness/BotHarness/issues/887), [guide](../../../docs/installation.md)).

- Linked the downstream [npm prerelease operator guide](../../../docs/npm-prerelease.md) for reviewed precompiled Bundle distribution; platform vocabulary and Skill runtime behavior remain unchanged ([#866](https://github.com/BotHarness/BotHarness/issues/866)).

- Recorded native Modal and third-party tour keyboard/focus ownership in the [local development guide](../dsh-dev/SKILL.md), verified with an independently installed DSH 0.2.0 RC1 packaged Client and Driver.js 1.4.0 ([#824](https://github.com/BotHarness/BotHarness/issues/824)).
- Recorded DSH's installation-first Bundle resolution and pnpm 12 artifact override location in the [debugging playbook](../dsh-dev/references/debugging-playbook.md), verified with an independent official DSH 0.2.0 RC1 installation and actual packaged Client inventory ([#823](https://github.com/BotHarness/BotHarness/issues/823)).
- Recorded a duplicate detached Host after a timed-out isolated launch and the resulting operational writer lease refusal in the [local development guide](../dsh-dev/SKILL.md), verified with DSH 0.2.0 RC1 during Assignment capacity QA ([#811](https://github.com/BotHarness/BotHarness/issues/811)).

- Recorded that native Tool approval and actual Shell execution require separate evidence in the [local development guide](../dsh-dev/SKILL.md), preserving a real Orchestrator workspace refusal while verifying a granted Assignment execution on DSH 0.2.0 RC1 ([#751](https://github.com/BotHarness/BotHarness/issues/751)).

- Recorded checked external reply connection ownership separately from reception in the [debugging playbook](../dsh-dev/references/debugging-playbook.md), using the pinned Provider contract and an independently bound responder ([#637](https://github.com/BotHarness/BotHarness/issues/637)).

- Recorded WebServer prefix slash matching and the raw HTTP peer boundary in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH 0.2.0 RC1 source and a real extension pairing/observation flow ([#741](https://github.com/BotHarness/BotHarness/issues/741)).

- Recorded native configForms scope receiver preservation in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH 0.2.0 RC1 settings and persisted Browser Target after Host restart ([#726](https://github.com/BotHarness/BotHarness/issues/726)).

- Recorded directory picker capability differences and native selection fallback in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH 0.2.0 RC1 with a real Inbox Grant flow ([#552](https://github.com/BotHarness/BotHarness/issues/552)).

- Recorded the open-Turn requirement for native approval probes in the [local development guide](../dsh-dev/SKILL.md), verified against pinned DSH 0.2.0 RC1 source and real Browser approval/cancellation turns ([#460](https://github.com/BotHarness/BotHarness/issues/460)).

- Recorded isolated Provider activation order, native Consumer Policy capture and the actual Tool execution boundary in the [local development guide](../dsh-dev/SKILL.md), verified with pinned DSH 0.2.0 RC1 native file and approved Shell calls ([#632](https://github.com/BotHarness/BotHarness/issues/632)).

- Clarified native token projection totals and dispatch-route attribution for failed attempts in the [local development guide](../dsh-dev/SKILL.md), verified against DSH 0.2.0 RC1 with real Assignment and Subagent calls ([#503](https://github.com/BotHarness/BotHarness/issues/503)).

- Documented optional Bundle preservation when restarting an isolated development Profile ([#117](https://github.com/BotHarness/BotHarness/issues/117)).
- Recorded optional provider token buckets and actual Assistant source-route attribution in the [local development guide](../dsh-dev/SKILL.md), preventing missing reports from being treated as zero or estimated consumption ([#499](https://github.com/BotHarness/BotHarness/issues/499)).
- Recorded the distinction between an application-reserved Session ID and a persisted DSH Session in the [local development guide](../dsh-dev/SKILL.md), so pre-execution refusals can be retried after repair ([#500](https://github.com/BotHarness/BotHarness/issues/500)).

- Established an independent bilingual Release Ledger for the DSH Skill ([#102](https://github.com/BotHarness/BotHarness/issues/102)).

## [0.3.4] - 2026-09-20

Focused the installable skill on stable DSH/Cordis language and architectural decisions.

- **Skill version:** `0.3.4`
- **Verified against DSH:** `dsh 0.1.6-alpha.2`
- **Upstream revision:** [`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- Refocused the Context and Decision Tree on stable DSH/Cordis seams while leaving version-specific APIs to current upstream documentation and source ([#26](https://github.com/BotHarness/BotHarness/issues/26)).
