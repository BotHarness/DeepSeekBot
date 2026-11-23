import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { marketplaceCss } from './styles.js';
import { skillsCss } from '../skills/styles.js';

export const MARKETPLACE_CATALOG_CSS = [
  marketplaceCss.marketSubmit,
  `.bh-market-topic {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  height: 24px;
  padding: 0 ${space.x3};
  border: 0;
  border-radius: ${radius.md};
  background: ${color.surface};
  color: var(--tobs-ink-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  cursor: pointer;
}
`,
  marketplaceCss.marketTopic,
  `.bh-market-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-content: start;
  gap: ${space.x4};
  max-height: min(54vh, 560px);
  overflow-y: auto;
  padding: ${space.x1};
}
`,
  marketplaceCss.marketStack,
  `.bh-market-panel > .bh-market-browse > :first-child { flex-basis: 160px; }
`,
  marketplaceCss.marketPanel,
  `.bh-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  align-content: start;
  gap: ${space.x3};
}
`,
  marketplaceCss.marketPanelFooter,
  `.bh-market-carousel {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: min(240px, 80%);
  gap: ${space.x3};
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
`,
  marketplaceCss.marketCarousel,
  `button.bh-market-file:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: -2px; }
`,
  marketplaceCss.marketFilesHead,
  `.bh-market-file-bar {
  display: flex;
  gap: ${space.x1};
  height: 8px;
  overflow: hidden;
  border-radius: ${radius.xs};
}
.bh-market-file-bar i { flex-basis: 0; min-width: 4px; height: 100%; }
`,
  marketplaceCss.marketFileLegend,
  `.bh-market-file-legend i { width: 8px; height: 8px; border-radius: ${radius.xs}; }
`,
  marketplaceCss.marketFiles,
  skillsCss.skillRow,
  `.bh-file-preview {
  max-height: min(64vh, 560px);
  overflow-y: auto;
  min-width: 0;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
}
.bh-skill-row:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: -2px; }
`,
  skillsCss.skillRowName,
  `.bh-market-reader-code {
  max-height: min(56vh, 480px);
  margin: 0;
  overflow: auto;
  padding: ${space.x3} ${space.x4};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-well);
  font-family: ${font.familyMono};
  font-size: ${text.metaSize};
  line-height: ${text.bodyLine};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`,
  marketplaceCss.marketFileName,
  `/* A profile card: banner on top, the Bot's avatar half over its lower edge, identity below. */
.bh-market-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  padding: ${space.x3} ${space.x3} ${space.x3};
  border-radius: ${radius.lg};
  background: var(--tobs-layer-raised);
  transition: border-color 120ms ease, transform 120ms ease;
}
`,
  marketplaceCss.marketRow,
  `@media (hover: hover) and (pointer: fine) {
  html:not([data-botharness-motion='reduce']) .bh-market-row:hover { transform: translateY(-1px); }
}
`,
  marketplaceCss.marketRowMarketBannerThumb,
  `/* The avatar rides half over the banner; name, repository and Install sit beside it. */
.bh-market-row-head {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: ${space.x3};
  min-width: 0;
  margin-top: -32px;
  padding: 0 ${space.x2} 0 ${space.x3};
}
`,
  marketplaceCss.marketRowHead,
  `.bh-market-hero > .bh-market-row-head { margin-top: -36px; padding-left: ${space.x4}; }
`,
  marketplaceCss.marketHero,
  `.bh-market-github {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  background: var(--tobs-layer-raised);
  color: var(--tobs-ink-primary);
}
`,
  marketplaceCss.marketGithub,
  `.bh-market-github:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-market-readme {
  max-height: min(56vh, 480px);
  overflow-y: auto;
  padding-top: ${space.x4};
  border-top: ${border.hairline} solid ${color.divider};
  min-width: 0;
}
`,
  marketplaceCss.marketReadme,
  `.bh-market-report textarea:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
`,
  marketplaceCss.marketConfirm,
  `.bh-market-facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: ${space.x4};
}
`,
  marketplaceCss.marketFacts,
  `.bh-market-review-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${color.accent};
  animation: bh-market-review-pulse 1.2s ease-in-out infinite;
}
@keyframes bh-market-review-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
html[data-botharness-motion='reduce'] .bh-market-review-pulse { animation: none; }
`,
  marketplaceCss.marketReviewResult,
  `.bh-market-finding {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: ${space.x3};
  align-items: start;
}
.bh-market-finding-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: ${radius.sm};
  background: ${color.surface};
  color: ${color.danger};
}
`,
  marketplaceCss.marketFindingIcon,
].join('');
