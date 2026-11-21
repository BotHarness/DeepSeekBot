import { border, color, radius, size, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';

export const marketplaceCss = {
  marketSubmit: `.bh-market-submit {
  display: flex;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-submit > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-hint {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-market-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
  padding: ${space.x6} 0;
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
}
.bh-market-browse {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-browse > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-browse > * {
  height: ${size.row};
  box-sizing: border-box;
}
.bh-market-browse > button { border: 0; }
.bh-market-browse [role='tab'] { height: calc(${size.row} - ${space.x3}); }
.bh-market-sort { display: flex; min-width: 0; }
.bh-market-sort-menu { display: none; }
/* The pill's StyleX height outranks plain classes; match the 32px toolbar row. */
.bh-market-sort-menu > button { height: 100% !important; }
.bh-market-topics {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2};
}
`,
  marketTopic: `.bh-market-topic:hover {
  background: var(--bh-hover);
  color: var(--tobs-ink-primary);
}
.bh-market-topic[aria-pressed='true'] {
  background: ${color.accentTint};
  color: var(--tobs-ink-primary);
  font-weight: ${text.strong};
}
.bh-market-topic-count {
  color: var(--tobs-ink-tertiary);
}
`,
  marketStack: `/* The Market dock panel: browse controls on top, then a flat grid that follows the panel width. */
.bh-market-stack { position: relative; height: 100%; min-width: 0; }
.bh-market-page {
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.bh-market-page[hidden] { display: none; }
.bh-market-panel {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-height: 100%;
  min-width: 0;
  padding: ${space.x4};
  box-sizing: border-box;
  container: bh-market / inline-size;
}
.bh-market-panel > .bh-market-browse { flex-wrap: wrap; }
`,
  marketPanel: `.bh-market-panel > .bh-market-browse > button { flex-shrink: 0; }
.bh-market-panel > .bh-market-browse > :last-child { max-width: 100%; overflow-x: auto; }
@container bh-market (max-width: 480px) {
  .bh-market-panel > .bh-market-browse > :first-child { flex-basis: 100%; }
}
/* The three sort tabs need about 330px in English; below that a menu keeps every choice reachable. */
@container bh-market (max-width: 380px) {
  .bh-market-sort > [role='tablist'] { display: none; }
  .bh-market-sort-menu { display: flex; }
}
.bh-market-panel > .bh-market-topics {
  flex-wrap: nowrap;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.bh-market-panel > .bh-market-topics > .bh-market-topic { flex-shrink: 0; white-space: nowrap; }
`,
  marketPanelFooter: `.bh-market-panel > button:last-of-type { align-self: center; }
.bh-market-sections { display: flex; flex-direction: column; gap: ${space.x4}; flex-shrink: 0; }
.bh-market-sections[hidden] { display: none; }
.bh-market-section { display: flex; flex-direction: column; gap: ${space.x2}; min-width: 0; }
.bh-market-section-title {
  margin: 0;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
}
`,
  marketCarousel: `.bh-market-carousel > .bh-market-tile { scroll-snap-align: start; }
.bh-market-tile {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: ${radius.lg};
  background: ${color.surface};
  overflow: hidden;
}
.bh-market-tile-open { display: flex; flex-direction: column; min-width: 0; }
.bh-market-tile-banner {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  background: ${color.hover};
}
.bh-market-tile-banner .bh-banner-art { width: 100%; height: 100%; }
.bh-market-tile-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: ${space.x3} ${space.x4} 0;
}
.bh-market-tile-head .bh-market-avatar { padding: 0; background: transparent; }
.bh-market-tile-head .bh-market-copy { gap: 0; overflow: hidden; }
.bh-market-tile-head .bh-market-owner {
  overflow: hidden;
  line-height: ${text.metaLine};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-tile-open:hover .bh-market-card-name { text-decoration: underline; }
.bh-market-tile > .bh-market-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 0 ${space.x4};
}
.bh-market-tile-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
  min-width: 0;
  margin-top: auto;
  padding: ${space.x2} ${space.x4} ${space.x4};
}
.bh-market-tile-foot .bh-market-installs { font-variant-numeric: tabular-nums; }
.bh-market-meta { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
.bh-market-tile-foot > button { flex-shrink: 0; border: 0; }
.bh-market-files {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  font-size: ${text.bodySize};
}
.bh-market-file-list {
  margin: 0;
  padding: 0 0 0 ${space.x4};
  list-style: none;
}
.bh-market-files > .bh-market-file-list { padding-left: 0; }
.bh-market-file-folder {
  color: var(--tobs-ink-secondary);
  font-family: ${font.familyMono};
}
.bh-market-file {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  padding: ${space.x1} 0;
}
button.bh-market-file {
  width: 100%;
  margin: 0 -${space.x2};
  padding: ${space.x1} ${space.x2};
  box-sizing: content-box;
  border: 0;
  border-radius: ${radius.xs};
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
button.bh-market-file:hover { background: var(--tobs-state-hover); }
`,
  marketFilesHead: `.bh-market-files-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.x3};
}
.bh-market-file-breakdown {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding-bottom: ${space.x2};
}
`,
  marketFileLegend: `.bh-market-file-legend {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2} ${space.x5};
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: ${text.metaSize};
  color: var(--tobs-ink-secondary);
}
.bh-market-file-legend li { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-market-file-legend strong { color: var(--tobs-ink-primary); font-variant-numeric: tabular-nums; }
`,
  marketFiles: `.bh-market-files i[data-type="markdown"] { background: ${color.accent}; }
.bh-market-files i[data-type="text"] { background: color-mix(in srgb, ${color.accent} 38%, transparent); }
.bh-market-files i[data-type="data"] { background: var(--tobs-ink-tertiary); }
.bh-market-files i[data-type="image"] { background: ${color.success}; }
.bh-market-files i[data-type="script"] { background: ${color.warning}; }
.bh-skill-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
`,
  marketFileName: `.bh-market-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--tobs-ink-primary);
  font-family: ${font.familyMono};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-file-size {
  flex-shrink: 0;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
  marketRow: `.bh-market-row:hover {
  border-color: var(--tobs-ink-tertiary);
}
`,
  marketRowMarketBannerThumb: `.bh-market-row > .bh-market-banner-thumb {
  position: relative;
  aspect-ratio: 4 / 1;
  border-radius: ${radius.md};
  background: var(--tobs-state-hover);
}
.bh-market-avatar {
  display: block;
  flex-shrink: 0;
  width: fit-content;
  padding: ${space.x1};
  border-radius: ${radius.lg};
  background: var(--tobs-layer-raised);
  line-height: 0;
}
`,
  marketRowHead: `.bh-market-row-head > button:last-child { flex-shrink: 0; }
.bh-market-row-head > .bh-market-open { gap: 0; overflow: hidden; }
.bh-market-card-name {
  overflow: hidden;
  color: var(--tobs-ink-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-row .bh-market-owner {
  overflow: hidden;
  line-height: ${text.metaLine};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-card-tags {
  display: flex;
  flex-shrink: 0;
  gap: ${space.x2};
  overflow: hidden;
}
.bh-market-row > .bh-market-description {
  display: -webkit-box;
  overflow: hidden;
  padding: 0 ${space.x2};
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bh-market-row-foot {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  margin-top: auto;
  padding: 0 ${space.x2};
}
.bh-market-row-foot .bh-market-meta { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
.bh-market-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-market-name {
  display: flex;
  align-items: baseline;
  gap: ${space.x2};
  min-width: 0;
  color: var(--tobs-ink-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
}
.bh-market-owner {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
}
.bh-market-author-avatar {
  width: 1.25em;
  height: 1.25em;
  margin-inline-end: ${space.x1};
  border-radius: 50%;
  object-fit: cover;
  vertical-align: -0.3em;
}
.bh-market-owner,
[data-market-author] {
  font-feature-settings: 'calt' 0;
}
.bh-market-description {
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
  overflow-wrap: anywhere;
}
.bh-market-generated {
  margin-left: ${space.x2};
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  white-space: nowrap;
}
.bh-market-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x2} ${space.x3};
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-market-open {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-market-open:hover .bh-market-name > :first-child {
  text-decoration: underline;
}
.bh-market-detail {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  min-width: 0;
}
.bh-market-banner,
.bh-market-banner-thumb {
  display: block;
  flex-shrink: 0;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border: ${border.hairline} solid ${color.border};
  background: var(--tobs-state-hover);
}
.bh-market-banner,
.bh-market-banner-thumb { border: 0; }
.bh-market-hero {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-market-hero > .bh-market-banner {
  position: relative;
  aspect-ratio: 5 / 1;
  border-radius: ${radius.md};
}
.bh-market-hero[data-market-banner='none'] > .bh-market-banner { display: none; }
.bh-market-hero[data-market-banner='none'] > .bh-market-row-head { margin-top: 0; }
`,
  marketHero: `.bh-market-hero > .bh-market-row-head { justify-content: space-between; }
.bh-market-hero > .bh-market-hero-name,
.bh-market-hero > .bh-market-description,
.bh-market-hero > .bh-market-meta { padding: 0 ${space.x2}; }
.bh-market-hero-name { min-width: 0; }
.bh-market-hero-name > .bh-market-name { flex-wrap: wrap; row-gap: ${space.x1}; overflow-wrap: anywhere; }
.bh-market-hero .bh-market-name { font-size: ${text.titleSize}; font-weight: ${text.strong}; line-height: ${text.titleLine}; }
`,
  marketGithub: `.bh-market-github:hover { background: var(--tobs-state-hover); }
`,
  marketReadme: `.bh-market-readme img {
  max-width: 100%;
}
.bh-market-report {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: ${space.x3} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
.bh-market-report strong {
  color: var(--tobs-ink-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-market-report label {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-market-report textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-canvas);
  color: var(--tobs-ink-primary);
  font: inherit;
}
`,
  marketConfirm: `.bh-market-confirm {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  min-width: 0;
}
.bh-market-confirm-head {
  display: flex;
  align-items: flex-start;
  gap: ${space.x4};
}
.bh-market-facts {
  display: grid;
  gap: ${space.x3};
  margin: 0;
  font-size: ${text.bodySize};
}
`,
  marketFacts: `.bh-market-facts dt {
  color: var(--tobs-ink-tertiary);
}
.bh-market-facts dd {
  margin: 0;
  color: var(--tobs-ink-primary);
  font-family: ${font.familyMono};
  overflow-wrap: anywhere;
}
.bh-market-facts a {
  color: var(--tobs-accent-solid);
}
.bh-market-review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x3};
  border-radius: ${radius.sm};
  padding: ${space.x3} ${space.x4};
  background: ${color.surface};
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
.bh-market-review[data-tone='clean'] {
  color: ${color.success};
}
`,
  marketReviewResult: `.bh-market-review-result {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-findings {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  margin: 0;
  padding: 0;
  list-style: none;
}
`,
  marketFindingIcon: `.bh-market-finding-icon[data-tone='script'] {
  color: ${color.warning};
}
.bh-market-finding-body {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  min-width: 0;
  color: var(--tobs-ink-secondary);
}
.bh-market-finding-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: ${space.x3};
}
.bh-market-finding-head strong {
  color: var(--tobs-ink-primary);
  font-weight: ${text.strong};
}
.bh-market-finding-head code {
  font-family: ${font.familyMono};
  color: var(--tobs-ink-tertiary);
  overflow-wrap: anywhere;
}

`,
};
