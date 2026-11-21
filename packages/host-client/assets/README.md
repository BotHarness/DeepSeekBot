# Built-in Tilties avatars

The asset JSON contains 512 × 512 WebP encodings of the 36 Tilties portraits across AI Girls, Pioneers, Town and Fantasy. Web and mobile share these bytes and use the existing Bot avatar image path to save a selection.

To refresh the bundle from the named source tiles, run `node scripts/import-tilties-avatars.mjs <named PNG tiles...>` with libwebp's `cwebp` installed. Keep filenames aligned with the collection registry. The pack test checks membership, dimensions and the byte budget.
