import { radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';

export const skillsCss = {
  skillRow: `.bh-skill-row {
  display: flex;
  align-items: baseline;
  gap: ${space.x3};
  width: 100%;
  min-width: 0;
  margin: 0 -${space.x2};
  padding: ${space.x2};
  box-sizing: content-box;
  border: 0;
  border-radius: ${radius.xs};
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.bh-skill-row:hover { background: var(--tobs-state-hover); }
.bh-skill-row-chevron {
  display: inline-flex;
  flex-shrink: 0;
  align-self: center;
  margin-left: auto;
  color: var(--tobs-ink-tertiary);
}
.bh-skill-row:hover .bh-skill-row-chevron { color: var(--tobs-ink-secondary); }
`,
  skillRowName: `.bh-skill-row-name {
  flex-shrink: 0;
  font-family: ${font.familyMono};
  font-weight: ${text.strong};
  overflow-wrap: anywhere;
}
.bh-skill-row-description {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.metaSize};
  color: var(--tobs-ink-secondary);
}
.bh-skill-detail, .bh-skills-card, .bh-market-skills, .bh-skill-confirm {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-skill-detail-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${space.x2};
  min-width: 0;
  margin-left: -${space.x2};
}
.bh-skill-detail-path {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ${font.familyMono};
  font-size: ${text.metaSize};
  color: var(--tobs-ink-tertiary);
}
.bh-skill-detail-description { margin: 0; color: var(--tobs-ink-secondary); }
.bh-market-reader {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-reader-head {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  margin-left: -${space.x2};
}
.bh-market-reader-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: ${font.familyMono};
  font-weight: ${text.strong};
  text-overflow: ellipsis;
  white-space: nowrap;
}
`,
};
