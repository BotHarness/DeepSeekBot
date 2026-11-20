# UI design standard

[中文](ui-design.zh.md)

This is the shared design standard for every new or changed product interface: Web, desktop and native mobile. It also governs design reviews. Platform guides specify the components; [UI copy](ui-copy.md) specifies wording. Existing screens adopt this standard when touched; this document does not claim a completed product-wide redesign.

**Use layout, icons and interaction to explain the interface. Keep it simple.** A person should recognize the object, current state and next action from the screen's structure and controls. Labels name things and actions; descriptive prose supplies only information the interface cannot communicate clearly and safely.

## Product principles

These apply to every implementation, not only one feature.

1. **Common actions within easy reach.** Design from how people use the product: the frequent action is the most visible one. Buttons, cards and lists read clearly; separate areas with background colour and spacing rather than borders.
2. **Layout tells the story.** Use arrangement and icons to show what a feature does instead of long descriptions. When an explanation is genuinely needed, put it behind an info icon button as a tooltip or popover shown on hover or click.
3. **Shortest natural path.** The flow follows what people are trying to do, so the common 80% of tasks take the fewest steps.
4. **Never leave people lost.** Every empty state guides to the next useful action. Split a hard configuration with sequential decisions into a stepper; keep related decisions together on one step.
5. **Help is one click away.** Link to the relevant documentation, or offer a one-click copyable prompt that people can ask a Bot directly.

## Design rules

1. **Structure before explanation.** Use hierarchy, proximity, spacing and grouping to show what belongs together and what matters now. If a paragraph is needed to explain where to look or which control to use, revise the layout or control first. A supporting description is optional, not a required row decoration.
2. **Recognizable controls and icons.** Use the owning platform or shell's components and familiar symbols. On mobile, follow the native component rules in [Mobile design](../../apps/mobile/DESIGN.md); Web and desktop follow [DSH UI](../../.agents/skills/dsh-ui/SKILL.md). Icons help identify objects, actions and states. Pair unfamiliar or consequential actions with short visible labels. Colour alone must not carry meaning.
3. **Let the flow explain the task.** Show the current decision and its relevant information together. Give the primary action clear emphasis, acknowledge input immediately, and show progress, success or a recoverable failure where the action happens. Use focused steps for genuinely sequential decisions; keep a simple task in one place.
4. **Reveal detail when it is useful.** Keep secondary explanations, background and diagnostics behind a clearly labelled disclosure or help entry. Keep information needed for the current decision visible beside its action. Do not add a disclosure just to hide essential instructions or consequences.
5. **Retain essential text and facts.** Short labels, units, current values, permission scope, privacy limits, irreversible consequences and actionable errors remain explicit. Security comparisons must expose the complete required values before confirmation. Simplicity never means truncating a fingerprint, silently choosing for the user or weakening consent.
6. **Keep the design usable across modes.** Preserve reading order, keyboard/focus access, screen-reader names and reachable actions. Allow wrapping and scrolling at large text sizes. Apply the same hierarchy in both themes and maintained languages; use each platform's controls rather than copying another platform's appearance.
7. **One design language across panels.** The [Desktop/Web UI decisions](../decisions/desktop-ui.md#adr-0028) link the active design-system contracts. Web and desktop panels compose the shared `ds/` primitives (`NavItem`, `SettingsSection`, `SettingsRow`, controls, dialogs), which read the style tokens in `ds/tobs.stylex.ts` (`style.*`, [ADR-0351](../decisions/desktop-ui.md#adr-0351)). A selection changes colour and label weight only, never borders or size. Surfaces are separated by a gap that shows the canvas, not a line; borders belong to inputs and focus rings.

Desktop style literals, viewport breakpoints and motion are enforced by [UI rules 1, 2 and 6](../../scripts/check-ui-rules.mjs) and the [design token guard](../../scripts/check-design-tokens.mjs).

Desktop icon sources, accessible names, status labels, focus rings and disabled styles are enforced by [UI rules 3–5](../../scripts/check-ui-rules.mjs). Review the rendered names and focus order for composed controls.

## Examples

| Situation                        | What communicates it                                                                                    | Text that remains                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Pair a computer                  | Computer identity, grouped fingerprint card, one verification step, then a separate phone-approval step | Full fingerprints, a short comparison instruction, explicit match/cancel actions; explanation available on demand |
| Choose a setting                 | Grouped row, current value and the appropriate switch, picker or segmented control                      | Name and value; a hint only for a consequence the control cannot convey                                           |
| Save or retry                    | Immediate pending state, visible success, or an error next to the affected action                       | Specific action label and a brief recovery instruction                                                            |
| Grant access or remove something | Named target and scope beside the confirmation, clear primary/secondary actions                         | Permission scope, irreversible consequences and meaningful cancel/confirm labels                                  |

## Review gate

For each changed flow, reviewers verify:

- The object, current state and next action are recognizable without reading a block of explanatory prose.
- Every description adds a needed fact; layout, controls and feedback carry the interaction itself.
- Details are optional, while the facts required for an informed decision remain visible.
- Icons, labels and accessibility names convey the same meaning; no meaning depends on colour alone.
- The flow works with the platform's input methods, large text, both themes and maintained languages. Record untested platforms and accessibility modes separately.

Use the relevant platform's runtime verification and PR evidence requirements. A shorter paragraph or an attractive screenshot alone does not demonstrate a usable interaction.

## Message actions and read failures

Use the Web `ds/action-button` module or the native `primitives/button` adapter for card actions. Callers supply a semantic icon, a short action label, tone, pending state and their existing callback. The adapter owns the filled surface, icon colour, wrapping, disabled treatment and accessible pending state. Secondary actions must remain distinguishable from their containing message bubble or settings surface. Derived action colours resolve from global DSH tokens so portaled settings do not depend on Bot-mode ancestor variables. Keep the action name visible while pending; do not turn every action into an identical loading label.

Use `ds/read-failure` or native `primitives/read-failure` for standalone failed reads. Keep the summary short and native diagnostic details behind a disclosure. Reloading a failed read is valid; it must not replay an approval, message or other mutation. Approval and question cards retain their owning request guards and keyboard/focus contract.

Session maintenance uses the shared `session-maintenance` controller, scoped to a Host client and Bot DM. Failure cards and usage panels observe the same in-flight operation and outcome. Compact and new Session never resend messages. Group channels and Assignment failures do not expose these actions; the Host remains authoritative for busy and permission refusals.

## Component names and motion

**Name the component.** When discussing, planning, reviewing or implementing UI (issues, PRs, commits, code comments, chat), name the concrete component by its platform term from `GLOSSARY.md` → Native UI components: the Material 3 name on Android, the HIG name on iOS, and the API name (Compose, SwiftUI, UIKit, `@expo/ui`) when you mean code. Say "Android `ModalBottomSheet`" or "iOS pull-down button", not "popup", "弹窗", "drawer", "dropdown" or "the bottom thing". When a change covers both platforms, name both sides of the pair (Android `ModalBottomSheet` ↔ iOS form sheet). If a job has no counterpart, say so and name the custom surface recorded in `apps/mobile/DESIGN.md`. A component missing from the table is added to `GLOSSARY.md` and `GLOSSARY.zh.md` in the same change.

Animation is part of the product's feel. Any new or changed animation on web, desktop or mobile follows Emil Kowalski's skills (third-party, locked in `skills-lock.json`): `animate` to build web motion, `animate-expo` for React Native and Expo, `review-animations` before you ship it, `improve-animations` to audit existing motion, `animation-performance` for dropped frames, and `emil-design-eng` / `animation-vocabulary` for the shared rules and words. They decide whether something animates, which properties and its reduced-motion behavior. On mobile the platform decides the curve: iOS uses SwiftUI's springs and Android uses Material 3 Expressive springs, through the `spring` roles in `apps/mobile/src/ui/design/motion.ts` ([ADR-0264](../decisions/mobile-ui.md#adr-0264)).

Motion tokens and same-style reduced-motion overrides are enforced by [UI rule 6](../../scripts/check-ui-rules.mjs).
