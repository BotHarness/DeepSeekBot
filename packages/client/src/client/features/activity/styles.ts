import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';

export const activityCss = {
  sourcePolicyTable: `.bh-source-policy-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: ${text.bodySize};
}
.bh-source-policy-table th, .bh-source-policy-table td {
  padding: ${space.x2} ${space.x3};
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-source-policy-table thead th {
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
  color: var(--tobs-ink-secondary);
}
.bh-source-policy-table th:first-child { width: 25%; padding-left: 0; }
.bh-source-policy-table th:nth-child(2) { width: 43%; }
.bh-source-policy-table th:nth-child(3) { width: 14%; }
.bh-source-policy-table th:nth-child(4) { width: 18%; }
.bh-source-policy-table tbody th { font-weight: ${text.strong}; }
.bh-source-policy-table tbody tr:last-child > * { border-bottom: 0; }
.bh-source-policy-table td:last-child, .bh-source-policy-table th:last-child { padding-right: 0; text-align: right; }
.bh-source-policy-action { border-radius: ${radius.sm}; color: var(--tobs-ink-primary); }
`,
  sourcePolicyAudit: `.bh-source-policy-audit { display: flex; flex-direction: column; gap: ${space.x5}; margin: 0; font-size: ${text.bodySize}; }
.bh-source-policy-audit dt { color: var(--tobs-ink-secondary); margin-bottom: ${space.x2}; }
.bh-source-policy-audit dd { margin: 0; overflow-wrap: anywhere; }
`,
  imActions: `.bh-im-actions { display: flex; align-items: center; gap: ${space.x2}; flex-wrap: wrap; }
.bh-im-heading { display: flex; align-items: center; gap: ${space.x2}; min-width: 0; }
.bh-im-heading small { color: var(--tobs-ink-secondary); font-weight: normal; }
`,
  imGroupPolicy: `[data-im-grant] .bh-im-group-policy { grid-template-columns: repeat(2,minmax(0,1fr)); gap: ${space.x3} ${space.x4}; padding-block: ${space.x3}; }
.bh-im-wide { grid-column: 1 / -1; }
.bh-im-policy-footer { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; flex-wrap: wrap; }
.bh-im-policy-revision { color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
[data-im-grant] .bh-im-status { margin: 0; font-size: ${text.metaSize}; }
.bh-im-notice { font-size: ${text.metaSize}; }
[data-im-grant] .bh-im-submit { align-self: flex-end; }
.bh-im-danger.bh-im-danger { background: var(--tobs-status-danger-base); color: var(--tobs-accent-on-solid); border-color: transparent; }
.bh-im-danger.bh-im-danger:not(:disabled):hover { background: color-mix(in srgb, var(--tobs-status-danger-base) 85%, var(--tobs-ink-primary)); }
.bh-im-thread-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
`,
  imDangerOutline: `.bh-im-danger-outline.bh-im-danger-outline { color: var(--tobs-status-danger-base); }
.bh-conversation-group { display: grid; gap: ${space.x2}; }
`,
  externalSourceFile: `.bh-external-source-file {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  margin-block: ${space.x3};
}
.bh-external-source-audio { display: grid; gap: ${space.x3}; margin-block: ${space.x3}; }
`,
  externalSourceAudio: `.bh-external-source-audio p { margin: 0; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
`,
  externalSourceFileLabel: `.bh-external-source-file > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.bh-external-source-file > button { flex-shrink: 0; }
.bh-external-source-content {
  max-height: 65vh;
  overflow: auto;
  overflow-wrap: anywhere;
  font: ${text.bodySize}/1.5 ${font.familySans};
  color: var(--tobs-ink-primary);
}
`,
  panelActivity: `/* Activity follows the native Bot mode inset and semantic theme aliases. */

nav:has(> .bh-panel-activity) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
nav > button:is(.bh-panel-activity, .bh-panel-activity ~ *, :has(~ .bh-panel-activity)) { grid-column: 1; }
`,
  wideActivityButtonQuiet: `.bh-panel-activity[data-wide='true'][data-unread='false'] { opacity: 0; pointer-events: none; }
button:has(.bh-panel-glyph):is(:hover, :focus-within) .bh-panel-activity[data-wide='true'][data-active='true'],
.bh-panel-activity[data-wide='true'][data-unread='false'].driver-active-element { opacity: 1; pointer-events: auto; }
.bh-panel-activity:hover { background: var(--tobs-state-hover); color: var(--tobs-ink-primary); }
.bh-panel-activity[aria-current='page'] { background: var(--tobs-state-hover); color: var(--tobs-ink-primary); }
`,
  narrowActivityButtonInactive: `.bh-panel-activity[data-wide='false'][data-active='false'] { display: none; }
.bh-panel-activity[data-wide='false']:hover { background: var(--bh-hover); }
.bh-panel-activity[data-wide='false'][aria-current='page'] { background: var(--bh-selected); }
`,
  activityListRow: `.bh-activity-list-row[data-selected='true'] {
  background: var(--tobs-state-hover);
}
.bh-activity-list {
  min-width: 0;
}
`,
  activityListRowOpen: `.bh-activity-list-row-open {
  position: absolute;
  inset: 0;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.bh-activity-list-row-open:hover { background: var(--bh-hover); }
`,
  activityListRowMain: `.bh-activity-list-row-main {
  position: relative;
  pointer-events: none;
  flex: 1 1 24ch;
  min-width: 0;
}
.bh-activity-list-row > .bh-activity-list-detail {
  flex-basis: 100%;
  min-width: 0;
}
`,
  activityListSourceLink: `.bh-activity-list-source-link:hover { background: var(--tobs-accent-solid-hover); }
`,
  activityListChannelAvatar: `.bh-activity-list-channel-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bh-activity-list-reply {
  margin: 0;
  padding: ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
}
.bh-activity-list-reply-header,
.bh-activity-list-reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
}
.bh-activity-list-reply-header h2 {
  margin: 0;
  font-size: inherit;
  font-weight: ${text.strong};
}
.bh-activity-list-reply p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: ${space.x2} 0;
}
.bh-activity-list-purpose {
  font-size: inherit;
  font-weight: ${text.strong};
  overflow-wrap: anywhere;
}
.bh-activity-list-purpose.is-collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bh-activity-list-message {
  position: relative;  display: flex;
  gap: ${space.x3};
  padding: ${space.x4} ${space.x5};
  border-bottom: ${border.hairline} solid ${color.divider};
}
`,
  activityListMessageContent: `.bh-activity-list-message-content {
  min-width: 0;
  flex: 1;
}
`,
  activityListMessageHeading: `.bh-activity-list-message-heading {
  display: flex;
  align-items: baseline;
  gap: ${space.x3};
  flex-wrap: wrap;
}
.bh-activity-list-message time {
  color: var(--tobs-ink-secondary);
  font-size: inherit;
}
.bh-activity-list-message-target {
  display: inline-block;
  margin: ${space.x2} 0 0;
  padding: ${space.x1} ${space.x2};
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
  color: ${color.accentText};
  font-size: inherit;
}
.bh-activity-list-reply-source {
  border-left: ${border.hairline} solid var(--bh-accent);
  background: var(--tobs-layer-raised);
}
.bh-activity-list-message blockquote {
  margin: ${space.x3} 0;
  padding-left: ${space.x3};
  border-left: ${border.hairline} solid ${color.divider};
  color: var(--tobs-ink-secondary);
}
.bh-activity-list-reply form label {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-activity-list-reply textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-canvas);
  color: var(--tobs-ink-primary);
  font: inherit;
  line-height: 1.5;
}
.bh-activity-list-reply-actions {
  justify-content: flex-end;
  margin-top: ${space.x3};
  flex-wrap: wrap;
}
`,
  activityListRowTitle: `.bh-activity-list-row-title {
  position: relative;
  pointer-events: none;
  flex-basis: 100%;
  min-width: 0;
  font-weight: ${text.strong};
  overflow-wrap: anywhere;
}
.bh-activity-list-row-summary {
  margin-top: ${space.x2};
  color: var(--tobs-ink-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.bh-activity-list-unread-meta {
  margin-top: ${space.x2};
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
.bh-activity-list-unread-meta summary {
  margin-top: ${space.x3};
  cursor: pointer;
}
.bh-activity-list-row-actions {
  align-items: center;
  justify-content: flex-end;
  position: relative;
  display: flex;
  flex: none;
  max-width: 100%;
  margin-inline-start: auto;
  gap: ${space.x2};
  flex-wrap: wrap;
}
.bh-activity-list-pairing-capabilities {
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  gap: ${space.x2} ${space.x4};
}
.bh-activity-list-row-check {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  margin: 0 ${space.x3} 0 0;
  vertical-align: middle;
  accent-color: ${color.accentText};
  cursor: pointer;
}
.bh-activity-list-row[data-checked] { background: ${color.selected}; }
`,
  activityListBatchAll: `.bh-activity-list-batch-all { display: inline-flex; align-items: center; color: var(--tobs-ink-secondary); cursor: pointer; }
.bh-activity-list-more {
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.borderStrong};
  border-radius: ${radius.sm};
  color: var(--tobs-ink-primary);
  background: transparent;
  cursor: pointer;
}
.bh-activity-list-more:hover {
  background: var(--tobs-state-hover);
}
.bh-activity-center { display:flex;flex-direction:column;overflow:hidden; }
`,
  activityCenterHeader: `.bh-activity-center-header h1 {margin:0 0 ${space.x5};font-size:${text.titleSize};line-height:${text.titleLine};font-weight:${text.strong};}
.bh-activity-center > .bh-activity-list {min-height:0;flex:1;}
.bh-activity-center-panel {height:100%;min-height:0;container-type:inline-size;}
.bh-activity-center-panel .bh-activity-center-header {padding:0;}
.bh-activity-center-panel > .bh-activity-list {padding:${space.x4} 0 0;}
.bh-activity-list-context-window { margin-top: ${space.x4}; }
`,
  activityListContextEdge: `.bh-activity-list-context-edge:not(:disabled):hover { background: var(--bh-hover); }
.bh-activity-list-context-edge:disabled { opacity: .4; cursor: default; }
.bh-activity-list-context-older svg { transform: rotate(180deg); }
`,
  activityListMessage: `.bh-activity-list-message:hover .bh-activity-list-message-source, .bh-activity-list-message:focus-within .bh-activity-list-message-source, .bh-activity-list-message-source:focus-visible { opacity: 1; pointer-events: auto; }
.bh-activity-list-message-heading { padding-right: ${space.x6}; }
.bh-activity-list-dismiss { display: flex; align-items: center; gap: ${space.x2}; }
@media (hover: none) { .bh-activity-list-message-source { opacity: 1; pointer-events: auto; } }


.bh-channel-activity {margin-top:${space.x6};color:var(--tobs-ink-primary);font-size:${text.bodySize};}
.bh-channel-activity header {display:flex;align-items:center;justify-content:space-between;gap:${space.x4};flex-wrap:wrap;}
.bh-channel-activity h2 {font-size:${text.bodySize};margin:0;font-weight:${text.strong};}
.bh-channel-activity p {margin:${space.x3} 0;color:var(--tobs-ink-secondary);}
.bh-channel-activity ul {list-style:none;margin:0;padding:0;}
.bh-channel-activity > ul > li {border-bottom:${border.hairline} solid ${color.divider};}
.bh-channel-activity-legend {display:flex;gap:${space.x5};margin:${space.x4} 0;color:var(--tobs-ink-secondary);}
.bh-channel-activity-legend span {display:flex;align-items:center;gap:${space.x2};}
`,
  channelActivityHuman: `.bh-channel-activity-human {background:var(--bh-accent);}
.bh-channel-activity-bot {background:var(--bh-chart-output);}
.bh-channel-activity-other {background:var(--tobs-ink-tertiary);}
.bh-channel-activity-row {display:flex;align-items:center;gap:${space.x3};padding:${space.x3} 0;}
`,
  channelActivityToggle: `.bh-channel-activity-toggle:hover {background:var(--bh-hover);}
`,
  channelActivityChart: `.bh-channel-activity-chart i {height:100%;}
.bh-channel-activity strong {font-variant-numeric:tabular-nums;}
`,
  channelActivityClosed: `.bh-channel-activity-closed {transform:rotate(-90deg);}
`,
  channelActivitySenders: `.bh-channel-activity-senders li {display:flex;align-items:center;gap:${space.x4};padding:${space.x2} 0;}
.bh-channel-activity-senders li > span:first-child {min-width:0;flex:1;overflow-wrap:anywhere;}
.bh-channel-activity-kind {color:var(--tobs-ink-secondary);}
`,
  statisticsToggle: `.bh-statistics-toggle {display:flex;align-items:center;gap:${space.x3};background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.bh-statistics-toggle:hover {color:var(--bh-accent);}
.bh-channel-activity-name {flex:1;width:auto;}
.bh-channel-statistics-chart {width:100%;min-width:0;}
.bh-channel-activity {margin-top:${space.x6};padding-top:${space.x5};border-top:${border.hairline} solid ${color.divider};}
.bh-statistics-content[hidden] {display:none;}

.bh-overview-memory {margin-top:${space.x4};min-width:0;}
.bh-overview-memory h3 {margin:0;font-weight:${text.regular};}
.bh-overview-memory .bh-note {margin:0;}
.bh-overview-memory-range {display:flex;justify-content:space-between;gap:${space.x3};font-size:${text.metaSize};color:var(--tobs-ink-tertiary);}
.bh-overview-memory-bots {list-style:none;margin:0;padding:0;}
`,
  overviewMemoryName: `.bh-overview-memory-name {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-memory-bots strong {font-variant-numeric:tabular-nums;white-space:nowrap;}
.bh-overview-memory-bots strong > span {font-weight:${text.regular};color:var(--tobs-ink-secondary);}
`,
  overviewMemoryDirty: `.bh-overview-memory-dirty {color:var(--tobs-status-warning-base);}
.bh-overview-memory-unavailable {color:var(--tobs-ink-secondary);}
.bh-overview-memory .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--tobs-ink-secondary);}
.bh-overview-memory .bh-profile-pin:disabled {opacity:0.5;cursor:default;}
.bh-overview-memory .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
`,
};
