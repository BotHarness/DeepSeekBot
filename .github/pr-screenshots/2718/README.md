# S2 panel lessons: Web evidence

Captured 2026-10-25 (Asia/Tokyo), Chromium Web Client, English, light theme,
1440 × 900 CSS pixels, browser scale 100%. Synthetic Tob conversation, no model
messages sent. These are Web captures, not native Desktop or zoom evidence.

- Base: `335946b15fae4444643a0cecb25f3a83a6f5ea43` (S1).
- Candidate: S2 source in the commit containing these images; captured before
  committing, with no later product-source changes.
- Candidate Client artifact SHA256:
  `64ed4a03322405af4b98065833d0cd7814ef4e6aa61ae580137cb38849653796`.
- `a.png`: base Sessions layout answer; `b.png`: candidate answer. Both are
  identical 1115 × 300 crops at (325, 300), excluding unrelated onboarding and
  roster state. No pixels or visible text were replaced.
- `c.png`: candidate real Sessions practice, first step, original full viewport.
  The synthetic group in the roster is extra candidate test data, not a change
  to the selected Tob conversation.
- Private originals and ARIA/text evidence remain in the task verification
  archive. Selected images were visually inspected before publication.

The full light/dark automated journeys additionally cover nested movement,
resize, hidden controls, DM/Group context, VRM camera changes, explicit mount
selection, removal and Plugin disposal/re-registration. These screenshots are
not a substitute for their state assertions. The matching VRM baseline visual
pair is not published yet; this PR remains draft for that evidence gap.

Native actual 125% application zoom and native VRM remain **untested**. Human
authorization to advance to S3 does not change either status. No release,
deployment, merge, or final cumulative qualification is implied.
