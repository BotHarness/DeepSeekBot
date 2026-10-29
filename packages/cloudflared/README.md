# cloudflared for DeepSeekBot Connect

Each folder here is one optional npm package that carries the pinned
[`cloudflared`](https://github.com/cloudflare/cloudflared) binary for one platform, in the esbuild
pattern (ADR-0241). The published `deepseekbot` package lists them as `optionalDependencies`, so an
install fetches only the package whose `os` and `cpu` match the machine.

The binary is not committed. The release build (`scripts/cloudflared-packages.mjs`, run by
`scripts/npm-prerelease.mjs prepare`) downloads the release pinned in
`packages/core/src/devices/cloudflared.json`, checks its SHA-256, and places it at
`bin/cloudflared` (`bin/cloudflared.exe` on Windows). When the package is missing, the Host
downloads the same pinned release into the profile and checks the same hash.

`node scripts/cloudflared-packages.mjs list` prints the packages, assets and hashes without
downloading anything.

`cloudflared` is © Cloudflare, Inc. and licensed under the Apache License 2.0; see `LICENSE`.
