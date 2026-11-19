---
Status: Accepted
Date: 2026-10-03
---

# Editable Avatar appearance is independent of activity presentation

Human has confirmed two original Avatar Families—illustrated people and abstract characters—with detailed part selection and bounded geometric editing. Families share Bot-state meanings and transition rules but adapt their own poses; abstract characters may briefly become dots or symbols while configured parts temporarily hide and fully return. Preserve one versioned Avatar Appearance recipe through the PersonaBot owning module, consume the existing shared Activity Projection for execution, and keep sampled poses and transition time in the Client renderer. A transition never rewrites the saved appearance or becomes a second execution authority. Human confirmed the complete design at Q20 on 2026-10-03; this ADR records the accepted target and does not authorize implementation.

## Authority and lifecycle

- **Appearance** is application-defined PersonaBot data: Avatar Family, compatible part selections, content colors and bounded geometric parameters, with explicit schema and asset/rig version references. The PersonaBot Registry owns its canonical write/read path. It is not Persona content, a SessionEvent, or browser-local identity. The current registry uses `bot.json`; ADR-0041's database target does not justify a separate appearance store. Exact field shape and migration remain implementation work.
- **Execution and attention** retain their existing owners. DSH SessionEvents and explicit Session Ownership feed the shared Activity Projection; Avatar consumers do not infer state from model text, tool arguments or background activity. Human attention remains orthogonal to execution and uses the safe shared contract delivered by the #123 owner. Explicit waiting-on-Assignment has no declared Host source at the verified baseline and is not fabricated here.
- **Presentation** is transient Client work: family-specific poses, gaze, component transforms, transition progress and a bounded dot/symbol layer. Renderers consume the same shared semantics across Bindings. A Client renderer owns and cleans up its animations and subscriptions; frames are not written to the registry, appended to Session history or sent over RPC.

Host commands and queries cross the existing Typert/API Gateway seam. The editor previews a local draft and recommends an explicit Save/Cancel boundary; canonical validation remains Host-owned. Framework APIs, DTO names and concrete storage migrations must be verified against the implementation baseline before coding.

## Family and motion contracts

The first two families use compatible choices within each family; only explicitly adapted parts are shared across families. Both support the confirmed first scope: facial expression, gaze and overall pose, with no first-version requirement for hands or a full body. Appearance controls include individual hair sections and rich geometry parameters; direct path-control-point editing and free drawing are outside the confirmed first scope.

Each asset/rig contract must declare its anchors, layer/occlusion rules, parameter ranges and supported poses. Parameterized poses plus a separate bounded dot/symbol layer are the preferred validation candidate. Local same-structure path morph remains possible for authored assets; arbitrary incoming SVG paths are not promised to interpolate. During a topology-changing transition, parts may hide without losing their saved configuration and reappear when the stable character pose returns. Dots and symbols are principally short transitions, not the continuous representation of an entire work phase.

Attention labels and actionable indicators update from their owning facts independently of decorative easing. Rapid activity changes must retarget from the currently displayed pose with bounded transition state, rather than concatenate particle lists or enqueue a dance for every event. Reduced motion follows the existing shared preference. Connectivity loss must be expressed as presentation freshness, not invented idle, success or failure.

Human confirmed quiet small-avatar motion with richer large-avatar motion: both follow the same activity semantics, while the small variant shortens and reduces the amplitude of large transitions. The saved appearance includes a retained versioned recipe and a derived static snapshot. If a compatible asset/protocol version is unavailable, preserve the recipe, show that snapshot and state that editing and character animation are temporarily unavailable; independent truthful Activity Frame indicators remain available. Do not silently substitute another part or convert the fallback image into the canonical editable recipe.

The complete design is accepted. This records the agreed target, not delivered runtime behavior or permission to implement, publish or replace the existing avatar contract.

## Considered options

- **Persist only the final image** preserves static appearance through today's bounded image flow but loses editable geometry and part-specific animation; it cannot fulfill the confirmed scope alone.
- **Persist arbitrary SVG markup as appearance** exposes a different trust and authoring boundary and cannot guarantee compatible animation. Human has chosen controlled presets first, with uploads as a future capability.
- **One universal geometric rig for every family** constrains anatomy and silhouette to one template. Human chose shared semantics with family-specific motion instead.
- **Derive or rewrite appearance from activity** would make a brief transition overwrite Human choices, breaking return-to-character and sharing behavior.
- **Animate every part into particles** adds sampling, attribution and recomposition cost. Human allows parts to hide temporarily, so this is not required to preserve the configured appearance.
- **Create a new state aggregator in the Avatar renderer** duplicates ownership, concurrency and attention interpretation already assigned to the owning modules.

## Consequences and validation

Part counts and performance budgets must come from visual and runtime measurement. First prove a narrow Host→registry→bridge→Client path for one family, validate it with Human, then reuse the same semantics for the second family within the agreed first-release scope. Each working slice must include editing/save/re-read, real tool activity, independent attention and a runnable in-harness view. The first slice depends on the #123 owner's delivered shared attention contract; if unavailable, record that dependency rather than defer attention past the second family or independently implement #123's work.

The proposed implementation baseline is controlled inline SVG in the existing React Client, with stable nodes and validated parameters. Use browser transforms/opacity for ordinary part motion and a bounded pose sampler where path/particle geometry needs it; compare this candidate in the first slice before committing to any new animation dependency. Preset artwork is trusted catalog content; input remains data, never imported executable markup. Existing bounded raster-image avatars and deterministic fallback remain compatible alternatives.

The current owning record should distinguish the selected default/image/composed media without introducing an independently authoritative browser store or renderer preference. Exact fields are application-defined and unimplemented. A derived snapshot is tied to the appearance revision, follows existing bounded raster-image rules and travels with the recipe for fallback; routine activity refreshes carry lightweight references rather than full snapshot bytes. An explicit sharing preparation writes selected recipe/presentation into committed Memory metadata and does not turn local Save into an automatic Git commit or publication.

Validation must cover legal parameter extrema, hairstyle/face/accessory compatibility, rapid mid-transition retargeting with bounded particle capacity, multiple instances of one Avatar without SVG ID collisions, reduced motion, visibility/disposal, saved-appearance recovery and missing-version handling. No prototype screenshot or four-character demo establishes production performance. Completion celebrations and error expressions follow in a later slice with explicit result scope and authority.

Sharing is coordinated with #17's confirmed contract: committed presentation metadata/assets preserve appearance while import creates a fresh PersonaBot identity; ordinary Git updates do not automatically overwrite local presentation preferences. Profile Backup/Restore/Transfer remains #76. Appearance references must not silently dangle, and imported definitions cannot bring executable renderers, credentials or live execution authority.

## Evidence

- [#743: design documentation and local spec handoff](https://github.com/BotHarness/BotHarness/issues/743)
- [Design interview and source evidence](../research/2026-10-03-svg-avatar-design-exploration.md)
- [ADR-0049: shared activity projection](../decisions/release.md#adr-0049)
- [ADR-0086: bounded static image avatars](0086-custom-personabot-avatars-are-bounded-data-urls.md)
- [#120: shared Avatar surface](https://github.com/BotHarness/BotHarness/issues/120)
- [#123 owner and undeclared waiting source](https://github.com/BotHarness/BotHarness/issues/123#issuecomment-5965624849)
- [#737 merged: Overview keeps execution and Human action separate](https://github.com/BotHarness/BotHarness/pull/737)
- [#740: native approval attention proposal, open at this review](https://github.com/BotHarness/BotHarness/pull/740)
- [#17: public sharing/import contract](https://github.com/BotHarness/BotHarness/issues/17)
- [#76: Profile portability](https://github.com/BotHarness/BotHarness/issues/76)
