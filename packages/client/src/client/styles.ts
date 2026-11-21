import { WORKSPACE_CSS } from './workspace-styles.js';
import { INTERNAL_TOUR_CSS } from './internal-tour-styles.js';
import { COMPOSER_CONTEXT_CSS } from './composer-context-styles.js';
import { WINDOW_COMPANION_CSS } from './window-companion-styles.js';
import { COMBOBOX_CSS } from './combobox.js';
import { CHANNEL_DOCK_CSS } from './channel-dock-styles.js';
import { GENERATED_FILES_CSS } from './generated-files-styles.js';
import { CALL_CSS } from './call-styles.js';
import { VOICE_RIPPLE_CSS } from './voice-ripple-styles.js';
import { ACTIVITY_INBOX_CSS } from './activity-inbox-styles.js';
import { MOBILE_APPS_CSS } from './mobile-apps-styles.js';
import { STYLEX_CSS } from './ds/stylex-css.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';
import { font } from './ds/tobs.stylex.js';
import { ASSIGNMENT_SESSION_ICON, channelSidebarIconMask } from './channel-sidebar-icon.js';
import { activityCss } from './features/activity/styles.js';
import { appearanceCss } from './features/appearance/styles.js';
import { approvalsCss } from './features/approvals/styles.js';
import { assignmentsCss } from './features/assignments/styles.js';
import { avatarsCss } from './features/avatars/styles.js';
import { channelFilesCss } from './features/channel-files/styles.js';
import { channelsCss } from './features/channels/styles.js';
import { timelineCss } from './features/channels/timeline-styles.js';
import { marketplaceCss } from './features/marketplace/styles.js';
import { memoryCss } from './features/memory/styles.js';
import { messagingCss } from './features/messaging/styles.js';
import { modelsCss } from './features/models/styles.js';
import { personabotsCss } from './features/personabots/styles.js';
import { privateInputCss } from './features/private-input/styles.js';
import { releaseCss } from './features/release/styles.js';
import { schedulesCss } from './features/schedules/styles.js';
import { sessionsCss } from './features/sessions/styles.js';
import { skillsCss } from './features/skills/styles.js';
import { usageCss } from './features/usage/styles.js';
import { workspacesCss } from './features/workspaces/styles.js';
import { sharedCss } from './shared-styles.js';
import { SHELL_AND_ROSTER_CSS } from './shell-and-roster-styles.js';

const ASSIGNMENT_SESSION_MASK = channelSidebarIconMask(ASSIGNMENT_SESSION_ICON);
export const CSS = [
  WORKSPACE_CSS,
  COMPOSER_CONTEXT_CSS,
  INTERNAL_TOUR_CSS,
  COMBOBOX_CSS,
  WINDOW_COMPANION_CSS,
  CHANNEL_DOCK_CSS,
  GENERATED_FILES_CSS,
  CALL_CSS,
  VOICE_RIPPLE_CSS,
  ACTIVITY_INBOX_CSS,
  MOBILE_APPS_CSS,
  SHELL_AND_ROSTER_CSS,
  `.bh-root .bh-multi-selected {
  background: var(--bh-selected);
  box-shadow: inset 0 0 0 1px var(--tobs-line-edge);
}
.bh-shortcut-badge {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.xs};
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-primary);
  font: ${text.metaSize}/1 ${font.familySans};
  pointer-events: none;
}
.bh-pinned .bh-shortcut-badge {
  top: 8px;
  right: 5px;
  transform: none;
}
.bh-rail-channel .bh-shortcut-badge {
  top: -2px;
  right: -2px;
  transform: none;
  width: 16px;
  height: 16px;
  font-size: ${text.metaSize};
}

`,
  personabotsCss.contact,
  `.bh-unread-count {
  display: inline-flex;
  flex: none;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 ${space.x2};
  border-radius: ${radius.round};
  background: var(--bh-accent);
  color: var(--tobs-accent-on-solid);
  font: ${text.strong} ${text.metaSize}/1 ${font.familySans};
  font-variant-numeric: tabular-nums;
}
.bh-pinned .bh-unread-count,
.bh-rail-channel .bh-unread-count {
  position: absolute;
  top: 4px;
  right: 4px;
  pointer-events: none;
}
.bh-rail-channel .bh-unread-count {
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 ${space.x1};
}
`,
  personabotsCss.rowAvatar,
  `.bh-row-glyph {
  flex: none;
  display: block;
  width: 16px;
  height: 16px;
  color: var(--tobs-ink-primary);
}
`,
  personabotsCss.rowGlyphRing,
  `.bh-unread {
  width: 8px;
  height: 8px;
  border-radius: ${radius.round};
  background: var(--bh-accent);
  flex: 0 0 auto;
}

.bh-channel-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md};
  overflow: hidden;
  background: ${color.hover};
  color: var(--tobs-ink-secondary);
  font-weight: ${text.strong};
}

`,
  personabotsCss.channelRow,
  `.bh-channel-row.bh-drop-before::before,
.bh-channel-row.bh-drop-after::after,
.bh-contact.bh-drop-before::before,
.bh-contact.bh-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 4px;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--tobs-accent-solid) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}
.bh-channel-row.bh-drop-before::before,
.bh-contact.bh-drop-before::before {
  top: -7px;
}
.bh-channel-row.bh-drop-after::after,
.bh-contact.bh-drop-after::after {
  bottom: -7px;
}

`,
  personabotsCss.section,
  `.bh-section.bh-drop-before::before,
.bh-section.bh-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--tobs-accent-solid) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}
.bh-section.bh-drop-before::before {
  top: -8px;
}
.bh-section.bh-drop-after::after {
  bottom: -8px;
}

`,
  personabotsCss.sectionDropScope,
  `.bh-section.bh-drop-scope > .bh-list-area::before {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 4px;
  top: 100%;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--tobs-accent-solid) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--tobs-accent-solid) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}

`,
  personabotsCss.pinZone,
  `/* 原生 WorkspaceBrowser 的 .renameInput（shipped dialog 用的是 feature-local
   普通 input，不是 primitives Input）：类自身拥有完整盒模型，Modal 在 body
   下也不依赖 .bh-root 前缀。几何逐项对齐原生：高 44、内衬 7/14、圆角 22、
   border-l4、透明底、14/22 label-primary、outline none。 */
.bh-name-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 7px 14px;
  border: 0.5px solid var(--tobs-line-strong);
  border-radius: 22px;
  outline: none;
  background: transparent;
  font-size: ${text.titleSize};
  font-weight: ${text.regular};
  line-height: ${text.bodyLine};
  color: var(--tobs-ink-primary);
}
`,
  sharedCss.nameInput,
  `.bh-role-edit-badge button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: -${space.x1};
  border: 0;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
  color: var(--tobs-ink-tertiary);
  cursor: pointer;
}
`,
  sharedCss.roleEditBadge,
  marketplaceCss.marketSubmit,
  `.bh-market-topic {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  height: 24px;
  padding: 0 ${space.x3};
  border: 0;
  border-radius: ${radius.md};
  background: ${color.surface};
  color: var(--tobs-ink-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  cursor: pointer;
}
`,
  marketplaceCss.marketTopic,
  `.bh-market-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-content: start;
  gap: ${space.x4};
  max-height: min(54vh, 560px);
  overflow-y: auto;
  padding: ${space.x1};
}
`,
  marketplaceCss.marketStack,
  `.bh-market-panel > .bh-market-browse > :first-child { flex-basis: 160px; }
`,
  marketplaceCss.marketPanel,
  `.bh-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  align-content: start;
  gap: ${space.x3};
}
`,
  marketplaceCss.marketPanelFooter,
  `.bh-market-carousel {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: min(240px, 80%);
  gap: ${space.x3};
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
`,
  marketplaceCss.marketCarousel,
  `button.bh-market-file:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: -2px; }
`,
  marketplaceCss.marketFilesHead,
  `.bh-market-file-bar {
  display: flex;
  gap: ${space.x1};
  height: 8px;
  overflow: hidden;
  border-radius: ${radius.xs};
}
.bh-market-file-bar i { flex-basis: 0; min-width: 4px; height: 100%; }
`,
  marketplaceCss.marketFileLegend,
  `.bh-market-file-legend i { width: 8px; height: 8px; border-radius: ${radius.xs}; }
`,
  marketplaceCss.marketFiles,
  skillsCss.skillRow,
  `.bh-file-preview {
  max-height: min(64vh, 560px);
  overflow-y: auto;
  min-width: 0;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
}
.bh-skill-row:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: -2px; }
`,
  skillsCss.skillRowName,
  `.bh-market-reader-code {
  max-height: min(56vh, 480px);
  margin: 0;
  overflow: auto;
  padding: ${space.x3} ${space.x4};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-well);
  font-family: ${font.familyMono};
  font-size: ${text.metaSize};
  line-height: ${text.bodyLine};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`,
  marketplaceCss.marketFileName,
  `/* A profile card: banner on top, the Bot's avatar half over its lower edge, identity below. */
.bh-market-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  padding: ${space.x3} ${space.x3} ${space.x3};
  border-radius: ${radius.lg};
  background: var(--tobs-layer-raised);
  transition: border-color 120ms ease, transform 120ms ease;
}
`,
  marketplaceCss.marketRow,
  `@media (hover: hover) and (pointer: fine) {
  html:not([data-botharness-motion='reduce']) .bh-market-row:hover { transform: translateY(-1px); }
}
`,
  marketplaceCss.marketRowMarketBannerThumb,
  `/* The avatar rides half over the banner; name, repository and Install sit beside it. */
.bh-market-row-head {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: ${space.x3};
  min-width: 0;
  margin-top: -32px;
  padding: 0 ${space.x2} 0 ${space.x3};
}
`,
  marketplaceCss.marketRowHead,
  `.bh-market-hero > .bh-market-row-head { margin-top: -36px; padding-left: ${space.x4}; }
`,
  marketplaceCss.marketHero,
  `.bh-market-github {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  background: var(--tobs-layer-raised);
  color: var(--tobs-ink-primary);
}
`,
  marketplaceCss.marketGithub,
  `.bh-market-github:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-market-readme {
  max-height: min(56vh, 480px);
  overflow-y: auto;
  padding-top: ${space.x4};
  border-top: ${border.hairline} solid ${color.divider};
  min-width: 0;
}
`,
  marketplaceCss.marketReadme,
  `.bh-market-report textarea:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
`,
  marketplaceCss.marketConfirm,
  `.bh-market-facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: ${space.x4};
}
`,
  marketplaceCss.marketFacts,
  `.bh-market-review-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${color.accent};
  animation: bh-market-review-pulse 1.2s ease-in-out infinite;
}
@keyframes bh-market-review-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
html[data-botharness-motion='reduce'] .bh-market-review-pulse { animation: none; }
`,
  marketplaceCss.marketReviewResult,
  `.bh-market-finding {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: ${space.x3};
  align-items: start;
}
.bh-market-finding-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: ${radius.sm};
  background: ${color.surface};
  color: ${color.danger};
}
`,
  marketplaceCss.marketFindingIcon,
  sharedCss.note,
  `.bh-skeleton-messages {
  gap: ${space.x6};
  padding: 20px ${space.x6};
}
`,
  sharedCss.skeletonRow,
  `html[data-botharness-motion='full'] .bh-skeleton-avatar,
html[data-botharness-motion='full'] .bh-skeleton-line {
  animation: bh-skeleton-pulse 1.6s ease-in-out infinite;
}
.bh-skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: ${radius.round};
}
`,
  sharedCss.skeletonLines,
  `.bh-skeleton-line {
  width: 84%;
  height: 10px;
}
`,
  sharedCss.skeletonLineShort,
  channelsCss.main,
  `.bh-main {
  --bh-channel-header-height: 53px;
}
.bh-topbar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  display: flex;
  justify-content: center;
  min-width: 0;
  padding: ${space.x3} 52px 0;
  pointer-events: none;
}
.bh-channel-island {
  display: inline-flex;
  align-items: center;
  gap: ${space.x3};
  max-width: min(100%, 440px);
  min-height: 34px;
  padding: ${space.x2} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  background: var(--tobs-layer-raised);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
  color: var(--tobs-ink-primary);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
`,
  channelsCss.channelIsland,
  `.bh-channel-island:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
`,
  channelsCss.channelIslandContent,
  `.bh-group-activity-chip { display: inline-flex; min-width: 0; max-width: 100%; border-radius: 999px; }
.bh-group-activity-chip:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 2px; }
`,
  channelsCss.groupActivityPill,
  `.bh-group-activity-chip-name { min-width: 0; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tobs-ink-primary); }
`,
  channelsCss.groupActivityChipState,
  `.bh-channel-island-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: min(100%, 440px);
  pointer-events: auto;
}
`,
  personabotsCss.profileName,
  avatarsCss.avatarMediaComposed,
  `.bh-avatar-editor { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: ${space.x6}; align-items: start; }
`,
  avatarsCss.avatarEditorPreview,
  `.bh-avatar-families button { min-height: 26px; padding: 0 ${space.x4}; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
`,
  avatarsCss.avatarFamilies,
  `.bh-avatar-ranges { display: flex; flex-direction: column; gap: ${space.x3}; max-width: 360px; }
.bh-avatar-ranges label { display: grid; grid-template-columns: 72px minmax(0, 1fr) 28px; align-items: center; gap: ${space.x3}; font-size: ${text.bodySize}; color: var(--tobs-ink-secondary); }
`,
  avatarsCss.avatarRanges,
  `.bh-avatar-categories button { min-height: 28px; padding: 0 ${space.x3}; border: ${border.hairline} solid transparent; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
`,
  avatarsCss.avatarCategories,
  `.bh-avatar-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: ${space.x3}; }
`,
  avatarsCss.avatarOption,
  `.bh-part-divider { width: 1px; height: 20px; background: var(--tobs-line-edge); }
`,
  avatarsCss.partOptions,
  `.bh-part-cursor { position: absolute; box-sizing: border-box; border: ${border.focus} solid var(--tobs-ink-primary); box-shadow: 0 0 0 1px var(--tobs-layer-canvas); pointer-events: none; }
.bh-part-draw { align-self: stretch; min-width: 88px; padding: 0 ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); font: inherit; touch-action: none; user-select: none; }
`,
  avatarsCss.partWorkspace,
  `.bh-part-grid { position: absolute; inset: 0 0 auto 0; display: grid; outline: ${border.focus} dashed var(--tobs-ink-secondary); outline-offset: -1px; }
.bh-part-cell { box-shadow: inset 0 0 0 0.5px var(--tobs-line-edge); cursor: crosshair; }
`,
  avatarsCss.partCell,
  `.bh-part-preview svg { display: block; width: 32px; height: 32px; image-rendering: pixelated; }
`,
  avatarsCss.partPalette,
  `.bh-part-swatch { width: 18px; height: 18px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.xs}; cursor: pointer; }
.bh-part-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 1px; }
`,
  avatarsCss.partName,
  `.bh-part-name input { flex: 1; min-height: 30px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: inherit; font: inherit; }
`,
  avatarsCss.partLibraryActions,
  `.bh-part-image input, .bh-part-image select { min-height: 28px; padding: 0 ${space.x2}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: inherit; font: inherit; }
.bh-part-image input { width: 72px; }
.bh-avatar-color-reset { min-height: 26px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
`,
  avatarsCss.avatarColors,
  `.bh-avatar-color-row > span { width: 72px; color: var(--tobs-ink-secondary); }
.bh-avatar-swatch { width: 24px; height: 24px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; cursor: pointer; }
.bh-avatar-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
.bh-avatar-color-row input { width: 32px; height: 26px; padding: 0 ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); }
.bh-avatar-editor-fields :focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
`,
  avatarsCss.composedAvatarRaster,
  `@media (max-width: 640px) { .bh-avatar-editor { grid-template-columns: minmax(0, 1fr); } .bh-avatar-options { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); } }
`,
  personabotsCss.bannerArt,
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
  timelineCss.chatLayout,
  `.bh-chat-body {
  mask-image: linear-gradient(to bottom, transparent, black min(var(--bh-chat-mask-top, ${space.x6}), 20%), black calc(100% - var(--bh-composer-overlay, 0px) - ${space.x6}), transparent calc(100% - var(--bh-composer-overlay, 0px)));
  mask-mode: alpha;
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  margin-bottom: calc(-1 * var(--bh-composer-overlay, 0px));
  --bh-chat-top-inset: 74px;
  --bh-code-sticky-top: calc(var(--bh-chat-mask-top, ${space.x6}) - var(--bh-chat-top-inset));
  padding: var(--bh-chat-top-inset) ${space.x5} calc(${space.x6} + var(--bh-companion-read-inset, 0px) + var(--bh-composer-overlay, 0px));
  overscroll-behavior: contain;
}
`,
  timelineCss.markdownCodeBlock,
  `.bh-timeline-top-sentinel,
.bh-timeline-newer-sentinel {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
  timelineCss.timelineTopSentinel,
  `.bh-message-day {
  width: fit-content;
  margin: ${space.x3} auto ${space.x5};
  padding: ${space.x1} ${space.x3};
  border-radius: 999px;
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
  timelineCss.messageGroup,
  `/* The avatar rests at its group's last bubble and pins to the timeline's
   bottom edge while a taller group scrolls past, so the author stays visible.
   The sticky edge already sits inside .bh-chat-body's bottom padding. */
.bh-message-group-avatar {
  position: sticky;
  bottom: 0;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: flex-end;
  border: 0;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
}
.bh-message-group-avatar-link {
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: transparent;
  outline: none;
}
`,
  timelineCss.messageGroupAvatarLink,
  `.bh-message-group-human-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 28px;
  height: 28px;
  border-radius: ${radius.round};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
}
.bh-message-group-human-avatar svg { width: 18px; height: 18px; }

/* Header working status: a visually hidden status region in the chat pane
   announces the same Bots, so this copy is hidden from assistive tech. */
.bh-header-working {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  padding-left: ${space.x3};
  border-left: ${border.hairline} solid ${color.divider};
  transform-origin: left center;
  animation: bh-header-working-enter 180ms var(--bh-ease-out) both;
}
.bh-header-working-avatars { flex-shrink: 0; }
.bh-header-working-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--tobs-ink-tertiary);
  font-weight: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-conversation-title] > .bh-header-working-summary { display: block; }
html[data-botharness-motion='reduce'] .bh-header-working { animation-name: bh-fade-in; }
`,
  timelineCss.headerWorkingKeyframes,
  `.bh-message-group-avatar-link:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
.bh-message-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: min(720px, calc(100% - 56px));
}
`,
  timelineCss.messageGroupMe,
  `.bh-bridge-source-author:hover {
  color: var(--tobs-ink-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.bh-bridge-source-author:focus-visible {
  outline: ${border.focus} solid var(--tobs-accent-solid);
  outline-offset: 3px;
  border-radius: ${radius.sm};
}
.bh-bridge-source-modal {
  width: min(560px, 100%);
  max-height: 100%;
}
`,
  timelineCss.bridgeSourceFields,
  `.bh-bridge-source-fields > div {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 3fr);
  gap: ${space.x4};
}
`,
  timelineCss.bridgeSourceFieldLabels,
  `.bh-bubble-failed-action:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
`,
  timelineCss.bubbleWrap,
  `.bh-bubble-enter {
  transform-origin: left bottom;
  animation: bh-bubble-enter 220ms var(--bh-ease-out) both;
}
.bh-message-group-me .bh-bubble-enter { transform-origin: right bottom; }
html[data-botharness-motion='reduce'] .bh-bubble-enter { animation-name: bh-fade-in; }
`,
  timelineCss.bubbleEnterKeyframes,
  `.bh-message-group-enter .bh-message-group-avatar {
  transform-origin: center bottom;
  animation: bh-avatar-enter 220ms var(--bh-ease-out) both;
}
.bh-message-group-enter .bh-message-identity {
  animation: bh-fade-in 220ms var(--bh-ease-out) both;
}
html[data-botharness-motion='reduce'] .bh-message-group-enter .bh-message-group-avatar {
  animation-name: bh-fade-in;
}
`,
  timelineCss.avatarEnterKeyframes,
  `/* Same rule as mobile: a lone single-line bubble is a pill on every corner; inside a
   group a single-line bubble keeps the multi-line radius so the stack reads as one shape. */
.bh-bubble.bh-bubble[data-single-line][data-group-position='solo'] {
  border-radius: 999px;
}
`,
  timelineCss.bubbleBadges,
  `.bh-reading {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  padding: ${space.x2} ${space.x3} ${space.x2} ${space.x2};
  border: ${border.focus} solid var(--tobs-layer-canvas);
  border-radius: 999px;
  background: ${color.surface};
  color: var(--tobs-ink-tertiary);
  pointer-events: auto;
}
`,
  timelineCss.stackAvatar,
  `.bh-stack-human {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--tobs-ink-primary);
  font-size: calc(${text.metaSize} - ${space.x1});
  font-weight: ${text.strong};
}
`,
  timelineCss.stackMore,
  `[data-badge-motion='enter'] {
  animation: bh-badge-in 180ms var(--bh-ease-out) both;
}
[data-badge-motion='leave'] {
  animation: bh-badge-out 150ms var(--bh-ease-out) both;
  pointer-events: none;
}
/* A Bot that reads for only a moment never shows its chip: the chip waits 300ms
   before it fades in and is dropped if the reading ends first. Once shown it holds
   for 800ms before it leaves, so it never blinks out. */
.bh-reading[data-badge-motion='enter'] {
  animation-delay: 300ms;
}
.bh-reading[data-badge-motion='leave'] {
  animation-delay: 800ms;
}
html[data-botharness-motion='reduce'] [data-badge-motion='enter'] { animation-name: bh-fade-in; }
html[data-botharness-motion='reduce'] [data-badge-motion='leave'] { animation-name: bh-fade-out; }
`,
  timelineCss.badgeEnterKeyframes,
  `.bh-bubble-focused .bh-bubble {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
`,
  timelineCss.bubbleReplyThumb,
  `.bh-bubble-reply-thumb {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: ${radius.xs};
  object-fit: cover;
  background: color-mix(in srgb, currentColor 13%, transparent);
}

`,
  channelFilesCss.bubbleContent,
  `/* Bound intrinsic attachment width too, so long filenames do not widen the bubble. */
.bh-message-attachments { display: grid; max-width: 320px; gap: ${space.x3}; margin-top: ${space.x3}; }
.bh-message-voice { max-width: 320px; }
`,
  channelFilesCss.messageVoice,
  `.bh-bridge-image { max-width: min(100%, 320px); }
`,
  channelFilesCss.bridgeImageButton,
  `.bh-bridge-image-button:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 2px; }
.bh-bridge-image-state { display: flex; align-items: center; gap: ${space.x3}; min-height: 96px; color: var(--tobs-ink-secondary); }
`,
  channelFilesCss.bridgeImageExpanded,
  `.bh-message-image { display: block; max-width: 100%; max-height: 320px; border-radius: ${radius.md}; object-fit: contain; }
.bh-message-album { display: grid; gap: 0; width: 320px; max-width: 100%; overflow: hidden; border-radius: ${radius.md}; }
`,
  channelFilesCss.messageAlbumCell,
  `.bh-message-album-tile:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: -2px; }
`,
  channelFilesCss.messageAlbumTile,
  `.bh-message-album-more { position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, black 55%, transparent); color: white; font-size: ${text.titleSize}; font-weight: ${text.strong}; pointer-events: none; }
.bh-message-file { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; width: fit-content; max-width: min(100%, 320px); min-height: 52px; padding: ${space.x3} ${space.x3} ${space.x3} ${space.x4}; border: 0; border-radius: ${radius.md}; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; }
`,
  channelFilesCss.messageFile,
  `.bh-message-file-tile { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: ${radius.sm}; background: var(--bh-file-tone); color: white; font-size: ${text.metaSize}; font-weight: ${text.strong}; letter-spacing: 0.03em; line-height: 1; }
`,
  channelFilesCss.messageFileTile,
  `.bh-message-file-main:focus-visible, .bh-message-file-download:focus-visible, .bh-message-audio-play:focus-visible, .bh-message-audio-spectrum:focus-visible { outline: ${border.focus} solid currentColor; outline-offset: 2px; }
.bh-message-file-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; }
`,
  channelFilesCss.messageFileCopy,
  `.bh-message-file-divider { flex: none; align-self: stretch; width: 1px; margin-block: ${space.x1}; background: var(--tobs-line-edge); }
.bh-message-file-download { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: ${radius.sm}; color: inherit; text-decoration: none; }
`,
  channelFilesCss.messageFileDownload,
  `.bh-message-audio-play { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: ${radius.round}; corner-shape: round; background: ${color.accent}; color: ${color.onAccent}; cursor: pointer; }
`,
  channelFilesCss.bubbleMe,
  `.bh-message-audio-spectrum { display: flex; align-items: center; gap: ${space.x1}; height: 24px; padding: 0; border-radius: ${radius.xs}; cursor: pointer; touch-action: none; }
`,
  channelFilesCss.messageAudioSpectrum,
  `.bh-message-audio-bar { flex: none; width: 3px; border-radius: ${radius.xs}; background: color-mix(in srgb, currentColor 30%, transparent); }
`,
  channelFilesCss.messageAudioBar,
  timelineCss.bubbleSide,
  `.bh-bubble[data-bubble-media] {
  width: 320px;
  padding: 0;
  overflow: hidden;
}
`,
  timelineCss.bubble,
  `/* Narrow screens: inline copy/reply actions crowd the bubble, so they move
   into the long-press message menu and the bubble keeps the full width. */
@media (max-width: 640px) {
  .bh-bubble-toolbar {
    display: none;
  }
}
`,
  timelineCss.timelineJumpAnchor,
  `.bh-timeline-new {
  position: absolute;
  z-index: 2;
  bottom: ${space.x3};
  right: ${space.x4};
  max-width: calc(100% - ${space.x4} * 2);
  border: 0;
  border-radius: calc(${radius.panel} + ${space.x3});
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: ${size.row};
  height: ${size.row};
  box-sizing: border-box;
  padding: 0 ${space.x3};
  color: var(--bh-timeline-new-fg, var(--tobs-ink-secondary));
  background: var(--bh-timeline-new-bg, var(--tobs-layer-elevated));
  box-shadow: var(--tobs-elevation-1);
  opacity: 1;
  cursor: pointer;
  transition:
    background-color 200ms var(--ds-ease-in-out),
    color 200ms var(--ds-ease-in-out);
}
`,
  timelineCss.timelineNew,
  sessionsCss.sessionChrome,
  `.bh-inline-mention,
.bh-bubble-body-markdown a[href^="https://session.tobs.invalid/"] {
  border-radius: ${radius.xs};
  background: var(--tobs-state-pressed);
  color: var(--tobs-ink-primary);
  box-shadow: 0 0 0 1px var(--tobs-state-pressed);
}
`,
  channelsCss.inlineMentionSent,
  `a[href^="https://session.tobs.invalid/"]::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: ${space.x1};
  vertical-align: -2px;
  background: currentColor;
  -webkit-mask: ${ASSIGNMENT_SESSION_MASK} center / contain no-repeat;
  mask: ${ASSIGNMENT_SESSION_MASK} center / contain no-repeat;
}
.bh-inline-mention-link:hover,
.bh-bubble-body-markdown a[href^="https://session.tobs.invalid/"]:hover {
  background: var(--tobs-state-hover);
  box-shadow: 0 0 0 1px var(--tobs-state-hover);
}
.bh-inline-mention-link:focus-visible {
  outline: ${border.focus} solid currentColor;
  outline-offset: 2px;
}
.bh-bubble-me .bh-inline-mention {
  color: inherit;
  background: color-mix(in srgb, currentColor 14%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 14%, transparent);
}
`,
  channelsCss.bubbleMe,
  `.bh-bubble-me .bh-inline-mention-link:hover {
  background: color-mix(in srgb, currentColor 24%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent);
}
`,
  channelsCss.composerRichInput,
  `.bh-composer-inline-attachment {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  box-sizing: border-box;
  max-width: min(100%, 320px);
  padding: 0 ${space.x2};
  font: inherit;
  line-height: ${text.bodyLine};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  vertical-align: middle;
  user-select: all;
  cursor: pointer;
}
`,
  channelsCss.composerInlineAttachment,
  `.bh-composer-attachment-reference { display: grid; place-items: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); cursor: pointer; }
`,
  channelsCss.composerAttachmentReference,
  `.bh-composer-attachment-reference:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: 2px; }
`,
  channelsCss.composerAttachmentReferenceDisabled,
  `.bh-composer-image-reference,
.bh-composer-file-reference { position: absolute; bottom: 2px; right: 2px; width: 20px; height: 20px; }
.bh-delivery-trigger {
  position: absolute;
  z-index: 2;
  right: -27px;
  bottom: 2px;
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 ${space.x1};
  border: 0;
  border-radius: 999px;
  background: var(--tobs-layer-canvas);
  cursor: pointer;
}
.bh-message-group-me .bh-delivery-trigger {
  right: auto;
  left: -27px;
}
`,
  channelsCss.deliveryTrigger,
  `.bh-delivery-trigger:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}

`,
  channelsCss.deliveryStack,
  `.bh-delivery-human-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: ${radius.round};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
  font-weight: ${text.strong};
}
`,
  channelsCss.deliveryLegendRetryable,
  `/* The receipt card portals to body so it remains visible at the edge of the
   scrolling Channel timeline. It reads DSH tokens directly, like HoverCard. */
.bh-delivery-panel {
  position: fixed;
  z-index: 1000;
  width: min(320px, calc(100vw - 16px));
  max-height: min(400px, calc(100vh - 16px));
  overflow: auto;
  padding: ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
  color: var(--tobs-ink-primary);
  font: ${text.metaSize}/1.5 ${font.familySans};
}
.bh-delivery-panel:focus {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
`,
  channelsCss.deliveryPanelSummary,
  `.bh-delivery-legend {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: ${radius.round};
  background: currentColor;
}
`,
  channelsCss.deliveryPanelGroup,
  `.bh-mention-picker {
  max-height: 280px;
  overflow-y: auto;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent);
}
`,
  channelsCss.mentionOption,
  `.bh-composer {
  --bh-composer-body-height: 34px;
  --bh-composer-compact-padding-left: 48px;
  --bh-composer-compact-padding-right: 52px;
  position: relative;
  min-height: 50px;
  box-sizing: border-box;
  overflow: hidden;
  --bh-composer-footer-padding: 10px 12px 48px;
  padding: var(--bh-composer-padding, ${space.x3} var(--bh-composer-compact-padding-right) ${space.x3} var(--bh-composer-compact-padding-left));
  border: ${border.hairline} solid transparent;
  transition:
    padding 180ms var(--bh-ease-out),
    border-color 160ms var(--ds-ease-in-out);
}
`,
  channelsCss.composerReply,
  `.bh-composer-attachment-card {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 180px;
  box-sizing: border-box;
  width: 180px;
  height: 48px;
  min-width: 0;
  gap: ${space.x2};
  padding: ${space.x2} ${space.x6} ${space.x2} ${space.x2};
  border-radius: ${radius.sm};
  background: var(--tobs-layer-field);
  color: var(--tobs-ink-secondary);
}
.bh-composer-image-preview {
  display: block;
  flex: none;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border-radius: ${radius.sm};
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
`,
  channelsCss.composerImagePreview,
  `.bh-composer-image-preview:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: -3px; }
`,
  channelsCss.composerImagePreviewImage,
  `.bh-composer-file-icon { display: grid; place-items: center; flex: none; width: 32px; height: 32px; }
.bh-composer-attachment-card .bh-composer-attachment-remove { top: 2px; right: 2px; width: 20px; height: 20px; }
`,
  channelsCss.composerFileCopy,
  `.bh-composer-upload-status { color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; line-height: 13px; }
.bh-composer-upload-retry { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--tobs-status-danger-base); font-size: ${text.metaSize}; line-height: 13px; cursor: pointer; }
.bh-composer-attachment-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
}
`,
  channelsCss.composerAttachmentRemove,
  `.bh-composer-attachment-remove:focus-visible,
.bh-composer-upload-retry:focus-visible { outline: ${border.focus} solid var(--tobs-line-focus); outline-offset: 2px; }
`,
  channelsCss.composerBody,
  `.bh-composer-first-expand .bh-composer-body {
  transition: height 180ms var(--bh-ease-out);
}
.bh-composer-input {
  display: block;
  font: inherit;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  max-height: 144px;
  box-sizing: border-box;
  border: 0;
  outline: none;
  resize: none;
  padding: 7px 8px 5px;
  background: transparent;
  color: var(--tobs-ink-primary);
  line-height: ${text.bodyLine};
  overflow-wrap: anywhere;
}
`,
  channelsCss.composerInput,
  `.bh-composer-footer {
  position: absolute;
  right: 9px;
  bottom: 9px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.bh-composer-has-mic { --bh-composer-compact-padding-right: 88px; }
`,
  channelsCss.composerHasMic,
  `.bh-composer[data-dictation='starting'],
.bh-composer[data-dictation='listening'],
.bh-composer[data-dictation='finishing'] {
  border-color: var(--tobs-accent-solid);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--tobs-accent-solid) 18%, transparent),
    0 8px 24px color-mix(in srgb, var(--tobs-accent-solid) 16%, transparent);
}
`,
  channelsCss.composer,
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
  `.bh-model-menu-list { max-height: min(60vh, calc(100vh - 12px - max(12px, var(--dsh-frame-overlay-top, 12px)))); min-width: 0; max-width: min(360px, calc(100vw - 24px)); }
`,
  channelsCss.modelMenuList,
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
  approvalsCss.grantRequestTitle,
  `.bh-session-failure-row {
  --bh-message-card-gap: ${space.x3};
  display: grid;
  gap: var(--bh-message-card-gap);
  min-width: min(340px, 100%);
  max-width: 560px;
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
`,
  sessionsCss.sessionFailureHeading,
  `.bh-private-input-card, .bh-takeover-card { --bh-message-card-gap: ${space.x3}; display: grid; gap: var(--bh-message-card-gap); width: 380px; max-width: 100%; }
`,
  sessionsCss.takeoverCard,
  privateInputCss.messageCardActions,
  `.bh-private-input-card { --bh-message-card-gap: ${space.x2}; width: 520px; }
`,
  privateInputCss.privateInputHeading,
  `.bh-tool-approval-input {
  margin: 0;
  padding: ${space.x3};
  max-height: min(420px, 60vh);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: ${radius.md};
  background: ${color.well};
  color: var(--tobs-ink-primary);
}
`,
  assignmentsCss.assignmentAccessRow,
  memoryCss.memoryHistory,
  `.bh-memory-recovery-list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
}
`,
  memoryCss.memoryRecoveryRow,
  `.bh-memory-graph-row {
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  width: 100%;
  min-height: 46px;
  gap: ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-primary);
  padding: 0 ${space.x2};
  text-align: left;
  cursor: pointer;
}
`,
  memoryCss.memoryGraphRow,
  `.bh-memory-ref {
  flex: none;
  display: inline-flex;
  align-items: center;
  max-width: 84px;
  height: 16px;
  overflow: hidden;
  padding: 0 ${space.x2};
  border-radius: ${radius.xs};
  background: var(--tobs-state-pressed);
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  text-overflow: ellipsis;
  white-space: nowrap;
}
`,
  memoryCss.memoryRef,
  appearanceCss.sidebarOrderRow,
  `.bh-sidebar-visibility-toggle { display: flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 34px; padding: 0; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--tobs-ink-secondary); cursor: pointer; }
`,
  appearanceCss.sidebarVisibilityToggle,
  `.bh-sidebar-visibility-toggle:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: -2px; }
`,
  appearanceCss.sidebarVisibilityToggleDisabled,
  `.bh-sidebar-order-row[data-drop-indicator]::before { content: ''; position: absolute; inset-inline: 24px 12px; top: -1px; height: 2px; background: var(--tobs-accent-solid); pointer-events: none; }
`,
  appearanceCss.sidebarEditing,
  `.bh-sidebar-order-handle { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 34px; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--tobs-ink-secondary); cursor: grab; }
`,
  appearanceCss.sidebarOrderHandle,
  `.bh-sidebar-order-handle:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: -2px; }
`,
  appearanceCss.sidebarOrderToolbar,
  `.bh-sidebar-order-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
`,
  memoryCss.memoryLoadFeedback,
  `.bh-memory-change-badge { flex: none; min-width: 20px; border-radius: ${radius.xs}; padding: 1px ${space.x2}; background: var(--tobs-state-hover); color: var(--tobs-ink-secondary); font-family: ${font.familyMono}; font-size: ${text.metaSize}; font-weight: ${text.strong}; text-align: center; }
`,
  memoryCss.memoryChangeBadge,
  `.bh-file-path-button:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
`,
  channelFilesCss.filePathButton,
  `.bh-file-app-icon { width: 16px; height: 16px; object-fit: contain; }
.bh-file-open { display: inline-flex; align-items: stretch; flex: none; height: 28px; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; color: var(--tobs-ink-primary); font-family: ${font.familySans}; }
`,
  channelFilesCss.fileOpenMain,
  `.bh-file-open-main { gap: ${space.x2}; min-width: 28px; padding: 0 ${space.x3}; border-radius: ${radius.sm} 0 0 ${radius.sm}; white-space: nowrap; }
`,
  channelFilesCss.fileOpen,
  `.bh-file-open-more { width: 24px; border-left: ${border.hairline} solid ${color.divider}; border-radius: 0 ${radius.sm} ${radius.sm} 0; color: var(--tobs-ink-secondary); }
`,
  channelFilesCss.fileOpenMainFileOpenMore,
  `.bh-file-open-main:focus-visible, .bh-file-open-more:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: -2px; }
`,
  channelFilesCss.fileOpenMainFileOpenMoreDisabled,
  memoryCss.memoryDiffFileAction,
  `@media (max-width: 520px) {
  .bh-memory-diff-file-action .bh-file-open-main span { display: none; }
}
`,
  memoryCss.fileOpenAnchor,
  `.bh-file-open-anchor > .bh-file-action-feedback { display: block; font-family: inherit; position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; width: max-content; max-width: min(280px, 70vw); margin: 0; padding: ${space.x2} ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-elevated); color: var(--tobs-ink-primary); box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent); font-size: ${text.metaSize}; font-weight: ${text.regular}; line-height: ${text.metaLine}; white-space: normal; text-align: left; }
`,
  memoryCss.fileOpenAnchorFileActionFeedback,
  `@media (pointer: coarse) {
  .bh-file-open { height: 36px; }
  .bh-file-open-main { min-width: 36px; }
  .bh-file-open-more { width: 36px; }
}
`,
  memoryCss.fileActionFeedback,
  `.bh-memory-working-list button:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: -2px; }
`,
  memoryCss.memoryCommitView,
  `.bh-memory-commit-header { display: flex; align-items: center; gap: ${space.x3}; min-height: 52px; margin: 0 -${space.x4} ${space.x3}; padding: ${space.x3} ${space.x4}; border-bottom: ${border.hairline} solid ${color.divider}; background: var(--tobs-layer-nav); }
.bh-memory-view-icon-button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-tertiary); cursor: pointer; }
`,
  memoryCss.memoryViewIconButton,
  `.bh-memory-view-icon-button:focus-visible, .bh-memory-diff-file-header:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: -2px; }
`,
  memoryCss.memoryCommitHeader,
  `.bh-memory-version { flex: none; max-width: 40%; overflow: hidden; padding: 0 ${space.x2}; border-radius: 999px; background: color-mix(in srgb, var(--tobs-status-success-base) 12%, transparent); color: var(--tobs-status-success-base); font-size: ${text.metaSize}; line-height: ${text.metaLine}; text-overflow: ellipsis; white-space: nowrap; }
`,
  memoryCss.memoryVersion,
  `.bh-memory-version-chip { display: inline-flex; align-items: center; gap: ${space.x1}; max-width: 100%; padding: 0 ${space.x1} 0 ${space.x3}; border-radius: 999px; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); font-size: ${text.metaSize}; line-height: ${text.bodyLine}; }
`,
  memoryCss.memoryVersionChip,
  `.bh-memory-continue-form input { min-width: 180px; max-width: 320px; }
`,
  memoryCss.memoryCommitHeaderDetails,
  `.bh-memory-commit-header .bh-memory-commit-title {
  flex: 0 1 auto;
  flex-direction: row;
  align-items: baseline;
  gap: ${space.x3};
  min-width: 0;
  max-width: calc(100% - 96px);
  white-space: nowrap;
}
`,
  memoryCss.memoryGraphList,
  `.bh-memory-diff-file { overflow: hidden; margin: 0 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--tobs-layer-canvas); box-shadow: 0 1px 2px color-mix(in srgb, var(--tobs-ink-primary) 5%, transparent); }
.bh-memory-diff-file-header { display: flex; align-items: center; gap: ${space.x3}; min-height: 40px; padding: ${space.x3} ${space.x4}; background: var(--tobs-layer-nav); color: var(--tobs-ink-primary); cursor: pointer; list-style: none; }
`,
  memoryCss.memoryDiffFileHeader,
  `.bh-memory-diff-file-header > svg { flex: none; color: var(--tobs-ink-tertiary); transition: transform 150ms var(--ds-ease-in-out); }
`,
  memoryCss.memoryDiffFile,
  `.bh-memory-diff-table td { box-sizing: border-box; height: 24px; padding: ${space.x1} 0; vertical-align: top; }
.bh-memory-diff-number { width: 1px; white-space: pre; min-width: 34px; padding: ${space.x1} ${space.x2} !important; color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; text-align: right; user-select: none; }
`,
  memoryCss.memoryDiffNumber,
  `.bh-memory-diff-sign { width: 1px; white-space: pre; min-width: 20px; padding: ${space.x1} ${space.x1} !important; color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; text-align: center; user-select: none; }
`,
  memoryCss.memoryDiffContent,
  `.bh-memory-diff-add .bh-memory-diff-number:first-child::before, .bh-memory-diff-remove .bh-memory-diff-number:first-child::before { position: absolute; top: 0; bottom: 0; left: 0; width: 3px; content: ''; }
`,
  memoryCss.memoryDiffAdd,
  `.bh-memory-diff-remove .bh-memory-diff-number:first-child::before { background: repeating-linear-gradient(45deg, var(--tobs-status-danger-base) 0 1.5px, transparent 1.5px 3px); }
`,
  memoryCss.memoryDiffEmpty,
  `.bh-member-departure {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  max-width: min(100%, 520px);
  width: fit-content;
  margin: ${space.x2} auto;
  padding: ${space.x3} ${space.x4};
  border-radius: 999px;
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
  text-align: center;
}
`,
  channelsCss.memberDeparture,
  `.bh-bot-dm-action {
  display: block;
  max-width: min(100%, 520px);
  margin: ${space.x2} auto;
  padding: ${space.x2} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  cursor: pointer;
}
`,
  personabotsCss.botDmAction,
  `/* Status lines stay inside the Bot bubble column: 28px avatar + 8px gap on each side. */
.bh-memory-commit-row {
  container-type: inline-size;
  box-sizing: border-box;
  width: 100%;
  padding-inline: 36px;
}
`,
  memoryCss.memoryCommit,
  `.bh-memory-commit-line:focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
.bh-memory-commit-line > .bh-memory-commit-subject {
  flex: 0 1 auto;
  min-width: 140px;
  overflow: hidden;
  color: var(--tobs-ink-primary);
  text-overflow: ellipsis;
}
`,
  memoryCss.memoryCommitLine,
  activityCss.panelActivity,
  `button:has(> .bh-panel-actions) { padding-right: 112px; }
.bh-panel-activity {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${space.x1};
  min-width: 22px;
  height: 22px;
  padding: 0 ${space.x1};
  border-radius: ${radius.sm};
  color: var(--tobs-ink-secondary);
  cursor: pointer;
  transition:
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out);
}
`,
  activityCss.wideActivityButtonQuiet,
  `.bh-panel-activity:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 1px; }
.bh-activity-list-count {
  flex: none;
  min-width: 14px;
  padding: 0 ${space.x1};
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  font-variant-numeric: tabular-nums;
  color: inherit;
}
.bh-activity-list-notification-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: ${radius.round};
  background: var(--tobs-status-danger-base);
}
.bh-panel-activity[data-wide='false'] {
  justify-self: start;
  width: 36px;
  height: 36px;
  min-height: 36px;
  margin: -${space.x3} 0 0;
  padding: 0;
  border: 0;
  border-radius: ${radius.md};
  background: transparent;
}
`,
  activityCss.narrowActivityButtonInactive,
  `.bh-activity-list {
  overflow: auto;
  padding: 28px min(6vw, 64px);
}
.bh-activity-list-inner {
  width: min(100%, 1120px);
  margin: 0 auto;
}
.bh-activity-list-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
`,
  activityCss.activityListRow,
  `.bh-activity-list-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x3} ${space.x4};
  min-height: 76px;
  padding: ${space.x4} ${space.x5};
  border-bottom: ${border.hairline} solid ${color.divider};
}
`,
  activityCss.activityListRowOpen,
  `.bh-activity-list-row-open:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: -2px;
}
`,
  activityCss.activityListRowMain,
  `.bh-activity-list-source-link {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: ${space.x1};
  border: 0;
  border-radius: ${radius.sm};
  background: var(--tobs-accent-solid);
  color: var(--tobs-accent-on-solid);
  cursor: pointer;
}
`,
  activityCss.activityListSourceLink,
  `.bh-activity-list-source-link:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-activity-list-source-arrow {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  border-radius: ${radius.sm};
  background: var(--tobs-accent-solid);
}
.bh-activity-list-channel-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  overflow: hidden;
  border-radius: ${radius.sm};
}
`,
  activityCss.activityListChannelAvatar,
  `.bh-activity-list-message-flow {
  max-height: min(42vh, 380px);
  overflow: auto;
  margin-bottom: 0;
}
`,
  activityCss.activityListMessageContent,
  `.bh-activity-list-human-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: ${radius.sm};
  background: var(--tobs-state-hover);
}
`,
  activityCss.activityListMessageHeading,
  `.bh-activity-list-reply textarea:focus-visible,
.bh-activity-list-reply button:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
`,
  activityCss.activityListRowTitle,
  `.bh-activity-list-batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x3};
  min-height: 36px;
  padding: 0 ${space.x5} ${space.x3};
  border-bottom: ${border.hairline} solid ${color.divider};
}
`,
  activityCss.activityListBatchAll,
  `.bh-activity-center-header {padding:20px ${space.x6} 0; flex-shrink:0;}
`,
  activityCss.activityCenterHeader,
  `.bh-activity-list-context-edge { display: flex; align-items: center; justify-content: center; width: 100%; height: 28px; padding: 0; border: ${border.hairline} solid ${color.borderStrong}; background: var(--tobs-layer-raised); color: var(--tobs-ink-secondary); cursor: pointer; }
`,
  activityCss.activityListContextEdge,
  `.bh-activity-list-message-source { position: absolute; right: 8px; top: 8px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); opacity: 0; pointer-events: none; cursor: pointer; }
`,
  activityCss.activityListMessage,
  `.bh-channel-activity-legend i {width:8px;height:8px;border-radius:${radius.sm};}
`,
  activityCss.channelActivityHuman,
  `.bh-channel-activity-toggle {border:0;border-radius:${radius.sm};background:transparent;display:flex;align-items:center;gap:${space.x4};min-width:0;flex:1;min-height:40px;padding:${space.x3};text-align:left;font:inherit;color:inherit;cursor:pointer;}
`,
  activityCss.channelActivityToggle,
  `.bh-channel-activity-name {width:160px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-channel-activity-chart {display:flex;flex:1;min-width:24px;height:12px;overflow:hidden;border-radius:${radius.sm};}
`,
  activityCss.channelActivityChart,
  `.bh-channel-activity-toggle strong {min-width:36px;text-align:right;}
`,
  activityCss.channelActivityClosed,
  `.bh-channel-activity-senders {padding:0 ${space.x5} ${space.x4} 36px;}
`,
  activityCss.channelActivitySenders,
  `@media(max-width:720px){.bh-channel-activity-name{width:100px}.bh-channel-activity-toggle{gap:${space.x2}}}

`,
  activityCss.statisticsToggle,
  `.bh-overview-memory-bots > li {display:flex;align-items:center;gap:${space.x4};min-height:42px;padding:${space.x2} 0;border-top:${border.hairline} solid ${color.divider};font-size:${text.metaSize};}
`,
  activityCss.overviewMemoryName,
  `.bh-overview-memory-trend {width:126px;flex-shrink:0;}
`,
  activityCss.overviewMemoryDirty,
  `@media (max-width:700px) {.bh-overview-memory-bots > li {flex-wrap:wrap;gap:${space.x2};}.bh-overview-memory-trend {width:84px;}.bh-overview-memory-name {flex-basis:calc(100% - 36px);}.bh-overview-memory-bots .bh-profile-pin {margin-left:auto;}}
`,
  usageCss.overviewUsage,
  personabotsCss.intro,
  `.bh-release-dialog {
  width: min(680px, calc(100vw - 32px));
}
.bh-telemetry-dialog {
  width: min(560px, calc(100vw - 32px));
}
`,
  personabotsCss.telemetryNotice,
  `.bh-telemetry-notice-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: ${space.x4};
  min-width: 0;
}
`,
  personabotsCss.telemetryNoticeRow,
  `@media (max-width: 520px) {
  .bh-telemetry-notice-row {
    grid-template-columns: minmax(0, 1fr);
    gap: ${space.x1};
  }
}
.bh-release-notes {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  max-height: min(60vh, 560px);
  overflow-y: auto;
  min-width: 0;
}
`,
  releaseCss.releaseNote,
  `.bh-release-note-head::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 ${space.x1};
  border-right: ${border.hairline} solid currentColor;
  border-bottom: ${border.hairline} solid currentColor;
  transform: rotate(-45deg);
  transition: transform 150ms var(--ds-ease-in-out);
}
`,
  releaseCss.releaseNoteReleaseNoteHead,
  `.bh-release-note-rule {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: var(--tobs-line-edge);
}
`,
  releaseCss.releaseNoteCount,
  schedulesCss.schedules,
  sharedCss.cardList,
  `.bh-message-card-list .bh-card-main {min-height:40px;align-items:center;}
`,
  sharedCss.messageCardList,
  `.bh-card-checkbox {flex:none;width:16px;height:16px;margin:0;accent-color:var(--bh-accent);cursor:pointer;}
.bh-card-checkbox:focus-visible {outline:${border.focus} solid var(--bh-accent);outline-offset:2px;}
`,
  sharedCss.cardCheckbox,
  `.bh-card-main:focus-visible {outline:${border.focus} solid var(--tobs-ink-primary);outline-offset:-2px;}
.bh-card-icon {display:grid;flex:none;place-items:center;padding-top:1px;color:var(--tobs-ink-primary);}
`,
  sharedCss.cardLeading,
  `.bh-card-detail {padding:0 ${space.x3} ${space.x3} 34px;}
`,
  sharedCss.cardRow,
  `.bh-card-trailing .bh-workspace-folder-remove {width:28px;height:28px;border-radius:${radius.sm};}
`,
  sharedCss.workspaceFolderAdd,
  STYLEX_CSS,
].join('');
