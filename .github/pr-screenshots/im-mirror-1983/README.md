# IM mirror settings evidence

Captured 2026-10-16 through the real isolated DSH 0.2.0-rc.2 Web Client. Viewport 1440 × 900; locale zh; light theme except `forward-help-dark.png`.

- `before.png`: base `d8de3483012db075579d10b07ba6a97d8f9c08f2`, same connector edit dialog, no mirror controls.
- `after.png`: both new preferences default off.
- `mirror-help.png`: click the mirror info button; switch values stay unchanged.
- `forward-help-dark.png`: forwarding help, reopened by keyboard after Escape.
- `saved-both-on.png`: enable both, save, reopen.
- `restart-independent.png`: CLI disables forwarding only; after Host restart, mirror remains on and forwarding remains off.

The account and owner are task-local simulated Provider fixtures. These images prove UI behavior and settings persistence, not real WeChat delivery. All captured journeys reported zero browser console issues. Profile credentials and login URLs are excluded. Real WeChat and Human QA remain required before merge.
