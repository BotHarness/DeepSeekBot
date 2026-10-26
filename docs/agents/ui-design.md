# UI design standard

[中文](ui-design.zh.md)

This is the shared design standard for every new or changed product interface: Web, desktop and native mobile. It also governs design reviews. Platform guides specify the components; [UI copy](ui-copy.md) specifies wording. Existing screens adopt this standard when touched; this document does not claim a completed product-wide redesign.

**Use layout, icons and interaction to explain the interface. Keep it simple.** A person should recognize the object, current state and next action from the screen's structure and controls. Labels name things and actions; descriptive prose supplies only information the interface cannot communicate clearly and safely.

## Design rules

1. **Structure before explanation.** Use hierarchy, proximity, spacing and grouping to show what belongs together and what matters now. If a paragraph is needed to explain where to look or which control to use, revise the layout or control first. A supporting description is optional, not a required row decoration.
2. **Recognizable controls and icons.** Use the owning platform or shell's components and familiar symbols. On mobile, follow the native component rules in [Mobile design](../../apps/mobile/DESIGN.md); Web and desktop follow [DSH UI](../../.agents/skills/dsh-ui/SKILL.md). Icons help identify objects, actions and states. Pair unfamiliar or consequential actions with short visible labels; every icon-only action needs an accessible name. Colour alone must not carry meaning.
3. **Let the flow explain the task.** Show the current decision and its relevant information together. Give the primary action clear emphasis, acknowledge input immediately, and show progress, success or a recoverable failure where the action happens. Use focused steps for genuinely sequential decisions; keep a simple task in one place.
4. **Reveal detail when it is useful.** Keep secondary explanations, background and diagnostics behind a clearly labelled disclosure or help entry. Keep information needed for the current decision visible beside its action. Do not add a disclosure just to hide essential instructions or consequences.
5. **Retain essential text and facts.** Short labels, units, current values, permission scope, privacy limits, irreversible consequences and actionable errors remain explicit. Security comparisons must expose the complete required values before confirmation. Simplicity never means truncating a fingerprint, silently choosing for the user or weakening consent.
6. **Keep the design usable across modes.** Preserve reading order, keyboard/focus access, screen-reader names and reachable actions. Allow wrapping and scrolling at large text sizes. Apply the same hierarchy in both themes and maintained languages; use each platform's controls rather than copying another platform's appearance.

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
