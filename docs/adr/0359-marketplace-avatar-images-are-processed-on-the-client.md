---
Status: Accepted
Date: 2026-11-21
---

# ADR-0359: Marketplace Avatar images are processed on the client

## Context

Anyone who applies a Marketplace Avatar receives its image, so a published image must contain no location or other metadata and must not be a disguised file. The Marketplace Worker cannot afford to decode and re-encode every upload.

## Decision

The Web and mobile clients crop, resize and re-encode the image before publishing. The result is a square still PNG, JPEG or WebP between 256 and 512 pixels on a side, with no metadata, of at most 128 KiB (the same as the Host's Avatar limit). The Worker reads only file headers and chunk structure, and never pixels. It checks the signature, the dimensions from the header, that the image is square and within those bounds, that it is not animated (APNG, animated WebP), that it has no metadata chunk (JPEG APP1 EXIF/XMP; PNG `eXIf`, `tEXt`, `iTXt`; WebP `EXIF`, `XMP`) and its size. The Worker rejects anything that fails as unprocessed. A client that skips the checks gets refused, never silently fixed.

## Considered Options

- **Cloudflare Images binding decodes and re-encodes on the Worker.** This is the strongest guarantee, but it costs a paid dependency and Worker resources on every upload.
- **Reuse the author-profile check (signature and a 1 MiB cap only).** This is too weak for images that are redistributed to Hosts.

## Consequences

- A metadata chunk we did not list can still pass. Adding a chunk type to the reject list is the fix, not decoding on the server.
- Large lossy 512-pixel images must be compressed on the client until they fit in 128 KiB.
