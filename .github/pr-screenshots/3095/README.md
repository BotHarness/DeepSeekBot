# Bot creation pages — Android verification

Issue: [#3095](https://github.com/BotHarness/DeepSeekBot/issues/3095).
Runtime source: `5343d050f`; base: `b21e11b313` (avatar PR #3085, above native event PR #3082).

## Scope and source

Blank creation now uses Environment → Name and avatar → Persona and behavior → Bio and tags.
The header, portrait and progress remain in the existing Android creation shell.
Git, Zip and Marketplace keep the imported persona; their profile details have a separate step.
Only the persona is submitted as persona instructions. Bio and roles remain the existing metadata fields.
They can still be read by other Bots in contact/profile queries.

Physical Android phone, model 24069PC21G, Android 16, arm64, 1220 × 2712, Chinese locale.
Images are actual native captures with the 124 px system status bar cropped; no UI was composited.
All content is a synthetic QA fixture on an isolated Host.

| Images                             | Integration source | Meaning                                                                            |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `bi`, `bl`, `bd`                   | `fd0eb153f7f2`     | Before: identity and combined persona/profile form                                 |
| `ai`, `pl`, `pd`                   | `0b7ebcc95857`     | After: identity and isolated persona, before the keyboard-action-only follow-up    |
| `dl`, `dd`, `tk`, `fl`, `fd`, `m*` | `16a2d66a016b`     | Final source: separate profile step, native InputChip and continued keyboard entry |

The baseline is main `06c5acd49` plus the existing avatar/native-event stack and unchanged keyboard PR #3050 (`f17232f458`).
The final integration adds this PR. No conflicts were resolved inside the QA integration.
Native inputs are unchanged from the matching Debug binary's source `94797941062a`.
Debug APK SHA-256: `82fa4366ad2584ceaf4636d951fb20817ec3c7baacf7f3db0d8fb03d8b37887e`.

## Verified

- Persona and profile fields are on separate native pages. Identity only contains name and avatar.
- Enter adds a native M3 InputChip, clears the entry and keeps the keyboard shown.
- Empty Enter adds nothing. Removing a chip retains pending text. Back retains persona and profile data.
- Chinese IME composition is committed before submitting the tag; an IME composition-confirm key is not treated as tag submission.
- Phone code tests: 318 files passed, 9 skipped; 2,392 tests passed, 11 skipped. The final keyboard action was then checked with all 7 adapter tests.
- Root lint, formatting, typecheck and build passed.

All six font/theme cases passed with a real keyboard, an actual persona edit, tag submission and reachable bottom actions.
Each persona edit was also checked against its captured native text, not just a key-event return value.

| System font | Theme | Persona with keyboard  | Tags after Enter, keyboard retained |
| ----------- | ----- | ---------------------- | ----------------------------------- |
| 1.0         | Light | [Capture](m10-l-p.png) | [Capture](m10-l-d.png)              |
| 1.0         | Dark  | [Capture](m10-d-p.png) | [Capture](m10-d-d.png)              |
| 1.3         | Light | [Capture](m13-l-p.png) | [Capture](m13-l-d.png)              |
| 1.3         | Dark  | [Capture](m13-d-p.png) | [Capture](m13-d-d.png)              |
| 2.0         | Light | [Capture](m20-l-p.png) | [Capture](m20-l-d.png)              |
| 2.0         | Dark  | [Capture](m20-d-p.png) | [Capture](m20-d-d.png)              |

## Final Release creation

Development application ID, arm64 Release, integration source `16a2d66a016b366c5e9bc363abd4d4cc08a9839d`.
APK SHA-256: `8953cfe0d52f66e67fdf2aa24da1c8960cdc27377686c59a7ea5abe45ca4bddb`.
The APK and build manifest are retained locally with the private QA record.

- Cold-started the Release APK with the saved draft. [Persona](rp.png) and [profile details](rd.png) matched that draft.
- Created exactly one Bot through the native form and reached [its empty DM](rc.png). No model message was sent.
- Read the canonical Bot with the existing CLI: description and roles matched the profile fields, including the pending tag that had not received Enter.
- Read that Bot's canonical `SOUL.md`: it contained the exact persona; bio/tag markers were absent.
- Deleted only that identified QA fixture through its canonical confirmation flow. The retained deleted record is a tombstone; no active QA Bots remain.
- Revoked and removed only the QA device/pairing; restored the exact original raw draft, five pairings and interface preferences.
- Reinstalled the original accepted APK and verified its hash, font, original input method and saved settings. Its native drawer showed the exact original five pairings.
- Stopped the owned Host and Metro, removed only the two owned reverse mappings and temporary credentials, and released the device lease. The shared ADB service was unchanged.

The first follow-up Release build hit a shared Metro file-cache race while Debug Metro was active.
Stopping the owned Metro and rebuilding sequentially succeeded; the successful final APK above is the one tested.

## Review limits

This is Android evidence. iOS native verification belongs to the other engineer and is pending here.
Native UI checks and Debug captures do not establish an FPS or hitch budget.
The integration includes the separate keyboard performance PR; this PR does not claim a new performance improvement.
Full Git/Zip/Marketplace network imports are not re-run in this UI slice; source preservation and step order are covered by focused tests.
Human UX acceptance remains required. The PR remains draft until that review.

## Matched views

| State           | Before                  | After                  |
| --------------- | ----------------------- | ---------------------- |
| Identity, light | [Before](bi.png)        | [After](ai.png)        |
| Persona, light  | [Combined page](bl.png) | [Persona only](pl.png) |
| Persona, dark   | [Combined page](bd.png) | [Persona only](pd.png) |
| Profile, light  | [Combined page](bl.png) | [Bio and tags](dl.png) |
| Profile, dark   | [Combined page](bd.png) | [Bio and tags](dd.png) |

Additional final states: [Enter with keyboard](tk.png), [filled profile light](fl.png), [filled profile dark](fd.png).
