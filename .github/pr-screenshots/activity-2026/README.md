# Activity Center review captures

- Before: real original Activity Inbox, Chinese/dark, 900 × 1000, captured before implementation.
- After: source revision `2a6c7ed6d74fbcc784d1d366d8753b84182f2a63`, real isolated Host, Chinese/dark. Page is 900 × 1000; Dock/search are 1440 × 1000.
- These captures use disposable QA Bots and actual native pending bash approval requests. No authentication URL, credential or absolute private user path is included. The command uses a literal `$HOME` variable and targets only the ignored task QA directory.
- The original Bot request was consumed during approval verification. After captures use its replacement request; Bot names, timestamps and unread totals differ. The merged Panel shell redesign (#2027) also changed the surrounding desktop layout. Compare the Activity content, not unrelated shell geometry.
- A publishable original Dock capture is unavailable: it includes the private absolute QA path in the adjacent conversation. `before-page.png` shows the original shared Inbox renderer. Use `after-dock.png` for the resulting narrow Panel layout.
- Final browse verification exercised three section toggles, persisted collapse, positive and empty search, Escape focus return, history/sort menu, wide and narrow Dock, page fallback and both themes. Canonical decisions/read state were unchanged and browser errors were empty.
- Original first-slice live proof exercised allow/reject, a refused response followed by retry, canonical decision records and the exact QA file effect. This is distinct from the final non-consuming browse run. Focused source tests cover the current approval/failure/expiry paths.
- Historical idle-Overview verification remains archived as a retired behavior; its live journey cannot qualify this new UI.
