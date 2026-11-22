import { border, color, radius, space, text } from './ds/tokens.stylex.js';

export const sharedCss = {
  nameInput: `.bh-name-input::placeholder {
  color: var(--tobs-ink-disabled);
}
.bh-name-input:disabled {
  color: var(--tobs-ink-disabled);
}

.bh-role-editor {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-role-editor-badges {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2};
}
.bh-role-edit-badge {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
}
`,
  roleEditBadge: `.bh-role-edit-badge button:hover {
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
}
.bh-role-edit-badge button:disabled {
  cursor: default;
  color: var(--tobs-ink-disabled);
}


.bh-modal-error {
  margin-top: ${space.x3};
  border: ${border.hairline} solid color-mix(in srgb, var(--tobs-status-danger-base) 45%, transparent);
  background: var(--tobs-status-danger-tint);
  color: var(--tobs-status-danger-base);
  border-radius: ${radius.sm};
  padding: ${space.x2} ${space.x3};
  font-size: ${text.metaSize};
}

`,
  note: `.bh-note {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  padding: ${space.x2} ${space.x2};
}
.bh-skeleton {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  padding: ${space.x4} ${space.x5};
}
`,
  skeletonRow: `.bh-skeleton-row {
  display: flex;
  align-items: flex-start;
  gap: ${space.x3};
  width: 100%;
}
.bh-skeleton-avatar,
.bh-skeleton-line {
  display: block;
  flex: none;
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
}
`,
  skeletonLines: `.bh-skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${space.x3};
  padding-top: ${space.x1};
}
`,
  skeletonLineShort: `.bh-skeleton-line-short {
  width: 48%;
}
.bh-skeleton-row:nth-child(even) .bh-skeleton-line:first-child {
  width: 68%;
}
@keyframes bh-skeleton-pulse {
  50% { opacity: 0.45; }
}
.bh-empty-create {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space.x3};
  padding: ${space.x4} ${space.x2};
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
.bh-error {
  margin: ${space.x2} ${space.x2} ${space.x3};
  border: ${border.hairline} solid color-mix(in srgb, var(--tobs-status-danger-base) 45%, transparent);
  background: var(--tobs-status-danger-tint);
  color: var(--tobs-status-danger-base);
  border-radius: ${radius.sm};
  padding: ${space.x3} ${space.x3};
  font-size: ${text.metaSize};
}

`,
  content: `.bh-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.bh-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tobs-ink-tertiary);
  flex-direction: column;
  gap: ${space.x2};
  text-align: center;
  padding: ${space.x6};
}
.bh-placeholder .bh-big {
  font-size: ${text.titleSize};
  color: var(--tobs-ink-secondary);
}
.bh-dim {
  color: var(--tobs-ink-tertiary);
}

`,
  cardList: `.bh-card-list {display:flex;flex-direction:column;gap:var(--bh-card-list-gap, 0px);margin:0;padding:var(--bh-card-list-padding, 0px);list-style:none;overflow:hidden;border:${border.hairline} solid var(--bh-card-list-edge, ${color.border});border-radius:var(--bh-card-list-radius, ${radius.md});background:var(--bh-card-list-fill, transparent);box-shadow:var(--bh-card-list-shadow, none);}
.bh-card-list + .bh-card-list {margin-top:var(--bh-card-list-stack, ${space.x3});}
.bh-card-list[data-flush] {border:0;border-radius:0;}
.bh-card-list[data-flush] + .bh-card-list[data-flush] {margin-top:0;border-top:${border.hairline} solid ${color.divider};}
.bh-card-list.bh-message-card-list {border:0;background:${color.well};}
.bh-message-card-list .bh-card-title {white-space:normal;overflow-wrap:anywhere;}
`,
  messageCardList: `.bh-message-card-list .bh-card-row:has(.bh-card-main:disabled),
.bh-message-card-list .bh-card-row:has(.bh-card-checkbox:disabled) {opacity:.6;}
`,
  cardCheckbox: `.bh-card-checkbox:disabled {cursor:default;}
label.bh-card-main {cursor:pointer;}
label.bh-card-main:has(.bh-card-checkbox:disabled) {cursor:default;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > label.bh-card-main > .bh-card-checkbox:not(:disabled)):hover {background:var(--tobs-state-hover);}

.bh-card-row {min-width:0;border-radius:var(--bh-card-row-radius, 0px);background:var(--bh-card-row-fill, transparent);}
.bh-card-row + .bh-card-row {border-top:${border.hairline} solid var(--bh-card-row-separator, ${color.divider});}
.bh-card-line {display:flex;align-items:center;gap:${space.x3};min-width:0;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > button.bh-card-main:not(:disabled):hover) {background:var(--tobs-state-hover);}
.bh-card-main {display:flex;flex:1;align-items:flex-start;gap:${space.x3};min-width:0;margin:0;padding:${space.x3} var(--bh-card-main-inline, ${space.x3});border:0;border-radius:0;background:transparent;color:var(--tobs-ink-primary);font:inherit;text-align:left;}
button.bh-card-main {cursor:pointer;}
button.bh-card-main:disabled {cursor:default;}
`,
  cardLeading: `.bh-card-leading {display:grid;flex:none;place-items:center;}
.bh-card-body {display:flex;flex:1;flex-direction:column;gap:${space.x2};min-width:0;}
.bh-card-title {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${text.bodySize};font-weight:${text.strong};line-height:${text.bodyLine};}
.bh-card-chips {display:flex;flex-wrap:wrap;align-items:center;gap:${space.x2};}
.bh-card-title-row {display:flex;align-items:center;gap:${space.x3};min-width:0;}
.bh-card-title-row > .bh-card-title {flex:1;min-width:0;}
.bh-card-badge {display:flex;flex:none;align-items:center;gap:${space.x2};}
.bh-card-summary {display:-webkit-box;overflow:hidden;color:var(--tobs-ink-secondary);font-size:${text.metaSize};line-height:${text.metaLine};overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.bh-card-title.bh-inbox-item-head {display:flex;align-items:baseline;gap:${space.x2};}
.bh-inbox-item-head .bh-inbox-item-author {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-inbox-item-head .bh-inbox-item-origin {color:var(--tobs-ink-secondary);font-weight:${text.regular};}
.bh-inbox-item-head .bh-inbox-item-time {flex:none;color:var(--tobs-ink-secondary);font-size:${text.metaSize};font-weight:${text.regular};}
.bh-inbox-item-return {flex:none;}
.bh-inbox-item-note {display:-webkit-box;overflow:hidden;flex-basis:100%;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.bh-sessions-header-action {display:contents;}
.bh-card-glyph {display:inline-grid;place-items:center;color:var(--tobs-ink-secondary);}
.bh-card-meta {display:flex;flex-wrap:wrap;align-items:baseline;gap:${space.x1} ${space.x3};min-width:0;color:var(--tobs-ink-secondary);font-size:${text.metaSize};line-height:${text.metaLine};overflow-wrap:anywhere;}
.bh-card-meta-line {flex-basis:100%;}
.bh-card-trailing {display:flex;flex:none;align-items:center;gap:${space.x2};padding-right:var(--bh-card-main-inline, ${space.x3});color:var(--tobs-ink-secondary);}
`,
  cardRow: `.bh-card-row[data-muted="true"] .bh-card-icon,
.bh-card-row[data-muted="true"] .bh-card-title {color:var(--tobs-ink-secondary);}
`,
  workspaceFolderAdd: `.bh-workspace-folder-add, .bh-workspace-folder-add .bh-card-title, .bh-workspace-folder-add .bh-card-leading {color:${color.accentText};}
.bh-workspace-folder-write {display:inline-flex;align-items:center;gap:${space.x2};font-size:${text.metaSize};line-height:${text.metaLine};white-space:nowrap;}
.bh-card-detail > .bh-workspace-folder-detail {padding:0;}
.bh-schedule-switch {display:inline-flex;}
`,
};
