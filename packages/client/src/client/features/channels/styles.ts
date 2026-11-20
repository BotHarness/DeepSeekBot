import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const channelsCss = {
  main: `.bh-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--tobs-layer-canvas);
}
`,
  channelIsland: `.bh-channel-island:hover {
  background: color-mix(in srgb, var(--tobs-ink-primary) 8%, var(--tobs-layer-raised));
}
`,
  channelIslandContent: `.bh-channel-island > :first-child {
  flex: 0 0 auto;
}
.bh-group-live-activity { container-type: inline-size; min-width: 0; }
.bh-group-live-activity-chips { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; margin-top: ${space.x2}; }
`,
  groupActivityPill: `.bh-group-activity-pill { min-width: 0; max-width: 100%; }
`,
  groupActivityChipState: `.bh-group-activity-chip-state { white-space: nowrap; }
.bh-group-activity-overflow { flex-shrink: 0; }
`,
  conversationGroup: `.bh-conversation-group + .bh-conversation-group { margin-top: ${space.x3}; }
.bh-conversation-group-title { font-size: ${text.metaSize}; font-weight: ${text.strong}; color: var(--tobs-ink-secondary); }
.bh-conversation-group-title small { font-weight: ${text.regular}; margin-left: ${space.x1}; }
.bh-conversation-reason { font-size: ${text.metaSize}; color: var(--tobs-status-warning-ink); }
.bh-conversation-list .bh-card-main { padding-block: ${space.x3} ${space.x1}; }
.bh-conversation-list .bh-card-body { gap: ${space.x1}; }
.bh-conversation-list .bh-card-detail { display: grid; gap: ${space.x2}; padding-bottom: ${space.x2}; }
.bh-conversation-actions { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; }
.bh-conversation-confirm { display: grid; gap: ${space.x3}; }
.bh-conversation-confirm p { margin: 0; }
.bh-modal-footer { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x3}; width: 100%; justify-content: flex-end; }
.bh-modal-footer > button { white-space: nowrap; }
`,
  managementSettings: `.bh-management-settings, .bh-management-records { display: grid; gap: ${space.x4}; min-width: 0; }
.bh-management-detail { gap: ${space.x3}; }
.bh-management-time { display: block; }
[data-pairing-panel] .bh-management-state { box-sizing: border-box; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.bh-management-records .bh-pairing-table { min-width: 0; table-layout: fixed; }
.bh-management-records .bh-pairing-table th:nth-child(2) { width: 32%; min-width: 0; }
`,
  managementRecords: `.bh-management-records .bh-pairing-table td:last-child { white-space: nowrap; }
`,
  pairingToolbarGap: `.bh-pairing-toolbar-gap { flex: 1; }
.bh-pairing-panel { display: grid; gap: ${space.x4}; min-width: 0; }
`,
  groupEditorHeader: `.bh-group-editor-header { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: ${space.x5}; border: 0; padding: 0; margin: 0 0 ${space.x5}; }
.bh-group-editor-selection { min-width: 0; }
[data-group-editor] .bh-group-editor-header { gap: ${space.x4}; margin-bottom: 0; }
[data-group-editor] .bh-pairing-workspace { gap: ${space.x4}; min-height: 0; }
`,
  inlineMentionSent: `.bh-inline-mention-sent {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  vertical-align: middle;
  border-radius: ${radius.sm};
  padding: ${space.x1} ${space.x3};
}
a[href^="https://session.tobs.invalid/"] {
  display: inline;
  padding: 0 ${space.x2};
  border-radius: ${radius.xs};
  line-height: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
.bh-inline-mention-avatar {
  display: inline-flex;
  flex: 0 0 auto;
}
.bh-inline-mention-link,
.bh-bubble-body-markdown a[href^="https://session.tobs.invalid/"] {
  border: 0;
  text-decoration: none;
  font: inherit;
  cursor: pointer;
}
a[href^="https://session.tobs.invalid/"] > svg:first-child {
  display: none;
}
`,
  bubbleMe: `.bh-bubble-me .bh-bubble-body-markdown > *,
.bh-bubble-me .bh-bubble-body-markdown :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, strong, em, del, a, th, td),
.bh-bubble-me .bh-bubble-body-markdown li::marker {
  color: inherit;
}
.bh-bubble-me .bh-bubble-body-markdown :not(pre) > code {
  color: inherit;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
`,
  composerRichInput: `.bh-composer-rich-input {
  white-space: pre-wrap;
  cursor: text;
}
.bh-composer-rich-input:not(:has(> br[data-rich-placeholder]:last-child))::after {
  content: '\\200b';
}
.bh-composer-rich-input:empty::before {
  content: attr(data-placeholder);
  color: var(--tobs-ink-secondary);
  pointer-events: none;
}
.bh-composer-rich-input[contenteditable='false'] {
  color: var(--tobs-ink-disabled);
  cursor: default;
}
.bh-composer-inline-mention {
  user-select: all;
}
`,
  composerInlineAttachment: `.bh-composer-inline-attachment [data-attachment-icon] { display: inline-flex; flex: none; }
.bh-composer-inline-attachment-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-composer-inline-attachment-size { flex: none; color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; }
.bh-attachment-ordinal { flex: none; font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-composer-inline-attachment[data-status='uploading'] { opacity: .65; }
.bh-composer-inline-attachment[data-status='error'] { border-color: var(--tobs-status-danger-base); }
`,
  composerAttachmentReference: `.bh-composer-attachment-reference:hover { background: var(--tobs-state-hover); }
`,
  composerAttachmentReferenceDisabled: `.bh-composer-attachment-reference:disabled { opacity: .5; cursor: default; }
`,
  deliveryTrigger: `.bh-delivery-trigger:hover {
  background: var(--tobs-state-hover);
}
`,
  deliveryStack: `.bh-delivery-stack {
  display: inline-flex;
  align-items: center;
  padding: ${space.x1};
}
.bh-delivery-stack .bh-stack-avatar + .bh-stack-avatar {
  margin-left: calc(-1 * ${space.x2});
}
.bh-delivery-legend-handled {
  color: var(--tobs-status-success-base);
}
.bh-delivery-legend-running {
  color: var(--tobs-accent-solid);
}
.bh-delivery-legend-observed {
  color: var(--tobs-ink-primary);
}
.bh-delivery-legend-pending {
  color: var(--tobs-ink-secondary);
}
.bh-delivery-legend-ignored {
  color: var(--tobs-ink-tertiary);
}
.bh-delivery-legend-human-read {
  color: var(--tobs-status-success-base);
}
.bh-delivery-legend-human-unread {
  color: var(--tobs-ink-secondary);
}
.bh-empty-actions {
  display: flex;
  margin-top: ${space.x3};
  flex-wrap: wrap;
  justify-content: center;
  gap: ${space.x2};
}
`,
  deliveryLegendRetryable: `.bh-delivery-legend-retryable,
.bh-delivery-legend-needs-repair {
  color: var(--tobs-status-danger-base);
}
.bh-delivery-legend-missing {
  color: var(--tobs-status-warning-base);
}
`,
  deliveryPanelSummary: `.bh-delivery-panel-summary {
  margin-bottom: ${space.x3};
  color: var(--tobs-ink-secondary);
}
.bh-delivery-panel-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${space.x4};
}
.bh-delivery-panel-groups:has(> :only-child) {
  grid-template-columns: minmax(0, 1fr);
}
.bh-delivery-panel-group {
  min-width: 0;
}
.bh-delivery-panel-group h3 {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  margin: 0 0 ${space.x2};
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
}
`,
  deliveryPanelGroup: `.bh-delivery-panel-group ul {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-delivery-panel-group li {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: ${space.x2};
}
.bh-delivery-panel-group li > span:last-child,
.bh-delivery-bot > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-delivery-bot {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: ${space.x2};
  margin-inline: calc(-1 * ${space.x2});
  padding: ${space.x1} ${space.x2};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.bh-delivery-bot:hover {
  background: var(--tobs-state-hover);
}
.bh-delivery-bot:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 0;
}
`,
  mentionOption: `.bh-mention-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: ${space.x3};
  border: 0;
  padding: ${space.x3} ${space.x3};
  color: var(--tobs-ink-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.bh-mention-option:hover,
.bh-mention-option-active {
  background: var(--tobs-state-pressed);
}
.bh-mention-option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: ${space.x1};
}
.bh-mention-option-copy small,
.bh-mention-option-id {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
.bh-composer-shell {
  --bh-companion-avoid-inset: 0px;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${space.x2};
  margin: 0 ${space.x4} calc(${space.x4} + env(safe-area-inset-bottom, 0px));
  flex: 0 0 auto;
}
/* Cards above the composer (the Tob journey) share the composer's side inset. */
.bh-composer-inset { margin-inline: ${space.x4}; }
`,
  composerReply: `.bh-composer-reply {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: 0 0 ${space.x2} ${space.x3};
}
.bh-composer-reply-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: ${space.x1};
}
.bh-composer-reply-author {
  overflow: hidden;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-body {
  overflow: hidden;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-attachments {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  gap: ${space.x2};
  padding: ${space.x1} ${space.x2} ${space.x2} 0;
}
`,
  composerImagePreview: `.bh-composer-image-preview:disabled { cursor: default; }
`,
  composerImagePreviewImage: `.bh-composer-image-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.bh-composer-image-attachment[data-status='error'] .bh-composer-image-preview img { opacity: .55; }
`,
  composerFileCopy: `.bh-composer-file-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.bh-composer-attachment-size { color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-composer-attachment-name { display: block; overflow: hidden; min-width: 0; color: var(--tobs-ink-primary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; text-overflow: ellipsis; }
`,
  composerAttachmentRemove: `.bh-composer-attachment-remove:hover { background: var(--tobs-state-hover); color: var(--tobs-ink-primary); }
`,
  composerBody: `.bh-composer-body {
  position: relative;
  display: flex;
  min-width: 0;
  height: var(--bh-composer-body-height);
  overflow: hidden;
}
`,
  composerInput: `.bh-composer-input::placeholder {
  color: var(--tobs-ink-secondary);
}
.bh-composer-input:disabled {
  color: var(--tobs-ink-disabled);
  cursor: default;
}
`,
  composerHasMic: `.bh-composer-has-mic .bh-composer-footer { gap: ${space.x2}; }
`,
  composer: `.bh-composer[data-dictation='listening'] .bh-composer-input,
.bh-composer[data-dictation='finishing'] .bh-composer-input { caret-color: var(--tobs-accent-solid); }
.bh-composer[data-dictation='denied'] .bh-composer-input::placeholder,
.bh-composer[data-dictation='missing'] .bh-composer-input::placeholder,
.bh-composer[data-dictation='failed'] .bh-composer-input::placeholder { color: var(--tobs-status-danger-base); }
.bh-composer[data-dictation='starting'] .bh-composer-rich-input[contenteditable='false'],
.bh-composer[data-dictation='listening'] .bh-composer-rich-input[contenteditable='false'],
.bh-composer[data-dictation='finishing'] .bh-composer-rich-input[contenteditable='false'] { color: var(--tobs-ink-primary); }
.bh-composer[data-dictation='denied'] .bh-composer-rich-input:empty::before,
.bh-composer[data-dictation='missing'] .bh-composer-rich-input:empty::before,
.bh-composer[data-dictation='failed'] .bh-composer-rich-input:empty::before { color: var(--tobs-status-danger-base); }
html[data-botharness-motion='reduce'] .bh-composer,
html[data-botharness-motion='reduce'] .bh-composer-body,
html[data-botharness-motion='reduce'] .bh-composer-add-file,
html[data-botharness-motion='reduce'] .bh-composer-footer,
html[data-botharness-motion='reduce'] .bh-timeline-new {
  transition: none;
}

`,
  channelSidebarResize: `.bh-channel-sidebar-resize:hover {
  background: var(--tobs-line-edge);
}
`,
  sidebarToggle: `.bh-sidebar-toggle:hover {
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
}
.bh-channel-sidebar-tab-badge { display: inline-flex; }
.bh-channel-sidebar-tab-badge:empty { display: none; }
.bh-channel-sidebar-tab-badge > * + * { display: none; }
`,
  channelSidebarSplitPanes: `.bh-channel-sidebar-split-panes {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.bh-channel-sidebar-split-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bh-channel-sidebar-split-pane[data-split-pane='top'] { flex: var(--bh-split-top) 1 0; }
.bh-channel-sidebar-split-pane[data-split-pane='bottom'] {
  flex: var(--bh-split-bottom) 1 0;
  border-top: ${border.hairline} solid ${color.divider};
}
.bh-channel-sidebar-split-panes:has(> .bh-channel-sidebar-split-pane > [data-sidebar-entry]:not(:has(> [data-sidebar-entry-body]))) > .bh-channel-sidebar-split-pane {
  flex: 1 1 0;
}
.bh-channel-sidebar-split-pane:has(> [data-sidebar-entry]:not(:has(> [data-sidebar-entry-body]))) {
  flex: 0 0 auto !important;
}
.bh-channel-sidebar-split-panes:has(> .bh-channel-sidebar-split-pane > [data-sidebar-entry]:not(:has(> [data-sidebar-entry-body]))) .bh-channel-sidebar-split-handle {
  display: none;
}
`,
  sidebarSettings: `.bh-sidebar-settings {
  position: static;
}
.bh-sidebar-settings-list > [role="presentation"] { overflow: visible; }
.bh-model-menu-anchor { display: flex; width: 100%; min-width: 0; }
`,
  modelMenuList: `.bh-model-menu-list > [role="presentation"] { overflow: auto; }
.bh-model-menu-list .bh-move-checked { min-width: 0; }
.bh-sidebar-settings-group { position: relative; }
`,
  sidebarSettingsTrigger: `.bh-sidebar-settings-trigger > span { flex: 1; white-space: nowrap; }
.bh-sidebar-settings-trigger:hover, .bh-sidebar-settings-trigger:focus-visible { background: var(--tobs-state-hover); outline: none; }
`,
  channelSidebarEntryHead: `.bh-channel-sidebar-entry-head:hover {
  background: var(--tobs-state-hover);
}
`,
  channelSidebarEntryChevron: `.bh-channel-sidebar-entry-chevron.bh-chevron-collapsed,
.bh-workspace-folder-secondary:not([open]) > summary > .bh-channel-sidebar-entry-chevron {
  transform: rotate(-90deg);
}
.bh-channel-sidebar-entry-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.titleSize};
  line-height: ${text.bodyLine};
}
.bh-channel-sidebar-summary {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}
.bh-channel-sidebar-summary,
.bh-channel-sidebar-summary * {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`,
  channelSidebarOverlayLayer: `.bh-channel-sidebar-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  justify-content: flex-end;
}
.bh-channel-sidebar-overlay-layer:has([data-bh-remote-viewer-fullscreen]) {
  z-index: 8;
}
.bh-channel-sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--tobs-ink-primary) 22%, transparent);
}
`,
  channelSidebarEntryChevronMemoryDiffFileHeader: `html[data-botharness-motion='reduce'] .bh-channel-sidebar-entry-chevron,
html[data-botharness-motion='reduce'] [data-panel-chevron],
html[data-botharness-motion='reduce'] .bh-memory-diff-file-header > svg,
html[data-botharness-motion='reduce'] .bh-release-note-head::before {
  transition: none;
}
`,
  memberRow: `.bh-member-row {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  padding: ${space.x2} ${space.x3};
}

.bh-member-row .bh-name {
  flex: 1;
  min-width: 0;
}
.bh-member-open-dm {
  display: flex;
  flex: 1;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  border: 0;
  border-radius: ${radius.sm};
  padding: ${space.x1};
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-member-open-dm:hover { background: var(--bh-hover); }
`,
  memberMenuButton: `.bh-member-menu-button:hover,
.bh-member-menu-button[aria-expanded='true'] {
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
}
`,
  groupAvatarImage: `/* These controls are in native Modal portals, outside .bh-root. */
.bh-group-avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
`,
  groupAvatarStack: `/* Static member stack for a Group without an uploaded avatar: idle
   portraits on the Group tile. Two faces overlap on a diagonal with a ring in
   the tile fill; three or four sit in a 2x2 grid without overlap. Faces
   ignore the pointer so their per-Bot titles never surface as state. */
.bh-group-avatar-stack {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  background: var(--tobs-layer-elevated);
}
.bh-group-avatar-stack > .bh-persona-avatar {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 28%;
  pointer-events: none;
}
.bh-group-avatar-stack[data-count='1'] > .bh-persona-avatar { top: 50%; left: 50%; translate: -50% -50%; }
.bh-group-avatar-stack[data-count='2'] > .bh-persona-avatar { border: ${border.hairline} solid var(--tobs-layer-elevated); }
.bh-group-avatar-stack[data-count='2'] > :nth-child(1) { top: 8%; left: 8%; }
.bh-group-avatar-stack[data-count='2'] > :nth-child(2) { right: 8%; bottom: 8%; }
.bh-group-avatar-stack[data-count='3'] > :nth-child(1),
.bh-group-avatar-stack[data-count='4'] > :nth-child(1) { top: 5%; left: 5%; }
.bh-group-avatar-stack[data-count='3'] > :nth-child(2),
.bh-group-avatar-stack[data-count='4'] > :nth-child(2) { top: 5%; right: 5%; }
.bh-group-avatar-stack[data-count='3'] > :nth-child(3) { bottom: 5%; left: 50%; translate: -50% 0; }
.bh-group-avatar-stack[data-count='4'] > :nth-child(3) { bottom: 5%; left: 5%; }
.bh-group-avatar-stack[data-count='4'] > :nth-child(4) { right: 5%; bottom: 5%; }
.bh-group-profile-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: ${radius.md};
  overflow: hidden;
  background: var(--tobs-layer-raised);
  color: var(--tobs-ink-secondary);
  font-weight: ${text.strong};
}
`,
  groupProfileAvatar: `.bh-group-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bh-group-profile-authors {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-group-profile-authors li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x4};
}
.bh-group-manage-button {
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
  font-size: ${text.metaSize};
  padding: ${space.x2} ${space.x3};
}
.bh-group-manage-button:hover {
  background: var(--bh-hover);
  color: var(--tobs-ink-primary);
}
`,
  memberDeparture: `.bh-member-departure .bh-delivery-trigger {
  position: static;
  flex: 0 0 auto;
  background: transparent;
}

`,
};
