import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';

export const memoryCss = {
  memoryEntry: `.bh-memory-entry {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-memory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-memory-toolbar button,
.bh-memory-editor button {
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x2} ${space.x3};
  background: var(--tobs-layer-canvas);
  color: var(--tobs-ink-primary);
  cursor: pointer;
}
.bh-memory-toolbar button { margin-left: auto; }
.bh-memory-toolbar button:hover,
.bh-memory-editor button:hover:not(:disabled) {
  background: var(--tobs-state-hover);
}
.bh-memory-editor button:disabled {
  opacity: 0.5;
  cursor: default;
}
.bh-memory-files,
.bh-memory-history {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  min-width: 0;
}
.bh-memory-row {
  width: 100%;
  border: 0;
  border-radius: ${radius.sm};
  padding: ${space.x2} ${space.x3};
  background: transparent;
  color: var(--tobs-ink-primary);
  font-size: ${text.metaSize};
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.bh-memory-row:hover {
  background: var(--bh-hover);
}
.bh-memory-row-selected {
  background: var(--bh-selected);
}
.bh-memory-editor {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-memory-editor label,
.bh-memory-history strong {
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
`,
  memoryHistory: `.bh-memory-history {
  gap: 0;
}
.bh-memory-recovery {
  display: grid;
  gap: ${space.x3};
  color: var(--tobs-ink-primary);
  font-size: ${text.bodySize};
}
.bh-memory-recovery-meta {
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
`,
  memoryRecoveryRow: `.bh-memory-recovery-row {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  width: 100%;
  padding: ${space.x2} ${space.x2};
  border: 0;
  background: transparent;
  color: var(--tobs-ink-primary);
  text-align: left;
  cursor: pointer;
}
.bh-memory-recovery-row:hover {
  background: var(--tobs-state-hover);
}
.bh-memory-recovery-row[aria-pressed='true'] {
  background: var(--bh-selected);
}
.bh-memory-recovery-main,
.bh-memory-recovery-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${space.x2};
}
    .bh-memory-recovery-archive {
    overflow-wrap: anywhere;
  }
  .bh-memory-recovery-archive > summary {
    cursor: pointer;
  }
  .bh-memory-recovery-archive code {
    display: block;
    margin-top: ${space.x2};
    user-select: all;
  }
.bh-memory-recovery-confirm p {
  flex-basis: 100%;
  margin: 0;
}
.bh-memory-graph-list {
  min-width: 0;
  overflow-x: auto;
}
`,
  memoryGraphRow: `.bh-memory-graph-row:hover {
  background: var(--tobs-state-hover);
}
.bh-memory-graph-row[aria-pressed='true'] {
  background: var(--bh-selected);
}
.bh-memory-graph-svg {
  flex: none;
  display: block;
  align-self: stretch;
  overflow: visible;
}
.bh-memory-graph-svg path {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.bh-memory-graph-svg path[data-lane='0'],
.bh-memory-graph-svg circle[data-lane='0'] { stroke: var(--tobs-accent-solid); }
.bh-memory-graph-svg path[data-lane='1'],
.bh-memory-graph-svg circle[data-lane='1'] { stroke: var(--tobs-status-warning-base); }
.bh-memory-graph-svg path[data-lane='2'],
.bh-memory-graph-svg circle[data-lane='2'] { stroke: var(--tobs-status-success-base); }
.bh-memory-graph-svg path[data-lane='3'],
.bh-memory-graph-svg circle[data-lane='3'] { stroke: var(--tobs-status-danger-base); }
.bh-memory-graph-svg circle {
  stroke-width: 1.5;
  fill: var(--tobs-accent-solid);
}
.bh-memory-graph-svg circle[data-lane='1'] { fill: var(--tobs-status-warning-base); }
.bh-memory-graph-svg circle[data-lane='2'] { fill: var(--tobs-status-success-base); }
.bh-memory-graph-svg circle[data-lane='3'] { fill: var(--tobs-status-danger-base); }
.bh-memory-graph-svg circle[data-head='true'] {
  fill: var(--tobs-layer-canvas);
  stroke-width: 2;
}
.bh-memory-graph-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: ${space.x1};
  padding: ${space.x2} 0 ${space.x3};
}
.bh-memory-graph-top {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: ${space.x2};
}
.bh-memory-graph-subject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-memory-graph-detail {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: ${space.x3};
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-memory-graph-hash {
  font-family: ${font.familyMono};
  font-variant-numeric: tabular-nums;
}
`,
  memoryRef: `.bh-memory-ref[data-current='true'] {
  background: var(--tobs-accent-tint);
  color: var(--tobs-accent-solid);
}
.bh-memory-graph-head-label {
  color: var(--tobs-accent-solid);
  font-weight: ${text.strong};
}
.bh-memory-commit-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-memory-commit-status-needs-repair {
  color: var(--tobs-status-warning-base);
}
.bh-memory-commit-status-pending {
  color: var(--tobs-ink-secondary);
}
.bh-memory-graph-more {
  border: 0;
  background: transparent;
  padding: ${space.x3} ${space.x2};
  color: var(--tobs-ink-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-memory-graph-more:hover {
  color: var(--tobs-ink-primary);
}
`,
  memoryLoadFeedback: `.bh-memory-load-feedback {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-memory-retry {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.bh-memory-retry:disabled {
  cursor: default;
  opacity: 0.5;
}
.bh-memory-working-list { display: flex; flex-direction: column; gap: ${space.x3}; padding: ${space.x3} 0; }
.bh-memory-change-group { min-width: 0; }
.bh-memory-change-heading { display: flex; align-items: center; gap: ${space.x2}; width: 100%; border: 0; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x1}; background: transparent; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; text-align: left; cursor: pointer; }
.bh-memory-change-heading:hover { background: var(--bh-hover); }
.bh-memory-change-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.bh-memory-change-rows { display: flex; flex-direction: column; gap: ${space.x1}; }
.bh-memory-change-rows .bh-memory-row { display: flex; align-items: center; gap: ${space.x3}; padding-left: ${space.x3}; }
`,
  memoryChangeBadge: `.bh-memory-change-badge[data-status='new'], .bh-memory-change-badge[data-status='A'], .bh-memory-change-badge[data-status='U'] { color: var(--tobs-status-success-base); }
.bh-memory-change-badge[data-status='deleted'], .bh-memory-change-badge[data-status='D'] { color: var(--tobs-status-danger-base); }
.bh-memory-change-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-file-path-button { padding: 0; border: 0; border-radius: ${radius.xs}; background: transparent; text-align: left; cursor: pointer; font: inherit; }
.bh-file-path-button:hover { text-decoration: underline; }
`,
  memoryDiffFileAction: `.bh-memory-diff-file-action { display: inline-flex; flex: none; margin-left: auto; }
.bh-memory-diff-stat + .bh-memory-diff-file-action { margin-left: 0; }
.bh-file-open[data-default="unavailable"] .bh-file-open-main { color: var(--tobs-ink-secondary); }
`,
  fileOpenAnchor: `.bh-file-open-anchor { position: relative; display: inline-flex; flex: none; }
`,
  fileOpenAnchorFileActionFeedback: `.bh-file-open-anchor > .bh-file-action-feedback.bh-error { border-color: color-mix(in srgb, var(--tobs-status-danger-base) 45%, transparent); color: var(--tobs-status-danger-base); }
.bh-file-path-open > .bh-file-path-button { min-width: 0; overflow-wrap: anywhere; }
.bh-message-file .bh-file-open { border-color: color-mix(in srgb, currentColor 18%, transparent); color: inherit; }
.bh-message-file .bh-file-open-more { border-left-color: color-mix(in srgb, currentColor 18%, transparent); color: inherit; }
.bh-message-file .bh-file-open-main:hover:not(:disabled), .bh-message-file .bh-file-open-more:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-file .bh-file-open-main:focus-visible, .bh-message-file .bh-file-open-more:focus-visible { outline-color: currentColor; }
`,
  fileActionFeedback: `.bh-file-action-feedback { font-size: ${text.metaSize}; }
`,
  memoryCommitView: `.bh-memory-commit-view { flex: 1; min-height: 0; overflow: auto; padding: 0 ${space.x4} ${space.x4}; color: var(--tobs-ink-primary); }
`,
  memoryViewIconButton: `.bh-memory-view-icon-button:hover { background: var(--tobs-state-hover); color: var(--tobs-ink-primary); }
`,
  memoryCommitHeader: `.bh-memory-commit-header > .bh-memory-view-icon-button:last-child { margin-left: auto; }
.bh-memory-graph-row[data-expanded='true'] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.bh-memory-graph-panel { display: flex; gap: ${space.x3}; padding: 0 ${space.x2}; border-radius: 0 0 ${radius.sm} ${radius.sm}; background: var(--bh-selected); }
.bh-memory-graph-rail { position: relative; flex: none; overflow: hidden; }
.bh-memory-graph-rail svg { position: absolute; inset: 0; height: 100%; }
.bh-memory-restore-offer { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; min-width: 0; padding-bottom: ${space.x3}; }
.bh-memory-restore-title { display: flex; align-items: center; gap: ${space.x2}; }
.bh-memory-restore-done { display: flex; align-items: center; gap: ${space.x2}; }
.bh-memory-restore-note > span { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-memory-version-list { display: flex; flex-direction: column; gap: ${space.x1}; min-width: 0; }
.bh-memory-version-row { display: flex; flex-direction: column; align-items: stretch; gap: ${space.x1}; width: 100%; padding: ${space.x3} ${space.x3}; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-primary); text-align: left; cursor: pointer; }
.bh-memory-version-row:hover { background: var(--bh-hover, var(--bh-selected)); }
.bh-memory-version-row[data-expanded='true'] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; background: var(--bh-selected); }
.bh-memory-version-name { font-weight: ${text.strong}; font-size: ${text.bodySize}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-name:not([data-branch])::before { content: '★ '; color: var(--tobs-status-success-base); }
.bh-memory-version-subject { overflow: hidden; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-panel { margin-top: -${space.x1}; padding: 0 ${space.x3} ${space.x3}; border-radius: 0 0 ${radius.sm} ${radius.sm}; background: var(--bh-selected); }
.bh-memory-restore-actions { display: flex; flex-wrap: wrap; gap: ${space.x2}; flex-basis: 100%; }
`,
  memoryVersion: `.bh-memory-version::before { content: '★ '; }
`,
  memoryVersionChip: `.bh-memory-version-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-chip > button { border: 0; background: transparent; color: var(--tobs-ink-secondary); cursor: pointer; font-size: ${text.titleSize}; line-height: 1; padding: 0 ${space.x2}; }
.bh-memory-restore-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: ${space.x3}; min-width: 0; padding-bottom: ${space.x3}; }
.bh-memory-restore-note { display: flex; flex-direction: column; flex-basis: 100%; gap: ${space.x2}; min-width: 0; color: var(--tobs-ink-secondary); }
.bh-memory-restore-confirm p { flex-basis: 100%; margin: 0; color: var(--tobs-ink-secondary); }
.bh-memory-continue-form { display: flex; align-items: center; flex-wrap: wrap; gap: ${space.x3}; margin-bottom: ${space.x4}; }
.bh-memory-continue-form label { color: var(--tobs-ink-secondary); }
`,
  memoryCommitHeaderDetails: `.bh-memory-commit-header div { display: flex; flex-direction: column; min-width: 0; gap: ${space.x1}; }
.bh-memory-commit-header strong { min-width: 0; overflow-wrap: anywhere; }
.bh-memory-commit-header span { font-family: ${font.familyMono}; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
`,
  memoryGraphList: `.bh-memory-graph-list > .bh-memory-continue-form { margin: ${space.x2} 0 ${space.x3} ${space.x6}; }
.bh-topbar[data-memory-diff='true'] .bh-channel-island-wrap { display: none; }
.bh-topbar[data-channel-detail='true'] { display: none; }
.bh-memory-commit-title code { flex: none; font-family: ${font.familyMono}; font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
.bh-memory-commit-header .bh-memory-commit-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: inherit;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  color: var(--tobs-ink-primary);
}
.bh-memory-commit-files-count { margin: 0 0 ${space.x3}; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; font-weight: ${text.strong}; }
`,
  memoryDiffFileHeader: `.bh-memory-diff-file-header:hover { background: var(--tobs-state-hover); }
.bh-memory-diff-file-header::-webkit-details-marker { display: none; }
`,
  memoryDiffFile: `.bh-memory-diff-file:not([open]) .bh-memory-diff-file-header > svg { transform: rotate(-90deg); }
.bh-memory-diff-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${font.familyMono}; font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-memory-diff-stat { display: inline-flex; align-items: center; flex: none; gap: ${space.x3}; margin-left: auto; font-family: ${font.familyMono}; font-size: ${text.metaSize}; font-variant-numeric: tabular-nums; }
.bh-memory-diff-stat-add { color: var(--tobs-status-success-base); }
.bh-memory-diff-stat-remove { color: var(--tobs-status-danger-base); }
.bh-memory-diff-file[open] .bh-memory-diff-file-header { border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-memory-commit-code { overflow: auto; margin: 0 -${space.x4}; border-top: ${border.hairline} solid ${color.divider}; border-bottom: ${border.hairline} solid ${color.divider}; padding: ${space.x2} 0; font-family: ${font.familyMono}; font-size: ${text.bodySize}; line-height: 1.5; white-space: pre; }
pre.bh-memory-commit-code { padding: ${space.x3} ${space.x5}; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-memory-diff-scroll { overflow: auto; background: var(--tobs-layer-canvas); }
.bh-memory-diff-table { width: 100%; min-width: max-content; border-collapse: separate; border-spacing: 0; font-family: ${font.familyMono}; font-size: ${text.metaSize}; line-height: ${text.bodyLine}; white-space: pre; }
.bh-memory-diff-table[data-wrap="true"] { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-memory-diff-wrap-button[aria-pressed="true"] { color: var(--tobs-ink-primary); background: var(--tobs-state-hover); }
.bh-memory-commit-header > .bh-memory-diff-wrap-button { margin-left: auto; }
.bh-memory-commit-header > .bh-memory-diff-wrap-button + .bh-memory-view-icon-button { margin-left: 0; }
`,
  memoryDiffNumber: `.bh-memory-diff-number:first-child { position: relative; padding-left: ${space.x3} !important; }
.bh-memory-diff-number:nth-child(2) { border-right: ${border.hairline} solid ${color.divider}; }
`,
  memoryDiffContent: `.bh-memory-diff-content { padding: ${space.x1} ${space.x5} ${space.x1} ${space.x2} !important; color: var(--tobs-ink-primary); }
.bh-memory-diff-hunk td, .bh-memory-diff-note td { padding: ${space.x2} ${space.x4} !important; color: var(--tobs-ink-secondary); }
.bh-memory-diff-hunk { background: color-mix(in srgb, var(--bh-accent) 6%, var(--tobs-layer-canvas)); }
.bh-memory-diff-note { font-style: italic; }
.bh-memory-diff-add { background: color-mix(in srgb, var(--tobs-status-success-base) 9%, var(--tobs-layer-canvas)); }
.bh-memory-diff-remove { background: color-mix(in srgb, var(--tobs-status-danger-base) 9%, var(--tobs-layer-canvas)); }
.bh-memory-diff-add .bh-memory-diff-number:nth-child(2), .bh-memory-diff-add .bh-memory-diff-sign { color: var(--tobs-status-success-base); }
.bh-memory-diff-remove .bh-memory-diff-number:first-child, .bh-memory-diff-remove .bh-memory-diff-sign { color: var(--tobs-status-danger-base); }
`,
  memoryDiffAdd: `.bh-memory-diff-add .bh-memory-diff-number:first-child::before { background: var(--tobs-status-success-base); }
`,
  memoryDiffEmpty: `.bh-memory-diff-empty { padding: ${space.x4} ${space.x4}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }

`,
  memoryCommit: `@container (max-width: 720px) {
  .bh-memory-commit-line > .bh-memory-commit-files { display: none; }
}
.bh-memory-commit-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${space.x2};
  max-width: 100%;
  margin: ${space.x2} auto;
  padding: ${space.x2} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  white-space: nowrap;
  cursor: pointer;
}
.bh-memory-commit-line > * { flex: none; }
.bh-memory-commit-line:hover { color: var(--tobs-ink-primary); }
`,
  memoryCommitLine: `.bh-memory-commit-line:hover > .bh-memory-commit-subject { text-decoration: underline; }
.bh-memory-commit-line > .bh-memory-commit-files {
  flex: 0 100 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bh-memory-commit-line[data-memory-display='compact'] > .bh-bot-dm-action-bot {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 40%;
}
.bh-memory-commit-line[data-memory-display='compact'] .bh-bot-dm-action-name,
.bh-memory-commit-line[data-memory-display='compact'] > .bh-memory-commit-action {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bh-memory-commit-line[data-memory-display='compact'] > .bh-memory-commit-action { flex: 0 1 auto; }
.bh-memory-commit-sha { font-family: ${font.familyMono}; font-size: ${text.metaSize}; }
.bh-memory-commit-files { color: var(--tobs-ink-tertiary); }
.bh-bot-dm-action-bot .bh-persona-avatar { border-radius: 28%; overflow: hidden; }
.bh-bot-dm-action-name { color: var(--tobs-ink-primary); font-weight: ${text.strong}; }
.bh-dm-trace-line > .bh-memory-commit-subject { color: var(--tobs-ink-secondary); }
.bh-bot-dm-readonly {
  padding: ${space.x4} ${space.x5};
  text-align: center;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
};
