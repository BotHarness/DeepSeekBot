# @botharness/vrm-companion

A VRM companion Panel for [DeepSeekBot](https://github.com/BotHarness/DeepSeekBot): the Bot's character sits at a desk in a lo-fi study room in the style of Chill with You. It types while the Bot works, looks up while it thinks, turns to you and speaks the Bot's committed replies in a speech bubble, and between tasks sips coffee, rests its chin or checks its phone. Day, night and weather follow your local clock, and **Change character…** loads your own `.vrm` file (VRoid/VRM 0.x or VRM 1.0) without uploading it.

## Requirements

- DeepSeek Harness (DSH) `>=0.2.0-rc.2 <0.3.0`.
- DeepSeekBot newer than 1.4.1, installed in the same Profile. The Panel uses DeepSeekBot's `botPresentation` and `dockPanels` services, which 1.4.1 and earlier do not provide, and the DSH Client `locale` service for its Chinese and English text; the Panel does not load without them.

## Install

```sh
dsh plugin --profile <your-profile> add @botharness/vrm-companion@0.2.0
```

Restart the Host. In Bot mode, select a Bot DM, open Messages and choose **VRM Companion** (**VRM 伴侣** in Chinese) in the Messages header. The pin icon creates a fixed instance for that Bot. See the [Panel guide](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/panel-plugin.md) for controls and behavior.

## License

The source code is MIT; see [LICENSE](LICENSE). The bundled assets keep their own terms:

- The default character, VRoid Project's AvatarSample_A, may be used, modified and redistributed without credit under its VRoid Hub conditions; it is not under the MIT license. See [assets/README.md](assets/README.md).
- The room models are KayKit Furniture Bits by Kay Lousberg, CC0; see [assets/kaykit/README.md](assets/kaykit/README.md).
- The lilToon shader port is MIT; see [assets/THREE-LILTOON-LICENSE.txt](assets/THREE-LILTOON-LICENSE.txt) and its third-party notices.

## Release

`@botharness/vrm-companion` is versioned independently of DeepSeekBot and published by `.github/workflows/vrm-companion-release.yml`.

1. Bump `version` in `packages/vrm-companion/package.json` (a prerelease such as `0.2.0-rc.1` goes to the `next` dist-tag, anything else to `latest`) and merge it to `main`.
2. Tag that commit on `main` and push the tag:

   ```sh
   git tag vrm-companion-v0.2.0 && git push origin vrm-companion-v0.2.0
   ```

3. The workflow checks that the tag is on `main` and matches the package version, runs `pnpm install --frozen-lockfile`, `pnpm build` and the VRM tests, then waits for approval in the `npm-release` environment.
4. After approval it runs `npm publish --provenance --access public` in `packages/vrm-companion`. It authenticates with npm trusted publishing when a Trusted Publisher for this workflow is configured on npmjs.com for `@botharness/vrm-companion`, and otherwise with the `NPM_TOKEN` secret.
