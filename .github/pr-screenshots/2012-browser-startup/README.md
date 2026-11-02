# Browser cold-start comparison

1440 × 1100, English, dark, task-created PersonaBots and the same deterministic loopback fixture.

- Before: source `0f9f690071c5345eed4427bdcc5ad2471ff77474`, a successful baseline attempt. The intermittent failure was not reproduced in this capture. It is not a screenshot of the startup 404.
- After: source `cd39d08994765058ca1a5d19cf6ad2d0a10d22dc`, real panel/CLI lifecycle without Reconnect, no HTTP/console error, screenshot/ARIA/frame inspected.
- The layout is deliberately unchanged. See the PR's immutable evidence packet for the original failing run, the deterministic red regression and refreshed evidence on the final PR head. Short-lived waiting/error copy is covered by executed viewer-script tests; these pictures only show the completed user path.

The fixture URL is historical correlation data, not a reviewer service. Bot names and preset artwork differ because each attempt creates its own disposable PersonaBot. Human QA is separate and not run.
