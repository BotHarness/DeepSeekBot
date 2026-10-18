# Tob CLI approval evidence

Real DSH 0.2.0-rc.2 captures for #2087. The before image comes from the still-running #2085 Web Host; after images come from an isolated candidate Web Host and the actual macOS Desktop. The images crop the rendered operation and decision controls, excluding machine-local working directories. The before crop uses the real Companion approval card because the old timeline did not catch up; after crops use the message timeline. The comparison shows operation payloads and approval controls, not a layout redesign. The before request was denied and its original value/revision remained unchanged. No mock UI or synthetic screenshot is used.

The new approval reviews the parsed CLI namespace, global scope, old value, patch and expected revision, linked to the real native Shell call. It does not approve a setting based only on the Shell command string.

Verified separately through Web and macOS Desktop:

- Home submission produces a real model reply backed by native Shell → `deepseekbot capabilities` / `settings`.
- Approve once changes the canonical native setting and returns its revision/value.
- Denial leaves the setting unchanged and returns `approval-denied` in the Shell result.
- While approval is pending, an independent Human CLI update changes the setting. Approving the old proposal returns `stale-setting` and preserves that independent update.
- Restarting the same isolated Profile preserves the setting; a fresh Shell can read it.

The initial development-model quota failure and automation targeting/scroll failures were retained locally. They are not counted as passing attempts. Main Desktop was restored after isolated native checks. Human visual review and merge of this PR remain pending.
