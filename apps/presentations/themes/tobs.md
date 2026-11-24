# Tobs

Brand theme for Tobs decks. Colours come from Tobs core, the same values the app, the docs site, the marketing site and the promo kit use, so a brand change reaches every deck from one place.

## Palette

Import the generated values; never copy hex codes by hand, except the one accent literal below:

```tsx
import type { DesignSystem } from '@open-slide/core';
import { tobsCore } from '../../themes/tobs-core.generated';

const core = tobsCore.light; // or tobsCore.dark for a dark deck
```

- `design.palette.accent` must be a literal, so write the current `tobsCore.<mode>.brand` value there. `scripts/test/site-colors.test.mjs` and `node scripts/generate-tokens.mjs --check` keep the generated file current; re-copy the accent when the brand changes.
- Extra colours (status, accent families, filled-button ink) are plain constants read from `core`: `core.success`, `core.warning`, `core.danger`, `core.info` and their `*Tint` fills; `core.accentForestGreen`, `core.accentMistPurple`, `core.accentWarmAmber`; `core.onSolid` for text on a `core.brand` fill.
- Neutral ground and ink are the deck's own choice.

`themes/tobs-core.generated.ts` is written by `node scripts/generate-tokens.mjs` from `design/tokens/tobs.resolver.json`. Do not edit it.
