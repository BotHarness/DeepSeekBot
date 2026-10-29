# T5 image wallpaper verification

Web: Chromium 1440×1000, with 1000×1100 and 1800×850 resize checks. Before runs T4 `38d099ba234e90ff7d1a739526a22cb6d2a060a1`; after runs this PR. Task-only generated PNG wallpaper, no private media. `scripts/e2e-image-wallpaper.mjs` verifies original bytes, UI crop/cancel/recrop, deletion of source followed by refresh, mode independence, simulated quota and corrupt-file preservation, multi-chunk live CLI import/crop/remove, and native DSH absence. No page errors.

Native: official macOS DSH 0.2.1-rc.2, `dsh-app://app/`, 2560×1640 captures, private application user data. Actual image upload and recrop; exact original bytes/crop restored after restarting the same application directory into a different isolated linked Host Profile. Web starts independently. This is not an interactive Host switch test. PNG is the format actually exercised on both runtimes; other codecs, Windows native and Human QA remain unqualified here.

Focused source coverage: 59 tests across 9 files, repository lint, root/mobile typecheck, formatting and build passed. CI is reported separately on the PR. Failed first attempts were retained privately: invented Web button name, a missing catch for synchronous IDB quota errors (fixed), and a mismatched native locale label (driver fixed).

Only these screenshots and bounded proof JSON are public. Local login URLs, media byte arrays, browser profiles, Host paths and credentials remain private. No PR was merged or deployed.
