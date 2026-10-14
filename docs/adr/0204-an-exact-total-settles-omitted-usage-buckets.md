---
Status: Accepted
Date: 2026-10-14
Issues: [#1787](https://github.com/BotHarness/DeepSeekBot/issues/1787)
---

# An exact total settles omitted usage buckets

ADR-0094 records a usage bucket as unknown when a provider leaves it out, even when the request's total is known, and one unknown request makes that day's bucket unknown. OpenCode Go DeepSeek routes leave out `cacheReadTokens` on a cache miss and never send `cacheWriteTokens`, so every DeepSeek Bot showed cache read and cache write as unknown and its Profile total as partial. DSH's own Session totals count the same omission as zero. A one-line DM reply that read 68,224 tokens from cache showed none of them.

## Decision

A request's reported total, once accepted (it is not below the sum of the reported buckets), settles the buckets it leaves out:

- If exactly one of uncached input, output, cache read and cache write is missing, it is the total minus the other three.
- If several are missing and the reported buckets already add up to the total, each missing bucket is zero.
- If several are missing and a remainder is left, they stay unknown, since the total cannot say how the remainder splits.

A request without a total keeps every missing bucket unknown, as before. Missing totals still stay null.

This applies to requests folded from now on. Days already recorded keep their unknown buckets: fold receipts prevent counting a request twice, so the Host does not reinterpret history it has already counted.

## What this gives up

The derived numbers are as exact as the provider's total. A provider that reports a total covering only some buckets would now show a wrong zero instead of unknown; no supported route does that today.
