# Group Members split and Channel icon

- Before: `480e99eaad7627d37fdd3ae16fabd918eda07dbd`; after: this PR’s explicit horizontal split and single-person Channel icon.
- Actual isolated DSH rc.2 Web Client with a real QA Group created via `channelCreate`; no response fixtures or model messages in this journey.
- English; dark/light at 1440 × 1000. Compact after view is 1000 × 850.
- Enter Bot mode → select the QA Group → click Members in the Messages header. Before, computed flex direction was column and Members appeared below Messages; after, direction is row, both share top/height and Members lies to the right.
- Drag the vertical divider, refresh, reselect the Group: saved ratio survives (30% → approximately 39.84%). Resize the window, confirm the same proportional width, then close Members through its header toggle.
- `results.json` contains runtime geometry and the canonical localStorage member preference. No page errors. Native Desktop was not rerun.
- Channel header and control-rail switch now show one person; the Members action retains two people.
