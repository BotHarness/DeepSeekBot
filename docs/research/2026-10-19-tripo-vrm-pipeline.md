# Tripo → VRM companion: bounded feasibility check

Date: 2026-10-19. Scope: T1 #2222 character asset research only; no generation, credit spending, subscription change, or runtime change was performed by this research task.

## Decision

Tripo can supply a textured character mesh and body rig as an intermediate asset. The available evidence does **not** establish a one-click, downloadable, facially animated VRM from the user's 200-credit Free Studio account. Keep the licensed working VRM for T1 acceptance while resolving export and facial-authoring costs; a generated replacement must pass the same runtime checks before adoption.

## Confirmed capabilities and limits

| Question                                                         | Finding                                                                                                                                                                                                                                                                   | Primary source                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Can Studio generate a textured humanoid?                         | Its documented text/image workflow produces a textured PBR model; Auto Rig adds skeleton and skin weights, with FBX/GLB export. This establishes a possible starting asset, not guaranteed topology or visual quality for our character.                                  | [Studio tutorial](https://www.tripo3d.ai/blog/tripo-studio-tutorial-english)                            |
| What does 200 credits buy?                                       | Current Free pricing lists 200 monthly credits, public/non-commercial models, limited storage and exports. The export row specifically says **15, H2.5 only**. Generation eligibility and download eligibility differ.                                                    | [Studio pricing](https://www.tripo3d.ai/pricing)                                                        |
| Does the visible H3.1 generation button mean export is included? | No. The parent task's read-only account observation found a 200 balance, a 55-credit H3.1 generation button, public default, and an upgrade banner for model export. This observation is consistent with the pricing restriction; H3.1 download has not been established. | Live account observation supplied by the parent task; [plan comparison](https://www.tripo3d.ai/pricing) |
| Can these credits be used through the API?                       | No. Studio and API have independent credit systems; Studio membership does not supply API credits.                                                                                                                                                                        | [Tripo Help Center](https://www.tripo3d.ai/help/api-plugins/tripo-studiotripo-api)                      |
| Is a VRM skeleton available?                                     | API Auto Rig `v3.0-20260909` supports `rig_type: biped`, `spec: vrm`. The specification describes this as **VRM 1.0 humanoid bone naming**. Output choices remain GLB/FBX. Studio availability for this account was not established.                                      | [Auto Rig API](https://developers.tripo3d.ai/en/docs/animations-rig)                                    |
| Are blink and mouth expressions automatic?                       | Tripo's own VTuber guide explicitly separates Auto Rig's skeleton/weights from facial expression authoring and says it does not create a complete VRM expression set.                                                                                                     | [VTuber rigging guide](https://www.tripo3d.ai/blog/vtuber-rigging)                                      |

Do not budget from older marketing articles that quote 300 Free Studio credits or from API price tables. Use the account's displayed quote for the selected operation and independently confirm its export entitlement.

## Bone names are not the VRM container contract

A GLB whose nodes are named `hips`, `head`, etc. is not thereby a VRM. Tripo's own conversion guide calls for a dedicated VRM authoring stage and distinguishes ordinary GLB from GLB with VRM extensions. [Tripo VRM workflow](https://www.tripo3d.ai/blog/vrm-model-generator)

The actual VRM 1.0 container uses the `VRMC_vrm` extension for avatar metadata, humanoid mapping, expressions and look-at. A candidate must carry valid extension data and pass VRM-aware loading, rather than merely being renamed `.vrm`. [VRM Consortium specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/README.md)

For this T1, acceptance specifically needs a visible `aa` mouth shape, `blink`, usable head/limb mapping, correct material rendering and sane scale. A body rig alone leaves the speaking requirement unmet. Facial keys must exist on the mesh and be bound to VRM expressions; a name-only placeholder is insufficient. This is our runtime requirement and proposed validation, not a claim about uninspected Tripo output.

## Proposed single-candidate pipeline

1. **Before spending:** confirm an exportable model version and rigging availability in Studio. If H2.5 is selectable and its normal export route is available, record that choice and the displayed generation cost. Stop at a paywall; do not extract assets from internal requests.
2. Create one original full-body character concept in a neutral rig-friendly pose, separated arms/legs and uncluttered clothing. Use the same visual palette as the room, without baking the room or chair into the character. Tripo recommends visible limbs and avoiding complex accessories for this workflow. [Tripo character preparation](https://www.tripo3d.ai/blog/vrm-model-generator)
3. Generate one textured candidate. Inspect all sides before any refinement spend. Reject fused limbs, unusable hands, painted-on facial detail that cannot deform, or clothing intersections that would prevent sitting.
4. Rig and export through the normal allowed GLB/FBX path; test shoulders, hips and knees before conversion. Author missing face shape keys in Blender, then use a VRM-capable exporter or Unity/UniVRM to configure humanoid mapping, `aa`/`blink`, gaze and truthful asset metadata. Tripo documents this downstream conversion rather than direct finished VRM output. [Conversion workflow](https://www.tripo3d.ai/blog/vrm-model-generator)
5. Reimport the exported VRM, then load it through the existing `@pixiv/three-vrm` stage. Compare idle, seated, typing, standing, walking, head turn, blink and real Bot speech. Verify seated contacts, material colors and disposal before replacing the existing sample.

This is a proposed process, not a successful asset result. Do not promise that 200 credits cover generation, rigging, retries and downloadable export; the latter may require a different plan, and facial authoring remains separate work.

## Distribution gate

Current pricing marks Free models non-commercial. Tripo's help center states that commercial rights are granted to paid users; its governing terms distinguish Free-user and paid-user rights in §§5.2.1–5.2.2. Therefore a free experimental output should not be bundled into the redistributable BotHarness package on the assumption that it has the same permissions as the current sample. A later subscription must not be assumed to retroactively change an earlier asset's rights. Record the generation-time plan and obtain applicable rights before repository distribution. [Commercial-use help](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially), [Terms](https://www.tripo3d.ai/terms)

The open questions are concrete: exportable Studio version, actual rigging entitlement/quote, facial deformation quality, permitted redistribution, and final VRM runtime behavior. None blocks improving the real 3D room with the existing licensed avatar.
