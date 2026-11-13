# Team mode: one Host, many Host Members

Accepted target design, confirmed by the Human on 2026-11-13 after Q1–Q35; not a description of shipped behavior or completed acceptance. Normative decisions live in [ADR-0336](../adr/0336-hosts-have-members.md). Orthogonal to the [Environment panel design](environment-panel.md) (one Human, many Hosts). [中文](team-mode.zh.md).

## Why

A Tobs Host — an office computer or a VPS — can be used remotely by colleagues, each as an independent Host Member. Members keep private Bots, collaborate with other Humans and Bots in public Channels, and let shared Bots accumulate team context. Small teams get basic IM (messages and files) plus Bots as colleagues on hardware they control; one Host can isolate permissions and share AI compute and knowledge.

## Decision log

| # | Decision |
| --- | --- |
| Q1 | Data model is always multi-member; `local-human` is the Host Owner. Team mode is a policy switch. |
| Q2 | The Host is the identity authority: local username/password, no Better Auth session layer, no Connect dependency. |
| Q3 | Device grant = (device, Host, Human ID); one active identity per Host per Client; a member may sign in from phone and computer. |
| Q4 | Owner can view private content; every access is audited and members are told. |
| Q5 | Owner is unique; other members hold roles from a fixed permission catalog (union); built-in Admin and Member. |
| Q6 | Bots have an owner and visibility; a shared Bot has one Memory, disclosed when sharing. |
| Q7 | Each member has their own private Tob acting with that member's authority. |
| Q8 | Separate spec and hub, parallel to Environment E1–E11; relationships stay Owner-scoped. |
| Q9 | First delivery is permission isolation, not OS isolation. |
| Q10, Q20 | Role Policy reuses Behavior permission items (Allow/Deny, Deny wins); advisory, not access control; "ask" deferred. |
| Q11, Q21 | Bot visibility `private`/`roles`/`shared`; Channel visibility `public`/`roles`/`private` with Feishu-style Channel admin settings; audience containment. |
| Q12 | Identity and credentials separate; OIDC later; no cross-Host directory sync. |
| Q13, Q22, Q23 | Local Desktop/loopback/CLI act as Owner (optional password); LAN browsers sign in without installing anything; Gateway denies DSH-native methods to members; password sign-in needs HTTPS or the encrypted gateway. |
| Q14 | Disabling Team mode suspends members and keeps data. |
| Q15, Q16 | Invitation link/QR with fingerprint, out-of-band initial password, forced change; argon2id, rate limits, admin reset revokes all grants. |
| Q17 | Channel types stay `dm` and `group`; add Human–Human DM. |
| Q18, Q24 | Approval cards stay in place, masked for non-approvers; fallback to Bot owner's Activity. |
| Q19 | Activity, read state and push per Human ID; Source Events carry the speaking Human. |
| Q25, Q30 | Personal and shared Workspace roots; refuse grants into other members' roots, Memory repositories and the Host data directory; opaque approval Owner/Admin, dangerous preset Owner-only. |
| Q26 | Bot–Bot DMs readable by participating Bots' owners and audited viewers. |
| Q27 | Member default: private Bots, Channels, Human DMs, configured models. Admin: all but private-content viewing and ownership transfer. |
| Q28 | Usage attributed per Human and Bot; role model allowlists; no quotas. |
| Q29 | Offboarding: deactivate → transfer → separately confirmed purge. |
| Q31, Q32 | Shared Bot management by owner or all-Bots managers; external IM binding needs ownership plus permission; external people never become members. |
| Q33 | CLI groups `members`, `roles`, `devices --member`, Channel visibility/admin, `audit`, `team-mode`; local `--as <member>`. |
| Q34 | Terms Host Member, Host Owner, Team mode. |
| Q35 | Slices M0–M11 below. |

## OS sandbox (future)

Considered after Q30. A per-execution sandbox (Linux Landlock/bubblewrap + seccomp, macOS Seatbelt, Windows AppContainer) whose filesystem allowlist equals the Grant plus Memory fits DSH's Execution World Provider seam and also benefits single-Human Hosts. Costs: three platform implementations, tools that need paths outside the allowlist (package caches, git and SSH config), a network policy to prevent exfiltration, harder failure diagnosis, and no protection against Host-process bugs. Per-member OS users (root, ACL drift) and per-member containers (heavy, lose local apps and GPU) were rejected. Out of scope; a separate specification if pursued.

## Delivery

| Slice | Behavior | Blocked by |
| --- | --- | --- |
| M0 | Explicit Human context through Host methods; remove hard-coded `local-human`; no behavior change | — |
| M1 | Enable Team mode → Owner password → create member → LAN HTTPS sign-in → Tobs-only Client → join public Channel and exchange messages; CLI | M0 |
| M2 | Private Bots, per-member Tob, per-member Activity and push | M1 |
| M3 | Roles, permission catalog, member and device management | M1 |
| M4 | Channel visibility, Channel admin settings, Human–Human DM | M3 |
| M5 | Approval masking and routing, opaque-tool permission | M2, M3 |
| M6 | Workspace roots, audience containment, grant refusals | M3 |
| M7 | Bot visibility (shared/roles) and Role Policy | M4, M6 |
| M8 | Mobile invitation, sign-in and self-pairing | M1 |
| M9 | Password lifecycle, disabling Team mode, offboarding | M3 |
| M10 | Usage per member, model allowlists | M3 |
| M11 | Private-content access audit and member notice | M3 |

Seek Human feedback after M1 before expanding.
