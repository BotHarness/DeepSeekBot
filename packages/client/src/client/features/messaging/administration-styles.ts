import { border, space } from '../../ds/tokens.stylex.js';
import { activityCss } from '../activity/styles.js';
import { channelsCss } from '../channels/styles.js';
import { messagingCss } from './styles.js';

export const MESSAGING_ADMINISTRATION_CSS = [
  activityCss.sourcePolicyTable,
  `.bh-source-policy-action:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 1px; }
`,
  activityCss.sourcePolicyAudit,
  `@media (max-width: 1100px) {
  .bh-source-policy-table th, .bh-source-policy-table td { padding-left: ${space.x2}; padding-right: ${space.x2}; }
  .bh-source-policy-table th:first-child { width: 25%; }
  .bh-source-policy-table th:nth-child(2) { width: 37%; }
  .bh-source-policy-table th:nth-child(3) { width: 16%; }
  .bh-source-policy-table th:nth-child(4) { width: 22%; }
}

`,
  activityCss.imActions,
  `.bh-im-help { width: 22px; height: 22px; flex: none; color: var(--tobs-ink-secondary); }
.bh-im-help:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 2px; }
`,
  activityCss.imGroupPolicy,
  `@media (max-width: 720px) {
  [data-im-grant] .bh-im-group-policy { grid-template-columns: minmax(0,1fr); }
}
`,
  activityCss.imDangerOutline,
  channelsCss.conversationGroup,
  `.bh-management-workspace { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: ${space.x5}; align-items: start; }
`,
  channelsCss.managementSettings,
  `.bh-management-records .bh-pairing-table th:last-child { width: 84px; min-width: 0; }
`,
  channelsCss.managementRecords,
  `@media (max-width: 760px) {
  .bh-management-workspace { grid-template-columns: minmax(0, 1fr); }
  .bh-management-records [role="tablist"], .bh-management-records [role="tab"] { height: auto; }
  .bh-management-records [role="tab"] { min-height: 34px; padding: ${space.x3} ${space.x2}; white-space: normal; }
  .bh-management-records .bh-pairing-table th:first-child, .bh-management-records .bh-pairing-table td:first-child { width: 16px; padding-inline: ${space.x2}; }
  .bh-management-records .bh-pairing-table th:nth-child(2) { width: 28%; }
  .bh-management-records .bh-pairing-table th:last-child { width: 56px; }
  .bh-management-time > span { display: block; }
}
`,
  channelsCss.pairingToolbarGap,
  `.bh-pairing-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: ${space.x5}; align-items: start; min-height: 260px; }
.bh-pairing-detail { min-width: 0; max-height: 420px; overflow-y: auto; }
`,
  channelsCss.groupEditorHeader,
  messagingCss.behaviorResults,
  `.bh-behavior-preview-toggle:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: -2px; }
.bh-behavior-preview-body { padding: ${space.x2} 0 0 20px; }
`,
  messagingCss.pairingTablePanel,
  `.bh-pairing-table td:first-child, .bh-pairing-table th:first-child { width: 28px; }
.bh-pairing-table th:nth-child(2) { width: 24%; min-width: 130px; }
.bh-pairing-table th:last-child { min-width: 52px; white-space: nowrap; }
`,
  messagingCss.pairingTable,
  `.bh-behavior-checkbox > span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
`,
  messagingCss.pairingTableSelection,
  `.bh-pairing-name:focus-visible, .bh-pairing-sort:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 3px; }
`,
  messagingCss.pairingPolicyPreview,
  `.bh-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) { .bh-pairing-workspace { grid-template-columns: minmax(0, 1fr); } .bh-pairing-table { min-width: 560px; } .bh-pairing-detail { max-height: none; } }
@media (max-width: 760px) { .bh-group-editor-header { grid-template-columns: minmax(0, 1fr); } .bh-group-editor-selection [role="tablist"] { height: auto; } .bh-group-editor-selection [role="tab"] { height: auto; min-height: 34px; padding: ${space.x3} ${space.x2}; overflow-wrap: anywhere; } }
@media (max-width: 760px) { [data-group-editor] .bh-pairing-detail { max-height: none; overflow: visible; } }
`,
  messagingCss.permissionTable,
  `.bh-im-pairing-request dl > div { display: grid; grid-template-columns: minmax(90px, 25%) minmax(0, 1fr); gap: ${space.x4}; }
`,
  messagingCss.imPairingRequest,
  `.bh-im-field textarea { min-height: 80px; resize: vertical; }
`,
  messagingCss.imOutcome,
].join('');
