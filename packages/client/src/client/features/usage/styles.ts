import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const usageCss = {
  profileCardTotal: `.bh-profile-card-total {
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-profile-card-compact .bh-profile-card-total {
  font-size: ${text.bodySize};
}
`,
  profilePin: `.bh-profile-pin:hover {
  background: var(--bh-hover);
  color: var(--tobs-ink-primary);
}
.bh-profile-pin[aria-pressed='true'] {
  color: ${color.accentText};
}
.bh-profile-heat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-profile-heat-scroll {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.bh-profile-heat[data-compact='true'] .bh-profile-heat-scroll { overflow-x: hidden; }
.bh-profile-heat-cell[data-level='before'] { visibility: hidden; }
.bh-profile-tip-head { display: flex; gap: ${space.x3}; align-items: baseline; }
.bh-profile-tip-line { color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
`,
  profileHeatCell: `.bh-profile-heat-cell {
  border-radius: ${radius.xs};
  background: var(--tobs-state-hover);
}
button.bh-profile-heat-cell {
  padding: 0;
  border: 0;
  appearance: none;
}
`,
  profileHeatCellLevels: `.bh-profile-heat-cell[data-level='1'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 28%, var(--tobs-state-hover));
}
.bh-profile-heat-cell[data-level='2'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 50%, var(--tobs-state-hover));
}
.bh-profile-heat-cell[data-level='3'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 72%, var(--tobs-state-hover));
}
.bh-profile-heat-cell[data-level='4'] {
  background: var(--bh-bot-color, var(--bh-accent));
}
.bh-profile-heat-cell[data-level='future'] {
  background: transparent;
}
.bh-profile-empty {
  font-size: ${text.metaSize};
  color: var(--tobs-ink-tertiary);
}
.bh-profile-reason-count {
  font-variant-numeric: tabular-nums;
  color: var(--tobs-ink-primary);
}
.bh-profile-bar-chart {
  width: 100%;
}
.bh-profile-bar-chart svg {
  display: block;
}
.bh-profile-token-shares {
  font-size: ${text.metaSize};
  color: var(--tobs-ink-secondary);
}
.bh-model-usage {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding-top: ${space.x4};
  border-top: ${border.hairline} solid ${color.divider};
}
.bh-model-usage-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x4};
}
.bh-model-usage-header label {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  color: var(--tobs-ink-secondary);
}
.bh-model-usage-header select { width: auto; }
.bh-model-usage-header label { white-space: nowrap; }
.bh-model-usage-header input {
  width: auto;
}
.bh-model-usage-overview {
  border-top: 0;
  padding-top: 0;
}
.bh-model-usage-range {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x4};
}
.bh-model-usage-range label {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-model-usage-range input { width: auto; }
.bh-usage-model-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: ${space.x4}; }
.bh-usage-range-controls { display: flex; align-items: center; gap: ${space.x2}; margin-left: auto; }
.bh-usage-totals { display: flex; flex-wrap: wrap; align-items: baseline; gap: ${space.x2} ${space.x4}; }
.bh-usage-daily > .bh-usage-legend { margin-bottom: ${space.x2}; }
.bh-usage-grouping { display: inline-flex; padding: ${space.x1}; gap: ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; }
.bh-usage-grouping button { border: 0; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x3}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-usage-grouping button[aria-pressed="true"] { background: var(--tobs-state-hover); color: var(--tobs-ink-primary); }
.bh-usage-grouping button:hover { color: var(--tobs-ink-primary); }
`,
  usageDaily: `.bh-usage-daily, .bh-usage-models { display: grid; gap: ${space.x4}; }
.bh-usage-axis-labels { display: flex; justify-content: space-between; font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
.bh-usage-model-plot { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: ${space.x5}; }
`,
  usageModelLabel: `.bh-usage-model-label > span { min-width: 0; line-height: ${text.metaLine}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-usage-model-label strong { flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-usage-measures { display: grid; gap: ${space.x1}; margin: ${space.x2} 0 0; font-size: ${text.metaSize}; font-variant-numeric: tabular-nums; }
.bh-usage-measures > div { display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-usage-measures dt { color: var(--tobs-ink-secondary); }
.bh-usage-measures dd { margin: 0; }
.bh-usage-cached-measure { padding-left: ${space.x3}; }
.bh-usage-legend { display: flex; flex-wrap: wrap; gap: ${space.x5}; font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
.bh-usage-legend span { display: inline-flex; align-items: center; gap: ${space.x2}; }
`,
  usageLegend: `.bh-usage-legend i[data-series="cached"] { background: var(--bh-accent); }
.bh-usage-legend i[data-series="uncached"] { background: var(--bh-chart-read-dim); }
.bh-usage-legend i[data-series="output"] { background: var(--bh-chart-output); }
.bh-usage-legend i[data-series="unclassified"] { background: var(--tobs-ink-tertiary); }
.bh-usage-tone-legend { gap: ${space.x4}; font-weight: ${text.regular}; }
.bh-usage-tone-legend i { background: var(--tobs-ink-primary); }
.bh-usage-tone-legend i[data-tone="uncached"] { opacity: 0.62; }
.bh-usage-tone-legend i[data-tone="output"] { opacity: 0.36; }
.bh-usage-identity-chart { min-width: 0; }
`,
  usageDetails: `.bh-usage-details summary { cursor: pointer; padding: ${space.x4} 0; color: var(--tobs-ink-secondary); }
.bh-usage-details summary:hover, .bh-usage-details summary:focus-visible { color: var(--tobs-ink-primary); }
.bh-usage-details > div { display: grid; gap: ${space.x4}; }
.bh-usage-table-scroll { overflow-x: auto; }
.bh-usage-day-table { width: 100%; border-collapse: collapse; font-size: ${text.metaSize}; }
.bh-usage-day-table th, .bh-usage-day-table td { padding: ${space.x3}; text-align: left; font-variant-numeric: tabular-nums; border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-usage-day-table caption { text-align: left; padding-bottom: ${space.x3}; color: var(--tobs-ink-secondary); }
.bh-profile-heat-grid {
  position: relative;
}
`,
  usageCharts: `/* TanStack's tooltip container carries its own chrome; the inner
   .bh-profile-chart-tip is the single surface, so neutralise the outer one. */
.ts-chart-tooltip {
  --ts-chart-tooltip-padding: 0;
  --ts-chart-tooltip-border: 0;
  --ts-chart-tooltip-background: transparent;
  --ts-chart-tooltip-shadow: none;
}
`,
  profileTipDay: `.bh-profile-tip-day {
  color: var(--tobs-ink-secondary);
}
.bh-profile-tip-value {
  color: var(--tobs-ink-primary);
}
.bh-profile-tip-rows {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-profile-tip-rows li {
  display: flex;
  justify-content: space-between;
  gap: ${space.x5};
}
.bh-profile-tip-shares {
  color: var(--tobs-ink-secondary);
}
`,
  overviewUsage: `.bh-overview-usage {margin-top:${space.x4};min-width:0;container-type:inline-size;}
.bh-overview-usage h3 {margin:0;font-weight:${text.regular};}
/* Home uses the same flat surface, inset and rounding as conversation approval cards. */

.bh-overview-usage .bh-profile-card-head {flex-wrap:wrap;}
.bh-overview-usage-controls {display:flex;flex-wrap:wrap;align-items:center;gap:${space.x3};min-width:0;}
.bh-overview-usage .bh-usage-grouping button {white-space:nowrap;}
@container (max-width: 320px) {.bh-overview-usage .bh-usage-grouping button {padding:${space.x2};}}
.bh-overview-usage .bh-note {margin:0;}
.bh-overview-usage-period {padding:0;}
.bh-overview-usage .bh-usage-model-label {gap:${space.x2};}
.bh-overview-usage-bot-name {flex:1;}
.bh-overview-usage-bot-name > span {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-usage-bot-name > span + span {color:var(--tobs-ink-secondary);}
.bh-overview-usage .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--tobs-ink-secondary);}
.bh-overview-usage .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
.bh-overview-usage .bh-profile-pin:disabled {cursor:default;opacity:0.5;}
.bh-statistics-content > header h3 {font-size:${text.bodySize};margin:0;}
`,
};
