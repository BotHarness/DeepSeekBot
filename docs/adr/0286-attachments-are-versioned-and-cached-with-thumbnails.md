# ADR-0286: Attachments are content-versioned, cached as immutable, and served with thumbnails

- Status: Accepted
- Date: 2026-11-05
- Issue: #3507 (hub #3505)
- Supersedes: the `no-store`, no-thumbnail and no-media-catalog rules of ADR-0137

## Context

ADR-0137 served every image preview with `no-store` and full-size bytes, and kept no cached copy on a client. A phone that opens a Channel with many images downloads every original again on each visit, and a Channel media grid downloads full-size originals for tiles that are 100 points wide. The Human chose (#3505) to keep the Host as the source of truth and to version media so that clients can cache it, with thumbnails made by the Host.

## Decision

**Version.** Each Attachment file has a content version: the first 32 hex characters of its sha256. The Host keeps it, with the image width, height and thumbhash, in a sidecar `media/facts.json` next to the file. The sidecar records the file size and modification time; when either changes (for example after "edit original"), the sidecar is stale and the Host computes it again in the background. A message's Attachment refs carry `version`, `width`, `height` and `thumbhash` once they are known. A ref without a version keeps the old unversioned behaviour.

**Thumbnails.** The Host makes WebP thumbnails with sharp in three variants: `96c` (96 px square crop), `320` and `800` (fit inside). They are made on first request and kept as `media/<version>-<variant>.webp`. Inputs over 50 megapixels, animated frames after the first, and files that are not PNG, JPEG, GIF or WebP get no thumbnail. sharp is optional: when it cannot load, the Host serves originals only.

**Backfill (#3514).** Attachments stored before this change get their version, dimensions and thumbhash from a background job that starts two minutes after the Host starts and then runs daily. It processes one file at a time and rests four times as long as it worked, so it uses at most a fifth of one core. It skips files whose sidecar is current, so a stopped or restarted Host resumes where it left off. Thumbnail variants are still made on first request.

**HTTP.** A request with `v` (and optionally `variant`) is checked against the same Channel and message ownership as before. If `v` is the current version, the response is `private, max-age=31536000, immutable` with an ETag, and a matching `If-None-Match` gets 304. If `v` is old, the response is 409 `{error: "stale-version", version}` with `no-store`, so a client never caches an old file under a new name. A thumbnail of a non-image is 422. A versioned original also answers a single `Range` with 206, `Content-Range` and the same immutable headers, so downloads resume and media players seek (#3508); a range outside the file is 416. The device gateway forwards `Range` and the 206 answer unchanged. Requests without `v` keep ADR-0137's `no-store` behaviour.

**Clients.** The phone shows the `800` preview in chat bubbles and the `320` thumbnail in the Channel media grid, each with its thumbhash placeholder, and keeps downloaded versions in its cache directory under `fileId:version[:variant]`. The full-screen viewer, Share, Open and voice playback reuse the same versioned file, so a second open downloads nothing; at most three downloads at a time with shared in-flight requests. Profile backup excludes `media/`, because it can be rebuilt.

**Purge reaches the phone (#3509).** Every purged placement the Host sends carries the purged `fileIds`. The roster `baseline` frame repeats every purge on each subscribe, so a phone that was offline catches up on reconnect without a separate tombstone cursor or retention window; the phone applies each purge once per launch. Media cache keys start with the Host id (`<hostId>/<fileId>:<version>[:<variant>]`), and every versioned image, on direct and encrypted routes alike, is stored in the app's own media directory rather than the image library's disk cache, so it can be deleted by key. Applying a purge deletes that file's cached versions and shared copies, blanks the message in the conversation tail cache and in any open conversation, and never touches another Host's entries. Unpairing a Host, or the Host revoking the phone, deletes that Host's whole media namespace and tail cache. Bot deletion keeps the Bot's Channel history on the Host, so it removes nothing from the phone.

## Consequences

Repeat visits read images from the phone's disk, and grids download thumbnails of a few kilobytes instead of originals. An edited original gets a new version, so stale copies are never shown. The sidecars and thumbnails use disk space on the Host; they are removed with their Attachment file. No bridge method is added, so no CLI command is added. Change cursors, tombstones and purge reaching device caches follow in later slices of #3505.
