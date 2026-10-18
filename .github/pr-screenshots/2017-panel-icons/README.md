# Final Panel icon mapping

- Before: `cd406c9ea7d047e5791adfe416122cd17784d115`; after: the final icon refinement in this PR.
- Channels → Hash (the same Lucide geometry as the Group channel hash).
- Messages → MessagesCircle; Sessions → TextQuote. Members retains Users.
- Applied to headers, control-rail switches and corresponding empty states; the Sessions command uses TextQuote too.
- Exact glyph data comes from the locally pinned `lucide-react@1.46.0`, vendored under the existing ISC notice. No runtime dependency was added.
- Actual isolated DSH rc.2 Web Client, real QA Group, English, 1440 × 1000; dark and light selected explicitly for each pair. No response fixtures or model calls in this capture.
- Group Members right-side geometry, divider drag, refresh persistence, compact resizing and close checks were rerun with no page errors. Native Desktop was not rerun.
