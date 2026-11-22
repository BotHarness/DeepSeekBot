import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { usageCss } from './styles.js';
import { sharedCss } from '../../shared-styles.js';

export const PROFILE_USAGE_CSS = [
  usageCss.profileCardTotal,
  `.bh-profile-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-tertiary);
  cursor: pointer;
}
`,
  usageCss.profilePin,
  `.bh-profile-heat-grid {
  width: max-content;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 10px);
  grid-auto-columns: 10px;
  gap: ${space.x1};
}
.bh-profile-card-compact .bh-profile-heat-grid {
  grid-template-rows: repeat(7, 8px);
  grid-auto-columns: 8px;
}
`,
  usageCss.profileHeatCell,
  `button.bh-profile-heat-cell:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 1px;
}
`,
  usageCss.profileHeatCellLevels,
  `.bh-usage-grouping button:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
`,
  usageCss.usageDaily,
  `.bh-usage-model-label { height: 36px; display: flex; align-items: center; justify-content: space-between; gap: ${space.x4}; font-size: ${text.metaSize}; }
`,
  usageCss.usageModelLabel,
  `.bh-usage-legend i { width: 8px; height: 8px; border-radius: ${radius.xs}; }
`,
  usageCss.usageLegend,
  `.bh-usage-identity-marker { display: inline-block; width: 8px; height: 8px; margin-right: ${space.x2}; border-radius: ${radius.xs}; }
`,
  usageCss.usageDetails,
  `.bh-profile-heat-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  align-items: flex-start;
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-raised);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--tobs-ink-primary) 14%, transparent);
  white-space: nowrap;
  pointer-events: none;
}
`,
  usageCss.usageCharts,
  `.bh-profile-chart-tip {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-raised);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--tobs-ink-primary) 14%, transparent);
  color: var(--tobs-ink-primary);
  font: ${text.metaSize}/1.4 ${font.familySans};
}
`,
  usageCss.profileTipDay,
  sharedCss.content,
].join('');
