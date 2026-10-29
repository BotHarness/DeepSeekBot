# T4 nested appearance evidence

Base: T3 `07b9cea069c08a00d08d4c201cc10699e76be33b`. Web captures: 1440 × 1000, English, isolated task Profile and synthetic Memory content. Native captures: official macOS Desktop 0.2.1-rc.2, Chinese, separate task application directory and Host.

Before/after pairs cover the prior nested Header entry point, parent/child paint, all three Memory detail views and Browser/Computer outer surfaces. Independent contribution screenshots use the real test-only native Bundle in `scripts/fixtures/appearance-panel`, loaded through the Profile. Its content draft survives appearance writes; unregister/re-register retains saved functional appearance.

Browser proof uses an actual loopback fixture page through the Browser Provider. Media opacity/filter remain unchanged; a sampled rendered pixel is identical before/after changing the outer body opacity. Whole-frame hash was intentionally not used after an earlier attempt observed frame variation. This sample is bounded pixel evidence, not a comparison of every remote pixel.

Computer evidence covers the actual local-provider Header, body and permissions UI on Web/macOS. The current local provider intentionally has no inline desktop viewer. A task-local start/status/stop succeeded; a container desktop viewer was not run because the Docker daemon probe did not respond within 60 seconds. No Docker daemon restart or unrelated container operation was attempted. Remote desktop pixel validation remains a Human/runtime gate; shared viewer code is not changed.

47 focused tests, lint, format, root/mobile types and build passed. Web UI/CLI, Bot switch, reload, parent reset, shared detail identity and plugin re-registration passed. Native menus, three Memory views, real Browser, plugin re-registration and same-directory restart/scoped reset passed. Human QA, Windows and container desktop pixel checks remain unverified. No merge or deployment.

Failed attempts are retained privately: initial expected palette value, reload waiting on network idleness while polling panels were open, Browser Access refresh, whole-frame screenshot variability, an incorrect local Computer iframe assumption, and a native verification script that changed the revision before comparing restart state. The corrected restart check saves state before shutdown and reads before any write.
