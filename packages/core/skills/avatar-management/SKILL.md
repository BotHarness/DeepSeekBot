---
name: avatar-management
description: Create or change a Bot or Group avatar from a local PNG, JPEG or WebP image.
---

# Avatar preparation and reviewed changes

1. Discover the current command and its review requirements with `deepseekbot capabilities` in Tob's eligible Shell execution. Resolve the exact Bot or Group. Existing Bot changes start with `deepseekbot show <bot-id>`; Group changes start with `deepseekbot channel <group-channel-id>`.
2. Prepare a readable local PNG, JPEG or WebP image. Sources may be at most 5 MB (5,000,000 bytes), with at most 40 million decoded pixels. Animated images and other formats are refused. Keep the subject centered and suitable for a square avatar; the CLI does not provide an interactive crop. Supply the file path, not base64 image text, a remote URL or an HTML file. The source file is preserved.
3. The CLI decodes the image, applies its orientation, fits it within 1024 × 1024 pixels without enlargement and compresses it to WebP. It reduces quality and dimensions when needed. Bot output is at most 128 KiB (131,072 bytes); Group output is at most 98,286 bytes, within the existing 96 KiB and data-URL limits. Do not reject a valid source merely because its original file is larger than the stored-avatar limit, or ask the Human to compress it manually first.
4. Use the applicable discovered command:
   - New Bot: `deepseekbot create --name <name> --avatar-file <path>` plus its required creation metadata and stable operation key. An avatar request alone does not authorize creating another Bot.
   - Existing Bot: `deepseekbot bot-avatar-set <bot-id> --file <path> --expected-profile <profileFingerprint>` in scoped Tob execution.
   - Group: `deepseekbot group-avatar-set <group-channel-id> --avatar-file <path> --expected-channel <channelFingerprint>` in scoped Tob execution.
   - Clear an avatar only when requested, using the same command's `--clear` option and reviewed fingerprint.
5. Retain the existing Human review and native file-access checks. After `stale-profile` or `stale-channel`, read again and prepare a new review. After an uncertain write, read the current target before proposing another mutation. A changed snapshot does not authorize overwriting someone else's change.
6. Read the target back through the supported CLI and report the verified result. A stored avatar readback proves persistence; rendered appearance and Human approval of the composition are separate checks.

If normalization refuses an image, report the coded failure and prepare another valid source within the same authorized request. Do not bypass size, decoder, file-access or approval checks. Guidance is versioned with the installed package; it does not make an unavailable command or target available.
