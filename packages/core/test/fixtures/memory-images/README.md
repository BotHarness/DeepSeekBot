# Memory image fixtures

Real 160 × 90 blue/orange/green PNG, JPEG, GIF and WebP bytes were encoded with sharp 0.35.5. Static SVG fixtures use the same colours with native CSS/text/gradient elements. `animated.gif` and `animated.webp` each contain two 120 ms frames (blue and orange). These files are shared by owning-service, CLI, mobile adapter and real browser checks; they are synthetic test data, not PR screenshots. Their formats and pixel output are verified through real decoders during runtime acceptance. Preserve original bytes when checking version/export identity.
