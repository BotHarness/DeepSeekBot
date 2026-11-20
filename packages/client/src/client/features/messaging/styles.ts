import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const messagingCss = {
  behaviorResults: `.bh-behavior-results { display: grid; gap: ${space.x3}; }
.bh-im-pairing-request.bh-behavior-item { padding: ${space.x3} ${space.x3}; gap: ${space.x2}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; }
.bh-behavior-item .bh-pairing-behavior { margin: 0; }
.bh-behavior-sources { display: grid; gap: ${space.x1}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-behavior-preview-toggle { width: 100%; }
`,
  pairingTablePanel: `.bh-pairing-table-panel { display: grid; gap: ${space.x4}; min-width: 0; }
.bh-pairing-table-scroll { overflow-x: auto; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; }
.bh-pairing-table { width: 100%; border-collapse: collapse; text-align: left; font-size: ${text.bodySize}; }
.bh-pairing-table th, .bh-pairing-table td { padding: ${space.x3} ${space.x3}; border-bottom: ${border.hairline} solid ${color.divider}; vertical-align: middle; overflow-wrap: anywhere; }
.bh-pairing-table th { color: var(--tobs-ink-secondary); font-weight: ${text.strong}; }
`,
  pairingTable: `.bh-pairing-table td:first-child label { font-size: 0; gap: 0; }
.bh-behavior-exclusions .bh-pairing-table { min-width: 0; }
.bh-behavior-exclusions .bh-pairing-table th:nth-child(2) { width: auto; min-width: 0; }
.bh-behavior-selection .bh-pairing-table { min-width: 0; table-layout: fixed; }
.bh-behavior-selection .bh-pairing-table th:first-child, .bh-behavior-selection .bh-pairing-table td:first-child { width: 60%; }
.bh-behavior-selection .bh-pairing-table th:nth-child(2), .bh-behavior-selection .bh-pairing-table th:last-child { width: 20%; min-width: 0; }
.bh-behavior-checkbox { gap: 0; }
`,
  pairingTableSelection: `.bh-pairing-table tr[data-selected] { background: var(--tobs-state-hover); }
.bh-pairing-table tbody tr:last-child td { border-bottom: none; }
.bh-pairing-sort, .bh-pairing-name { padding: 0; border: none; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.bh-pairing-sort { white-space: nowrap; }
.bh-pairing-sort:disabled { cursor: default; }
.bh-pairing-name { font-weight: ${text.strong}; }
.bh-pairing-name:hover { text-decoration: underline; }
`,
  pairingPolicyPreview: `.bh-pairing-policy-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bh-pairing-behavior { white-space: pre-wrap; }
.bh-pairing-empty { padding: ${space.x6} ${space.x4}; color: var(--tobs-ink-secondary); }
.bh-pairing-pagination { display: flex; align-items: center; gap: ${space.x2}; flex-wrap: wrap; }
.bh-pairing-pagination > span { margin-right: auto; }
.bh-pairing-receiver { font-size: ${text.metaSize}; }
[data-pairing-panel] .bh-im-pairing-request { border-radius: ${radius.md}; }
.bh-pairing-times { display: grid; gap: ${space.x1}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-pairing-sort-indicator { color: var(--tobs-ink-secondary); }
`,
  permissionTable: `.bh-permission-table { min-width: 0; table-layout: fixed; }
.bh-permission-table th:first-child, .bh-permission-table td:first-child { width: 32%; }
.bh-permission-table th:not(:first-child), .bh-permission-table td:not(:first-child) { width: 17%; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.bh-permission-table td label { font-size: 0; gap: 0; }
.bh-group-members .bh-pairing-table th:nth-child(2) { width: auto; }
[data-im-grant] p { margin: 0; }
.bh-muted { color: var(--tobs-ink-secondary); }
.bh-im-history { display: flex; flex-direction: column; gap: ${space.x3}; padding-top: ${space.x4}; border-top: ${border.hairline} solid ${color.divider}; }
.bh-external-entry { display: flex; flex-direction: column; gap: ${space.x3}; min-width: 0; }
.bh-memory-limits { margin-top: ${space.x3}; }
[data-external-panel] .bh-im-pairing { padding-block: 0; font-size: ${text.bodySize}; }


 .bh-im-field {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  font-size: ${text.bodySize};
}
 .bh-im-group-policy { display: grid; gap: ${space.x3}; padding-block: ${space.x4}; border-block: ${border.hairline} solid ${color.divider}; }
.bh-im-threads { display: grid; gap: ${space.x3}; padding-block: ${space.x4}; }
.bh-im-threads p { margin: 0; color: var(--tobs-ink-secondary); }
.bh-im-pairing { display: flex; flex-direction: column; gap: ${space.x4}; padding-block: ${space.x5}; }
.bh-im-pairing p { margin: 0; }
.bh-im-pairing-request { padding: ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; display: flex; flex-direction: column; gap: ${space.x4}; overflow-wrap: anywhere; }
.bh-im-pairing-request dl { margin: 0; display: grid; gap: ${space.x2}; }
`,
  imPairingRequest: `.bh-im-pairing-request dt { color: var(--tobs-ink-secondary); }
.bh-im-pairing-request dd { margin: 0; }
.bh-im-pairing-capabilities { display: flex; flex-wrap: wrap; gap: ${space.x4}; border: none; padding: 0; margin: 0; }
.bh-im-pairing-capabilities legend { margin-bottom: ${space.x3}; }
.bh-im-role-form { display: flex; flex-direction: column; gap: ${space.x4}; border: none; padding: 0; margin: 0; }
.bh-im-role-form legend { margin-bottom: ${space.x3}; }
.bh-im-pairing-capabilities label { display: flex; align-items: center; gap: ${space.x2}; }
.bh-im-threads td { overflow-wrap: anywhere; }
.bh-bridge-secondary{display:block;color:var(--tobs-ink-secondary);font-size:${text.metaSize};margin-top:${space.x2}}
.bh-im-threads .bh-source-policy-table th:first-child { width: 40%; }
.bh-im-threads .bh-source-policy-table th:nth-child(2) { width: 27%; }
.bh-im-threads .bh-source-policy-table th:nth-child(3) { width: 12%; }
.bh-im-threads .bh-source-policy-table th:nth-child(4) { width: 21%; }
.bh-im-group-policy p { margin: 0; color: var(--tobs-ink-secondary); }
.bh-im-digest-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${space.x4}; }
`,
  imOutcome: `.bh-im-outcome { display: flex; flex-direction: column; align-items: flex-start; gap: ${space.x2}; overflow-wrap: anywhere; }
.bh-im-field > select,
.bh-im-field > textarea,
.bh-im-field > input,
.bh-profile-policy-select {
  box-sizing: border-box;
  width: 100%;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x3};
  background: var(--tobs-layer-canvas);
  color: var(--tobs-ink-primary);
  font: inherit;
}
`,
  externalRoute: `.bh-external-route {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: 0 0 ${space.x5};
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-external-route-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  margin-bottom: ${space.x2};
}
.bh-external-platform {
  font-weight: ${text.strong};
  color: var(--tobs-accent-solid);
}
`,
  externalRouteLabel: `.bh-external-route > strong {
  font-size: ${text.titleSize};
}
.bh-external-route > span {
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
`,
  externalMessage: `.bh-external-message {
  display: flex;
  align-items: flex-start;
  gap: ${space.x4};
  min-width: 0;
}
`,
  externalMessageMain: `.bh-external-message-main { flex: 1; min-width: 0; }
.bh-external-message-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.x2} ${space.x3};
  margin-bottom: ${space.x3};
}
.bh-external-message-head strong { font-size: ${text.bodySize}; }
.bh-external-message-head time {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
.bh-external-quote {
  margin: ${space.x3} 0;
  padding: ${space.x3} ${space.x4};
  border-left: ${border.hairline} solid ${color.divider};
  background: var(--tobs-state-hover);
  border-radius: ${radius.sm};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-external-quote p { margin: ${space.x2} 0; }
.bh-external-message-text {
  width: fit-content;
  max-width: 100%;
  padding: ${space.x3} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: 0 ${radius.sm} ${radius.sm} ${radius.sm};
  background: var(--tobs-layer-canvas);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.bh-external-mention { color: var(--tobs-accent-solid); }
.bh-external-details {
  margin-top: ${space.x3};
  font-size: ${text.metaSize};
  color: var(--tobs-ink-tertiary);
}
.bh-external-details > summary {
  width: fit-content;
  padding: ${space.x1} 0;
  cursor: pointer;
}
.bh-external-details > summary:hover { color: var(--tobs-ink-primary); }
`,
  externalDetailBody: `.bh-external-detail-body {
  overflow-wrap: anywhere;
  padding: ${space.x3} ${space.x3};
  margin-top: ${space.x2};
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-secondary);
}
.bh-external-detail-body p { margin: 0 0 ${space.x2}; }
.bh-external-detail-body p:last-child { margin-bottom: 0; }
.bh-external-raw-text { white-space: pre-wrap; }
.bh-external-context { border-top: ${border.hairline} solid ${color.divider}; padding-top: ${space.x5}; }
.bh-external-context h3 { margin: 0 0 ${space.x2}; font-size: ${text.bodySize}; }
.bh-external-context-hint { margin: 0; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
.bh-external-notice {
  margin: ${space.x3} 0;
  padding: ${space.x3} ${space.x3};
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
  color: var(--tobs-status-warning-base);
  font-size: ${text.metaSize};
}
`,
};
