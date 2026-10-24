# Tobs / 托布 Tobs — iOS promotional artwork

Twelve branded variants of the existing iOS campaign: seven English compositions (three dark), five Simplified Chinese compositions. Each PNG is 1320 × 2868, with the complete phone frame and an exterior Tobs/托布 Tobs wordmark plus `tobs.app`. The originals and native captures remain unchanged in their task evidence batches. `manifest.json` records the original poster, capture source and output hashes.

The five Chinese compositions use **unchanged native screenshot layers**, saved under `sources/zh/`. Their 1320 × 2868 content is displayed at 860 × 1868.53 CSS pixels with `width: 100%; height: auto`; horizontal and vertical scales differ only by browser subpixel rounding (less than 0.001%). A CSS device frame, physical camera mask and exterior typography surround that layer. Built-in imagegen supplies the decorative background only. The seven English images remain generated marketing compositions. These are campaign assets from retained earlier captures, not proof of the renamed app binary; final editorial acceptance remains in #2736. Community and official DeepSeek names remain accurate.

## Order

| Slot | English                  | Simplified Chinese  |
| ---- | ------------------------ | ------------------- |
| 01   | Chats                    | Chats               |
| 02   | Group collaboration      | Group collaboration |
| 03   | Marketplace              | Marketplace         |
| 04   | Direct message, dark     | Bot profile         |
| 05   | Marketplace, dark        | Activity            |
| 06   | Marketplace detail, dark | —                   |
| 07   | Native Create menu       | —                   |

## Decorative background direction

Remove phone and typography from the existing cream/blue/pixel-character poster to obtain a decorative background only. Keep the center clear. Never send the final native screenshot layer through image generation; use its original aspect ratio when placing it in the complete phone frame. Exterior brand text is `托布 Tobs`, with `tobs.app` below it. The prior generated Chinese posters remain in Git history.

Uploading these candidates to the existing App Store Connect draft does not submit the app for App Review or publish a release. App Store Connect record, bundle IDs, EAS project, signing, App Groups, storage and deep-link schemes remain the existing identities. Native naming and upgrade verification are recorded separately on #2725.
