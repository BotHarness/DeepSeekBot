import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const releaseCss = {
  releaseNote: `.bh-release-note {
  min-width: 0;
}
.bh-release-note-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  padding: ${space.x3} 0;
  cursor: pointer;
  list-style: none;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.bodyLine};
}
.bh-release-note-head::-webkit-details-marker {
  display: none;
}
`,
  releaseNoteReleaseNoteHead: `.bh-release-note[open] > .bh-release-note-head::before {
  transform: rotate(45deg);
}
.bh-release-note-head:hover .bh-release-note-version {
  color: var(--bh-accent, var(--tobs-accent-solid));
}
.bh-release-note-version {
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  color: var(--tobs-ink-primary);
}
`,
  releaseNoteCount: `.bh-release-note-count {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.bh-release-note-body {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding: ${space.x1} 0 ${space.x4} ${space.x5};
}
.bh-release-note-summary {
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
}
.bh-release-note-entries {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: ${space.x3} ${space.x3};
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-release-note-entries > li {
  display: contents;
}
.bh-release-note-chip {
  justify-self: stretch;
  justify-content: center;
  margin-top: ${space.x1};
  white-space: nowrap;
}
.bh-release-note-text {
  min-width: 0;
  font-size: ${text.bodySize};
  color: var(--tobs-ink-primary);
}
.bh-release-site-button {
  margin-right: auto;
}
.bh-release-update {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  margin: ${space.x4} 0 ${space.x2};
  padding: ${space.x4} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
}
.bh-release-update-title {
  margin-right: auto;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  color: var(--tobs-ink-primary);
}
`,
};
