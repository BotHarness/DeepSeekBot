# Batch43: native glass creation panel

Runtime source: `06b8fadedf6b66379ee39ed01751f562e10b6714` (same batch branch commit).
[Exact-source CI passed](https://github.com/BotHarness/DeepSeekBot/actions/runs/39162302354).
Evidence and architecture documentation were committed afterward; they do not change runtime source.
Shared-queue iOS 26 Simulator, 402 × 874 points, installed native build `494a20f1e`, Expo UI 58.0.20. JavaScript-only session; no build or install. English, synthetic UAT Computer fixtures. No production activity.

## Observed passes

- Native rounded-rectangle glass creation menu and target chooser at default light/dark appearance; actual New Channel row → target chooser → Back → Close.
- Live light → dark → light with menu/chooser open retained the current page and corrected foreground/material without restarting the app.
- Maximum system Dynamic Type: light/dark glass panel, wrapping left-aligned icon/text rows and reachable close action. Single-line, bounded environment tabs retain the Computer icon and trailing ellipsis.
- Computer scope displays exactly New Channel and New PersonaBot. All displays those plus Join with invitation.
- Actual Chats → Activity → Chats navigation. Outside tap dismissed the menu on a bounded retry, without triggering a background action.

`panel-live-theme.mp4` is the original unedited 32.44-second native recording of menu appearance changes, target chooser, Back and Close. Screenshots and sampled video frames were reviewed locally for private data before publishing.

Matched before images are in ../batch41 at source `b46dfdb6c`: same viewport, locale, synthetic content and long Computer alias. `final-default-dark-menu.png` and `final-computer-menu.png` show the former opaque menu; the corresponding Batch43 images show native glass.

## Limits and first failure

The first outside-coordinate attempt left the menu open. Its screenshot and the subsequent failed attempt to press the hidden plus button remain in private evidence; they are not counted as passing. A fresh screenshot-grounded outside tap closed the menu. No live source edits or simulated UI callbacks were used.

Maximum-font navigation labels still wrap within words (Chats), as the screenshots show; this is not a claim of polished single-line navigation at maximum text size. Nested native AX button nodes remain; VoiceOver/focus behavior is unverified. Actual Reduce Transparency enable/disable remains unverified after the prior batch's Settings driver failure; original/final native readback was false and unchanged in this batch. Source tests cover its opaque fallback. Android, physical iPhone, Human acceptance, animation frame rate and a new authenticated Cloud creation flow were not run here. Earlier Cloud-flow proof remains bound to its earlier source.

## Restoration

Only one new task-owned Computer pairing and local alias were used. Exact new device revoked; all original Host channels/device statuses preserved. Original cloud vault and saved Hosts restored; stopped app Documents and Preferences were byte-identical to backup. Original light appearance, standard text size, locale and Reduce Transparency restored/unchanged. Clipboard untouched. Only this run's driver and Metro stopped; shared checkout restored to its original branch/commit with the three pre-existing untracked documents intact. Shared lane explicitly released. No WorkOS, Cloud resources, messages, models, Host restart, production changes or merge.
