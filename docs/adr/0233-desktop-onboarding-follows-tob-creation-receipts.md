# ADR-0233: Desktop onboarding follows Tob creation receipts

Status: Accepted for the first Desktop slice of #2192; mobile Web remains separate.

## Context

The seven-item tutorial and generated welcome letters predate the protected Tob identity and panel workspace. A successful model reply does not prove a Bot or group was created.

## Decision

Supersede the checklist/tutorial presentation of ADR-0180, ADR-0147 and ADR-0155 with five steps: configure a model, ask Tob to create a Bot, ask it to create a group with that Bot, learn panel controls, then actually click the Home title to close it and enter the existing Tob DM. Reuse Home, the shared composer, existing approvals and driver.js. Suggestions only fill a draft; no step submits text or approves changes.

Generation 102 extends the existing Profile onboarding receipt with a journey version, start time, result references and lifecycle completion. The trusted scoped Shell adapter records operation correlation before executing an already approved creation. The onboarding owner reconciles committed Bot and Channel operation receipts on refresh; model prose, rejected/reserved operations and older entities cannot advance the guide. A group result waits for actual membership; later acceptance is reconciled. Removed unfinished targets can be replaced, while historical receipts remain intact. No creation is re-executed by onboarding.

The Host owns shared creation progress and tutorial lifecycle. Layout-tip completion is a device-local presentation fact keyed by Profile; replay never changes Dock geometry, shortcut overrides or resource identity. Global controls reopen global panels and Messages header controls reopen Channel subpanels.

Legacy completed/skipped receipts remain settled. Other legacy statuses become paused until deliberately reopened. Client clears obsolete tour-return flags without discarding drafts or changing the selected Channel. Stop writing default welcome messages for new ordinary Bots and Tob; preserve existing timeline records and legacy rendering.

Expose lifecycle read/write through `deepseekbot onboarding [--action ...]`, with the same authenticated Host checks as the Client. This is Human administration, not another Tob management capability.

## Consequences

The schema upgrade is additive but older binaries cannot reopen the upgraded database under the existing generation fence. Back up before upgrade. There is no forced layout migration. Native Desktop qualification and source tests remain distinct; narrow Web navigation and real-phone qualification are outside this slice.

The fifth step requires the Human to click Home's actual title control. Finishing the layout tips only records a device-local presentation fact; it does not finish onboarding. The title action closes Home using the existing layout owner, reveals Messages and opens the same Tob DM, then settles tutorial lifecycle. Rail toggles, programmatic closure and reading the tips alone do not complete this action. Unsent Home drafts are preserved. _Amended by [ADR-0259](0259-desktop-layout-has-simple-and-advanced-modes.md): step 4 first asks for a Layout mode, and in Simple mode step 5 is a real rail selection of Messages instead of the Home title._
