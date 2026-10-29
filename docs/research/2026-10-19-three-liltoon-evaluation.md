# three-liltoon evaluation for T1 #2222

Date: 2026-10-19. Scope: source/documentation research, not a rendered compatibility test. No dependency was installed and no runtime code was changed.

## Recommendation

Run a selective avatar-material A/B experiment with `@mochiya/three-liltoon`; retain physically based room materials initially. The library is relevant to the desired soft anime character shading, but cannot repair chair geometry, missing wood grain, or flat cloud silhouettes. Do not replace every room material or claim reference-game fidelity from a successful import.

## Verified upstream facts

- `three-liltoon` is an unofficial WebGL2 port; upstream `lilToon` itself is a Unity shader. The port remains alpha. Its README explicitly lists Three **0.180.0** and `@pixiv/three-vrm` **3.5.5** among tested versions, matching this worktree. This is upstream-reported compatibility, not our Host verification. [Port README](https://github.com/mochiya-labs/three-liltoon), [Unity installation and compatibility](https://lilxyzw.github.io/lilToon/ja_JP/first.html)
- The fetched raw manifest reports version **0.1.9**, ESM, `sideEffects: false`, Three peer `>=0.180.0 <0.190.0`, and optional Three-VRM peer `>=3.4.0 <4`. Runtime entry points are the root package, `/gltf`, and `/vrm`. These mutable `main` URLs are a research snapshot; resolve and pin an actual published version before implementation. Different cached GitHub/raw responses observed during this investigation contained older package/API versions. [Manifest](https://raw.githubusercontent.com/mochiya-labs/three-liltoon/main/package.json)
- Ordinary GLB/VRM assets retain their existing materials. Automatic replacement requires **`MOCHIYA_materials_liltoon`** data; material names and textures are not guessed. An ordinary VRM does not acquire the lilToon look merely by registering its loader. [Port README](https://github.com/mochiya-labs/three-liltoon)
- First visible directional light plus ambient/hemisphere approximation is the lighting model. Additional point/spot lighting and Unity lightmaps/probes are unsupported. Directional shadow reception uses one depth map with 2×2 PCF; shadow casting is approximate. Instancing is unsupported. Environment reflection accepts a `CubeTexture`, not direct equirectangular or PMREM data. This makes wholesale conversion of a point-lit, instanced room unsuitable. [Feature matrix](https://github.com/mochiya-labs/three-liltoon/blob/main/docs/FEATURE_MATRIX.md)
- The feature matrix explicitly has no approved committed Unity image-parity baseline. Browser regression coverage is evidence for selected rendering paths, not universal fidelity or GPU compatibility. [Feature matrix](https://github.com/mochiya-labs/three-liltoon/blob/main/docs/FEATURE_MATRIX.md)

## Integration and expression ownership

`enableLilToon(renderer)` installs rendering passes and returns cleanup. `enableLilToonVRM(new VRMLoaderPlugin(parser))` includes extension loading and supported expression adapters; do not also register the GLB-only plugin. Three-VRM retains humanoid, morph-expression, and spring-bone updates. [Port README](https://github.com/mochiya-labs/three-liltoon)

The API maps material expressions to `_Color`, `_EmissionColor`, `_ShadowColor`, `_MatCapColor`, `_RimColor`, `_OutlineColor`, and main-texture `_MainTex_ST`. Custom loading can call `installLilToonExpressionBindings(vrm)` before expression updates, undoing and reinstalling when bindings change. Generated outlines follow morphs and skinning. Input textures remain caller-owned. Direct rendering honors Three tone mapping/exposure/output color space; composer output transformation should run once. Outline selection requires an outline `shaderVariant`; width alone is insufficient. [API](https://github.com/mochiya-labs/three-liltoon/blob/main/docs/API.md)

**Manual replacement is an experiment, not a documented one-call MToon conversion.** Replacing `mesh.material` after loading may leave material-expression bindings pointing at the old objects. Explicitly inspect/remap those references before installing adapters; verify colors, UV expressions, blink, and mouth shapes. Morph lip-sync is conceptually separate from material bindings, but its rendered result still needs validation. Preserve original alpha/culling/textures and retain reversible ownership until that test passes. This paragraph is an integration inference; the inspected docs do not promise arbitrary post-load replacement support.

## Local findings supplied by the owning T1 agent

The parent agent inspected the current worktree and sample asset during this research:

- Installed versions are exactly Three 0.180.0 and Three-VRM 3.5.5.
- `sample.vrm` has 13 MToon materials. Its extension list includes `VRMC_materials_mtoon`, `VRMC_vrm`, spring bones and node constraints, but no `MOCHIYA_materials_liltoon`.
- `stage.ts` adds an unshadowed key directional light before `room.root`; that root contains the time-driven sun. Therefore the port's first-light rule would select the key, not the sun, with the current scene ordering.
- `room.ts` also uses a point lamp. Its room illumination cannot be assumed to carry over to lilToon surfaces.

These are current implementation observations, not upstream package guarantees. Before an A/B, make the intended time-driven main directional light explicit and shared by both avatar comparisons.

## Soft anime look: proposed parameter experiments

| Intent                               | Evidence and experiment                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Soft, colored shadows                | Upstream supports independently colored shadow bands, borders, blur and AO masks. Nonzero blur moves away from hard cel boundaries. Test one restrained warm shadow first, then a weaker cool second band; inspect face and neck in both sunset and night. [Shadow manual](https://lilxyzw.github.io/lilToon/ja_JP/color/shadow.html)                                                                  |
| Gentle edge separation               | Rim blur softens the edge; light influence prevents it remaining conspicuously bright in darkness. Test a thin, low-strength warm rim, not a broad white halo. [Rim manual](https://lilxyzw.github.io/lilToon/ja_JP/reflections/rimlight.html)                                                                                                                                                         |
| Preserve whites and room integration | `_LightMinLimit` and `_LightMaxLimit` bound brightness. `_AsUnlit` lifts illumination but can detach an avatar visually from its environment. Test restrained limits and near-zero unlit contribution with the actual exposure. Unity's point-light controls are not evidence that the WebGL port supports those lights. [Lighting manual](https://lilxyzw.github.io/lilToon/ja_JP/base/lighting.html) |
| Fine silhouette                      | Test a narrow dark-brown outline selected through an outline shader variant. Judge at actual Panel body size, including hair transparency. The port is not a Three physical material and does not gain PBR properties merely by assignment. [API](https://github.com/mochiya-labs/three-liltoon/blob/main/docs/API.md)                                                                                 |

These are artistic hypotheses, not validated presets. Start with basic opaque/cutout avatar shading; avoid fur, gem, refraction and advanced masks until basic appearance and resource lifetime are proven.

## License, size and acceptance gates

Both the port and upstream lilToon identify MIT licensing. Preserve the package license and carried third-party notices when distributing its runtime. This does not grant rights to third-party avatar assets. [Port license](https://github.com/mochiya-labs/three-liltoon/blob/main/LICENSE), [carried notices](https://github.com/mochiya-labs/three-liltoon/blob/main/THIRD_PARTY_NOTICES.md), [upstream license documentation](https://lilxyzw.github.io/lilToon/ja_JP/first.html#ライセンス)

Follow-up registry verification on 2026-10-19 succeeded through `pnpm view @mochiya/three-liltoon@0.1.9 version dist.unpackedSize peerDependencies --json`: published version **0.1.9**, unpacked archive **2,642,652 bytes**, Three peer `>=0.180.0 <0.190.0`, Three-VRM peer `>=3.4.0 <4`. This resolves the published-version uncertainty above. The unpacked archive size is not the shipped Client bundle increase. Compressed transfer size, minified/gzipped application increase, shader compile cost and frame time remain **unmeasured**. Earlier metadata attempts failed DNS or automatic approval capacity; the successful retry used the normal approved command path.

Before adopting: pin a resolved version; preserve one Three copy; compare MToon and lilToon with the same avatar, camera, pose, light, exposure and Panel dimensions; verify real Activity and speaking states; inspect alpha edges, directional shadows, material expressions, GPU warnings, memory after repeated mount/unmount, and measured bundle/frame costs. Keep room geometry, textures and lighting improvements as their own required work: shader adoption alone does not satisfy the requested room quality.
