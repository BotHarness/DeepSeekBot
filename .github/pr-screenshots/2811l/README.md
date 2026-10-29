# Feedback stays local — UI evidence

Candidate UI source: `6a6b0b69213bf60151665fbc01667bf5f7fb44e7`, captured 2026-10-26 (Asia/Tokyo).
English, light appearance, default browser text scale. All conversation and feedback text is synthetic.

- `desktop.png`, `desktop-ok.png`: real DSH Web Client, 1440 × 1100. Submission acknowledged by existing PostHog ingest. Download remains available after receipt.
- `mobile.png`, `mobile-ok.png`: **Expo Web layout preview**, 390 × 844 CSS pixels at 2× scale. Real paired Host; successful feedback receipt and post-submit download control. No native controls were substituted in the app runtime.
- Before: existing captures in `../2811/` (desktop, published in commit `d9e80fbaa1d9dfd27f22ca1ba77e2a713ac996e5`) and `../2811m/` (Expo Web, published in `c1034613edcc1e43120e099f126231bb43bb6a21`). These are retained baseline captures from the preceding merged PRs, with matching viewport/theme/locale and synthetic fixture.

No screenshots establish native system save/share. iOS and Android physical-device checks and Human acceptance remain pending under #2811: open feedback from a saved message, submit synthetic feedback, download after the receipt, save/share the ZIP, and verify its contents. The current Windows run uses the requested Expo Web lane and has no native device lease.
