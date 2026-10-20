---
Status: Accepted
Date: 2026-10-20
---

# Marketplace listings localize author-first, with generated summaries as the fallback

Readers asked for Bot Marketplace listings in Chinese, while most listed Bots are written in English. The Marketplace stays an open GitHub-indexed catalog (ADR-0131): nobody curates entries, so a catalog that requires a translation for every entry, as curated plugin directories do, is not available. The Human chose author-first localization with a generated fallback.

Authors own their words. A repository may add `README.zh-CN.md` (or `README.zh.md`) and `README.en.md` next to `README.md`, and an `i18n` map in `.botharness/bot.json` with a translated `name` and `bio` per language. The Worker stores these with the rest of the presentation after each push and serves them when a reader asks with `lang=zh|en`; without `lang` every response is unchanged. Chinese and English are the only Marketplace languages for now, matching the product's two interface languages.

When a reader's language has no author bio, the Worker shows a one-sentence summary it generated in that language from the name, description, bio, tags and README. The model runs through the project's OpenCode Go key. Go's free models come and go, so the Worker does not pin one: each run lists Go's models, tries every `-free` model, keeps whichever worked last first, and falls back to the paid `deepseek-v4.1-flash` only when no free model answers. Summaries therefore rarely draw on the paid quota the Bots use. Summaries run on the hourly refresh rather than on submission, so pasting a URL stays fast, and are cached by a hash of their input and the configured model list so an unrelated push does not pay for another call. A push or a change to the GitHub description makes a listing due for a check. A listing whose summary fails three times is left alone until its next push, so one listing the model keeps refusing cannot hold up the rest. They are marked `bioGenerated` so readers can tell them apart, and any author text in that language replaces them. The README body is never machine-translated: a wrong translation of instructions is worse than English.

The listing is untrusted text sent to a model. The prompt says so, the output is accepted only as one short sentence in the expected language, and the cost is bounded per run. Summaries need a model key on the Worker and are off without one; the catalog keeps working on author text alone.
