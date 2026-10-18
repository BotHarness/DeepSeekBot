# Messages header and Channel settings — #2042

Real isolated DSH 0.2.0-rc.2 Web Client captures. Baseline: main b8efbd6bcb1d0314aabdf524b8c6b0485fe7f8de. The DM, Group and nickname before/after pairs use the same task-owned fixture, Chinese locale, dark theme and 1440 × 900 viewport. The nickname after image shows the saved value; the before image shows the previous empty editor.

- DM / Group: floating profile chip replaced by header Channel name, Profile icon and rightmost settings icon.
- My nickname: existing Channel-scoped persistence, Enter/blur save and Restore default in the settings sidebar.
- Long name: 1000 × 900 viewport; actual Messages group and header both 483px, Channel name 263px with 572px content, all four action buttons inside the group.
- DM settings use the Bot display name. DM trace preferences remain available in settings.
- Light theme includes an actual official DeepSeek reply, using the machine-local credential without exposing it.

Web checks: nickname readback/reload/reset and Channel isolation, Profile and Back/Escape, composer preservation, files/Inbox/Members, narrow fallback and workspace journey. No native-app qualification. The responsive diagnostic observer reports shell-lost/remounted at the desktop/narrow transition; page/console/window error arrays are empty, and this observation also predates this change.
