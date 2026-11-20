# Official rc2 theme build input

These unmodified MIT-licensed runtime files come from the signed official macOS arm64
DSH 0.2.2-rc.2 Desktop archive. `PROVENANCE.json` binds the download, archive digest,
actual boot commit and individual file digests. The Desktop package omits declarations;
the transformation preserves them when present in npm inputs for other versions.

The npm rc2 theme package was unavailable during #4024. This checked-in input keeps
builds reproducible without downloading the entire Desktop archive on each build or
substituting the rc1 theme. It is not evidence that the npm rc2 distribution is available
or that Windows is qualified. Formatting and first-party source policies exclude only
this exact third-party directory so upstream bytes and license remain intact.

`scripts/desktop-zoom-compat.mjs` verifies both entry-point digests before adapting the
owned font-shortcut scope and schema import. `tsdown.config.ts` produces the ignored
product payload; the release packer includes it in both product entry points. Revisit
this input when the npm wave becomes available: compare actual bytes and provenance,
not only the version label, before changing its source.
