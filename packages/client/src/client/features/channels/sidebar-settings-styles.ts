import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { activityCss } from '../activity/styles.js';
import { appearanceCss } from '../appearance/styles.js';
import { channelsCss } from './styles.js';
import { memoryCss } from '../memory/styles.js';
import { messagingCss } from '../messaging/styles.js';
import { modelsCss } from '../models/styles.js';
import { workspacesCss } from '../workspaces/styles.js';

export const CHANNEL_SIDEBAR_SETTINGS_CSS = [
  `.bh-channel-sidebar {
  position: relative;
  width: 320px;
  flex: 0 0 320px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: ${border.hairline} solid ${color.divider};
}
.bh-channel-sidebar-resize {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}
`,
  channelsCss.channelSidebarResize,
  `.bh-channel-sidebar-head {
  min-height: 42px;
}
.bh-sidebar-toggle {
  position: absolute;
  top: calc((var(--bh-channel-header-height) - 28px) / 2);
  right: 8px;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
}
`,
  channelsCss.sidebarToggle,
  `.bh-channel-sidebar-live-dot { display: inline-block; width: 6px; height: 6px; border-radius: ${radius.round}; background: var(--tobs-status-success-base, var(--bh-accent)); }
`,
  channelsCss.channelSidebarSplitPanes,
  `.bh-channel-sidebar-split-handle {
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  z-index: 1;
  height: 7px;
  cursor: row-resize;
  touch-action: none;
}
.bh-channel-sidebar-split-handle:hover,
.bh-channel-sidebar-split-handle:focus-visible {
  outline: none;
  background: linear-gradient(transparent 2px, var(--tobs-accent-solid) 2px, var(--tobs-accent-solid) 4px, transparent 4px);
}
.bh-channel-sidebar-head .bh-sidebar-settings-menu {
  position: absolute;
  top: calc((var(--bh-channel-header-height) - 28px) / 2);
  right: 44px;
  z-index: 7;
}
`,
  channelsCss.sidebarSettings,
  `.bh-sidebar-settings-trigger { display: flex; align-items: center; gap: ${space.x2}; width: 100%; min-height: 30px; padding: ${space.x2} ${space.x3}; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--tobs-ink-primary); font-size: ${text.bodySize}; line-height: ${text.bodyLine}; text-align: left; cursor: pointer; }
`,
  channelsCss.sidebarSettingsTrigger,
  `.bh-sidebar-settings-options { position: absolute; top: 0; right: calc(100% + 10px); z-index: 1101; min-width: 163px; padding: ${space.x2}; box-sizing: border-box; box-shadow: var(--tobs-elevation-2); }
.bh-sidebar-settings-options::before { content: ''; position: absolute; top: 0; bottom: 0; right: -10px; width: 10px; }
@media (max-width: 480px) {
  .bh-sidebar-settings-options { top: 100%; right: 0; }
}
.bh-channel-sidebar-entry-head {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
`,
  channelsCss.channelSidebarEntryHead,
  `.bh-channel-sidebar-entry-chevron {
  flex: none;
  display: inline-flex;
  color: var(--tobs-ink-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
`,
  channelsCss.channelSidebarEntryChevron,
  modelsCss.modelEntry,
  `.bh-model-task[data-mode-switched='true'] > .bh-model-allowed,
.bh-model-task[data-mode-switched='true'] > .bh-model-picker > :not(.bh-model-picker-heading-row) {
  animation: bh-model-mode-enter 180ms var(--bh-ease-out);
}
@keyframes bh-model-mode-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
`,
  modelsCss.modelTask,
  `.bh-model-card-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  min-height: 28px;
  font-size: ${text.bodySize};
}
`,
  modelsCss.modelCardProvider,
  `.bh-model-card-field > span {
  min-width: 96px;
  color: var(--tobs-ink-secondary);
}
`,
  modelsCss.modelCardEfforts,
  `.bh-inbox-item:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: -2px;
}
`,
  activityCss.externalSourceFile,
  `.bh-external-source-video video { display: block; max-width: 100%; max-height: 420px; }
`,
  activityCss.externalSourceAudio,
  `.bh-external-source-image { display: block; max-width: 100%; max-height: 384px; object-fit: contain; margin-block: ${space.x3}; }
`,
  activityCss.externalSourceFileLabel,
  messagingCss.externalRoute,
  `.bh-external-scope {
  padding: 1px ${space.x2};
  border-radius: ${radius.sm};
  font-size: ${text.metaSize};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-secondary);
}
`,
  messagingCss.externalRouteLabel,
  `.bh-external-original { padding: 20px 0; }
`,
  messagingCss.externalMessage,
  `.bh-external-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-secondary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
`,
  messagingCss.externalMessageMain,
  `.bh-external-details > summary:focus-visible {
  outline: ${border.focus} solid var(--tobs-accent-solid);
  outline-offset: 2px;
  border-radius: ${radius.sm};
}
`,
  messagingCss.externalDetailBody,
  `.bh-external-context-messages { display: flex; flex-direction: column; gap: 20px; padding-top: ${space.x5}; }
@media (max-width: 480px) {
  .bh-external-message { gap: ${space.x3}; }
  .bh-external-avatar { flex-basis: 28px; height: 28px; font-size: ${text.metaSize}; }
  .bh-external-message-text { padding: ${space.x3} ${space.x3}; }
}
`,
  channelsCss.channelSidebarOverlayLayer,
  `.bh-channel-sidebar-overlay {
  position: relative;
  height: 100%;
  background: var(--tobs-layer-canvas);
  box-shadow: -8px 0 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
}
`,
  channelsCss.channelSidebarEntryChevronMemoryDiffFileHeader,
  workspacesCss.workspaceGrants,
  `.bh-workspace-folder-remove {
  display: grid;
  flex: none;
  width: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
}
`,
  workspacesCss.workspaceFolderRemove,
  `.bh-workspace-folder-toggle:focus-visible, .bh-workspace-folder-remove:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: -2px;
}
.bh-workspace-folder-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space.x3};
  padding: 0 ${space.x3} ${space.x3} 32px;
}
`,
  workspacesCss.workspaceFolderPath,
  memoryCss.memoryEntry,
  `.bh-memory-editor textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x3};
  background: var(--tobs-layer-canvas);
  color: var(--tobs-ink-primary);
  font-family: ${font.familyMono};
  font-size: ${text.metaSize};
}


`,
  channelsCss.memberRow,
  `.bh-member-open-dm:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}

.bh-member-menu-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-tertiary);
  cursor: pointer;
}
`,
  channelsCss.memberMenuButton,
  `.bh-group-attention-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  display: inline-flex;
  min-width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  padding: 0 ${space.x1};
  border-radius: 999px;
  background: var(--tobs-status-danger-base);
  color: var(--tobs-layer-canvas);
  font-size: 9px;
  line-height: ${text.metaLine};
}
`,
  channelsCss.groupAvatarImage,
  `.bh-group-avatar-topbar { width: 22px; height: 22px; border-radius: ${radius.sm}; }
`,
  channelsCss.groupAvatarStack,
  `.bh-group-profile-avatar-small { width: 40px; height: 40px; }
.bh-group-profile-avatar-large { width: 64px; height: 64px; border-radius: ${radius.lg}; }
`,
  channelsCss.groupProfileAvatar,
  `/* Native General-row cell rhythm (ui-theme FontSizeRow / ui-chat
   TranscriptViewRow): title + description left, selector pill right, hairline
   separator the General section strips on its last child. */
/* The Bot mark: one box sized by the caller, artwork resolved per palette. */
.bh-bot-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--bh-bot-icon-size, 16px);
  height: var(--bh-bot-icon-size, 16px);
}

`,
  appearanceCss.botIcon,
  `.bh-bot-nav-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

`,
  appearanceCss.botNavIcon,
  `.bh-channel-settings-caption-avatar {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.sm};
  overflow: hidden;
  color: var(--tobs-ink-secondary);
  font-weight: ${text.strong};
}
`,
  appearanceCss.channelSettingsCaptionText,
  `@media (max-width: 720px) {
  .bh-composer-shell,
  .bh-composer-inset {
    margin-right: ${space.x3};
    margin-left: ${space.x3};
  }
  .bh-settings-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .bh-settings-row-text {
    flex-basis: 100%;
    padding-right: 0;
  }
}
/* Human approval in a Channel message uses the same Host folder browser as sidebar access. */
.bh-grant-request-card { --bh-message-card-gap: ${space.x4}; display: grid; gap: var(--bh-message-card-gap); min-width: min(340px, 100%); }
`,
].join('');
