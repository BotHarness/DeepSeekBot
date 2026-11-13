# ADR-0332: Report window capture is owned by the Desktop shell

Status: implemented and verified in a local composed Windows Desktop candidate; upstream Desktop release pending.

## Context

Report screenshots currently rasterize the application DOM on Desktop. A Windows investigation observed over 22 seconds of busy state. The Client cannot call Electron and the Host runs in a separate Node process. Native capture must be supplied by the Desktop owner rather than a Host screenshot service or debugging connection.

## Decision

Extend the existing Desktop preload capability seam with an optional no-argument `captureWindow()` operation. This is an application-defined proposal carried as an upstream source patch, not a promise about released DSH APIs. The Desktop main process validates the current application owner and top frame, captures only that visible window's viewport, and returns bounded PNG bytes. It accepts no window selector, screen selector, URL or file path. No Host route, Bot tool, credential, screenshot store or OS screen-sharing session is introduced.

The Client selects this capability when present under protocol 1. The existing report owns toolbar visibility, markup, attachment selection and transient bytes. Native refusal or timeout remains an error; it does not start DOM rasterization. Older Desktop releases keep their existing page capture behavior, and browsers retain their current capture provider.

Capture has a bounded response deadline. A timed-out native job retains its concurrency lease until Chromium settles; navigation, owner change, disposal or stopping the Client session invalidates late pixels. Returned images stay transient until explicitly added to the existing report attachment workflow.

## Consequences

Updating Tobs alone cannot enable native capture in older Desktop releases. Ship and qualify a composed Desktop candidate before claiming the delay is fixed. In particular, measure click-to-visible-markup against the below-one-second target, inspect high-DPI and guest-content pixels, and preserve the existing screenshot/report interactions. A source patch and unit tests are preparatory work, not a completed runtime slice.

See [integration and remaining native acceptance](../research/2026-11-13-native-report-capture.md).
