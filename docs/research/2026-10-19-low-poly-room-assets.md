# Low-poly room assets for T1 #2222

Date: 2026-10-19. Scope: creator sources, license evidence and delivery formats. No runtime edits, purchases or logins. Asset appearance in our Host remains unverified.

## Recommendation

Use **KayKit Furniture Bits** for coordinated room dressing, with **Kenney Furniture Kit** as the simpler furniture/office-chair fallback. Add at most one **Tiny Treats House Plants** cluster near the window if the existing plant still looks crude. Select a few meshes rather than importing a complete room: the reference composition needs a large window, substantial desk, ergonomic chair and sparse readable detail behind the avatar.

None of these sources proves a ready-made match for the reference's red ergonomic gaming chair. Keep that as a deliberate hero asset, adapting a suitable mesh only after inspecting its silhouette. A generic low-poly dining chair would not satisfy that requirement. These assets also do not replace wood grain, fabric roughness, local lighting or cloud work.

## Shortlist

| Source                                        | Relevant contents and fit                                                                                                                                                                                                                                                 | Format / license evidence                                                                                                                                                                       | Download route                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kay Lousberg — KayKit Furniture Bits 1.0**  | First choice for books, lamps, shelving, pillows, rugs and side furniture. The public asset inventory includes `book_set`, `lamp_table`, `armchair_pillows`, chair variants and decorated shelves. The coordinated gradient atlas is useful for a cohesive stylized room. | Creator specifies 50+ models, OBJ/FBX/glTF, one 1024² gradient atlas. Creator repository contains glTF + BIN + PNG files and a CC0 license file.                                                | [Creator repository](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0), [GitHub ZIP](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/archive/refs/heads/main.zip), [official free download page](https://kaylousberg.itch.io/furniture-bits/purchase). ZIP endpoint is the standard GitHub archive route; transfer not verified in this run. |
| **Kenney — Furniture Kit**                    | Broad fallback kit for tables, chairs and room details. Creator lists 140 assets. A separately listed Kenney desk chair provides an office-chair candidate to inspect, but do not assume the kit supplies the reference's high-backed red chair.                          | Official kit page explicitly CC0. The Kenney Desk Chair listing specifies OBJ/glTF and CC0; archive inventory was not opened, so exact kit formats/file names remain unverified here.           | [Official kit](https://kenney.nl/assets/furniture-kit), [exact ZIP exposed by creator's free-download link](https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip), [Kenney Desk Chair on Poly Pizza](https://poly.pizza/m/CKSz6PB1vO).                                                                                         |
| **Tiny Treats / Isa Lousberg — House Plants** | Optional cozy detail set: five plant types and four pot styles with size variants. Choose one foliage silhouette and a ceramic pot to replace the current sphere-leaf plant, not an entire garden. Creator says it shares KayKit sizing and technical conventions.        | Creator page specifies 100+ low-poly models, OBJ/FBX/glTF, a 1024² gradient atlas, and CC0. Free archive listed as 17 MB; editable Blender source is a separate paid tier and is outside scope. | [Official set](https://tinytreats.itch.io/house-plants), [exact free-download landing page](https://tinytreats.itch.io/house-plants/purchase). An anonymous "No thanks" download flow exists; no persistent binary URL was exposed by the text source.                                                                                                                      |

Primary evidence: [KayKit README](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0), [KayKit license](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/blob/main/LICENSE.txt), [KayKit glTF inventory](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/tree/main/addons/kaykit_furniture_bits/Assets/gltf), [Kenney license and download](https://kenney.nl/assets/furniture-kit), [Kenney chair listing](https://poly.pizza/m/CKSz6PB1vO), [Tiny Treats license/formats](https://tinytreats.itch.io/house-plants).

## Exact small KayKit candidates

All URLs below correspond to names observed in the creator's glTF directory. Fetch the sibling `.bin` and `furniturebits_texture.png` alongside each `.gltf`, or package the selected models into GLB during integration. Keep their original texture mapping until tested; its gradient atlas is part of the authored look.

- [Book set glTF](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/book_set.gltf)
- [Table lamp glTF](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/lamp_table.gltf)
- [Decorated small shelf glTF](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/shelf_B_small_decorated.gltf)
- [Upholstered armchair with pillows glTF](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/armchair_pillows.gltf)
- [Shared texture](https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/furniturebits_texture.png)

The free creator repository does not establish that the gaming setup is included. The creator's storefront explicitly places 20 gaming-setup extras in the paid Extra tier; do not source those from unofficial mirrors. [Creator tier comparison](https://kaylousberg.itch.io/furniture-bits)

## Sources not selected

**Quaternius Ultimate Furniture** has a pack page stating CC0 and FBX/OBJ/Blend, but the current general license page states **QAL v1.0**, updated 2026-08-28, restricting asset redistribution. Without the actual archive's license and clear provenance, do not treat a new download as automatically CC0 for an open-source repository. It is not needed while the above creator-hosted CC0 alternatives exist. [Pack page](https://quaternius.com/packs/ultimatefurniture.html), [current license](https://quaternius.com/license.html)

**Poly Pizza Office Pack** mixes CC-BY and CC0 across authors. It is a discovery collection, not one uniformly permissive license or coherent art set. Prefer the creator kits and preserve individual provenance if a single CC-BY mesh is later selected. [Collection license list](https://poly.pizza/bundle/The-Office-Pack-UGIy7YcQP9)

## Import evidence still required

Record source URL, author, downloaded archive hash, selected files and carried license; inspect mesh bounds, seat height, triangle count, materials and texture paths; normalize scale to the existing avatar; verify contact with the chair/desk and shadow behavior in the real Panel. Compare sunset and night screenshots with the same camera. Selective imports should improve silhouette and detail without turning the room into a mismatched asset gallery.

The attempted Kenney ZIP fetch failed DNS inside the sandbox. Its escalated retry was not executed because automatic approval review reported model-capacity failure. No alternative route was used to bypass that review. Kenney and Tiny Treats remain source-level research, not archive or runtime acceptance claims.

## Downloaded KayKit subset

After approval service recovery, normal approved requests downloaded the four selected KayKit models directly from the creator's public repository, with their linked BIN buffers, shared PNG and original CC0 license. They are in the ignored `.humanlayer/tasks/2222-vrm-companion/asset-research/kaykit/` directory; `inspection.json` records each exact source URL, byte length and SHA-256. All buffer files match their declared glTF byte lengths.

| Mesh                      | Vertices | Triangles | Local bounds dimensions (X × Y × Z) |
| ------------------------- | -------: | --------: | ----------------------------------- |
| `book_set`                |      325 |       196 | 0.780 × 0.500 × 0.365               |
| `lamp_table`              |      327 |       392 | 1.000 × 1.022 × 1.000               |
| `shelf_B_small_decorated` |      632 |       532 | 1.000 × 1.012 × 0.571               |
| `armchair_pillows`        |      523 |       614 | 1.800 × 1.224 × 1.600               |

Counts and bounds are from the actual downloaded glTF accessors, not marketing estimates. Total geometry is 1,734 triangles. The shared `furniturebits_texture.png` is 15,605 bytes. This subset is prepared for import inspection; it has not been rendered in the Host or accepted as a visual improvement.
