# Zoomed Bot-mode panel bounds — #2268 / #2245

Client source: `8ebe0277c8b8190dc1e563277f83c54ee0eaa431`.

The repository's pinned Dockview patch converts viewport rectangles and pointer deltas to local CSS layout units. It is bundled in the Client and does not change DSH, its installed executable, panel persistence or panel DOM parentage during zoom.

The matched 83% screenshots use the same existing isolated macOS DSH 0.2.1-rc.2 window at 1261 × 820 CSS pixels (2522 × 1640 capture pixels), light theme, Chinese locale and fixture data. The controlled before build bypasses only the Dockview patch; after restores the normal build. Hot replacement rounds persisted split sizes by less than one pixel. No desktop restart or guest recreation was used.

- Before: Home protrudes left by about 61 CSS pixels in the controlled comparison (the initial report scene measured about 51 pixels before the splitter test). Its width/height are also scaled a second time.
- After: both content rectangles match their allocated panel rectangles exactly at 83/100/120/144%, level -8 and level +8. Live panel elements, the unsent test draft and A/B/C/D inputs remain intact throughout the zoom matrix. The test draft was cleared afterward.
- Native splitter: 60-pixel pointer movement produces 60-pixel panel movement at 83% and 120%.
- Manual font tokens remain 14/11/13 px. Original guest identity is retained, native guest zoom stays 1, and its test input remains intact.
- Dependency browser regression: all 17 supported levels, three nested panels and both splitter axes pass (25 cases). Both exported package entry points have 10 focused geometry tests. The focused affected suite passes 79 tests.

## Proof limits

One ordinary foreground restoration of the existing guest painted at unchanged native window geometry with the same identity/input. This does not explain or eliminate intermittent blankness. Hidden guest creation, repeated recovery and actual process restart remain open. No reload/recreation/fullscreen workaround was added.

This run's plus automation uses Shift+Equal. The prior physical plain Cmd+= / Cmd+- matrix contains eight corresponding native events and eight state changes across four focus contexts on Client source `aeb70b4`; it is historical input-routing proof, not a fresh physical-key check of this build.

Native narrow-window layouts, other panel combinations, full IME/recording/custom binding coverage, wider packaging and Windows/Linux remain explicit boundaries. The previously saved HTTP CLI endpoint was unreachable this run, so previous live CLI success is not claimed as current. S1 and its dependent slices remain open; PR #2273 remains Draft and unmerged.

Run `node scripts/e2e-dock-zoom.mjs` for the browser regression. For native review, reuse the existing S1 window, compare each panel content rectangle with its group's content allocation, and drag the splitter at a non-default level. Record actual pixels and preserve guest/input identity.
