# Five-persona real-browser QA — #2316

Runtime under test after the QA fixes: `3dbbba7073e1565e289c80ffcf6414bc696d3333`.
Baseline runtime: `35d2838bb100ef2757e90f74371ea43b21e58ff4` (`c47d58fef` added evidence only).
All tests use the real machine-local model credential, synthetic Bots and harmless output commands. Credentials and private entry URLs are excluded. Exactly one isolated Host on port 7093 and one localhost test page run at a time. Persona browser turns run serially. Mobile, skeptic and breaker agents drive their own final turns. After the runtime removed DevTools from the impatient and literal agents, the root agent drives those final journeys and the corresponding persona agents independently review their evidence. The personas are adapted to this local approval slice: this Host has no pricing or signup journey, so production signup/legal checkout is not claimed.

## Baseline journeys

| Persona        | Browser                                 | Actual outcome                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impatient      | Local Edge                              | Home creation via Allow once; native pwsh marker succeeds.                                                                                                                                                                                           |
| Literal reader | Local Edge                              | One-click Always allow; same pwsh with changed input executes without another request.                                                                                                                                                               |
| Skeptic        | Edge → authorized Chrome DevTools       | Read Preview notice and Full Access description; ordinary once succeeds; Full Access ordinary call needs no card; permission-management call requires Human and is rejected. Journey resumed after Edge debugger detached, not an uninterrupted run. |
| Breaker        | Chrome DevTools                         | Empty draft disabled; harmless junk stays literal; back/forward retains pending request; Offline submit shows unavailable; online recheck creates no decision; actual double-click produces one decision and one execution.                          |
| Mobile         | Chrome DevTools, 375×667,actual Slow 3G | UI Bot creation, native pwsh approval and real output all succeed; layout faults below observed.                                                                                                                                                     |

## Findings ranked by observed incidence

| Finding                                                            | Users who actually encountered it | Action                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passive companion covers latest approval/reply                     | Skeptic + mobile (2/5)            | Reserve 112px reading space while companions are visible; preserve history position and activity inset. A first rerun found the status strip also overlapped; 3dbbba707 extends the existing composer avoidance by its measured visible status height. |
| Create-Bot dialog clips heading/footer at 375px                    | Mobile (1/5)                      | Enable existing internal form scrolling; keep title and actions within viewport.                                                                                                                                                                       |
| Slow 3G cold start                                                 | Mobile (1/5)                      | Measured, not presented as a speed improvement: first contentful paint 30.8s; load 146.3s. Two plugin responses total 6.35MB.                                                                                                                          |
| Automatic companion approval popup overlaps ordinary creation card | Breaker (1/5)                     | Non-blocking observation: actual correct click completed creation. No claim that passive-avatar fix redesigns expanded bubbles.                                                                                                                        |

The older onboarding label mismatch was found in the earlier parent run, not by five independent users. It was fixed in 35d; current baseline journeys confirm Allow once matches the guide.

## Evidence reading rules

- `before/` contains actual baseline screenshots and sanitized native readback, not mocked screens.
- Native DSH trace may say `allowed-once` for a call handled by a persistent BotHarness rule. Canonical Channel decision `allowed-always-tool`, one stored current-tool rule, and absence of a second request prove persistence.
- A successful decision response is not execution proof: native output is separately retained.
- Offline console failures are intentional injection. Literal-reader logs also contain extension errors. Skeptic had one appearance-control 404 without a captured response body; its cause is not established. Mobile baseline had no console errors/warnings.
- Mobile is browser device emulation, not physical-phone/native-app or software-keyboard coverage. Its post-fix throttled journey is warm-loaded; baseline cold timing remains separate.
- No Submitting screenshot is claimed when capture completed after settlement. The transient busy label was seen in a tool accessibility response and has component regression coverage.

## Final regression results

| Persona        | Final result on 3dbbba707                                                                            | Native evidence                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Impatient      | New Bot from Home; Allow once; visible success in dark and light                                     | 1 pwsh success, 1 request/decision, 0 rules                                    |
| Literal reader | One click Always allow; changed input succeeds without another card                                  | 2 pwsh successes (A/B), 1 request/decision, 1 current-tool rule                |
| Skeptic        | Full Access ordinary call succeeds; recognized permission-management call still asks and is rejected | New ordinary success without approval; new management denied/rejected; 0 rules |
| Breaker        | Back/forward, actual Offline, read-only recheck, actual double-click                                 | 0 decisions after Offline and recheck; then 1 success/decision, 0 rules        |
| Mobile         | 375px dialog and reading/status clearance; actual Slow 3G after app load                             | Final marker success, 1 new request/decision, 0 rules                          |

The final browser contexts are fresh, while the single Host/Profile is preserved. Impatient, literal and breaker use new synthetic Bots; skeptic and mobile reuse their test Bots. The first-time baseline and the final regressions are separate runs, not five fresh Profile claims. The impatient first-step guide image is from the 35d baseline: the preserved Profile has already progressed to step 2/5.

Mobile pending geometry: card bottom 393px, avatar top/bottom 425/521px, visible execution status top 525px. The final desktop skeptic reply ends at 875.5px and avatar begins at 896px while scrolled to the latest message. The skeptic pending-card screenshot proves the Human-only actions, but was 100px above the latest scroll position and is not used as geometry proof.

All seven target native calls in the final journeys are corroborated by sanitized Host readback: six successful output calls and one intentionally rejected management call. Bot-creation calls are separate setup actions. The JSON proofs contain actual native outcomes; model prose alone is not execution evidence.

## Automation observations and limits

- Browser tool reconnections and stale accessibility handles occurred. The impatient driver used a fresh snapshot after a loading handle became non-interactable; the failed attempt sent no message. Skeptic re-read the current Reject control after a stale handle; it submitted one rejection.
- Breaker tooling rejected stale create/recheck handles; fresh snapshots and current visible controls resolved them. No alternate hidden-state control path was used. The final double-click is a real DevTools double-click, corroborated by one Host decision.
- Final impatient, literal, skeptic and mobile captures had no console errors/warnings. Breaker retained the deliberate Offline failures and reconnect warning. Mobile also records a form-field id/name issue; these facts are not merged into a false all-console-clean claim.
- Automatic expanded companion bubbles remain a non-blocking usability observation. A final breaker reply bubble had a visible close control and partially overlapped another card; Allow once remained accessible and no misclick occurred. This is outside the passive-avatar spacing fix.
- Slow 3G cold start still takes about 146.3s in the measured baseline. Two plugin responses total 6.35MB; their owners were not established. The final warm-app throttle run proves functional completion, not faster cold loading.

## Validation and delivery

92 focused client tests, lint, format, typecheck and build passed for the final source. [Source CI](https://github.com/BotHarness/DeepSeekBot/actions/runs/39326960349) has all 10 required jobs green. The optional real-model workflow is skipped in CI; the real-key model evidence here was collected locally. Final evidence-only head checks are linked from the PR handoff after upload.

PR remains draft and unmerged for Human acceptance. Only one task Host listens on port 7093; old task ports are closed. Browser test tabs are closed after each turn. No production signup, physical phone/native app, or full permission-recovery matrix is claimed.
