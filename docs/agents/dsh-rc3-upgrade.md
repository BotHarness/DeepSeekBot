# DeepSeek Harness 0.2.1-rc.3 development upgrade

Tracking: [#2713](https://github.com/BotHarness/DeepSeekBot/issues/2713).

## Upstream scope

Reviewed [rc.2 → rc.3](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3), ending at `1f81c047fc48fa190a683e469daa699857e9afe8`. The changes add region-owned navigation menus, preserve new-Session drafts, and share official model-list discovery between account and API-key routes. The API-key route can now fetch `/models`; saved custom catalogs still override discovery. Do not overwrite a Human's model catalog to enable discovery.

## Local development

Use the worktree's pinned CLI and SDK, install its lockfile, build, then launch a **fresh isolated Profile** through `scripts/dev-instance.mjs` or `scripts/verify-app.mjs`. The helper refuses a Profile created with another CLI version. Do not switch a running Host's dependency directory or migrate another task's Profile. Shared credentials stay machine-local.

The file-tool `read_image` patch and OpenCode Go Session-header patch retain their reviewed implementation, re-keyed to rc.3. The Go launcher still checks the installed model catalog and requires real reply verification.

## Independent compatibility facts

| Fact                             | This change                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Development CLI and SDK          | 0.2.1-rc.3                                                                            |
| Product admission range          | Unchanged: `>=0.2.0-rc.2 <0.3.0-0`                                                    |
| Fresh-Profile release matrix     | 0.2.0-rc.2, 0.2.1-rc.2, 0.2.1-rc.3                                                    |
| Desktop zoom copy                | Keep rc.2 build input and exact runtime refusal; rc.3 native zoom remains unqualified |
| Immutable IM Provider            | Preserve source revision, content digest and original DSH build provenance            |
| Optional source IM qualification | Its existing rc.2-only launcher remains a separate qualification path                 |
| Public stable install identity   | Unchanged; this is not a product release                                              |

The rc.3 native theme client and Host bytes match the existing rc.2 SHA-256 guards. This is source evidence only. The separately pinned rc.2 theme dependency builds the opt-in zoom copy; ordinary rc.3 Profiles use the Host's native theme. Disable an installed zoom override before changing outside its qualified runtime, as described in the existing zoom guide. Never widen the runtime lease or installer guard solely because hashes match.

## Verification scope

Record build, automated checks, isolated Host, browser, model reply and restart persistence separately in the issue/PR. Browser success does not qualify macOS/Windows Desktop, physical mobile devices, external IM delivery, published tarballs, or every version admitted by SemVer. Preserve failed driver attempts and their observations. Stop the owned Host and children and verify port release before removing a disposable Profile.
