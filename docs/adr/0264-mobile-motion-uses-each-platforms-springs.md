---
Status: Accepted
Date: 2026-10-27
---

# Mobile motion uses each platform's springs

The mobile app keeps one set of motion roles and gives each platform its own values. A role is a property kind and a speed: **spatial** springs move position, size and scale; **effects** springs change opacity and colour and never overshoot; each comes in `fast`, `default` and `slow`. A released drag uses **release**, the spatial default made critically damped so the surface never bounces past the finger.

- **iOS** takes SwiftUI's springs: `.smooth` (no bounce) by default and `.snappy` (bounce 0.15) for small feedback such as a bubble or a badge appearing. It never uses `.bouncy`.
- **Android** takes the Compose Material 3 Expressive `MotionScheme` springs (`ExpressiveMotionTokens`): spatial damping 0.6 / 0.8 / 0.8 with stiffness 800 / 380 / 200, effects damping 1 with stiffness 3800 / 1600 / 800.

The tables live in `apps/mobile/src/ui/design/tokens.ts` (`springs`), resolved per platform by `src/ui/design/motion.ts` and `motion.android.ts`. Every spring follows the system Reduce Motion setting.

Animations whose length is set by what they show stay time-driven: the streaming text reveal, the Local Computer click ripple, the long-press lift that tracks the long-press delay, and the image viewer's fling-away. Where they ease, they use the platform's decelerate curve (UIKit ease-out, M3 emphasized decelerate). Screen transitions, sheets and menus stay with the system.

## Why

The app already uses each platform's own controls (`DESIGN.md` → Native first). Its motion did not: both platforms shared one ease-out curve and fixed durations, so Android did not move like Material 3 and iOS did not move like SwiftUI. Springs are also interruptible and carry gesture velocity, which fixed curves do not.

Emil Kowalski's animation skills still decide whether something animates, what it animates and how it degrades. The platform decides the curve.

## Consequences

- Duration tokens for the migrated animations are gone (`motion.bubble`, `badge`, `menu`, `composer`, `easeOut`, `drawerSpring`, `profileShell.openDuration`/`tabFade`, `scrollChrome.duration`). New motion picks a role from `spring`.
- Layout animations use `springy(Builder.springify(), spring.…)`.
- Feel is judged on native devices, not the web preview.
