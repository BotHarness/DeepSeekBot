import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { INTERNAL_TOUR_CSS } from './internal-tour-styles.js';
import { COMPOSER_CONTEXT_CSS } from './composer-context-styles.js';
import { WINDOW_COMPANION_CSS } from './window-companion-styles.js';
import { COMBOBOX_CSS } from './combobox.js';
import { CHANNEL_DOCK_CSS } from './channel-dock-styles.js';
import { GENERATED_FILES_CSS } from './generated-files-styles.js';
import { keyframesFor } from '@botharness/botui-core';
import { DEEPSEEKBOT_TRANSPARENT_DATA_URI } from './bot-icon-assets.js';
import { STYLEX_CSS } from './ds/stylex-css.js';

export const CSS =
  COMPOSER_CONTEXT_CSS +
  INTERNAL_TOUR_CSS +
  COMBOBOX_CSS +
  WINDOW_COMPANION_CSS +
  CHANNEL_DOCK_CSS +
  GENERATED_FILES_CSS +
  `
.bh-selection-bar { display: flex; align-items: center; justify-content: space-between; gap: ${space.x4}; margin: 0 ${space.x5} ${space.x5}; padding: ${space.x3} ${space.x4} ${space.x3} ${space.x5}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); }
.bh-selection-count { min-width: 0; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; font-weight: ${text.strong}; font-variant-numeric: tabular-nums; }
.bh-selection-export { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-snapshot { position: fixed; left: -100000px; top: 0; display: flex; flex-direction: column; gap: ${space.x4}; padding: 20px ${space.x6} ${space.x6}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); pointer-events: none; }
.bh-snapshot-header { display: flex; flex-direction: column; gap: ${space.x1}; padding-bottom: ${space.x4}; border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-snapshot-header strong { font-size: ${text.titleSize}; line-height: ${text.bodyLine}; font-weight: ${text.strong}; }
.bh-snapshot-header span { font-size: ${text.metaSize}; line-height: ${text.metaLine}; color: var(--dsw-alias-label-secondary); }
.bh-snapshot-body { display: flex; flex-direction: column; gap: ${space.x4}; }
.bh-selection-actions { display: flex; flex: none; gap: ${space.x3}; font-size: ${text.titleSize}; line-height: normal; }
.bh-message-group:has(.bh-bubble-selecting) { position: relative; padding-left: 32px; }
.bh-bubble-wrap.bh-bubble-selecting { position: static; cursor: pointer; user-select: none; }
.bh-bubble-wrap.bh-bubble-selecting:focus-visible { outline: none; }
.bh-bubble-wrap.bh-bubble-selecting:focus-visible .bh-bubble { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-surface { pointer-events: none; }
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-side { display: none; }
.bh-bubble-check { position: absolute; left: 4px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-bottom: ${space.x3}; border-radius: ${radius.round}; border: ${border.hairline} solid ${color.borderStrong}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary-foreground); }
.bh-bubble-check[data-checked="true"] { border-color: var(--bh-accent); background: var(--bh-accent); }
.bh-composer-recovery { min-width: 0; }
.bh-composer-recovery > p, .bh-composer-recovery section > p { margin: ${space.x2} 0; font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-composer-draft-version { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x3}; padding: ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; }
.bh-composer-draft-version pre { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 100px; overflow-y: auto; }
.bh-composer-recovery > p button, .bh-composer-draft-version button { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x3}; cursor: pointer; }
.bh-composer-recovery > p button:hover, .bh-composer-draft-version button:hover { background: var(--bh-hover); }
.bh-composer-recovery > p button:focus-visible, .bh-composer-draft-version button:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-root {
  --bh-chat-card-inset: ${space.x4};
  /* @bh-brand-aliases:start — thin BotHarness brand map onto DSH semantic
     tokens (ADR-0028): at most three entries, no second design system. */
  --bh-accent: var(--dsw-alias-state-business-primary);
  --bh-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-selected: var(--dsw-specific-sidebar-nav-item-active);
  /* @bh-brand-aliases:end */
  --bh-surface-selected: color-mix(in srgb, ${color.fg} 8%, ${color.surface});
  --bh-surface-pressed: color-mix(in srgb, ${color.fg} 13%, ${color.surface});
  --bh-surface-danger: color-mix(in srgb, ${color.danger} 10%, ${color.surface});
  --bh-on-surface-danger: color-mix(in srgb, ${color.danger} 65%, ${color.fg});
  --bh-well-inset: color-mix(in srgb, ${color.fg} 7%, ${color.well});
  /* @bh-profile-chart-aliases:start — the pinned DSH theme has no categorical
     chart palette; read shades derive from the brand accent and output uses a
     state token so both series stay distinguishable in either theme. */
  --bh-chart-output: var(--dsw-alias-state-warn-primary);
  --bh-chart-read-dim: color-mix(in srgb, var(--bh-accent) 38%, transparent);
  /* @bh-profile-chart-aliases:end */
  font: ${text.bodySize}/1.5 var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
}
.bh-root *,
.bh-root *::before,
.bh-root *::after {
  box-sizing: border-box;
}
.bh-root button,
.bh-root input,
.bh-root textarea {
  font: inherit;
}

.bh-onboarding-notice { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 1000; display: flex; align-items: center; gap: ${space.x3}; max-width: min(560px, calc(100vw - 32px)); padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-base); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.bh-onboarding-notice-text { min-width: 0; overflow-wrap: anywhere; }
/* Onboarding launcher: a progress ring in the Bot-mode row's action group (no row
   of its own). Like the Human Inbox and gear it appears only on hover, while its
   checklist is open, or while the walkthrough highlights the row. */
.bh-onboarding-launcher { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: ${radius.sm}; color: var(--dsw-alias-label-secondary); cursor: pointer; transition: opacity 120ms var(--ds-ease-in-out), background 120ms var(--ds-ease-in-out); }
.bh-onboarding-launcher[data-bh-onboarding-launcher='row']:not([data-open='true']) { opacity: 0; pointer-events: none; }
button:has(.bh-panel-glyph):is(:hover, :focus-within, .driver-active-element) .bh-onboarding-launcher[data-bh-onboarding-launcher='row'] { opacity: 1; pointer-events: auto; }
.bh-onboarding-launcher:hover, .bh-onboarding-launcher[data-open='true'] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-onboarding-launcher:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.bh-onboarding-launcher[data-bh-onboarding-launcher='header'] { width: 36px; height: 36px; border-radius: ${radius.md}; }
.bh-onboarding-launcher[data-bh-onboarding-launcher='header'][data-settled='true'] { display: none; }
.bh-onboarding-ring circle { fill: none; stroke-width: 2; }
.bh-onboarding-ring-track { stroke: var(--dsw-alias-border-l2); }
.bh-onboarding-ring-value { stroke: var(--dsw-alias-state-business-primary); stroke-linecap: round; transition: stroke-dashoffset 240ms var(--ds-ease-in-out); }
.bh-onboarding-enter { display: inline-flex; align-items: center; gap: ${space.x2}; margin-left: ${space.x2}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; color: var(--dsw-alias-state-business-primary); pointer-events: none; }
.bh-onboarding-enter-dot { width: 6px; height: 6px; border-radius: ${radius.round}; background: currentColor; animation: bh-onboarding-pulse 1.6s ease-in-out infinite; }
@keyframes bh-onboarding-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 45%, transparent); } 50% { box-shadow: 0 0 0 4px transparent; } }
html[data-botharness-motion='reduce'] .bh-onboarding-enter-dot { animation: none; }
.bh-onboarding-checklist { position: fixed; z-index: 1000; display: grid; gap: ${space.x4}; width: 340px; max-height: calc(100vh - 24px); overflow: auto; padding: ${space.x5}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); line-height: ${text.bodyLine}; }
.bh-onboarding-checklist[data-placement='sheet'] { left: 12px; right: 12px; bottom: 12px; width: auto; max-height: calc(100vh - 96px); }
.bh-onboarding-checklist-header { display: flex; align-items: flex-start; justify-content: space-between; gap: ${space.x3}; }
.bh-onboarding-checklist-heading { display: grid; gap: ${space.x1}; min-width: 0; }
.bh-onboarding-checklist-heading strong { font-size: ${text.titleSize}; }
.bh-onboarding-checklist-close { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: ${radius.sm}; color: var(--dsw-alias-label-secondary); background: transparent; cursor: pointer; }
.bh-onboarding-checklist-close:hover { background: var(--bh-hover); }
.bh-onboarding-checklist-progress { height: 4px; border-radius: ${radius.xs}; background: var(--dsw-alias-border-l2); overflow: hidden; }
.bh-onboarding-checklist-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--bh-accent); transition: width 240ms var(--ds-ease-in-out); }
.bh-onboarding-checklist-tier { display: grid; gap: ${space.x2}; }
.bh-onboarding-checklist-tier h3 { margin: 0; font-size: ${text.metaSize}; font-weight: ${text.strong}; line-height: ${text.metaLine}; color: var(--dsw-alias-label-secondary); }
.bh-onboarding-checklist-tier ul { display: grid; margin: 0; padding: 0; list-style: none; }
.bh-onboarding-checklist-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: ${space.x3}; padding: ${space.x3} 0; }
.bh-onboarding-checklist-item + .bh-onboarding-checklist-item { border-top: ${border.hairline} solid ${color.divider}; }
.bh-onboarding-checklist-mark { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; }
.bh-onboarding-checklist-item[data-state='done'] .bh-onboarding-checklist-mark { border-color: var(--bh-accent); background: var(--bh-accent); color: var(--dsw-alias-bg-base); }
.bh-onboarding-checklist-item[data-state='done'] .bh-onboarding-checklist-name { color: var(--dsw-alias-label-secondary); }
.bh-onboarding-checklist-item[data-state='locked'] { opacity: 0.6; }
.bh-onboarding-checklist-text { display: grid; gap: ${space.x1}; min-width: 0; }
.bh-onboarding-checklist-text .bh-note { font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-onboarding-checklist-status { font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-onboarding-checklist-exit { margin: 0; font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-onboarding-checklist-footer { display: flex; justify-content: space-between; gap: ${space.x3}; }
.bh-onboarding-checklist[data-placement='sheet'] { gap: ${space.x3}; padding: ${space.x4} ${space.x4}; }
.bh-onboarding-checklist[data-placement='sheet'] .bh-onboarding-checklist-item { padding: ${space.x2} 0; }
.bh-onboarding-checklist[data-placement='sheet'] .bh-onboarding-checklist-footer { align-items: center; justify-content: flex-end; }
.bh-onboarding-checklist-pager { display: inline-flex; align-items: center; gap: ${space.x2}; margin-right: auto; }
.bh-onboarding-checklist-page { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: ${radius.sm}; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); cursor: pointer; }
.bh-onboarding-checklist-page:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.bh-onboarding-checklist-page:disabled { opacity: 0.4; cursor: default; }
.bh-onboarding-checklist-dots { display: inline-flex; gap: ${space.x2}; }
.bh-onboarding-checklist-dots > span { width: 6px; height: 6px; border-radius: ${radius.round}; background: var(--dsw-alias-border-l2); }
.bh-onboarding-checklist-dots > span[data-state='done'] { background: color-mix(in srgb, var(--bh-accent) 45%, transparent); }
.bh-onboarding-checklist-dots > span[data-current='true'] { background: var(--bh-accent); }
.bh-onboarding-actions { display: flex; gap: ${space.x3}; align-items: center; flex-wrap: wrap; }
.bh-bubble:has(> .bh-onboarding-welcome) { padding: 0; background: transparent; }
.bh-onboarding-welcome { display: grid; gap: ${space.x4}; width: 380px; max-width: 100%; white-space: normal; line-height: ${text.bodyLine}; border-radius: ${radius.lg}; background: var(--dsw-alias-bg-module-platform); overflow: hidden; }
.bh-onboarding-welcome > :not(.bh-welcome-banner) { margin-inline: ${space.x4}; }
.bh-onboarding-welcome > :last-child { margin-bottom: ${space.x4}; }
.bh-welcome-banner { aspect-ratio: 3 / 1; background: var(--dsw-alias-bg-base); }
.bh-welcome-banner .bh-banner-art { display: block; width: 100%; height: 100%; }
/* The avatar rides over the banner; the name starts just below the banner edge (42px overlap - 12px grid gap + 4px). */
.bh-welcome-identity { position: relative; z-index: 1; display: flex; align-items: flex-start; gap: ${space.x3}; margin-top: -42px; }
.bh-welcome-avatar { padding: ${space.x1}; border-radius: ${radius.lg}; background: var(--dsw-alias-bg-module-platform); line-height: 0; }
.bh-welcome-identity-text { display: grid; gap: ${space.x2}; min-width: 0; padding-top: calc(${space.x6} + ${space.x3} + ${space.x1}); }
.bh-welcome-name { font-size: ${text.titleSize}; font-weight: ${text.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-welcome-roles { display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-welcome-letter { display: grid; gap: ${space.x2}; }
.bh-welcome-letter strong { font-size: ${text.titleSize}; }
.bh-welcome-letter p { margin: 0; }
.bh-welcome-signature { color: var(--dsw-alias-label-secondary); }
.bh-welcome-provenance { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; }
.bh-onboarding-welcome p, .bh-onboarding-model-form p { margin: 0; }
.bh-onboarding-welcome .bh-card-title { white-space: normal; }
.bh-onboarding-welcome .bh-onboarding-create { color: color-mix(in srgb, var(--bh-accent) 80%, var(--dsw-alias-label-primary)); background: color-mix(in srgb, var(--bh-accent) 10%, var(--dsw-alias-bg-base)); border-color: color-mix(in srgb, var(--bh-accent) 35%, transparent); }
.bh-onboarding-welcome .bh-onboarding-create:hover:not(:disabled) { background: color-mix(in srgb, var(--bh-accent) 18%, var(--dsw-alias-bg-base)); }
.bh-onboarding-welcome .bh-onboarding-create:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-onboarding-model-form > button { justify-self: start; }
.bh-onboarding-model-form .bh-card-title { white-space: normal; }
.bh-onboarding-model-form { display: grid; gap: ${space.x5}; min-width: 0; line-height: ${text.bodyLine}; }
.bh-onboarding-request { display: grid; gap: ${space.x2}; padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; }
.bh-onboarding-request p { white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-onboarding-model-scope { display: grid; gap: ${space.x2}; padding-top: ${space.x4}; border-top: ${border.hairline} solid ${color.divider}; }

.bh-region {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生 WorkspaceBrowser 的 root 约定：右侧内衬 = --dsh-session-list-edge-inset
     （= --dsh-sidebar-inline-padding，12px）。外层 regionArea 已抵消 sidebar 的右
     侧 padding 并给 4px 左衬（见 hHd-Xa_regionArea）；顶层内容再补 4px 左衬即与
     原生 sectionHeader / 新会话行（20px）对齐。 */
  padding: 0 var(--dsh-sidebar-inline-padding) ${space.x2} 0;
}
.bh-region-rail {
  padding: 0;
  align-items: center;
  gap: 0;
  scrollbar-width: none;
}
.bh-region-rail::-webkit-scrollbar {
  display: none;
}
.bh-rail-group {
  display: flex;
  width: 36px;
  flex: none;
  flex-direction: column;
  gap: ${space.x3};
}
.bh-rail-channel {
  position: relative;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: ${space.x1};
  border: 0;
  border-radius: ${radius.md};
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-rail-channel:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-rail-channel.bh-selected {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
}
.bh-rail-channel:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-rail-channel-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.round};
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-rail-channel-icon.bh-group-channel-icon { border-radius: ${radius.sm}; overflow: hidden; }
.bh-rail-divider {
  width: 28px;
  flex: none;
  margin: ${space.x3} ${space.x2};
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

/* HoverCard portals this preview to body, so these rules intentionally do
   not depend on the bh-root ancestor or its three local brand aliases. */
.bh-rail-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: ${space.x2};
  color: var(--dsw-alias-label-primary);
}
.bh-rail-preview-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: ${space.x3};
}
.bh-rail-preview-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: ${radius.round};
}
.bh-rail-preview-icon.bh-group-channel-icon { border-radius: ${radius.sm}; overflow: hidden; }
.bh-rail-preview-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
}
.bh-rail-preview-meta,
.bh-rail-preview-description,
.bh-rail-preview-summary {
  display: -webkit-box;
  overflow: hidden;
  line-height: ${text.metaLine};
  -webkit-box-orient: vertical;
}
.bh-rail-preview-meta,
.bh-rail-preview-description {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  -webkit-line-clamp: 2;
}
.bh-rail-preview-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  -webkit-line-clamp: 2;
  margin-top: ${space.x2};
}

/* Message author hover card: HoverCard portals it to body like the rail
   preview, so it reads DSH tokens directly instead of bh-root aliases. */
.bh-author-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: ${space.x3};
  padding: ${space.x2};
  color: var(--dsw-alias-label-primary);
}
.bh-author-card-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: ${space.x4};
}
.bh-author-card-identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.bh-author-card-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.titleLine};
}
.bh-author-card-meta,
.bh-author-card-description {
  display: -webkit-box;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.bh-author-card-status {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: ${space.x1};
}
.bh-author-card-status-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-author-card-status-value {
  display: -webkit-box;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.bh-author-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x3};
}

/* 原生 工作区 sectionHeader 模式（ui-workspace WorkspaceBrowser.module.css）：
   36px 高、gap 4、左衬 4、上下 margin 2/4；原生 header 还向内容右缘外挂 4px
   （margin-right: -4px），但最右侧按钮仍停在内容右缘（实测 280px 侧栏里
   添加按钮右缘 268），因为原生 header 尾部还有一个占掉 gap 的调用流锚点。
   这里用 padding-right: 4px 复现同一条可见边，不再多一个尾部节点。 */
.bh-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${space.x2};
  height: 36px;
  box-sizing: border-box;
  padding: 0 ${space.x2};
  margin: ${space.x1} -${space.x2} ${space.x2} 0;
  border-radius: ${radius.md};
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
}
.bh-header-label {
  flex: none;
  max-width: 45%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: ${text.titleSize};
  line-height: ${text.bodyLine};
  transition:
    max-width 180ms var(--ds-ease-in-out),
    margin-right 180ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    transform 180ms var(--ds-ease-in-out),
    visibility 0s linear;
}
.bh-header-label-hidden {
  max-width: 0;
  margin-right: -${space.x2};
  opacity: 0;
  transform: translateX(-4px);
  visibility: hidden;
}
.bh-search-slot {
  flex: 1;
  max-width: 28px;
  min-width: 0;
  display: flex;
  align-items: center;
  margin-left: auto;
  box-sizing: border-box;
  transition: max-width 180ms var(--ds-ease-in-out);
}
.bh-search-slot-open {
  max-width: 100%;
}
.bh-search {
  flex: none;
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  border: none;
  border-radius: ${radius.round};
  background: transparent;
  cursor: text;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  transition:
    width 180ms var(--ds-ease-in-out),
    padding 180ms var(--ds-ease-in-out),
    border-color 180ms var(--ds-ease-in-out);
}
.bh-search-open {
  width: calc(100% + 4px);
  height: 30px;
  margin-inline: -${space.x1};
  padding-right: ${space.x2};
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: ${radius.md};
  color: var(--dsw-alias-label-caption);
}
.bh-search-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.bh-search-open .bh-search-btn {
  height: 30px;
}
.bh-search-btn:hover {
  background: var(--bh-hover);
}
.bh-search-open .bh-search-btn:hover {
  background: transparent;
}
.bh-search-input {
  flex: 1;
  width: 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  font: inherit;
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
  color: var(--dsw-alias-label-primary);
  transition: opacity 120ms var(--ds-ease-in-out);
}
.bh-search-open .bh-search-input {
  margin-left: -${space.x1};
  opacity: 1;
  pointer-events: auto;
}
.bh-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.bh-clear-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
.bh-clear-btn:hover {
  background: var(--bh-hover);
}
.bh-header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: ${space.x2};
  max-width: 60px;
  overflow: hidden;
  transition:
    max-width 180ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    transform 180ms var(--ds-ease-in-out);
}
.bh-header-actions-hidden {
  max-width: 0;
  opacity: 0;
  transform: translateX(4px);
  visibility: hidden;
  pointer-events: none;
}
.bh-icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-icon-btn:hover {
  background: var(--bh-hover);
}

/* 原生侧栏面板行占满内容盒（ui-sidebar .panelRow width:100%），而原生
   新会话行每侧内收 2px（.newSession margin: 0 2px 8px）。面板行由外壳渲染，
   我们只注入图标，因此用 :has() 认领带本插件图标的行并对齐同一组
   horizontal insets；active 时同一条行内命中层把再次点击变成退出模式。 */
button:has(.bh-panel-glyph) {
  position: relative;
  overflow: hidden;
  width: auto;
  margin-inline: ${space.x1};
}

/* The Bot row keeps its native shape and simply stands taller than the other
   sidebar rows, with a larger mark and label to match. */
button:has(.bh-panel-glyph[data-wide='true']) {
  min-height: 44px;
}

button:has(.bh-panel-glyph[data-wide='true']) .bh-panel-glyph > .bh-bot-icon {
  width: 24px;
  height: 24px;
}

button:has(.bh-panel-glyph[data-wide='true']) > span:not(.bh-panel-glyph):not(.bh-panel-glyph-hit):not(.bh-panel-actions) {
  font-size: 16px;
  line-height: 24px;
}

/* The Bot mode switch: the button keeps its own background, the transparent
   mascot is scaled to twice the fitted size and anchored bottom-left as a
   texture layer, and the chosen mark sits above it. */
button:has(.bh-panel-glyph)::before {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 200%;
  height: 200%;
  background: var(--bh-bot-texture, url(${DEEPSEEKBOT_TRANSPARENT_DATA_URI})) left bottom / contain
    no-repeat;
  opacity: 0.1;
  pointer-events: none;
}

.bh-panel-glyph {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}


/* Action group on the wide Bot row: tutorial progress, Human Inbox and the
   settings gear sit side by side inside the row, sharing its layer and hover. */
.bh-panel-actions {
  position: absolute;
  top: 50%;
  right: 10px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  transform: translateY(-50%);
}

/* Settings gear on the active Bot row: hidden until the row is hovered, then
   it opens the Bot section of the Settings dialog. */
.bh-panel-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: ${radius.sm};
  color: var(--dsw-alias-label-secondary);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out);
}

button:has(.bh-panel-glyph):hover .bh-panel-gear,
button:has(.bh-panel-glyph):focus-within .bh-panel-gear,
.bh-panel-gear.driver-active-element {
  opacity: 1;
  pointer-events: auto;
}

.bh-panel-gear:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.bh-pin-zone {
  flex: none;
  overflow: hidden;
  margin-bottom: 0;
  border-radius: ${radius.md};
  transition:
    height 150ms var(--ds-ease-in-out),
    min-height 150ms var(--ds-ease-in-out),
    margin-bottom 150ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    border-color 120ms var(--ds-ease-in-out),
    box-shadow 120ms var(--ds-ease-in-out);
}
.bh-pin-zone-empty {
  display: grid;
  place-items: center;
  height: 96px;
  min-height: 96px;
  margin-bottom: ${space.x4};
  margin-inline: ${space.x2};
  border: ${border.hairline} dashed ${color.borderStrong};
  background: var(--dsw-alias-button-elevated-fill);
  opacity: 1;
}
.bh-pin-zone-empty.bh-pin-zone-hidden {
  height: 0;
  min-height: 0;
  margin-bottom: 0;
  border-width: 0;
  opacity: 0;
  pointer-events: none;
}
.bh-pin-zone-filled {
  margin-bottom: ${space.x4};
  padding: ${space.x2};
}
.bh-pin-zone-active {
  background: var(--bh-hover);
  box-shadow: inset 0 0 0 1px var(--bh-accent);
}
.bh-pin-zone-empty.bh-pin-zone-active {
  border-color: var(--bh-accent);
}
.bh-pin-zone-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  font-weight: ${text.strong};
  pointer-events: none;
}
.bh-unpin-zone {
  display: grid;
  flex: none;
  place-items: center;
  box-sizing: border-box;
  height: 72px;
  min-height: 72px;
  margin: 0 ${space.x2} ${space.x4};
  padding-inline: 20px;
  border: ${border.hairline} dashed ${color.borderStrong};
  border-radius: ${radius.md};
  background: var(--dsw-alias-button-elevated-fill);
  opacity: 1;
  transition:
    height 150ms var(--ds-ease-in-out),
    min-height 150ms var(--ds-ease-in-out),
    margin-bottom 150ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    border-color 120ms var(--ds-ease-in-out),
    box-shadow 120ms var(--ds-ease-in-out);
}
.bh-unpin-zone-hidden {
  height: 0;
  min-height: 0;
  margin-bottom: 0;
  border-width: 0;
  opacity: 0;
  pointer-events: none;
}
.bh-unpin-zone-active {
  background: var(--bh-hover);
  border-color: var(--bh-accent);
  box-shadow: inset 0 0 0 1px var(--bh-accent);
}
.bh-unpin-zone-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  font-weight: ${text.strong};
  text-align: center;
  pointer-events: none;
}
.bh-pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: ${space.x2} ${space.x3};
}
.bh-pinned-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  padding: 0 ${space.x2};
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
}
.bh-pinned-header .bh-row-action {
  width: 20px;
  height: 20px;
}

.bh-pinned {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${space.x2};
  padding: ${space.x3} ${space.x2};
  border: 0;
  border-radius: ${radius.md};
  background: transparent;
  color: inherit;
  cursor: pointer;
  position: relative;
  font: inherit;
}
.bh-pinned:hover {
  background: var(--bh-hover);
}
.bh-pinned.bh-selected {
  background: var(--bh-selected);
}
.bh-pinned.bh-drag-source {
  opacity: 0.4;
}
.bh-pinned.bh-pin-drop-before::before,
.bh-pinned.bh-pin-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: ${radius.xs};
  background: var(--bh-accent);
  pointer-events: none;
}
.bh-pinned.bh-pin-drop-before::before {
  left: 0;
}
.bh-pinned.bh-pin-drop-after::after {
  right: 0;
}

.bh-pinned .bh-name {
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-pinned-channel-icon {
  display: inline-flex;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.round};
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
}
.bh-pinned-channel-icon.bh-group-pinned-channel-icon {
  border-radius: ${radius.lg};
  overflow: hidden;
}
/* The native row-leading seat is shared with DSH's active Schedule mark. */
span:has(> [data-session-schedule-mark]) > .bh-native-session-owner {
  display: none;
}
.bh-persona-avatar {
  position: relative;
  z-index: 0;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  isolation: isolate;
}
.bh-avatar-media {
  display: inline-flex;
  width: 100%;
  height: 100%;
}
.bh-avatar-media svg,
.bh-avatar-media img {
  width: 100%;
  height: 100%;
  display: block;
}
.bh-avatar-media-image {
  overflow: hidden;
  border-radius: ${radius.round};
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-avatar-media-image img {
  object-fit: cover;
}
.bh-persona-avatar[data-media='blob'][data-effect='thinking-dots'] .bh-avatar-media {
  animation: bh-avatar-breathe 1300ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='generic-working'] .bh-avatar-media {
  animation: bh-avatar-work 1500ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='searching'] .bh-avatar-media {
  animation: bh-avatar-search 1250ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='coding'] .bh-avatar-media {
  animation: bh-avatar-code 1000ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='executing'] .bh-avatar-media {
  animation: bh-avatar-execute 900ms var(--ds-ease-in-out) infinite;
}
.bh-avatar-attention,
.bh-avatar-information {
  position: absolute;
  right: -4px;
  top: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 ${space.x1};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--dsw-alias-label-primary-foreground);
  background: var(--dsw-alias-state-error-primary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  font-weight: ${text.strong};
}
.bh-avatar-information {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: ${border.hairline} solid ${color.border};
}
.bh-rail-channel .bh-avatar-attention,
.bh-rail-channel .bh-avatar-information {
  right: 0;
  top: 0;
}
.bh-avatar-indicator {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 8px;
  height: 8px;
  border: ${border.hairline} solid var(--dsw-alias-bg-base);
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary);
}
.bh-persona-avatar[data-state='waiting'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-warn-primary);
}
.bh-persona-avatar[data-state='blocked'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-error-primary);
}
.bh-avatar-botui {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: ${radius.xs};
  color: var(--bh-accent);
  background: var(--dsw-alias-bg-base);
  pointer-events: none;
}
.bh-persona-avatar svg[data-pixel-cover]:not([data-avatar-speaking]) .bh-illustrated-head,
.bh-persona-avatar svg[data-pixel-cover]:not([data-avatar-speaking]) .bh-illustrated-body,
.bh-persona-avatar svg[data-pixel-cover]:not([data-avatar-speaking]) [data-avatar-turn] {
  visibility: hidden;
}
.bh-avatar-editor-title {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-channel-island .bh-row-status,
.bh-pinned html[data-botharness-activity='stale'] .bh-persona-avatar *,
html[data-botharness-activity='stale'] .bh-row-status * {
  animation-play-state: paused !important;
}
html[data-botharness-activity='stale'] .bh-row-status,
html[data-botharness-activity='stale'] .bh-avatar-botui,
html[data-botharness-activity='stale'] .bh-avatar-indicator {
  opacity: 0.45;
  filter: grayscale(1);
}
.bh-activity-stale {
  margin: ${space.x2} ${space.x1} ${space.x3};
  padding: ${space.x2} ${space.x3};
  border-radius: ${radius.sm};
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  color: var(--dsw-alias-label-secondary);
  background: var(--bh-hover);
}
.bh-git-unavailable {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  margin: ${space.x2} ${space.x1} ${space.x3};
  padding: ${space.x3} ${space.x3};
  border-radius: ${radius.sm};
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  color: var(--dsw-alias-label-secondary);
  background: var(--bh-hover);
}
.bh-git-unavailable-title {
  color: var(--dsw-alias-label-primary);
  font-weight: ${text.strong};
}
.bh-git-unavailable-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
  margin-top: ${space.x2};
}
.bh-git-unavailable-buttons {
  display: flex;
  gap: ${space.x2};
  margin-left: auto;
  white-space: nowrap;
}
.bh-git-install-error {
  color: var(--dsw-alias-state-error-primary);
}
.bh-git-install-progress {
  width: 100%;
  height: 4px;
  accent-color: var(--dsw-alias-state-business-primary);
}
.bh-git-unavailable-actions a {
  color: var(--dsw-alias-state-business-primary);
}
.bh-row-status {
  margin-left: ${space.x2};
}
.bh-row-status {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  flex: 0 0 auto;
  margin-left: auto;
}
.bh-row-status .bh-avatar-attention,
.bh-row-status .bh-avatar-information,
.bh-row-status .bh-avatar-indicator,
.bh-row-status .bh-avatar-botui {
  position: static;
}
.bh-row-status .bh-avatar-attention,
.bh-row-status .bh-avatar-information {
  min-width: 16px;
  height: 16px;
  line-height: ${text.metaLine};
}
.bh-row-status .bh-avatar-botui {
  background: transparent;
}
.bh-row-status[data-state='waiting'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-warn-primary);
}
.bh-row-status[data-state='blocked'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-error-primary);
}
.bh-avatar-botui .botui-dot-matrix {
  display: grid;
  place-content: center;
  contain: layout paint;
}
.bh-avatar-botui .botui-dot-matrix > i {
  display: block;
  background: currentColor;
  transform-origin: center;
  -webkit-mask: var(--botui-mask) center / calc(var(--botui-fill, 1) * 100%) no-repeat;
  mask: var(--botui-mask) center / calc(var(--botui-fill, 1) * 100%) no-repeat;
  scale: var(--botui-s-min, 0.5);
  animation: var(--botui-anim) var(--botui-cycle) linear infinite;
  animation-delay: calc(var(--botui-o, 0) * var(--botui-seed) * var(--botui-cycle));
}
.bh-avatar-facepile {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding-right: ${space.x1};
}
.bh-avatar-facepile-button { display: inline-flex; flex: none; padding: 0; border: 0; border-radius: ${radius.round}; background: transparent; color: inherit; cursor: pointer; }
.bh-avatar-facepile-button:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-avatar-facepile > * + * {
  margin-left: -${space.x3};
}
.bh-avatar-facepile .bh-persona-avatar,
.bh-avatar-facepile-overflow {
  border: ${border.hairline} solid var(--dsw-alias-bg-base);
  border-radius: ${radius.round};
}
.bh-avatar-facepile-overflow {
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  font-weight: ${text.strong};
}
@keyframes bh-avatar-breathe {
  0%,
  100% {
    transform: scale(0.98);
  }
  50% {
    transform: scale(1.035);
  }
}
@keyframes bh-avatar-work {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  38% {
    transform: translateY(-2%) rotate(-1.5deg);
  }
  70% {
    transform: translateY(1%) rotate(1deg);
  }
}
@keyframes bh-avatar-search {
  0%,
  100% {
    transform: translateX(-2%);
  }
  50% {
    transform: translateX(2%);
  }
}
@keyframes bh-avatar-code {
  0%,
  100% {
    transform: scaleY(0.98);
  }
  50% {
    transform: scaleY(1.035);
  }
}
@keyframes bh-avatar-execute {
  0%,
  100% {
    transform: rotate(-1.5deg);
  }
  50% {
    transform: rotate(1.5deg);
  }
}
${keyframesFor('spiral')}
${keyframesFor('morph')}
html[data-botharness-motion='reduce'] .bh-avatar-media,
html[data-botharness-motion='reduce'] .bh-avatar-botui i {
  animation: none !important;
}
html[data-botharness-motion='reduce'] .bh-avatar-botui i {
  opacity: calc(0.16 + 0.84 * (1 - var(--botui-o, 0)));
  scale: 1;
}


/* 原生 .flatList/.groupSection 行距：同一 scope 内相邻行 2px。 */
.bh-list-area > * + * {
  margin-top: ${space.x1};
}
.bh-roster-list {
  flex: 1 0 auto;
  min-height: 72px;
}
/* 区块距（PM 定稿）：section 之间、平铺列表与首个 section 之间 12px ——
   外壳自身的块节奏（logoRow / panelList 的 margin-bottom 8px，收起态 12px）
   里最小且仍是明确视觉断点的取整；` +
  ` 选择器保证首个 section 不吃这个
   间距，末尾也不留悬空（bottom-margin 反而要在 :last-child 上打补丁）。 */
.bh-list-area + .bh-section,
.bh-section + .bh-section {
  margin-top: ${space.x4};
}

/* 原生 .projectRow/.sessionRow 共同几何：8px 圆角、0 8px 内衬、悬停 alias
   token。行盒落在 root 内容右缘（280px 侧栏 = x12..268），与原生行同表一致。 */
/* .bh-root 前缀压过表单控件的 font: inherit 重置，让行盒与原生行同为
   14px/20px（可见文本各自声明字号）。 */
.bh-root .bh-section-head,
.bh-root .bh-channel-row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
  font-size: ${text.titleSize};
  line-height: ${text.bodyLine};
  user-select: none;
}
.bh-channel-row:hover,
.bh-channel-row.bh-selected {
  background: var(--bh-hover);
}
.bh-root .bh-multi-selected {
  background: var(--bh-selected);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);
}
.bh-contact,
.bh-root .bh-channel-row {
  position: relative;
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
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: ${text.metaSize}/1 var(--dsw-font-family);
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

.bh-contact {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  width: 100%;
  padding: ${space.x3} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: opacity 120ms var(--ds-ease-in-out);
}
.bh-contact:hover {
  background: var(--bh-hover);
}
.bh-contact.bh-selected {
  background: var(--bh-hover);
}
.bh-contact .bh-body,
.bh-channel-row .bh-body {
  min-width: 0;
  flex: 1;
}
.bh-contact .bh-top,
.bh-channel-row .bh-top {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
}
.bh-contact .bh-name,
.bh-channel-row .bh-name {
  min-width: 0;
  font-weight: ${text.strong};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-channel-message-time {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bh-row-status + .bh-channel-message-time {
  margin-left: 0;
}
.bh-role-badges {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  overflow: hidden;
}
.bh-role-badges > * {
  flex: 0 0 auto;
}
.bh-pinned .bh-role-badges {
  max-width: 100%;
  justify-content: center;
}
.bh-topbar .bh-role-badges {
  flex-wrap: wrap;
  overflow: visible;
}
.bh-contact .bh-msg,
.bh-channel-row .bh-msg {
  display: block;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-contact .bh-bottom,
.bh-channel-row .bh-bottom {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
}
.bh-bottom .bh-msg {
  min-width: 0;
  flex: 1;
}
.bh-has-unread .bh-msg {
  color: var(--dsw-alias-label-secondary);
}
.bh-unread-count {
  display: inline-flex;
  flex: none;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 ${space.x2};
  border-radius: ${radius.round};
  background: var(--bh-accent);
  color: var(--dsw-alias-label-primary-foreground);
  font: ${text.strong} ${text.metaSize}/1 var(--dsw-font-family);
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
.bh-unread-count-muted {
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
}
.bh-muted .bh-name,
.bh-muted .bh-msg {
  color: var(--dsw-alias-label-tertiary);
}
.bh-muted-mark {
  display: inline-flex;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.bh-shortcut-active .bh-unread-count {
  visibility: hidden;
}
.bh-unread {
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
  color: var(--dsw-alias-label-secondary);
  font-weight: ${text.strong};
}

/* Conversation rows share the DM geometry so Groups also show a message preview. */
.bh-channel-row {
  min-height: 48px;
  gap: ${space.x3};
  padding: 7px 8px;
  transition: opacity 120ms var(--ds-ease-in-out);
}
/* 拖拽源行原位淡出：标示来处，不占位、不推动任何布局（native 无此态，
   系刻意偏离：overlay 插入线之外唯一的拖拽中视觉）。 */
.bh-channel-row.bh-drag-source {
  opacity: 0.4;
}
.bh-contact.bh-drag-source {
  opacity: 0.4;
}
.bh-channel-slot {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: ${radius.md};
  overflow: hidden;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-tertiary);
}

/* 原生 ui-workspace sessionRow 的拖拽插入线（ADR-0031）：伪元素绝对定位，
   不占布局；箭头 + 2px 规则线，起点在行内 4px、右缘留 4px。行是 button，
   伪元素在 .bh-root .bh-channel-row 下同样生效。 */
.bh-channel-row.bh-drop-before,
.bh-channel-row.bh-drop-after,
.bh-contact.bh-drop-before,
.bh-contact.bh-drop-after {
  position: relative;
}
.bh-channel-row.bh-drop-before::before,
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
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
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

/* 原生 .groupSection 的 workspace 拖动插入线：section 头的重排和 flat
   gap 的松散落点把同一条渐变画在区块上下边界（-8px 落在 12px 间距带内）。
   伪元素绝对定位，不占布局，拖拽中没有任何区块改变高度。 */
.bh-section.bh-drop-before,
.bh-section.bh-drop-after {
  position: relative;
}
.bh-section.bh-drop-before::before,
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
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}
.bh-section.bh-drop-before::before {
  top: -8px;
}
.bh-section.bh-drop-after::after {
  bottom: -8px;
}

/* Row-less section body 的投放线（空 / 折叠 / 过滤无行）：画在 body 顶部
   下方——空 body 下即紧贴 header 的位置。伪元素绝对定位，不占布局；
   取布局的旧空区方案已退役（它在 dragstart 内同步改变高度会掐断手势）。 */
.bh-section.bh-drop-scope > .bh-list-area {
  position: relative;
}
.bh-section.bh-drop-scope > .bh-list-area::before {
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
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}

/* Section 头（Discord 式 PM 定稿）：24px 紧凑条、gap 6、padding 0 8px；
   无背景 fill（与 channel 行悬停区分）；标签默认 tertiary、悬停提亮到
   primary（原生 projectRow 悬停不提亮，此处按 PM 走 Discord 语言）；
   右侧 chevron 随标签同色、150ms 旋转指示折叠；整行可点击折叠
   （aria-expanded 留在行上）。未分组沿用同一标签色（无折叠态，不带
   chevron、不跟随提亮）。 */
.bh-section-head {
  height: 24px;
  gap: 6px;
  padding: 0 ${space.x3};
}
.bh-section-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${text.titleSize};
  line-height: ${text.bodyLine};
  color: var(--dsw-alias-label-tertiary);
}
.bh-section-head:hover .bh-section-name,
.bh-section-head:hover .bh-section-chevron {
  color: var(--dsw-alias-label-primary);
}
.bh-section-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
.bh-section-chevron.bh-chevron-collapsed {
  transform: rotate(-90deg);
}
.bh-section-count {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.bodyLine};
}

/* 原生 .rowActions：16px 字形、gap 12、仅悬停显示（菜单打开时的常显由
   row 组件的 menu-open 变体在交互接线时补上）。 */
.bh-row-actions {
  flex: none;
  display: none;
  align-items: center;
  gap: ${space.x4};
  height: 20px;
}
.bh-section-head:hover .bh-row-actions,
.bh-section-head:focus-within .bh-row-actions,
.bh-section-head.bh-menu-open .bh-row-actions {
  display: inline-flex;
}
.bh-row-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: ${radius.xs};
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-row-action:not(:disabled):hover {
  color: var(--dsw-alias-label-primary);
}
.bh-row-action:disabled {
  cursor: default;
}

html[data-botharness-motion='reduce'] .bh-pin-zone,
html[data-botharness-motion='reduce'] .bh-unpin-zone,
html[data-botharness-motion='reduce'] .bh-section-chevron {
  transition: none;
}

/* 右键「移动到」菜单的锚点：JsonTree 的 proxy-rect 方案 —— fixed 定位的
   0 尺寸代理，Menu 用 getAnchorRect 读它的 rect 并把列表 portal 到 body，
   从而跟随光标且不被侧栏的 overflow 裁切（Menu 自身再钳制到视口边距）。 */
.bh-menu-anchor {
  position: fixed;
  z-index: 3;
  display: inline-flex;
}

/* 子菜单当前 scope 的尾部对勾：primitives 的 Menu 只为主行渲染 check，
   子菜单的选中标记因此放在 label 内（菜单 portal 到 body，类不依赖 .bh-root）。 */
.bh-move-checked {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  width: 100%;
}
.bh-move-checked-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


/* 原生 WorkspaceBrowser 的 .renameInput（shipped dialog 用的是 feature-local
   普通 input，不是 primitives Input）：类自身拥有完整盒模型，Modal 在 body
   下也不依赖 .bh-root 前缀。几何逐项对齐原生：高 44、内衬 7/14、圆角 22、
   border-l4、透明底、14/22 label-primary、outline none。 */
.bh-name-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 7px 14px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 22px;
  outline: none;
  background: transparent;
  font-size: ${text.titleSize};
  font-weight: ${text.regular};
  line-height: ${text.bodyLine};
  color: var(--dsw-alias-label-primary);
}
.bh-name-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}
.bh-name-input:disabled {
  color: var(--dsw-alias-label-dimmed);
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
.bh-role-edit-badge button {
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
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-role-edit-badge button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-role-edit-badge button:disabled {
  cursor: default;
  color: var(--dsw-alias-label-dimmed);
}


.bh-modal-error {
  margin-top: ${space.x3};
  border: ${border.hairline} solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: ${radius.sm};
  padding: ${space.x2} ${space.x3};
  font-size: ${text.metaSize};
}

.bh-market-submit {
  display: flex;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-submit > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-market-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
  padding: ${space.x6} 0;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
}
.bh-market-browse {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
}
.bh-market-browse > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-topics {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2};
}
.bh-market-topic {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  height: 24px;
  padding: 0 ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  cursor: pointer;
}
.bh-market-topic:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-market-topic[aria-pressed='true'] {
  border-color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-weight: ${text.strong};
}
.bh-market-topic-count {
  color: var(--dsw-alias-label-tertiary);
}
.bh-market-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-content: start;
  gap: ${space.x4};
  max-height: min(54vh, 560px);
  overflow-y: auto;
  padding: ${space.x1};
}
/* A profile card: banner on top, the Bot's avatar half over its lower edge, identity below. */
.bh-market-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
  padding: ${space.x3} ${space.x3} ${space.x3};
  border-radius: ${radius.lg};
  background: var(--dsw-alias-bg-module-platform);
  transition: border-color 120ms ease, transform 120ms ease;
}
.bh-market-row:hover {
  border-color: var(--dsw-alias-label-tertiary);
  transform: translateY(-1px);
}
.bh-market-row > .bh-market-banner-thumb {
  position: relative;
  aspect-ratio: 4 / 1;
  border-radius: ${radius.md};
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-market-avatar {
  display: block;
  flex-shrink: 0;
  width: fit-content;
  padding: ${space.x1};
  border-radius: ${radius.lg};
  background: var(--dsw-alias-bg-module-platform);
  line-height: 0;
}
/* The avatar rides half over the banner; name, repository and Install sit beside it. */
.bh-market-row-head {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: ${space.x3};
  min-width: 0;
  margin-top: -32px;
  padding: 0 ${space.x2} 0 ${space.x3};
}
.bh-market-row-head > button:last-child { flex-shrink: 0; }
.bh-market-row-head > .bh-market-open { gap: 0; overflow: hidden; }
.bh-market-card-name {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-row .bh-market-owner {
  overflow: hidden;
  line-height: ${text.metaLine};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-card-tags {
  display: flex;
  flex-shrink: 0;
  gap: ${space.x2};
  overflow: hidden;
}
.bh-market-row > .bh-market-description {
  display: -webkit-box;
  overflow: hidden;
  padding: 0 ${space.x2};
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bh-market-row-foot {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  margin-top: auto;
  padding: 0 ${space.x2};
}
.bh-market-row-foot .bh-market-meta { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
.bh-market-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-market-name {
  display: flex;
  align-items: baseline;
  gap: ${space.x2};
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
}
.bh-market-owner {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
}
.bh-market-description {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
  overflow-wrap: anywhere;
}
.bh-market-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x2} ${space.x3};
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-market-open {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-market-open:hover .bh-market-name > :first-child {
  text-decoration: underline;
}
.bh-market-detail {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  min-width: 0;
}
.bh-market-banner,
.bh-market-banner-thumb {
  display: block;
  flex-shrink: 0;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border: ${border.hairline} solid ${color.border};
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-market-banner,
.bh-market-banner-thumb { border: 0; }
.bh-market-hero {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-market-hero > .bh-market-banner {
  position: relative;
  aspect-ratio: 5 / 1;
  border-radius: ${radius.md};
}
.bh-market-hero[data-market-banner='none'] > .bh-market-banner { display: none; }
.bh-market-hero[data-market-banner='none'] > .bh-market-row-head { margin-top: 0; }
.bh-market-hero > .bh-market-row-head { margin-top: -36px; padding-left: ${space.x4}; }
.bh-market-hero > .bh-market-row-head > .bh-market-copy { padding-bottom: ${space.x2}; }
.bh-market-hero > .bh-market-description,
.bh-market-hero > .bh-market-meta { padding: 0 ${space.x2}; }
.bh-market-hero .bh-market-name { font-size: ${text.titleSize}; font-weight: ${text.strong}; line-height: ${text.titleLine}; }
.bh-market-hero .bh-market-github {
  flex-shrink: 0;
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
}
.bh-market-github {
  flex: none;
  color: var(--bh-accent);
  font-size: ${text.bodySize};
  text-decoration: none;
}
.bh-market-github:hover {
  text-decoration: underline;
}
.bh-market-readme {
  max-height: min(56vh, 480px);
  overflow-y: auto;
  padding-top: ${space.x4};
  border-top: ${border.hairline} solid ${color.divider};
  min-width: 0;
}
.bh-market-readme img {
  max-width: 100%;
}
.bh-market-report {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: ${space.x3} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
.bh-market-report strong {
  color: var(--dsw-alias-label-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-market-report label {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-market-report textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.bh-market-report textarea:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-market-confirm {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  min-width: 0;
}
.bh-market-confirm-head {
  display: flex;
  align-items: flex-start;
  gap: ${space.x4};
}
.bh-market-facts {
  display: grid;
  gap: ${space.x3};
  margin: 0;
  font-size: ${text.bodySize};
}
.bh-market-facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: ${space.x4};
}
.bh-market-facts dt {
  color: var(--dsw-alias-label-tertiary);
}
.bh-market-facts dd {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, monospace);
  overflow-wrap: anywhere;
}
.bh-market-facts a {
  color: var(--dsw-alias-state-business-primary);
}
.bh-market-risk {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  border: ${border.hairline} solid var(--dsw-alias-state-warning-secondary);
  border-radius: ${radius.sm};
  padding: ${space.x3} ${space.x3};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-market-risk strong {
  color: var(--dsw-alias-state-warning-primary);
  font-size: ${text.bodySize};
}

/* Hidden Channel recovery is portaled under body; never depend on .bh-root. */
.bh-hidden-search {
  box-sizing: border-box;
  width: 100%;
}
.bh-hidden-list {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  max-height: min(360px, 55vh);
  overflow-y: auto;
}
.bh-hidden-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-height: 40px;
  padding: ${space.x1} ${space.x2};
  border-radius: ${radius.sm};
}
.bh-hidden-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-hidden-channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
}
.bh-hidden-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}
.bh-hidden-name,
.bh-hidden-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-hidden-name {
  color: var(--dsw-alias-label-primary);
  font-size: ${text.titleSize};
  line-height: ${text.bodyLine};
}
.bh-hidden-meta {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-hidden-empty {
  padding: 28px ${space.x3};
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.bodySize};
  text-align: center;
}

.bh-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  padding: ${space.x2} ${space.x2};
}
.bh-skeleton {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  padding: ${space.x4} ${space.x5};
}
.bh-skeleton-messages {
  gap: ${space.x6};
  padding: 20px ${space.x6};
}
.bh-skeleton-row {
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
  background: var(--dsw-alias-interactive-bg-hover);
}
html[data-botharness-motion='full'] .bh-skeleton-avatar,
html[data-botharness-motion='full'] .bh-skeleton-line {
  animation: bh-skeleton-pulse 1.6s ease-in-out infinite;
}
.bh-skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: ${radius.round};
}
.bh-skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${space.x3};
  padding-top: ${space.x1};
}
.bh-skeleton-line {
  width: 84%;
  height: 10px;
}
.bh-skeleton-line-short {
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
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
.bh-error {
  margin: ${space.x2} ${space.x2} ${space.x3};
  border: ${border.hairline} solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: ${radius.sm};
  padding: ${space.x3} ${space.x3};
  font-size: ${text.metaSize};
}

.bh-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dsw-alias-bg-base);
}
.bh-main {
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
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
.bh-channel-island:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, var(--dsw-alias-bg-module-platform));
}
.bh-channel-island:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-channel-island > :first-child {
  flex: 0 0 auto;
}
.bh-group-live-activity { container-type: inline-size; min-width: 0; }
.bh-group-live-activity-chips { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; margin-top: ${space.x2}; }
.bh-group-activity-chip { display: inline-flex; min-width: 0; max-width: 100%; border-radius: 999px; }
.bh-group-activity-chip:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-group-activity-pill { min-width: 0; max-width: 100%; }
.bh-group-activity-chip-name { min-width: 0; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.bh-group-activity-chip-state { white-space: nowrap; }
.bh-group-activity-overflow { flex-shrink: 0; }
.bh-channel-island-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: min(100%, 440px);
  pointer-events: auto;
}
.bh-profile-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  width: max-content;
  min-width: 248px;
  max-width: min(320px, 80vw);
  padding: ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
  text-align: left;
}
.bh-profile-popover-identity {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
}
.bh-profile-popover-text {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  min-width: 0;
}
.bh-profile-name {
  font-weight: ${text.strong};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-profile-roles {
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${space.x2};
}
.bh-profile-description {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}
.bh-profile-expand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
  width: 100%;
  padding: ${space.x2} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}
.bh-profile-expand:hover {
  background: var(--bh-hover);
}
.bh-avatar-media-composed svg { overflow: visible; }
.bh-illustrated-head { transform-box: fill-box; transform-origin: 50% 65%; }
.bh-illustrated-gaze { transform-box: fill-box; transform-origin: center; }
.bh-avatar-editor { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: ${space.x6}; align-items: start; }
.bh-card-list.bh-avatar-methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${space.x4}; overflow: visible; border: 0; border-radius: 0; }
.bh-card-list.bh-avatar-methods > .bh-card-row { border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; }
.bh-card-list.bh-avatar-methods > .bh-card-row + .bh-card-row { border-top: ${border.hairline} solid ${color.divider}; }
.bh-card-list.bh-avatar-methods > .bh-card-row[data-state="current"] { border-color: var(--bh-accent); }
.bh-card-list.bh-avatar-methods .bh-card-title { white-space: normal; }
.bh-card-list.bh-avatar-methods .bh-card-detail { padding-top: ${space.x1}; }
.bh-avatar-editor-preview { display: flex; align-items: center; justify-content: center; }
.bh-avatar-editor-controls h3 { margin: 0; font-size: ${text.titleSize}; }
.bh-avatar-editor-controls p { margin: ${space.x3} 0 ${space.x4}; color: var(--dsw-alias-label-secondary); font-size: ${text.bodySize}; }
.bh-avatar-editor-fields { border: 0; margin: 0 0 ${space.x4}; padding: 0; display: flex; flex-direction: column; gap: ${space.x4}; min-width: 0; }
.bh-avatar-families { display: inline-flex; gap: ${space.x1}; padding: ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; align-self: flex-start; }
.bh-avatar-families button { min-height: 26px; padding: 0 ${space.x4}; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
.bh-avatar-families button[aria-checked='true'] { background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); }
.bh-avatar-ranges { display: flex; flex-direction: column; gap: ${space.x3}; max-width: 360px; }
.bh-avatar-ranges label { display: grid; grid-template-columns: 72px minmax(0, 1fr) 28px; align-items: center; gap: ${space.x3}; font-size: ${text.bodySize}; color: var(--dsw-alias-label-secondary); }
.bh-avatar-ranges output { text-align: right; color: var(--dsw-alias-label-primary); }
.bh-avatar-categories { display: flex; flex-wrap: wrap; align-items: flex-start; gap: ${space.x2}; }
.bh-avatar-categories [role='tablist'] { display: flex; flex-wrap: wrap; gap: ${space.x2}; flex: 1; min-width: 0; }
.bh-avatar-categories button { min-height: 28px; padding: 0 ${space.x3}; border: ${border.hairline} solid transparent; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
.bh-avatar-categories button:hover { background: var(--bh-hover); }
.bh-avatar-categories button[aria-selected='true'] { background: var(--dsw-alias-button-elevated-fill); border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.bh-avatar-categories .bh-avatar-shuffle { margin-left: auto; border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.bh-avatar-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: ${space.x3}; }
.bh-avatar-option { aspect-ratio: 1; padding: ${space.x1}; border: ${border.focus} solid transparent; border-radius: ${radius.md}; background: transparent; cursor: pointer; }
.bh-avatar-option span, .bh-avatar-option svg { display: block; width: 100%; height: 100%; }
.bh-avatar-option:hover { border-color: var(--dsw-alias-border-l2); }
.bh-avatar-option[aria-pressed='true'] { border-color: var(--dsw-alias-label-primary); }
.bh-avatar-hidden-note { grid-column: 1 / -1; margin: 0; color: var(--dsw-alias-label-secondary); font-size: ${text.bodySize}; }
.bh-part-editor { grid-column: 1 / -1; display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-part-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; }
.bh-part-toolbar > button:not(.bh-avatar-category) { min-height: 28px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
.bh-part-toolbar > button:disabled { opacity: 0.45; cursor: default; }
.bh-part-divider { width: 1px; height: 20px; background: var(--dsw-alias-border-l2); }
.bh-part-options { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2} ${space.x4}; font-size: ${text.bodySize}; }
.bh-part-options > span, .bh-part-options label { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-part-options small { color: var(--dsw-alias-label-secondary); }
.bh-part-options > span > button:not(.bh-avatar-category):not(.bh-part-swatch) { min-height: 28px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.bh-part-options button:disabled { opacity: 0.45; cursor: default; }
.bh-part-hint { flex-basis: 100%; }
.bh-part-cursor { position: absolute; box-sizing: border-box; border: ${border.focus} solid var(--dsw-alias-label-primary); box-shadow: 0 0 0 1px var(--dsw-alias-bg-base); pointer-events: none; }
.bh-part-draw { align-self: stretch; min-width: 88px; padding: 0 ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; touch-action: none; user-select: none; }
.bh-part-workspace { display: flex; flex-wrap: wrap; gap: ${space.x4}; align-items: flex-start; }
.bh-part-canvas { position: relative; flex: none; max-width: 100%; overflow: hidden; border-radius: ${radius.sm}; touch-action: none; user-select: none; }
.bh-part-backdrop { position: absolute; inset: 0; opacity: 0.38; pointer-events: none; }
.bh-part-backdrop svg { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.bh-part-grid { position: absolute; inset: 0 0 auto 0; display: grid; outline: ${border.focus} dashed var(--dsw-alias-label-secondary); outline-offset: -1px; }
.bh-part-cell { box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l2); cursor: crosshair; }
.bh-part-cell[data-part-other='true'] { opacity: 0.45; }
.bh-part-side { display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-part-preview { display: flex; align-items: center; gap: ${space.x3}; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-part-preview svg { display: block; width: 32px; height: 32px; image-rendering: pixelated; }
.bh-part-palette { display: grid; grid-template-columns: repeat(2, auto); gap: ${space.x2} ${space.x3}; }
.bh-part-palette-row { display: flex; gap: ${space.x1}; }
.bh-part-swatch { width: 18px; height: 18px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.xs}; cursor: pointer; }
.bh-part-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 1px; }
.bh-part-name { display: flex; align-items: center; gap: ${space.x3}; font-size: ${text.bodySize}; }
.bh-part-name input { flex: 1; min-height: 30px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-bg-base); color: inherit; font: inherit; }
.bh-part-library-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-part-image { grid-column: 1 / -1; display: flex; flex-direction: column; gap: ${space.x2}; padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; font-size: ${text.bodySize}; }
.bh-part-image p { margin: 0; }
.bh-part-image label { display: flex; align-items: center; gap: ${space.x3}; }
.bh-part-image input, .bh-part-image select { min-height: 28px; padding: 0 ${space.x2}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-bg-base); color: inherit; font: inherit; }
.bh-part-image input { width: 72px; }
.bh-avatar-color-reset { min-height: 26px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-avatar-colors { display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-avatar-color-row { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; font-size: ${text.bodySize}; }
.bh-avatar-color-row > span { width: 72px; color: var(--dsw-alias-label-secondary); }
.bh-avatar-swatch { width: 24px; height: 24px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; cursor: pointer; }
.bh-avatar-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-avatar-color-row input { width: 32px; height: 26px; padding: 0 ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-bg-base); }
.bh-avatar-editor-fields :focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-avatar-media-composed svg { image-rendering: pixelated; }
@media (max-width: 640px) { .bh-avatar-editor { grid-template-columns: minmax(0, 1fr); } .bh-avatar-options { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); } }
.bh-profile-view {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: ${space.x5} ${space.x5} ${space.x6};
}
.bh-profile-back {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  margin-bottom: ${space.x5};
  padding: ${space.x2} ${space.x3} ${space.x2} ${space.x2};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.bh-profile-back:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-profile-header {
  overflow: hidden;
  margin-bottom: 20px;
  border-radius: ${radius.md};
  background: var(--dsw-alias-bg-module-platform);
}
.bh-profile-banner {
  position: relative;
  aspect-ratio: 3 / 1;
  max-height: 200px;
  width: 100%;
  overflow: hidden;
  background: var(--bh-hover);
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-banner-art {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
canvas.bh-banner-art { image-rendering: pixelated; }
.bh-profile-banner-edit {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: ${space.x1} ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-bg-module-platform) 88%, transparent);
  color: var(--dsw-alias-label-primary);
  font-size: ${text.metaSize};
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
}
.bh-profile-banner:hover .bh-profile-banner-edit,
.bh-profile-banner-edit:focus-visible { opacity: 1; }
@media (hover: none) { .bh-profile-banner-edit { opacity: 1; } }
/* No max-height: with aspect-ratio, WebKit turns it into a max-width and the banner stops
   short of the popover's right edge. Uploads are cropped to 3:1, so the ratio alone fits.
   The art is absolutely placed so its intrinsic width doesn't widen the popover. */
.bh-profile-popover-banner {
  position: relative;
  flex: none;
  margin: -${space.x4} -${space.x4} 0;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border-radius: ${radius.md} ${radius.md} 0 0;
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-profile-popover-banner > .bh-banner-art { position: absolute; inset: 0; }
.bh-profile-header-body {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: 0 ${space.x5} ${space.x5};
}
.bh-profile-header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${space.x4};
  margin-top: -40px;
}
.bh-profile-header-top .bh-profile-avatar-button {
  flex: none;
  border: 4px solid var(--dsw-alias-bg-module-platform);
  background: var(--dsw-alias-bg-module-platform);
}
.bh-profile-header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: ${space.x3};
  padding-bottom: ${space.x2};
}
.bh-profile-header-actions > button { white-space: nowrap; }
.bh-profile-header .bh-profile-view-name { margin-top: ${space.x2}; white-space: normal; overflow-wrap: anywhere; }
.bh-profile-header .bh-profile-description { -webkit-line-clamp: unset; overflow-wrap: anywhere; }
.bh-profile-view-identity {
  display: flex;
  align-items: flex-start;
  gap: ${space.x4};
  padding-bottom: 20px;
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-profile-view-heading {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-profile-view-name {
  margin: 0;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-profile-action {
  padding: ${space.x2} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}
.bh-profile-action:hover {
  background: var(--bh-hover);
}
.bh-profile-action-primary {
  border-color: var(--bh-accent);
  color: var(--bh-accent);
}
.bh-profile-action:disabled {
  opacity: 0.5;
  cursor: default;
}
.bh-profile-avatar-actions {
  display: flex;
  gap: ${space.x3};
  margin-top: ${space.x1};
}
.bh-profile-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: ${text.metaSize};
}
.bh-profile-cards {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  margin-top: 20px;
}
.bh-profile-section {
  margin-top: 20px;
}
.bh-profile-section-title {
  margin: 0 0 ${space.x4};
  color: var(--dsw-alias-label-primary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-profile-section .bh-profile-cards {
  margin-top: 0;
}
.bh-profile-card {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding: ${space.x4} ${space.x4};
  border-radius: ${radius.md};
  background: var(--dsw-alias-bg-module-platform);
}
.bh-profile-card-compact {
  gap: ${space.x2};
  padding: ${space.x3} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
}
.bh-profile-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
}
.bh-profile-card-label {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
  font-size: ${text.metaSize};
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-popover-cards {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
}
.bh-profile-card-body {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
}
.bh-source-policy-table {
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
  color: var(--dsw-alias-label-secondary);
}
.bh-source-policy-table th:first-child { width: 25%; padding-left: 0; }
.bh-source-policy-table th:nth-child(2) { width: 43%; }
.bh-source-policy-table th:nth-child(3) { width: 14%; }
.bh-source-policy-table th:nth-child(4) { width: 18%; }
.bh-source-policy-table tbody th { font-weight: ${text.strong}; }
.bh-source-policy-table tbody tr:last-child > * { border-bottom: 0; }
.bh-source-policy-table td:last-child, .bh-source-policy-table th:last-child { padding-right: 0; text-align: right; }
.bh-source-policy-action { border-radius: ${radius.sm}; color: var(--dsw-alias-label-primary); }
.bh-source-policy-action:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 1px; }
.bh-source-policy-audit { display: flex; flex-direction: column; gap: ${space.x5}; margin: 0; font-size: ${text.bodySize}; }
.bh-source-policy-audit dt { color: var(--dsw-alias-label-secondary); margin-bottom: ${space.x2}; }
.bh-source-policy-audit dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 1100px) {
  .bh-source-policy-table th, .bh-source-policy-table td { padding-left: ${space.x2}; padding-right: ${space.x2}; }
  .bh-source-policy-table th:first-child { width: 25%; }
  .bh-source-policy-table th:nth-child(2) { width: 37%; }
  .bh-source-policy-table th:nth-child(3) { width: 16%; }
  .bh-source-policy-table th:nth-child(4) { width: 22%; }
}

.bh-im-actions { display: flex; align-items: center; gap: ${space.x2}; flex-wrap: wrap; }
.bh-im-heading { display: flex; align-items: center; gap: ${space.x2}; min-width: 0; }
.bh-im-heading small { color: var(--dsw-alias-label-secondary); font-weight: normal; }
.bh-im-help { width: 22px; height: 22px; flex: none; color: var(--dsw-alias-label-secondary); }
.bh-im-help:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
[data-im-grant] .bh-im-group-policy { grid-template-columns: repeat(2,minmax(0,1fr)); gap: ${space.x3} ${space.x4}; padding-block: ${space.x3}; }
.bh-im-wide { grid-column: 1 / -1; }
.bh-im-policy-footer { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; flex-wrap: wrap; }
.bh-im-policy-revision { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
[data-im-grant] .bh-im-status { margin: 0; font-size: ${text.metaSize}; }
.bh-im-notice { font-size: ${text.metaSize}; }
[data-im-grant] .bh-im-submit { align-self: flex-end; }
.bh-im-danger.bh-im-danger { background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary-foreground); border-color: transparent; }
.bh-im-danger.bh-im-danger:not(:disabled):hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 85%, var(--dsw-alias-label-primary)); }
.bh-im-thread-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
@media (max-width: 720px) {
  [data-im-grant] .bh-im-group-policy { grid-template-columns: minmax(0,1fr); }
}
.bh-im-danger-outline.bh-im-danger-outline { color: var(--dsw-alias-state-error-primary); }
.bh-conversation-group { display: grid; gap: ${space.x2}; }
.bh-conversation-group + .bh-conversation-group { margin-top: ${space.x3}; }
.bh-conversation-group-title { font-size: ${text.metaSize}; font-weight: ${text.strong}; color: var(--dsw-alias-label-secondary); }
.bh-conversation-group-title small { font-weight: ${text.regular}; margin-left: ${space.x1}; }
.bh-conversation-reason { font-size: ${text.metaSize}; color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.bh-conversation-list .bh-card-main { padding-block: ${space.x3} ${space.x1}; }
.bh-conversation-list .bh-card-body { gap: ${space.x1}; }
.bh-conversation-list .bh-card-detail { display: grid; gap: ${space.x2}; padding-bottom: ${space.x2}; }
.bh-conversation-actions { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; }
.bh-conversation-confirm { display: grid; gap: ${space.x3}; }
.bh-conversation-confirm p { margin: 0; }
.bh-modal-footer { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x3}; width: 100%; justify-content: flex-end; }
.bh-modal-footer > button { white-space: nowrap; }
.bh-management-workspace { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: ${space.x5}; align-items: start; }
.bh-management-settings, .bh-management-records { display: grid; gap: ${space.x4}; min-width: 0; }
.bh-management-detail { gap: ${space.x3}; }
.bh-management-time { display: block; }
[data-pairing-panel] .bh-management-state { box-sizing: border-box; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.bh-management-records .bh-pairing-table { min-width: 0; table-layout: fixed; }
.bh-management-records .bh-pairing-table th:nth-child(2) { width: 32%; min-width: 0; }
.bh-management-records .bh-pairing-table th:last-child { width: 84px; min-width: 0; }
.bh-management-records .bh-pairing-table td:last-child { white-space: nowrap; }
@media (max-width: 760px) {
  .bh-management-workspace { grid-template-columns: minmax(0, 1fr); }
  .bh-management-records [role="tablist"], .bh-management-records [role="tab"] { height: auto; }
  .bh-management-records [role="tab"] { min-height: 34px; padding: ${space.x3} ${space.x2}; white-space: normal; }
  .bh-management-records .bh-pairing-table th:first-child, .bh-management-records .bh-pairing-table td:first-child { width: 16px; padding-inline: ${space.x2}; }
  .bh-management-records .bh-pairing-table th:nth-child(2) { width: 28%; }
  .bh-management-records .bh-pairing-table th:last-child { width: 56px; }
  .bh-management-time > span { display: block; }
}
.bh-pairing-toolbar-gap { flex: 1; }
.bh-pairing-panel { display: grid; gap: ${space.x4}; min-width: 0; }
.bh-pairing-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: ${space.x5}; align-items: start; min-height: 260px; }
.bh-pairing-detail { min-width: 0; max-height: 420px; overflow-y: auto; }
.bh-group-editor-header { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: ${space.x5}; border: 0; padding: 0; margin: 0 0 ${space.x5}; }
.bh-group-editor-selection { min-width: 0; }
[data-group-editor] .bh-group-editor-header { gap: ${space.x4}; margin-bottom: 0; }
[data-group-editor] .bh-pairing-workspace { gap: ${space.x4}; min-height: 0; }
.bh-behavior-results { display: grid; gap: ${space.x3}; }
.bh-im-pairing-request.bh-behavior-item { padding: ${space.x3} ${space.x3}; gap: ${space.x2}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; }
.bh-behavior-item .bh-pairing-behavior { margin: 0; }
.bh-behavior-sources { display: grid; gap: ${space.x1}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-behavior-preview-toggle { width: 100%; }
.bh-behavior-preview-toggle:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-behavior-preview-body { padding: ${space.x2} 0 0 20px; }
.bh-pairing-table-panel { display: grid; gap: ${space.x4}; min-width: 0; }
.bh-pairing-table-scroll { overflow-x: auto; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; }
.bh-pairing-table { width: 100%; border-collapse: collapse; text-align: left; font-size: ${text.bodySize}; }
.bh-pairing-table th, .bh-pairing-table td { padding: ${space.x3} ${space.x3}; border-bottom: ${border.hairline} solid ${color.divider}; vertical-align: middle; overflow-wrap: anywhere; }
.bh-pairing-table th { color: var(--dsw-alias-label-secondary); font-weight: ${text.strong}; }
.bh-pairing-table td:first-child, .bh-pairing-table th:first-child { width: 28px; }
.bh-pairing-table th:nth-child(2) { width: 24%; min-width: 130px; }
.bh-pairing-table th:last-child { min-width: 52px; white-space: nowrap; }
.bh-pairing-table td:first-child label { font-size: 0; gap: 0; }
.bh-behavior-exclusions .bh-pairing-table { min-width: 0; }
.bh-behavior-exclusions .bh-pairing-table th:nth-child(2) { width: auto; min-width: 0; }
.bh-behavior-selection .bh-pairing-table { min-width: 0; table-layout: fixed; }
.bh-behavior-selection .bh-pairing-table th:first-child, .bh-behavior-selection .bh-pairing-table td:first-child { width: 60%; }
.bh-behavior-selection .bh-pairing-table th:nth-child(2), .bh-behavior-selection .bh-pairing-table th:last-child { width: 20%; min-width: 0; }
.bh-behavior-checkbox { gap: 0; }
.bh-behavior-checkbox > span { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.bh-pairing-table tr[data-selected] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-pairing-table tbody tr:last-child td { border-bottom: none; }
.bh-pairing-sort, .bh-pairing-name { padding: 0; border: none; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.bh-pairing-sort { white-space: nowrap; }
.bh-pairing-sort:disabled { cursor: default; }
.bh-pairing-name { font-weight: ${text.strong}; }
.bh-pairing-name:hover { text-decoration: underline; }
.bh-pairing-name:focus-visible, .bh-pairing-sort:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 3px; }
.bh-pairing-policy-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bh-pairing-behavior { white-space: pre-wrap; }
.bh-pairing-empty { padding: ${space.x6} ${space.x4}; color: var(--dsw-alias-label-secondary); }
.bh-pairing-pagination { display: flex; align-items: center; gap: ${space.x2}; flex-wrap: wrap; }
.bh-pairing-pagination > span { margin-right: auto; }
.bh-pairing-receiver { font-size: ${text.metaSize}; }
[data-pairing-panel] .bh-im-pairing-request { border-radius: ${radius.md}; }
.bh-pairing-times { display: grid; gap: ${space.x1}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-pairing-sort-indicator { color: var(--dsw-alias-label-secondary); }
.bh-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) { .bh-pairing-workspace { grid-template-columns: minmax(0, 1fr); } .bh-pairing-table { min-width: 560px; } .bh-pairing-detail { max-height: none; } }
@media (max-width: 760px) { .bh-group-editor-header { grid-template-columns: minmax(0, 1fr); } .bh-group-editor-selection [role="tablist"] { height: auto; } .bh-group-editor-selection [role="tab"] { height: auto; min-height: 34px; padding: ${space.x3} ${space.x2}; overflow-wrap: anywhere; } }
@media (max-width: 760px) { [data-group-editor] .bh-pairing-detail { max-height: none; overflow: visible; } }
.bh-permission-table { min-width: 0; table-layout: fixed; }
.bh-permission-table th:first-child, .bh-permission-table td:first-child { width: 32%; }
.bh-permission-table th:not(:first-child), .bh-permission-table td:not(:first-child) { width: 17%; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.bh-permission-table td label { font-size: 0; gap: 0; }
.bh-group-members .bh-pairing-table th:nth-child(2) { width: auto; }
[data-im-grant] p { margin: 0; }
.bh-muted { color: var(--dsw-alias-label-secondary); }
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
.bh-im-threads p { margin: 0; color: var(--dsw-alias-label-secondary); }
.bh-im-pairing { display: flex; flex-direction: column; gap: ${space.x4}; padding-block: ${space.x5}; }
.bh-im-pairing p { margin: 0; }
.bh-im-pairing-request { padding: ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; display: flex; flex-direction: column; gap: ${space.x4}; overflow-wrap: anywhere; }
.bh-im-pairing-request dl { margin: 0; display: grid; gap: ${space.x2}; }
.bh-im-pairing-request dl > div { display: grid; grid-template-columns: minmax(90px, 25%) minmax(0, 1fr); gap: ${space.x4}; }
.bh-im-pairing-request dt { color: var(--dsw-alias-label-secondary); }
.bh-im-pairing-request dd { margin: 0; }
.bh-im-pairing-capabilities { display: flex; flex-wrap: wrap; gap: ${space.x4}; border: none; padding: 0; margin: 0; }
.bh-im-pairing-capabilities legend { margin-bottom: ${space.x3}; }
.bh-im-role-form { display: flex; flex-direction: column; gap: ${space.x4}; border: none; padding: 0; margin: 0; }
.bh-im-role-form legend { margin-bottom: ${space.x3}; }
.bh-im-pairing-capabilities label { display: flex; align-items: center; gap: ${space.x2}; }
.bh-im-threads td { overflow-wrap: anywhere; }
.bh-bridge-secondary{display:block;color:var(--dsw-alias-label-secondary);font-size:${text.metaSize};margin-top:${space.x2}}
.bh-im-threads .bh-source-policy-table th:first-child { width: 40%; }
.bh-im-threads .bh-source-policy-table th:nth-child(2) { width: 27%; }
.bh-im-threads .bh-source-policy-table th:nth-child(3) { width: 12%; }
.bh-im-threads .bh-source-policy-table th:nth-child(4) { width: 21%; }
.bh-im-group-policy p { margin: 0; color: var(--dsw-alias-label-secondary); }
.bh-im-digest-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${space.x4}; }
.bh-im-field textarea { min-height: 80px; resize: vertical; }
.bh-im-outcome { display: flex; flex-direction: column; align-items: flex-start; gap: ${space.x2}; overflow-wrap: anywhere; }
.bh-im-field > select,
.bh-im-field > textarea,
.bh-im-field > input,
.bh-profile-policy-select {
  box-sizing: border-box;
  width: 100%;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x3};
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.bh-profile-card-total {
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-profile-card-compact .bh-profile-card-total {
  font-size: ${text.bodySize};
}
.bh-profile-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-profile-pin:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-profile-pin[aria-pressed='true'] {
  color: var(--bh-accent);
}
.bh-profile-heat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 0;
}
.bh-profile-heat-scroll {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.bh-profile-heat[data-compact='true'] .bh-profile-heat-scroll { overflow-x: hidden; }
.bh-profile-heat-cell[data-level='before'] { visibility: hidden; }
.bh-profile-tip-head { display: flex; gap: ${space.x3}; align-items: baseline; }
.bh-profile-tip-line { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-profile-heat-grid {
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
.bh-profile-heat-cell {
  border-radius: ${radius.xs};
  background: var(--dsw-alias-interactive-bg-hover);
}
button.bh-profile-heat-cell {
  padding: 0;
  border: 0;
  appearance: none;
}
button.bh-profile-heat-cell:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 1px;
}
.bh-profile-heat-cell[data-level='1'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 28%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='2'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 50%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='3'] {
  background: color-mix(in srgb, var(--bh-bot-color, var(--bh-accent)) 72%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='4'] {
  background: var(--bh-bot-color, var(--bh-accent));
}
.bh-profile-heat-cell[data-level='future'] {
  background: transparent;
}
.bh-profile-empty {
  font-size: ${text.metaSize};
  color: var(--dsw-alias-label-tertiary);
}
.bh-profile-reason-count {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.bh-profile-bar-chart {
  width: 100%;
}
.bh-profile-bar-chart svg {
  display: block;
}
.bh-profile-token-shares {
  font-size: ${text.metaSize};
  color: var(--dsw-alias-label-secondary);
}
.bh-model-usage {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding-top: ${space.x4};
  border-top: ${border.hairline} solid ${color.divider};
}
.bh-model-usage-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x4};
}
.bh-model-usage-header label {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  color: var(--dsw-alias-label-secondary);
}
.bh-model-usage-header select { width: auto; }
.bh-model-usage-header label { white-space: nowrap; }
.bh-model-usage-header input {
  width: auto;
}
.bh-model-usage-overview {
  border-top: 0;
  padding-top: 0;
}
.bh-model-usage-range {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x4};
}
.bh-model-usage-range label {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-model-usage-range input { width: auto; }
.bh-usage-model-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: ${space.x4}; }
.bh-usage-range-controls { display: flex; align-items: center; gap: ${space.x2}; margin-left: auto; }
.bh-usage-totals { display: flex; flex-wrap: wrap; align-items: baseline; gap: ${space.x2} ${space.x4}; }
.bh-usage-daily > .bh-usage-legend { margin-bottom: ${space.x2}; }
.bh-usage-grouping { display: inline-flex; padding: ${space.x1}; gap: ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; }
.bh-usage-grouping button { border: 0; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x3}; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-usage-grouping button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-usage-grouping button:hover { color: var(--dsw-alias-label-primary); }
.bh-usage-grouping button:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-usage-daily, .bh-usage-models { display: grid; gap: ${space.x4}; }
.bh-usage-axis-labels { display: flex; justify-content: space-between; font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-usage-model-plot { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: ${space.x5}; }
.bh-usage-model-label { height: 36px; display: flex; align-items: center; justify-content: space-between; gap: ${space.x4}; font-size: ${text.metaSize}; }
.bh-usage-model-label > span { min-width: 0; line-height: ${text.metaLine}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-usage-model-label strong { flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-usage-measures { display: grid; gap: ${space.x1}; margin: ${space.x2} 0 0; font-size: ${text.metaSize}; font-variant-numeric: tabular-nums; }
.bh-usage-measures > div { display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-usage-measures dt { color: var(--dsw-alias-label-secondary); }
.bh-usage-measures dd { margin: 0; }
.bh-usage-cached-measure { padding-left: ${space.x3}; }
.bh-usage-legend { display: flex; flex-wrap: wrap; gap: ${space.x5}; font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-usage-legend span { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-usage-legend i { width: 8px; height: 8px; border-radius: ${radius.xs}; }
.bh-usage-legend i[data-series="cached"] { background: var(--bh-accent); }
.bh-usage-legend i[data-series="uncached"] { background: var(--bh-chart-read-dim); }
.bh-usage-legend i[data-series="output"] { background: var(--bh-chart-output); }
.bh-usage-legend i[data-series="unclassified"] { background: var(--dsw-alias-label-tertiary); }
.bh-usage-tone-legend { gap: ${space.x4}; font-weight: ${text.regular}; }
.bh-usage-tone-legend i { background: var(--dsw-alias-label-primary); }
.bh-usage-tone-legend i[data-tone="uncached"] { opacity: 0.62; }
.bh-usage-tone-legend i[data-tone="output"] { opacity: 0.36; }
.bh-usage-identity-chart { min-width: 0; }
.bh-usage-identity-marker { display: inline-block; width: 8px; height: 8px; margin-right: ${space.x2}; border-radius: ${radius.xs}; }
.bh-usage-details summary { cursor: pointer; padding: ${space.x4} 0; color: var(--dsw-alias-label-secondary); }
.bh-usage-details summary:hover, .bh-usage-details summary:focus-visible { color: var(--dsw-alias-label-primary); }
.bh-usage-details > div { display: grid; gap: ${space.x4}; }
.bh-usage-table-scroll { overflow-x: auto; }
.bh-usage-day-table { width: 100%; border-collapse: collapse; font-size: ${text.metaSize}; }
.bh-usage-day-table th, .bh-usage-day-table td { padding: ${space.x3}; text-align: left; font-variant-numeric: tabular-nums; border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-usage-day-table caption { text-align: left; padding-bottom: ${space.x3}; color: var(--dsw-alias-label-secondary); }
.bh-profile-heat-grid {
  position: relative;
}
.bh-profile-heat-tip {
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
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  white-space: nowrap;
  pointer-events: none;
}
/* TanStack's tooltip container carries its own chrome; the inner
   .bh-profile-chart-tip is the single surface, so neutralise the outer one. */
.ts-chart-tooltip {
  --ts-chart-tooltip-padding: 0;
  --ts-chart-tooltip-border: 0;
  --ts-chart-tooltip-background: transparent;
  --ts-chart-tooltip-shadow: none;
}
.bh-profile-chart-tip {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  color: var(--dsw-alias-label-primary);
  font: ${text.metaSize}/1.4 var(--dsw-font-family);
}
.bh-profile-tip-day {
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-tip-value {
  color: var(--dsw-alias-label-primary);
}
.bh-profile-tip-rows {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-profile-tip-rows li {
  display: flex;
  justify-content: space-between;
  gap: ${space.x5};
}
.bh-profile-tip-shares {
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-avatar-button {
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}
.bh-profile-avatar-button:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-chat-top-fade {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  height: 96px;
  background: var(--dsw-alias-bg-base);
  mask-image: linear-gradient(to bottom, var(--dsw-alias-label-primary) 16%, transparent 100%);
  pointer-events: none;
}
.bh-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.bh-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  flex-direction: column;
  gap: ${space.x2};
  text-align: center;
  padding: ${space.x6};
}
.bh-placeholder .bh-big {
  font-size: ${text.titleSize};
  color: var(--dsw-alias-label-secondary);
}
.bh-dim {
  color: var(--dsw-alias-label-tertiary);
}

.bh-chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}
.bh-chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.bh-chat-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 74px ${space.x5} calc(${space.x3} + var(--bh-activity-overlay-inset, 0px));
  overscroll-behavior: contain;
  transition: padding-bottom 160ms ease;
}
/* The faded composer status gives its reserved space back only after the
   fade, so the working rows slide down instead of jumping onto its text. */
.bh-chat-pane[data-activity-concealed='true'] .bh-chat-body {
  padding-bottom: ${space.x3};
  transition-delay: 160ms;
}
html[data-botharness-motion='reduce'] .bh-chat-body { transition: none; }
.bh-chat-empty {
  height: 100%;
}
.bh-timeline-top-sentinel,
.bh-timeline-newer-sentinel {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
.bh-timeline-top-sentinel button,
.bh-timeline-newer-sentinel button {
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-timeline-top-sentinel button:hover,
.bh-timeline-newer-sentinel button:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-message-block + .bh-message-block {
  margin-top: ${space.x4};
}
.bh-message-day {
  width: fit-content;
  margin: ${space.x3} auto ${space.x5};
  padding: ${space.x1} ${space.x3};
  border-radius: 999px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
.bh-message-group {
  display: flex;
  align-items: flex-end;
  gap: ${space.x3};
  min-width: 0;
}
.bh-message-group-me {
  justify-content: flex-end;
}
/* The avatar rests at its group's last bubble and pins to the timeline's
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
  margin-bottom: var(--bh-avatar-lift, 0px);
  border: 0;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
}
.bh-message-group-avatar-link,
.bh-message-group-avatar-focus {
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: transparent;
  outline: none;
}
.bh-message-group-avatar-link { cursor: pointer; }
/* Client-only working rows under the latest message: the composer status
   stays the live region, so these rows are hidden from assistive tech. */
.bh-timeline-working {
  margin-top: ${space.x3};
}
.bh-timeline-working-row {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
}
.bh-timeline-working-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.bodySize};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-timeline-working-ellipsis i {
  font-style: normal;
  animation: bh-timeline-working-dot 1.2s ease-in-out infinite;
}
.bh-timeline-working-ellipsis i:nth-child(2) { animation-delay: 0.2s; }
.bh-timeline-working-ellipsis i:nth-child(3) { animation-delay: 0.4s; }
html[data-botharness-motion='reduce'] .bh-timeline-working-ellipsis i { animation: none; }
@keyframes bh-timeline-working-dot {
  0%, 60%, 100% { opacity: 0.25; }
  30% { opacity: 1; }
}
.bh-message-group-avatar-link:focus-visible,
.bh-message-group-avatar-focus:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-message-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: min(560px, calc(100% - 84px));
}
.bh-message-group-me .bh-message-stack {
  align-items: flex-end;
}
.bh-message-identity {
  display: flex;
  align-items: baseline;
  gap: ${space.x2};
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  margin-bottom: ${space.x2};
}
.bh-bubble-author {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  margin: 0 0 0 ${space.x1};
}
.bh-root .bh-bridge-source-author {
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: ${text.metaSize};
  line-height: 1.5;
  text-align: left;
  max-width: 100%;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.bh-bridge-source-author:hover {
  color: var(--dsw-alias-label-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.bh-bridge-source-author:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-state-business-primary);
  outline-offset: 3px;
  border-radius: ${radius.sm};
}
.bh-bridge-source-modal {
  width: min(560px, 100%);
  max-height: 100%;
}
.bh-bridge-source-fields {
  display: grid;
  gap: ${space.x4};
  margin: 0;
}
.bh-bridge-source-fields > div {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 3fr);
  gap: ${space.x4};
}
.bh-bridge-source-fields dt {
  color: var(--dsw-alias-label-secondary);
}
.bh-bridge-source-fields dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-message-group-me .bh-bubble-author {
  margin: 0 ${space.x1} 0 0;
}
.bh-message-group-me .bh-message-identity {
  flex-direction: row-reverse;
}
.bh-bubble-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: ${space.x2};
  width: fit-content;
  max-width: 100%;
}
.bh-bubble-surface {
  position: relative;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
}
.bh-message-group-me .bh-bubble-surface {
  margin-left: auto;
}
.bh-bubble-surface-failed {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-bubble-failed-action {
  flex: none;
  border: 0;
  padding: ${space.x1} 0;
  color: var(--dsw-alias-state-error-primary);
  background: transparent;
  font-size: ${text.metaSize};
  cursor: pointer;
}
.bh-bubble-failed-action:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-bubble-wrap + .bh-bubble-wrap {
  margin-top: ${space.x1};
}
.bh-bubble {
  width: fit-content;
  max-width: 100%;
  border-radius: ${radius.lg};
  background: ${color.surface};
  color: ${color.fg};
  padding: var(--bh-chat-card-inset);
}
/* Text bubbles are flat and compact like the mobile bubble; cards keep the card inset. */
.bh-bubble:has(> .bh-bubble-body) {
  padding: ${space.x3} ${space.x4};
}
.bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: ${radius.xs};
}
.bh-bubble[data-group-position='middle'] {
  border-top-left-radius: ${radius.xs};
  border-bottom-left-radius: ${radius.xs};
}
.bh-bubble[data-group-position='last'] {
  border-top-left-radius: ${radius.xs};
}
.bh-message-group-me .bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: ${radius.lg};
  border-bottom-right-radius: ${radius.xs};
}
.bh-message-group-me .bh-bubble[data-group-position='middle'] {
  border-top-left-radius: ${radius.lg};
  border-bottom-left-radius: ${radius.lg};
  border-top-right-radius: ${radius.xs};
  border-bottom-right-radius: ${radius.xs};
}
.bh-message-group-me .bh-bubble[data-group-position='last'] {
  border-top-left-radius: ${radius.lg};
  border-top-right-radius: ${radius.xs};
}
.bh-message-group-me {
  --bh-bubble-me-fill: var(--bh-bubble-me-fill-light, color-mix(in srgb, ${color.accent} 90%, ${color.fg}));
  --bh-bubble-me-ink: var(--bh-bubble-me-ink-light, ${color.onAccent});
}
body[data-ds-dark-theme] .bh-message-group-me {
  --bh-bubble-me-fill: var(--bh-bubble-me-fill-dark, ${color.accent});
  --bh-bubble-me-ink: var(--bh-bubble-me-ink-dark, ${color.onAccent});
}
.bh-bubble-me {
  background: var(--bh-bubble-me-fill);
  color: var(--bh-bubble-me-ink);
}
.bh-bubble-pending {
  opacity: 0.7;
}
.bh-bubble-failed {
  opacity: 0.8;
}
.bh-bubble-focused .bh-bubble {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-bubble-reply {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 0 ${space.x3};
  padding: ${space.x2} ${space.x3};
  border: 0;
  border-left: ${border.hairline} solid var(--dsw-alias-label-secondary);
  border-radius: ${radius.xs};
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-bubble-reply:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.bh-bubble-reply:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-bubble-me .bh-bubble-reply {
  border-left-color: color-mix(in srgb, currentColor 60%, transparent);
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
}
.bh-bubble-me .bh-bubble-reply:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
}
.bh-bubble-me .bh-bubble-reply:focus-visible {
  outline-color: currentColor;
}
.bh-bubble-reply-unavailable {
  cursor: default;
}
.bh-bubble-reply-author {
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
}
.bh-bubble-reply-body {
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: ${text.metaSize};
}

/* Files stay part of the same message grouping as their text. */
.bh-bubble-content { min-width: 0; }
.bh-message-attachment { position: relative; min-width: 0; }
.bh-message-file-more { flex: none; color: inherit; }
.bh-message-attachments { display: grid; gap: ${space.x3}; margin-top: ${space.x3}; }
.bh-bridge-media-content { white-space: pre-wrap; }
.bh-bridge-image { max-width: min(100%, 320px); }
.bh-bridge-image-button { display: block; padding: 0; border: 0; background: transparent; cursor: zoom-in; border-radius: ${radius.md}; }
.bh-bridge-image-button:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-bridge-image-state { display: flex; align-items: center; gap: ${space.x3}; min-height: 96px; color: var(--dsw-alias-label-secondary); }
.bh-bridge-image-expanded { display: block; max-width: 100%; max-height: 75vh; margin: auto; object-fit: contain; }
.bh-message-image-link { display: block; width: fit-content; max-width: 320px; min-width: 0; padding: 0; border: 0; border-radius: ${radius.md}; background: transparent; cursor: zoom-in; }
.bh-message-image-link:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-message-image-row { display: flex; align-items: flex-start; gap: ${space.x2}; width: fit-content; max-width: 100%; min-width: 0; }
.bh-message-image { display: block; max-width: 100%; max-height: 320px; border-radius: ${radius.md}; object-fit: contain; }
/* File and audio pills share one card rhythm: icon, stacked name/size, divider, action. */
.bh-message-file, .bh-message-audio { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; width: fit-content; max-width: min(100%, 320px); min-height: 52px; padding: ${space.x3} ${space.x3} ${space.x3} ${space.x4}; border: 0; border-radius: ${radius.md}; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; }
.bh-message-file-main { display: flex; align-items: center; gap: ${space.x3}; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; }
button.bh-message-file-main { cursor: pointer; }
.bh-message-file-main:focus-visible, .bh-message-file-download:focus-visible, .bh-message-audio-play:focus-visible, .bh-message-audio-spectrum:focus-visible { outline: ${border.focus} solid currentColor; outline-offset: 2px; }
.bh-message-file-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; }
.bh-message-file-copy { display: flex; flex-direction: column; flex: 1; gap: ${space.x1}; min-width: 0; }
.bh-message-file-name { display: block; overflow: hidden; min-width: 0; white-space: nowrap; text-overflow: ellipsis; font-size: ${text.bodySize}; font-weight: ${text.strong}; line-height: ${text.bodyLine}; }
.bh-message-file-size { color: color-mix(in srgb, currentColor 72%, transparent); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }
.bh-message-file-divider { flex: none; align-self: stretch; width: 1px; margin-block: ${space.x1}; background: var(--dsw-alias-border-l2); }
.bh-message-file-download { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: ${radius.sm}; color: inherit; text-decoration: none; }
a.bh-message-file-download:hover, button.bh-message-file-download:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-audio-play { display: grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; background: transparent; color: inherit; cursor: pointer; }
.bh-message-audio-play:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-audio-play:disabled { opacity: 0.5; cursor: default; }
.bh-message-audio-meta { display: flex; align-items: center; gap: ${space.x2}; color: color-mix(in srgb, currentColor 72%, transparent); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }
.bh-message-audio-spectrum { display: flex; align-items: center; gap: ${space.x1}; width: 100%; min-width: 0; height: 28px; margin-top: ${space.x2}; padding: 0; border-radius: ${radius.xs}; cursor: pointer; touch-action: none; }
.bh-message-audio-spectrum[aria-disabled='true'] { cursor: default; }
.bh-message-audio-bar { flex: 1 1 0; min-width: 2px; max-width: 4px; border-radius: ${radius.xs}; background: color-mix(in srgb, currentColor 28%, transparent); }
.bh-message-audio-bar[data-played] { background: var(--dsw-alias-state-business-primary); }
.bh-message-audio-element { display: none; }
.bh-bubble-body {
  white-space: pre-wrap;
  word-break: break-word;
}
.bh-bubble-body-markdown {
  min-width: 0;
  white-space: normal;
}
.bh-bubble-body-markdown > :first-child > :first-child {
  margin-top: 0;
}
.bh-bubble-body-markdown > :first-child > :last-child {
  margin-bottom: 0;
}
.bh-bot-mention-prefix {
  display: inline;
}
.bh-bot-mention-prefix .bh-inline-mention + .bh-inline-mention {
  margin-left: ${space.x2};
}
.bh-bubble-body-bot-mentions > :not(.bh-bot-mention-prefix) {
  display: contents;
}
.bh-bubble-body-bot-mentions > :not(.bh-bot-mention-prefix) > p:first-child {
  display: inline;
  margin: 0;
}
.bh-bubble-body-markdown .md-code-block {
  max-width: 100%;
}
.bh-bubble-body-markdown pre {
  max-width: 100%;
  overflow-x: auto;
}
.bh-message-group-me .bh-bubble-wrap {
  flex-direction: row-reverse;
}
.bh-bubble-side {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: var(--bh-reaction-row, 0px);
}
.bh-bubble-side .bh-delivery-trigger {
  position: static;
}
.bh-bubble-meta {
  position: absolute;
  left: 100%;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: ${space.x2};
  width: max-content;
  color: var(--dsw-alias-label-tertiary);
  opacity: 0;
  pointer-events: none;
}
.bh-message-group-me .bh-bubble-meta {
  left: auto;
  right: 100%;
}
.bh-bubble-wrap:hover .bh-bubble-meta,
.bh-bubble-wrap:focus-within .bh-bubble-meta {
  opacity: 1;
  pointer-events: auto;
}
.bh-bubble-time {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: 1.5;
  white-space: nowrap;
  opacity: 0;
}
.bh-message-group:hover .bh-bubble-time,
.bh-message-group:focus-within .bh-bubble-time {
  opacity: 1;
}
.bh-bubble-status {
  display: block;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
/* Hover actions float over the bubble's top-right edge so showing them never
   shifts the layout. The lane spans the bubble and right-aligns the pill; a
   Bot bubble narrower than the pill keeps it from spilling over the avatar. */
.bh-bubble-toolbar {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  right: ${space.x3};
  display: flex;
  justify-content: safe flex-end;
  transform: translateY(calc(-100% + ${space.x3}));
  opacity: 0;
  pointer-events: none;
}
.bh-message-group-me .bh-bubble-toolbar {
  justify-content: flex-end;
}
.bh-bubble-wrap:hover .bh-bubble-toolbar,
.bh-bubble-wrap:focus-within .bh-bubble-toolbar,
.bh-bubble-toolbar:has([aria-expanded='true']) {
  opacity: 1;
}
.bh-bubble-actions {
  display: flex;
  align-items: center;
  gap: ${space.x1};
  padding: ${space.x1};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: ${color.base};
  box-shadow: 0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}
.bh-bubble-wrap:hover .bh-bubble-actions,
.bh-bubble-wrap:focus-within .bh-bubble-actions,
.bh-bubble-toolbar:has([aria-expanded='true']) .bh-bubble-actions {
  pointer-events: auto;
}
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-toolbar {
  display: none;
}
@media (hover: none) {
  .bh-bubble-meta,
  .bh-bubble-time {
    opacity: 1;
    pointer-events: auto;
  }
}
/* Narrow screens: inline copy/reply actions crowd the bubble, so they move
   into the long-press message menu and the bubble keeps the full width. */
@media (max-width: 640px) {
  .bh-bubble-meta,
  .bh-bubble-toolbar {
    display: none;
  }
}
.bh-timeline-new {
  position: absolute;
  z-index: 2;
  bottom: calc(82px + var(--bh-activity-overlay-inset, 0px));
  left: 50%;
  transform: translateX(-50%);
  border: ${border.hairline} solid ${color.border};
  border-radius: 999px;
  padding: ${space.x2} ${space.x4};
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  cursor: pointer;
}

.bh-inline-mention {
  border-radius: ${radius.xs};
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-interactive-bg-active);
}
.bh-inline-mention-sent {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  vertical-align: middle;
  border-radius: ${radius.sm};
  padding: ${space.x1} ${space.x3};
}
.bh-inline-mention-avatar {
  display: inline-flex;
  flex: 0 0 auto;
}
.bh-inline-mention-link {
  border: 0;
  font: inherit;
  cursor: pointer;
}
.bh-inline-mention-link:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: 0 0 0 1px var(--dsw-alias-interactive-bg-hover);
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
.bh-bubble-me .bh-bubble-body-markdown > *,
.bh-bubble-me .bh-bubble-body-markdown :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, strong, em, del, a, th, td),
.bh-bubble-me .bh-bubble-body-markdown li::marker {
  color: inherit;
}
.bh-bubble-me .bh-bubble-body-markdown :not(pre) > code {
  color: inherit;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.bh-bubble-me .bh-inline-mention-link:hover {
  background: color-mix(in srgb, currentColor 24%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent);
}
.bh-composer-rich-input {
  white-space: pre-wrap;
  cursor: text;
}
.bh-composer-rich-input::after {
  content: '\\200b';
}
.bh-composer-rich-input:empty::before {
  content: attr(data-placeholder);
  color: var(--dsw-alias-label-dimmed);
  pointer-events: none;
}
.bh-composer-rich-input[contenteditable='false'] {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.bh-composer-inline-mention {
  user-select: all;
}
.bh-composer-inline-attachment {
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
.bh-composer-inline-attachment [data-attachment-icon] { display: inline-flex; flex: none; }
.bh-composer-inline-attachment-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-composer-inline-attachment-size { flex: none; color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; }
.bh-attachment-ordinal { flex: none; font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-composer-inline-attachment[data-status='uploading'] { opacity: .65; }
.bh-composer-inline-attachment[data-status='error'] { border-color: var(--dsw-alias-state-error-primary); }
.bh-composer-attachment-reference { display: grid; place-items: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-composer-attachment-reference:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-composer-attachment-reference:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.bh-composer-attachment-reference:disabled { opacity: .5; cursor: default; }
.bh-composer-image-reference,
.bh-composer-file-reference { position: absolute; bottom: 2px; right: 2px; width: 20px; height: 20px; }
.bh-delivery-trigger {
  position: absolute;
  z-index: 2;
  right: -27px;
  bottom: 2px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: var(--dsw-alias-bg-base);
  cursor: pointer;
}
.bh-message-group-me .bh-delivery-trigger {
  right: auto;
  left: -27px;
}
.bh-delivery-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-delivery-trigger:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}

.bh-delivery-badge {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  padding: ${space.x1};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.round};
}
.bh-delivery-pie {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: ${radius.round};
}
.bh-delivery-legend-handled {
  color: var(--dsw-alias-state-success-primary);
}
.bh-delivery-legend-running {
  color: var(--dsw-alias-state-business-primary);
}
.bh-delivery-legend-observed {
  color: var(--dsw-alias-label-primary);
}
.bh-delivery-legend-pending {
  color: var(--dsw-alias-label-secondary);
}
.bh-delivery-legend-ignored {
  color: var(--dsw-alias-label-tertiary);
}
.bh-delivery-legend-human-read {
  color: var(--dsw-alias-state-success-primary);
}
.bh-delivery-legend-human-unread {
  color: var(--dsw-alias-label-secondary);
}
.bh-delivery-human-avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: ${radius.round};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-weight: ${text.strong};
}
.bh-delivery-legend-retryable,
.bh-delivery-legend-needs-repair {
  color: var(--dsw-alias-state-error-primary);
}
/* The receipt card portals to body so it remains visible at the edge of the
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
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  color: var(--dsw-alias-label-primary);
  font: ${text.metaSize}/1.5 var(--dsw-font-family);
}
.bh-delivery-panel:focus {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-delivery-panel-summary {
  margin-bottom: ${space.x3};
  color: var(--dsw-alias-label-secondary);
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
.bh-delivery-legend {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: ${radius.round};
  background: currentColor;
}
.bh-delivery-panel-group ul {
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
.bh-delivery-panel-group li > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-mention-picker {
  max-height: 280px;
  overflow-y: auto;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.bh-mention-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: ${space.x3};
  border: 0;
  padding: ${space.x3} ${space.x3};
  color: var(--dsw-alias-label-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.bh-mention-option:hover,
.bh-mention-option-active {
  background: var(--dsw-alias-interactive-bg-active);
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
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
.bh-composer-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${space.x2};
  margin: 0 ${space.x4} calc(${space.x4} + env(safe-area-inset-bottom, 0px));
  flex: 0 0 auto;
}
.bh-composer {
  --bh-composer-body-height: 34px;
  --bh-composer-compact-padding-left: 44px;
  --bh-composer-compact-padding-right: 54px;
  position: relative;
  min-height: 50px;
  box-sizing: border-box;
  overflow: hidden;
  padding: ${space.x3} var(--bh-composer-compact-padding-right) ${space.x3} var(--bh-composer-compact-padding-left);
  border: ${border.hairline} solid ${color.border};
  border-radius: 25px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px
    color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
  transition:
    padding 220ms var(--ds-ease-in-out),
    border-radius 220ms var(--ds-ease-in-out);
}
.bh-composer-expanded {
  padding-top: ${space.x3};
  padding-bottom: 48px;
  border-radius: 20px;
}
.bh-composer-with-footer {
  padding: 10px 12px 48px;
  border-radius: 20px;
}
.bh-composer-reply {
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
  padding-left: ${space.x3};
  border-left: ${border.hairline} solid var(--dsw-alias-label-secondary);
}
.bh-composer-reply-author {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-body {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-cancel {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  font-size: ${text.titleSize};
  cursor: pointer;
}
.bh-composer-reply-cancel:hover {
  background: var(--dsw-alias-interactive-bg-active);
}
.bh-composer-reply-cancel:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
}

.bh-composer-activity-status {
  transition: opacity 160ms ease, translate 160ms ease;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  pointer-events: none;
  container-type: inline-size;
  background: transparent;
  min-height: 28px;
  min-width: 0;
  padding: 0 ${space.x2};
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size);
}
/* Scrolled into history, the status sits over messages, so it carries a
   backdrop that fades in from the chat background above it. */
.bh-composer-activity-status { isolation: isolate; }
.bh-composer-activity-status::before {
  content: '';
  position: absolute;
  inset: -12px 0 -6px;
  z-index: -1;
  background: linear-gradient(to bottom, transparent, var(--dsw-alias-bg-base) 12px);
  pointer-events: none;
}
/* At the latest message the working rows already show every active Bot, so
   the status only fades out: it stays the screen-reader live region. */
.bh-composer-activity-status[data-concealed='true'] { opacity: 0; translate: 0 4px; }
.bh-composer-activity-status[data-concealed='true'] * { pointer-events: none; }
html[data-botharness-motion='reduce'] .bh-composer-activity-status { transition: none; }
.bh-composer-activity-facepile .bh-persona-avatar,
.bh-composer-activity-facepile .bh-avatar-facepile-overflow {
  border: 0;
}
.bh-composer-activity-facepile .bh-persona-avatar::before {
  display: none;
}
.bh-composer-activity-toggle {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: ${space.x3};
  cursor: pointer;
  list-style: none;
  background: transparent;
}
.bh-composer-activity-chevron { flex: none; }
.bh-composer-activity-status[open] .bh-composer-activity-chevron { transform: rotate(180deg); }
.bh-composer-activity-toggle::-webkit-details-marker { display: none; }
.bh-composer-activity-toggle:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-composer-activity-status:not([open]) .bh-composer-activity-details { display: none; }
.bh-composer-activity-details { pointer-events: auto; display: flex; flex-direction: column; gap: ${space.x2}; max-height: min(40vh, 320px); overflow-y: auto; margin: ${space.x3} 0 0; padding: 0; list-style: none; background: transparent; }
.bh-composer-activity-session { flex: none; pointer-events: auto; display: flex; align-items: center; gap: ${space.x3}; min-width: 0; min-height: 40px; padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; background: var(--dsw-alias-bg-base); border-radius: ${radius.sm}; }
.bh-composer-activity-session time { flex: none; margin-left: auto; font-size: var(--dsh-content-font-size); color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.bh-composer-activity-session-latest { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dsh-content-font-size); color: var(--dsw-alias-label-secondary); }
.bh-composer-activity-source-label { flex: 0 1 auto; max-width: 40%; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); }
@container (max-width: 480px) {
  .bh-composer-activity-session { flex-wrap: wrap; }
  .bh-composer-activity-source-label { flex: 1; max-width: none; }
  .bh-composer-activity-session-latest { order: 1; flex-basis: 100%; padding-left: ${space.x6}; }
}
.bh-composer-activity-summary {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-composer-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bh-composer-add-file { position: absolute; left: 8px; bottom: 10px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: pointer; }
.bh-composer-add-file:hover { background: var(--dsw-alias-interactive-bg-active); }
.bh-composer-add-file:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.bh-composer-add-file:disabled { opacity: .5; cursor: default; }
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
.bh-composer-attachment-card {
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
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
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
.bh-composer-image-preview:disabled { cursor: default; }
.bh-composer-image-preview:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -3px; }
.bh-composer-image-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.bh-composer-image-attachment[data-status='error'] .bh-composer-image-preview img { opacity: .55; }
.bh-composer-file-icon { display: grid; place-items: center; flex: none; width: 32px; height: 32px; }
.bh-composer-attachment-card .bh-composer-attachment-remove { top: 2px; right: 2px; width: 20px; height: 20px; }
.bh-composer-file-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.bh-composer-attachment-size { color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-composer-attachment-name { display: block; overflow: hidden; min-width: 0; color: var(--dsw-alias-label-primary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; text-overflow: ellipsis; }
.bh-composer-upload-status { color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; line-height: 13px; }
.bh-composer-upload-retry { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-state-error-primary); font-size: ${text.metaSize}; line-height: 13px; cursor: pointer; }
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
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-composer-attachment-remove:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-composer-attachment-remove:focus-visible,
.bh-composer-upload-retry:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.bh-composer-body {
  position: relative;
  display: flex;
  min-width: 0;
  height: var(--bh-composer-body-height);
  overflow: hidden;
}
.bh-composer-first-expand .bh-composer-body {
  transition: height 220ms var(--ds-ease-in-out);
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
  color: var(--dsw-alias-label-primary);
  line-height: ${text.bodyLine};
  overflow-wrap: anywhere;
}
.bh-composer-input::placeholder {
  color: var(--dsw-alias-label-secondary);
}
.bh-composer-input:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.bh-composer-footer {
  position: absolute;
  right: 10px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.bh-send-btn {
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border-radius: ${radius.round};
}
html[data-botharness-motion='reduce'] .bh-composer,
html[data-botharness-motion='reduce'] .bh-composer-body,
html[data-botharness-motion='reduce'] .bh-composer-add-file,
html[data-botharness-motion='reduce'] .bh-composer-footer {
  transition: none;
}

.bh-channel-sidebar {
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
.bh-channel-sidebar-resize:hover {
  background: var(--dsw-alias-border-l2);
}
.bh-channel-sidebar-head {
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
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-sidebar-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-channel-sidebar-tab-badge { display: inline-flex; }
.bh-channel-sidebar-tab-badge:empty { display: none; }
.bh-channel-sidebar-tab-badge > * + * { display: none; }
.bh-channel-sidebar-live-dot { display: inline-block; width: 6px; height: 6px; border-radius: ${radius.round}; background: var(--dsw-alias-state-success-primary, var(--bh-accent)); }
.bh-channel-sidebar-split-panes {
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
.bh-channel-sidebar-split-handle {
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
  background: linear-gradient(transparent 2px, var(--dsw-alias-state-business-primary) 2px, var(--dsw-alias-state-business-primary) 4px, transparent 4px);
}
.bh-channel-sidebar-head .bh-sidebar-settings-menu {
  position: absolute;
  top: calc((var(--bh-channel-header-height) - 28px) / 2);
  right: 44px;
  z-index: 7;
}
.bh-sidebar-settings {
  position: static;
}
.bh-sidebar-settings-list > [role="presentation"] { overflow: visible; }
.bh-sidebar-settings-group { position: relative; }
.bh-sidebar-settings-trigger { display: flex; align-items: center; gap: ${space.x2}; width: 100%; min-height: 30px; padding: ${space.x2} ${space.x3}; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--dsw-alias-label-primary); font-size: ${text.bodySize}; line-height: ${text.bodyLine}; text-align: left; cursor: pointer; }
.bh-sidebar-settings-trigger > span { flex: 1; white-space: nowrap; }
.bh-sidebar-settings-trigger:hover, .bh-sidebar-settings-trigger:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.bh-sidebar-settings-options { position: absolute; top: 0; right: calc(100% + 10px); z-index: 1101; min-width: 163px; padding: ${space.x2}; box-sizing: border-box; --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); }
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
.bh-channel-sidebar-entry-head:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-sidebar-entry-chevron {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
.bh-channel-sidebar-entry-chevron.bh-chevron-collapsed,
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
.bh-model-entry,
.bh-wake-policy-entry {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker, .bh-model-allowed {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker-heading {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  font-size: ${text.bodySize};
}
.bh-model-picker-heading > span {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-model-picker-effort {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x4};
  flex-wrap: wrap;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-model-task {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-model-picker-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${space.x4};
  min-width: 0;
}
.bh-model-picker-heading-row > .bh-model-picker-heading {
  flex: 1;
  min-width: 0;
}
.bh-model-picker-heading-row > :last-child {
  flex: none;
}
.bh-model-task[data-mode-switched='true'] > .bh-model-allowed,
.bh-model-task[data-mode-switched='true'] > .bh-model-picker > :not(.bh-model-picker-heading-row) {
  animation: bh-model-mode-enter 180ms var(--ds-ease-in-out);
}
@keyframes bh-model-mode-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
html[data-botharness-motion='reduce'] .bh-model-task > .bh-model-allowed,
html[data-botharness-motion='reduce'] .bh-model-task > .bh-model-picker > * {
  animation: none;
}
.bh-model-card {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  padding: ${space.x3} ${space.x4};
}
.bh-model-card-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  min-height: 28px;
  font-size: ${text.bodySize};
}
.bh-model-card-provider {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-model-card-field {
  display: flex;
  align-items: center;
  gap: ${space.x2} ${space.x4};
  flex-wrap: wrap;
  font-size: ${text.metaSize};
}
.bh-model-card-field > span {
  min-width: 96px;
  color: var(--dsw-alias-label-secondary);
}
.bh-model-card-efforts {
  display: flex;
  flex-wrap: wrap;
  gap: ${space.x2} ${space.x4};
}
.bh-inbox-item:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: -2px;
}
.bh-external-source-file {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  margin-block: ${space.x3};
}
.bh-external-source-audio { display: grid; gap: ${space.x3}; margin-block: ${space.x3}; }
.bh-external-source-video video { display: block; max-width: 100%; max-height: 420px; }
.bh-external-source-audio p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-external-source-image { display: block; max-width: 100%; max-height: 384px; object-fit: contain; margin-block: ${space.x3}; }
.bh-external-source-file > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.bh-external-source-file > button { flex-shrink: 0; }
.bh-external-source-content {
  max-height: 65vh;
  overflow: auto;
  overflow-wrap: anywhere;
  font: ${text.bodySize}/1.5 var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
}
.bh-external-route {
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
  color: var(--dsw-alias-state-business-primary);
}
.bh-external-scope {
  padding: 1px ${space.x2};
  border-radius: ${radius.sm};
  font-size: ${text.metaSize};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.bh-external-route > strong {
  font-size: ${text.titleSize};
}
.bh-external-route > span {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-external-original { padding: 20px 0; }
.bh-external-message {
  display: flex;
  align-items: flex-start;
  gap: ${space.x4};
  min-width: 0;
}
.bh-external-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: ${radius.sm};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
}
.bh-external-message-main { flex: 1; min-width: 0; }
.bh-external-message-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.x2} ${space.x3};
  margin-bottom: ${space.x3};
}
.bh-external-message-head strong { font-size: ${text.bodySize}; }
.bh-external-message-head time {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
.bh-external-quote {
  margin: ${space.x3} 0;
  padding: ${space.x3} ${space.x4};
  border-left: ${border.hairline} solid ${color.divider};
  background: var(--dsw-alias-interactive-bg-hover);
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
  background: var(--dsw-alias-bg-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.bh-external-mention { color: var(--dsw-alias-state-business-primary); }
.bh-external-details {
  margin-top: ${space.x3};
  font-size: ${text.metaSize};
  color: var(--dsw-alias-label-tertiary);
}
.bh-external-details > summary {
  width: fit-content;
  padding: ${space.x1} 0;
  cursor: pointer;
}
.bh-external-details > summary:hover { color: var(--dsw-alias-label-primary); }
.bh-external-details > summary:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
  border-radius: ${radius.sm};
}
.bh-external-detail-body {
  overflow-wrap: anywhere;
  padding: ${space.x3} ${space.x3};
  margin-top: ${space.x2};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.bh-external-detail-body p { margin: 0 0 ${space.x2}; }
.bh-external-detail-body p:last-child { margin-bottom: 0; }
.bh-external-raw-text { white-space: pre-wrap; }
.bh-external-context { border-top: ${border.hairline} solid ${color.divider}; padding-top: ${space.x5}; }
.bh-external-context h3 { margin: 0 0 ${space.x2}; font-size: ${text.bodySize}; }
.bh-external-context-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-external-notice {
  margin: ${space.x3} 0;
  padding: ${space.x3} ${space.x3};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-warn-primary);
  font-size: ${text.metaSize};
}
.bh-external-context-messages { display: flex; flex-direction: column; gap: 20px; padding-top: ${space.x5}; }
@media (max-width: 480px) {
  .bh-external-message { gap: ${space.x3}; }
  .bh-external-avatar { flex-basis: 28px; height: 28px; font-size: ${text.metaSize}; }
  .bh-external-message-text { padding: ${space.x3} ${space.x3}; }
}
.bh-channel-sidebar-overlay-layer {
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
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
}
.bh-channel-sidebar-overlay {
  position: relative;
  height: 100%;
  background: var(--dsw-alias-bg-base);
  box-shadow: -8px 0 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
html[data-botharness-motion='reduce'] .bh-channel-sidebar-entry-chevron,
html[data-botharness-motion='reduce'] [data-panel-chevron] {
  transition: none;
}
.bh-workspace-grants {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-workspace-folder-table {
  overflow: hidden;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
}
.bh-workspace-folder-row + .bh-workspace-folder-row {
  border-top: ${border.hairline} solid ${color.divider};
}
.bh-workspace-folder-main {
  display: flex;
  align-items: stretch;
  min-width: 0;
}
.bh-workspace-folder-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: ${space.x3} ${space.x3};
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-workspace-folder-toggle:hover,
.bh-workspace-folder-remove:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-workspace-folder-chevron {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  transform: rotate(-90deg);
}
.bh-workspace-folder-chevron.bh-expanded {
  transform: rotate(0);
}
.bh-workspace-folder-remove {
  display: grid;
  flex: none;
  width: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-workspace-folder-remove:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-workspace-folder-toggle:focus-visible, .bh-workspace-folder-remove:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-workspace-folder-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space.x3};
  padding: 0 ${space.x3} ${space.x3} 32px;
}
.bh-workspace-folder-path {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-workspace-folder-secondary {
  min-width: 0;
}
.bh-workspace-folder-secondary > summary {
  width: 100%;
  list-style: none;
}
.bh-workspace-folder-secondary > summary::-webkit-details-marker {
  display: none;
}
.bh-workspace-folder-secondary .bh-workspace-folder-table,
.bh-workspace-folder-manual {
  margin-top: ${space.x3};
}
.bh-workspace-folder-manual {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${space.x3};
}
.bh-workspace-folder-manual input {
  width: 100%;
}
.bh-memory-entry {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
  min-width: 0;
}
.bh-memory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-memory-toolbar button,
.bh-memory-editor button {
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x2} ${space.x3};
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.bh-memory-toolbar button { margin-left: auto; }
.bh-memory-toolbar button:hover,
.bh-memory-editor button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
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
  color: var(--dsw-alias-label-primary);
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
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-memory-editor textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  padding: ${space.x3};
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: ${text.metaSize};
}


.bh-member-row {
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
.bh-member-open-dm:focus-visible {
  outline: ${border.focus} solid var(--dsw-alias-label-primary);
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
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-member-menu-button:hover,
.bh-member-menu-button[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-group-attention-badge {
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
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 9px;
  line-height: ${text.metaLine};
}
/* These controls are in native Modal portals, outside .bh-root. */
.bh-group-avatar-crop { display: grid; gap: ${space.x4}; color: var(--dsw-alias-label-primary); }
.bh-group-avatar-crop > label { font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-group-avatar-crop-viewport {
  position: relative;
  width: 280px;
  height: 280px;
  max-width: 100%;
  overflow: hidden;
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  background: var(--dsw-alias-button-elevated-fill);
  cursor: grab;
  touch-action: none;
}
.bh-group-avatar-crop-viewport:active { cursor: grabbing; }
.bh-group-avatar-crop-viewport:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); }
.bh-group-avatar-crop-viewport img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  user-select: none;
  pointer-events: none;
}
.bh-group-avatar-crop input[type='range'] { width: 100%; }
.bh-group-avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.bh-group-avatar-topbar { width: 22px; height: 22px; border-radius: ${radius.sm}; }
/* Static member stack for a Group without an uploaded avatar: idle
   portraits on the Group tile. Two faces overlap on a diagonal with a ring in
   the tile fill; three or four sit in a 2x2 grid without overlap. Faces
   ignore the pointer so their per-Bot titles never surface as state. */
.bh-group-avatar-stack {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-group-avatar-stack > .bh-persona-avatar {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 28%;
  pointer-events: none;
}
.bh-group-avatar-stack[data-count='1'] > .bh-persona-avatar { top: 50%; left: 50%; translate: -50% -50%; }
.bh-group-avatar-stack[data-count='2'] > .bh-persona-avatar { border: ${border.hairline} solid var(--dsw-alias-button-elevated-fill); }
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
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-weight: ${text.strong};
}
.bh-group-profile-avatar-small { width: 40px; height: 40px; }
.bh-group-profile-avatar-large { width: 64px; height: 64px; border-radius: ${radius.lg}; }
.bh-group-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
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
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: ${text.metaSize};
  padding: ${space.x2} ${space.x3};
}
.bh-group-manage-button:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
/* Native General-row cell rhythm (ui-theme FontSizeRow / ui-chat
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

.bh-bot-icon > svg,
.bh-bot-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Settings nav cell tagged by bot-icon-nav: hide the shell glyph, show ours. */
button.bh-bot-nav > svg {
  display: none;
}

.bh-bot-nav-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.bh-bot-nav-icon > svg,
.bh-bot-nav-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Bot icon chooser: what you see is what you pick — one card per mark. */







.bh-settings-rows {
  display: flex;
  flex-direction: column;
}
.bh-channel-settings-caption {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: ${space.x3} ${space.x4};
  border-radius: ${radius.md};
  background: var(--dsw-alias-bg-module-platform);
}
.bh-channel-settings-caption-avatar {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.sm};
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-weight: ${text.strong};
}
.bh-channel-settings-caption-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bh-channel-settings-caption-kind {
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  color: var(--dsw-alias-label-secondary);
}
.bh-channel-settings-caption-title {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  color: var(--dsw-alias-label-primary);
}
.bh-settings-row {
  display: flex;
  align-items: center;
  gap: ${space.x4};
  padding: ${space.x4} 0;
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-settings-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
}
.bh-settings-row-desc {
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
  line-height: ${text.metaLine};
  color: var(--dsw-alias-label-secondary);
}
.bh-motion-preview {
  display: inline-flex;
  align-items: center;
  gap: ${space.x3};
  width: fit-content;
  min-height: 24px;
  margin-top: ${space.x2};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.md};
  padding: ${space.x1} ${space.x3};
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-motion-preview-sample {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  width: 22px;
  height: 12px;
}
.bh-motion-preview-sample i {
  width: 4px;
  height: 4px;
  border-radius: ${radius.round};
  background: var(--dsw-alias-state-business-primary);
  opacity: 0.45;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i {
  animation: bh-motion-preview-dot 1100ms var(--ds-ease-in-out) infinite;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i:nth-child(2) {
  animation-delay: 130ms;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i:nth-child(3) {
  animation-delay: 260ms;
}
@keyframes bh-motion-preview-dot {
  0%,
  70%,
  100% {
    opacity: 0.4;
    transform: translateY(0);
  }
  35% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 720px) {
  .bh-composer-shell {
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
.bh-grant-request-title { font-weight: ${text.strong}; }
.bh-grant-request-reason { white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-grant-request-card > button { justify-self: start; }
.bh-session-failure-row {
  --bh-message-card-gap: ${space.x3};
  display: grid;
  gap: var(--bh-message-card-gap);
  min-width: min(340px, 100%);
  max-width: 560px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, ${text.bodySize});
  line-height: ${text.bodyLine};
}
.bh-session-failure-heading {
  display: flex;
  align-items: baseline;
  gap: ${space.x3};
  min-width: 0;
  flex-wrap: wrap;
}
.bh-session-failure-heading > :first-child { flex: none; }
.bh-session-failure-title {
  color: var(--dsw-alias-state-error-primary);
  font-weight: ${text.strong};
}
.bh-session-failure-summary { overflow-wrap: anywhere; }
.bh-session-failure-code {
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-markdown-code-block-small);
}
.bh-session-failure-context {
  color: var(--dsw-alias-label-tertiary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-session-failure-row > button { justify-self: start; }
.bh-session-failure-details { color: var(--dsw-alias-label-tertiary); }
.bh-session-failure-details summary { cursor: pointer; }
.bh-session-failure-details > div, .bh-session-failure-details > code {
  display: block;
  margin-top: ${space.x2};
  overflow-wrap: anywhere;
}
.bh-session-failure-raw { white-space: pre-wrap; }
.bh-tool-approval-card { --bh-message-card-gap: ${space.x3}; display: grid; gap: var(--bh-message-card-gap); min-width: min(340px, 100%); }
.bh-question-card { --bh-message-card-gap: ${space.x3}; display: grid; gap: var(--bh-message-card-gap); width: 380px; max-width: 100%; }
.bh-question-card .bh-note, .bh-tool-approval-card .bh-note, .bh-grant-request-card .bh-note { padding: 0; }
.bh-question-card > button { justify-self: start; }
.bh-message-card-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; padding-top: calc(var(--bh-chat-card-inset) - var(--bh-message-card-gap, var(--bh-chat-card-inset))); }
.bh-private-input-card { --bh-message-card-gap: ${space.x2}; width: 520px; }
.bh-private-input-heading { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; }
.bh-private-input-state { margin-left: auto; }
.bh-private-input-card .bh-question-prompt { font-weight: ${text.regular}; }
.bh-private-input-card .bh-note { line-height: ${text.metaLine}; color: var(--dsw-alias-label-secondary); }
.bh-question-source { color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, ${text.bodySize}); }
.bh-question-source code { display: block; margin-top: ${space.x2}; overflow-wrap: anywhere; }
.bh-question-item { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${space.x2}; min-width: 0; }
.bh-question-prompt { font-weight: ${text.strong}; white-space: pre-wrap; }
.bh-question-letter { display: grid; place-items: center; width: 22px; height: 22px; border-radius: ${radius.round}; background: var(--bh-well-inset); color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; font-weight: ${text.strong}; line-height: 1; }
.bh-question-letter[data-multiple] { border-radius: ${radius.xs}; }
.bh-question-card .bh-card-row[data-selected='true'] .bh-question-letter { background: var(--bh-accent); color: ${color.onAccent}; }
.bh-question-card label.bh-card-main { position: relative; }
.bh-question-card .bh-card-checkbox { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bh-question-card label.bh-card-main:has(.bh-card-checkbox:focus-visible) { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-question-custom { color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, ${text.bodySize}); }
.bh-question-lettered { counter-reset: bh-option; }
.bh-question-lettered .bh-card-main::before { counter-increment: bh-option; content: counter(bh-option, upper-alpha); display: inline-grid; flex-shrink: 0; place-items: center; width: ${space.x6}; height: ${space.x6}; border-radius: 999px; background: var(--bh-well-inset); color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-tool-approval-input {
  margin: 0;
  padding: ${space.x3};
  max-height: min(420px, 60vh);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: ${radius.md};
  background: ${color.well};
  color: var(--dsw-alias-label-primary);
}
.bh-tool-approval-card:focus { outline: none; }
.bh-tool-approval-card:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: ${space.x2}; border-radius: ${radius.sm}; }
.bh-request-head { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; min-width: 0; }
.bh-request-category { min-width: 0; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-weight: ${text.strong}; }
.bh-request-pill { flex-shrink: 0; padding: 0 ${space.x2}; border-radius: 999px; background: var(--bh-surface-selected); color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }
.bh-request-pill[data-state='pending'] { background: color-mix(in srgb, ${color.warning} 16%, transparent); color: ${color.warning}; }
.bh-request-pill[data-state='pending'][data-urgent] { background: color-mix(in srgb, ${color.danger} 16%, transparent); color: ${color.danger}; }
.bh-tool-approval-sentence { min-width: 0; color: var(--dsw-alias-label-primary); font-size: ${text.bodySize}; line-height: ${text.bodyLine}; overflow-wrap: anywhere; }
.bh-tool-approval-line { display: block; min-width: 0; overflow: hidden; padding: ${space.x2} ${space.x3}; border-radius: ${radius.md}; background: ${color.well}; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; text-overflow: ellipsis; white-space: nowrap; }
.bh-tool-approval-card .bh-message-card-actions button, .bh-question-card .bh-message-card-actions button { border-color: transparent; border-radius: 999px; }
.bh-message-card-actions[data-stack] { flex-direction: column; }
.bh-message-card-actions[data-stack] > button { width: 100%; }
.bh-message-card-actions .bh-request-primary { border-color: transparent; background: ${color.fg}; color: ${color.base}; }
.bh-message-card-actions .bh-request-primary:hover:not(:disabled) { background: color-mix(in srgb, ${color.fg} 86%, ${color.base}); }
.bh-message-card-actions .bh-request-secondary { border-color: transparent; background: var(--bh-surface-selected); color: ${color.fg}; }
.bh-message-card-actions .bh-request-secondary:hover:not(:disabled) { background: var(--bh-surface-pressed); }
.bh-message-card-actions .bh-request-danger { border-color: transparent; color: var(--bh-on-surface-danger); background: var(--bh-surface-danger); }
.bh-message-card-actions .bh-request-danger:hover:not(:disabled) { background: color-mix(in srgb, ${color.danger} 16%, ${color.surface}); }
.bh-request-done { overflow: hidden; color: var(--dsw-alias-label-secondary); white-space: nowrap; text-overflow: ellipsis; --bh-request-dot: var(--dsw-alias-label-tertiary, currentColor); }
.bh-request-done::before { content: ''; display: inline-block; width: ${space.x2}; height: ${space.x2}; margin-right: ${space.x2}; border-radius: 999px; background: var(--bh-request-dot); vertical-align: middle; }
.bh-request-done[data-state='allowed'], .bh-request-done[data-state='remembered'], .bh-request-done[data-state='answered'] { --bh-request-dot: ${color.success}; }
.bh-request-done[data-state='denied'] { --bh-request-dot: ${color.danger}; }
.bh-request-done[data-state='submitted'] { --bh-request-dot: ${color.warning}; }
.bh-tool-approval-details-body { display: grid; gap: ${space.x2}; min-width: 0; cursor: auto; }
.bh-request-summary { display: grid; gap: var(--bh-message-card-gap); width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; border-radius: ${radius.sm}; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.bh-request-summary:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: ${space.x1}; }
.bh-request-summary:hover .bh-tool-approval-line, .bh-tool-approval-card[data-open] .bh-tool-approval-line { background: var(--bh-well-inset); }
.bh-tool-approval-card:has(> .bh-request-summary) { cursor: pointer; }
.bh-request-link { width: fit-content; margin: 0; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.metaSize}; line-height: ${text.metaLine}; text-align: start; cursor: pointer; }
.bh-request-link:disabled { cursor: default; opacity: 0.5; }
.bh-request-link:hover:not(:disabled) { color: var(--dsw-alias-label-primary); text-decoration: underline; }
.bh-tool-approval-input-block { display: grid; gap: ${space.x2}; min-width: 0; margin: 0; }
.bh-tool-approval-input[data-folded] { max-height: none; overflow: hidden; }
.bh-tool-approval-fold { justify-self: start; padding: 0; border: 0; background: transparent; color: ${color.accent}; font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-tool-approval-shell figcaption { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-tool-approval-diff figcaption { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; font-size: ${text.metaSize}; }
.bh-tool-approval-diff figcaption code { min-width: 0; overflow-wrap: anywhere; }
.bh-tool-approval-diff-stat[data-kind='add'] { color: ${color.success}; }
.bh-tool-approval-diff-stat[data-kind='remove'] { color: ${color.danger}; }
.bh-tool-approval-diff .bh-tool-approval-input { padding: ${space.x2} 0; }
.bh-tool-approval-diff-line { display: block; padding: 0 ${space.x3}; }
.bh-tool-approval-diff-line ins, .bh-tool-approval-diff-line del { text-decoration: none; }
.bh-tool-approval-diff-line[data-kind='add'] { background: color-mix(in srgb, ${color.success} 14%, transparent); }
.bh-tool-approval-diff-line[data-kind='remove'] { background: color-mix(in srgb, ${color.danger} 14%, transparent); }
.bh-tool-approval-diff-mark { display: inline-block; width: 1.5ch; color: var(--dsw-alias-label-tertiary); user-select: none; }
.bh-tool-approval-confirm { display: grid; gap: ${space.x3}; padding: ${space.x3}; border: ${border.hairline} solid ${color.borderStrong}; border-radius: ${radius.sm}; }
.bh-tool-approval-confirm { border: 0; border-radius: ${radius.md}; background: ${color.well}; }
.bh-tool-approval-confirm .bh-request-secondary { background: var(--bh-well-inset); }
.bh-tool-approval-confirm { --bh-message-card-gap: var(--bh-chat-card-inset); width: 100%; gap: var(--bh-message-card-gap); padding: var(--bh-chat-card-inset); }
.bh-bot-create-preview { display: grid; gap: ${space.x3}; min-width: 0; padding: ${space.x3}; border-radius: ${radius.md}; background: ${color.well}; }
.bh-bot-create-identity { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; }
.bh-bot-create-names { display: grid; min-width: 0; }
.bh-bot-create-name { overflow: hidden; color: var(--dsw-alias-label-primary); font-size: ${text.bodySize}; line-height: ${text.bodyLine}; font-weight: ${text.strong}; text-overflow: ellipsis; white-space: nowrap; }
.bh-bot-create-bio { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; overflow-wrap: anywhere; }
.bh-bot-create-file { display: grid; gap: ${space.x1}; min-width: 0; }
.bh-bot-create-label { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-weight: ${text.strong}; }
.bh-bot-create-excerpt { margin: 0; max-height: 7.5em; overflow: hidden; color: var(--dsw-alias-label-primary); font: inherit; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-bot-create-path { min-width: 0; color: var(--dsw-alias-label-primary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; overflow-wrap: anywhere; }
.bh-bot-create-fallback { color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-bot-create-warning { color: ${color.danger}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; overflow-wrap: anywhere; }
.bh-assignment-access-row { display: flex; align-items: center; justify-content: space-between; gap: ${space.x4}; }

.bh-memory-history {
  gap: 0;
}
.bh-memory-recovery {
  display: grid;
  gap: ${space.x3};
  color: var(--dsw-alias-label-primary);
  font-size: ${text.bodySize};
}
.bh-memory-recovery-meta {
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-memory-recovery-list {
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
}
.bh-memory-recovery-row {
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
  width: 100%;
  padding: ${space.x2} ${space.x2};
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-memory-recovery-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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
.bh-memory-graph-row {
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  width: 100%;
  min-height: 46px;
  gap: ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-primary);
  padding: 0 ${space.x2};
  text-align: left;
  cursor: pointer;
}
.bh-memory-graph-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
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
.bh-memory-graph-svg circle[data-lane='0'] { stroke: var(--dsw-alias-state-business-primary); }
.bh-memory-graph-svg path[data-lane='1'],
.bh-memory-graph-svg circle[data-lane='1'] { stroke: var(--dsw-alias-state-warn-primary); }
.bh-memory-graph-svg path[data-lane='2'],
.bh-memory-graph-svg circle[data-lane='2'] { stroke: var(--dsw-alias-state-success-primary); }
.bh-memory-graph-svg path[data-lane='3'],
.bh-memory-graph-svg circle[data-lane='3'] { stroke: var(--dsw-alias-state-error-primary); }
.bh-memory-graph-svg circle {
  stroke-width: 1.5;
  fill: var(--dsw-alias-state-business-primary);
}
.bh-memory-graph-svg circle[data-lane='1'] { fill: var(--dsw-alias-state-warn-primary); }
.bh-memory-graph-svg circle[data-lane='2'] { fill: var(--dsw-alias-state-success-primary); }
.bh-memory-graph-svg circle[data-lane='3'] { fill: var(--dsw-alias-state-error-primary); }
.bh-memory-graph-svg circle[data-head='true'] {
  fill: var(--dsw-alias-bg-base);
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
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-memory-graph-hash {
  font-family: var(--dsw-font-markdown-code-block-font-family);
  font-variant-numeric: tabular-nums;
}
.bh-memory-ref {
  flex: none;
  display: inline-flex;
  align-items: center;
  max-width: 84px;
  height: 16px;
  overflow: hidden;
  padding: 0 ${space.x2};
  border-radius: ${radius.xs};
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-memory-ref[data-current='true'] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.bh-memory-graph-head-label {
  color: var(--dsw-alias-state-business-primary);
  font-weight: ${text.strong};
}
.bh-memory-commit-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-memory-commit-status-needs-repair {
  color: var(--dsw-alias-state-warn-primary);
}
.bh-memory-commit-status-pending {
  color: var(--dsw-alias-label-secondary);
}
.bh-memory-graph-more {
  border: 0;
  background: transparent;
  padding: ${space.x3} ${space.x2};
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-memory-graph-more:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-sidebar-order-row { position: relative; display: flex; align-items: flex-start; min-width: 0; }
.bh-sidebar-order-row[hidden] { display: none; }
.bh-sidebar-hidden-badge { flex: none; align-self: center; font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-sidebar-visibility-toggle { display: flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 34px; padding: 0; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-sidebar-visibility-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-visibility-toggle:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-sidebar-visibility-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-row[data-dragging] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-order-row[data-drop-indicator]::before { content: ''; position: absolute; inset-inline: 24px 12px; top: -1px; height: 2px; background: var(--dsw-alias-state-business-primary); pointer-events: none; }
.bh-sidebar-editing .bh-sidebar-order-row { cursor: grab; user-select: none; touch-action: none; }
.bh-sidebar-editing .bh-sidebar-order-row[data-dragging] { cursor: grabbing; }
.bh-sidebar-order-handle { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 34px; border: 0; border-radius: ${radius.md}; background: transparent; color: var(--dsw-alias-label-secondary); cursor: grab; }
.bh-sidebar-order-handle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-order-handle:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-sidebar-order-toolbar { padding: ${space.x3} ${space.x4} ${space.x4}; }
.bh-sidebar-order-hint { color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-sidebar-order-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; margin-top: ${space.x3}; }
.bh-sidebar-order-actions button { border: 0; border-radius: ${radius.md}; padding: ${space.x2} ${space.x3}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-sidebar-order-actions button:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-actions button:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); }
.bh-sidebar-order-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.bh-memory-load-feedback {
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
.bh-memory-change-heading { display: flex; align-items: center; gap: ${space.x2}; width: 100%; border: 0; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x1}; background: transparent; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; text-align: left; cursor: pointer; }
.bh-memory-change-heading:hover { background: var(--bh-hover); }
.bh-memory-change-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.bh-memory-change-rows { display: flex; flex-direction: column; gap: ${space.x1}; }
.bh-memory-change-rows .bh-memory-row { display: flex; align-items: center; gap: ${space.x3}; padding-left: ${space.x3}; }
.bh-memory-change-badge { flex: none; min-width: 20px; border-radius: ${radius.xs}; padding: 1px ${space.x2}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.metaSize}; font-weight: ${text.strong}; text-align: center; }
.bh-memory-change-badge[data-status='new'], .bh-memory-change-badge[data-status='A'], .bh-memory-change-badge[data-status='U'] { color: var(--dsw-alias-state-success-primary); }
.bh-memory-change-badge[data-status='deleted'], .bh-memory-change-badge[data-status='D'] { color: var(--dsw-alias-state-error-primary); }
.bh-memory-change-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-file-path-button { padding: 0; border: 0; border-radius: ${radius.xs}; background: transparent; text-align: left; cursor: pointer; font: inherit; }
.bh-file-path-button:hover { text-decoration: underline; }
.bh-file-path-button:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-file-path-button.bh-workspace-folder-path { font-size: ${text.metaSize}; }
.bh-file-app-icon { width: 16px; height: 16px; object-fit: contain; }
.bh-file-open { display: inline-flex; align-items: stretch; flex: none; height: 28px; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family-default, inherit); }
.bh-file-open-main, .bh-file-open-more { display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: inherit; font: inherit; font-size: ${text.metaSize}; font-weight: ${text.strong}; line-height: ${text.metaLine}; cursor: pointer; }
.bh-file-open-main { gap: ${space.x2}; min-width: 28px; padding: 0 ${space.x3}; border-radius: ${radius.sm} 0 0 ${radius.sm}; white-space: nowrap; }
.bh-file-open[data-compact] .bh-file-open-main { padding: 0 ${space.x2}; }
.bh-file-open .bh-file-open-main span { color: inherit; font: inherit; }
.bh-file-open-more { width: 24px; border-left: ${border.hairline} solid ${color.divider}; border-radius: 0 ${radius.sm} ${radius.sm} 0; color: var(--dsw-alias-label-secondary); }
.bh-file-open-main:hover:not(:disabled), .bh-file-open-more:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.bh-file-open-main:focus-visible, .bh-file-open-more:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-file-open-main:disabled, .bh-file-open-more:disabled { opacity: 0.6; cursor: default; }
.bh-file-open[data-default="invalid"] .bh-file-open-main { color: var(--dsw-alias-label-secondary); }
.bh-file-path-open { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; }
.bh-memory-diff-file-action { display: inline-flex; flex: none; margin-left: auto; }
.bh-memory-diff-stat + .bh-memory-diff-file-action { margin-left: 0; }
.bh-file-open[data-default="unavailable"] .bh-file-open-main { color: var(--dsw-alias-label-secondary); }
@media (max-width: 520px) {
  .bh-memory-diff-file-action .bh-file-open-main span { display: none; }
}
.bh-file-open-anchor { position: relative; display: inline-flex; flex: none; }
.bh-file-open-anchor > .bh-file-action-feedback { display: block; font-family: inherit; position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; width: max-content; max-width: min(280px, 70vw); margin: 0; padding: ${space.x2} ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); font-size: ${text.metaSize}; font-weight: ${text.regular}; line-height: ${text.metaLine}; white-space: normal; text-align: left; }
.bh-file-open-anchor > .bh-file-action-feedback.bh-error { border-color: var(--dsw-alias-state-error-secondary); color: var(--dsw-alias-state-error-primary); }
.bh-file-path-open > .bh-file-path-button { min-width: 0; overflow-wrap: anywhere; }
.bh-message-file .bh-file-open { border-color: color-mix(in srgb, currentColor 18%, transparent); color: inherit; }
.bh-message-file .bh-file-open-more { border-left-color: color-mix(in srgb, currentColor 18%, transparent); color: inherit; }
.bh-message-file .bh-file-open-main:hover:not(:disabled), .bh-message-file .bh-file-open-more:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-file .bh-file-open-main:focus-visible, .bh-message-file .bh-file-open-more:focus-visible { outline-color: currentColor; }
@media (pointer: coarse) {
  .bh-file-open { height: 36px; }
  .bh-file-open-main { min-width: 36px; }
  .bh-file-open-more { width: 36px; }
}
.bh-file-action-feedback { font-size: ${text.metaSize}; }
.bh-memory-working-list button:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-memory-commit-view { flex: 1; min-height: 0; overflow: auto; padding: 0 ${space.x4} ${space.x4}; color: var(--dsw-alias-label-primary); }
.bh-memory-commit-header { display: flex; align-items: center; gap: ${space.x3}; min-height: 52px; margin: 0 -${space.x4} ${space.x3}; padding: ${space.x3} ${space.x4}; border-bottom: ${border.hairline} solid ${color.divider}; background: var(--dsw-specific-sidebar-fill); }
.bh-memory-view-icon-button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.bh-memory-view-icon-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-memory-view-icon-button:focus-visible, .bh-memory-diff-file-header:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-memory-commit-header > .bh-memory-view-icon-button:last-child { margin-left: auto; }
.bh-memory-graph-row[data-expanded='true'] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.bh-memory-graph-panel { display: flex; gap: ${space.x3}; padding: 0 ${space.x2}; border-radius: 0 0 ${radius.sm} ${radius.sm}; background: var(--bh-selected); }
.bh-memory-graph-rail { position: relative; flex: none; overflow: hidden; }
.bh-memory-graph-rail svg { position: absolute; inset: 0; height: 100%; }
.bh-memory-restore-offer { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; min-width: 0; padding-bottom: ${space.x3}; }
.bh-memory-restore-title { display: flex; align-items: center; gap: ${space.x2}; }
.bh-memory-restore-done { display: flex; align-items: center; gap: ${space.x2}; }
.bh-memory-restore-note > span { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-memory-version-list { display: flex; flex-direction: column; gap: ${space.x1}; min-width: 0; }
.bh-memory-version-row { display: flex; flex-direction: column; align-items: stretch; gap: ${space.x1}; width: 100%; padding: ${space.x3} ${space.x3}; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; }
.bh-memory-version-row:hover { background: var(--bh-hover, var(--bh-selected)); }
.bh-memory-version-row[data-expanded='true'] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; background: var(--bh-selected); }
.bh-memory-version-name { font-weight: ${text.strong}; font-size: ${text.bodySize}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-name:not([data-branch])::before { content: '★ '; color: var(--dsw-alias-state-success-primary); }
.bh-memory-version-subject { overflow: hidden; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-panel { margin-top: -${space.x1}; padding: 0 ${space.x3} ${space.x3}; border-radius: 0 0 ${radius.sm} ${radius.sm}; background: var(--bh-selected); }
.bh-memory-restore-actions { display: flex; flex-wrap: wrap; gap: ${space.x2}; flex-basis: 100%; }
.bh-memory-version { flex: none; max-width: 40%; overflow: hidden; padding: 0 ${space.x2}; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); color: var(--dsw-alias-state-success-primary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version::before { content: '★ '; }
.bh-memory-version-chip { display: inline-flex; align-items: center; gap: ${space.x1}; max-width: 100%; padding: 0 ${space.x1} 0 ${space.x3}; border-radius: 999px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: ${text.metaSize}; line-height: ${text.bodyLine}; }
.bh-memory-version-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-version-chip > button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: ${text.titleSize}; line-height: 1; padding: 0 ${space.x2}; }
.bh-memory-restore-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: ${space.x3}; min-width: 0; padding-bottom: ${space.x3}; }
.bh-memory-restore-note { display: flex; flex-direction: column; flex-basis: 100%; gap: ${space.x2}; min-width: 0; color: var(--dsw-alias-label-secondary); }
.bh-memory-restore-confirm p { flex-basis: 100%; margin: 0; color: var(--dsw-alias-label-secondary); }
.bh-memory-continue-form { display: flex; align-items: center; flex-wrap: wrap; gap: ${space.x3}; margin-bottom: ${space.x4}; }
.bh-memory-continue-form label { color: var(--dsw-alias-label-secondary); }
.bh-memory-continue-form input { min-width: 180px; max-width: 320px; }
.bh-memory-commit-header div { display: flex; flex-direction: column; min-width: 0; gap: ${space.x1}; }
.bh-memory-commit-header strong { min-width: 0; overflow-wrap: anywhere; }
.bh-memory-commit-header span { font-family: var(--dsw-font-markdown-code-block-font-family); color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }
.bh-memory-commit-header .bh-memory-commit-title {
  flex: 0 1 auto;
  flex-direction: row;
  align-items: baseline;
  gap: ${space.x3};
  min-width: 0;
  max-width: calc(100% - 96px);
  white-space: nowrap;
}
.bh-memory-graph-list > .bh-memory-continue-form { margin: ${space.x2} 0 ${space.x3} ${space.x6}; }
.bh-topbar[data-memory-diff='true'] .bh-channel-island-wrap { display: none; }
.bh-topbar[data-channel-detail='true'] { display: none; }
.bh-memory-commit-title code { flex: none; font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.metaSize}; color: var(--dsw-alias-label-secondary); }
.bh-memory-commit-header .bh-memory-commit-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: inherit;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  color: var(--dsw-alias-label-primary);
}
.bh-memory-commit-files-count { margin: 0 0 ${space.x3}; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-memory-diff-file { overflow: hidden; margin: 0 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.bh-memory-diff-file-header { display: flex; align-items: center; gap: ${space.x3}; min-height: 40px; padding: ${space.x3} ${space.x4}; background: var(--dsw-specific-sidebar-fill); color: var(--dsw-alias-label-primary); cursor: pointer; list-style: none; }
.bh-memory-diff-file-header:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-memory-diff-file-header::-webkit-details-marker { display: none; }
.bh-memory-diff-file-header > svg { flex: none; color: var(--dsw-alias-label-tertiary); transition: transform 150ms; }
.bh-memory-diff-file:not([open]) .bh-memory-diff-file-header > svg { transform: rotate(-90deg); }
.bh-memory-diff-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.metaSize}; font-weight: ${text.strong}; }
.bh-memory-diff-stat { display: inline-flex; align-items: center; flex: none; gap: ${space.x3}; margin-left: auto; font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.metaSize}; font-variant-numeric: tabular-nums; }
.bh-memory-diff-stat-add { color: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-stat-remove { color: var(--dsw-alias-state-error-primary); }
.bh-memory-diff-file[open] .bh-memory-diff-file-header { border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-memory-commit-code { overflow: auto; margin: 0 -${space.x4}; border-top: ${border.hairline} solid ${color.divider}; border-bottom: ${border.hairline} solid ${color.divider}; padding: ${space.x2} 0; font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.bodySize}; line-height: 1.5; white-space: pre; }
pre.bh-memory-commit-code { padding: ${space.x3} ${space.x5}; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-memory-diff-scroll { overflow: auto; background: var(--dsw-alias-bg-base); }
.bh-memory-diff-table { width: 100%; min-width: max-content; border-collapse: separate; border-spacing: 0; font-family: var(--dsw-font-markdown-code-block-font-family); font-size: ${text.metaSize}; line-height: ${text.bodyLine}; white-space: pre; }
.bh-memory-diff-table td { box-sizing: border-box; height: 24px; padding: ${space.x1} 0; vertical-align: top; }
.bh-memory-diff-number { width: 1%; min-width: 34px; padding: ${space.x1} ${space.x2} !important; color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; text-align: right; user-select: none; }
.bh-memory-diff-number:first-child { position: relative; padding-left: ${space.x3} !important; }
.bh-memory-diff-number:nth-child(2) { border-right: ${border.hairline} solid ${color.divider}; }
.bh-memory-diff-sign { width: 1%; min-width: 20px; padding: ${space.x1} ${space.x1} !important; color: var(--dsw-alias-label-tertiary); font-size: ${text.metaSize}; text-align: center; user-select: none; }
.bh-memory-diff-content { padding: ${space.x1} ${space.x5} ${space.x1} ${space.x2} !important; color: var(--dsw-alias-label-primary); }
.bh-memory-diff-hunk td, .bh-memory-diff-note td { padding: ${space.x2} ${space.x4} !important; color: var(--dsw-alias-label-secondary); }
.bh-memory-diff-hunk { background: color-mix(in srgb, var(--bh-accent) 6%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-note { font-style: italic; }
.bh-memory-diff-add { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-remove { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-add .bh-memory-diff-number:nth-child(2), .bh-memory-diff-add .bh-memory-diff-sign { color: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-remove .bh-memory-diff-number:first-child, .bh-memory-diff-remove .bh-memory-diff-sign { color: var(--dsw-alias-state-error-primary); }
.bh-memory-diff-add .bh-memory-diff-number:first-child::before, .bh-memory-diff-remove .bh-memory-diff-number:first-child::before { position: absolute; top: 0; bottom: 0; left: 0; width: 3px; content: ''; }
.bh-memory-diff-add .bh-memory-diff-number:first-child::before { background: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-remove .bh-memory-diff-number:first-child::before { background: repeating-linear-gradient(45deg, var(--dsw-alias-state-error-primary) 0 1.5px, transparent 1.5px 3px); }
.bh-memory-diff-empty { padding: ${space.x4} ${space.x4}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; }

.bh-member-departure {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  max-width: min(100%, 520px);
  width: fit-content;
  margin: ${space.x2} auto;
  padding: ${space.x3} ${space.x4};
  border-radius: 999px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
  text-align: center;
}
.bh-member-departure .bh-delivery-trigger {
  position: static;
  flex: 0 0 auto;
  background: transparent;
}

.bh-bot-dm-action {
  display: block;
  max-width: min(100%, 520px);
  margin: ${space.x2} auto;
  padding: ${space.x2} ${space.x3};
  border: 0;
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  cursor: pointer;
}
.bh-bot-dm-action:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-bot-dm-action-label {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: ${space.x2};
}
.bh-bot-dm-action-bot {
  display: inline-flex;
  align-items: center;
  gap: ${space.x2};
}
.bh-bot-dm-action-avatar { display: inline-flex; pointer-events: none; }
/* Status lines stay inside the Bot bubble column: 28px avatar + 8px gap on each side. */
.bh-memory-commit-row {
  container-type: inline-size;
  box-sizing: border-box;
  width: 100%;
  padding-inline: 36px;
}
@container (max-width: 720px) {
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
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: ${text.metaSize};
  white-space: nowrap;
  cursor: pointer;
}
.bh-memory-commit-line > * { flex: none; }
.bh-memory-commit-line:hover { color: var(--dsw-alias-label-primary); }
.bh-memory-commit-line:focus-visible { outline: ${border.focus} solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-memory-commit-line > .bh-memory-commit-subject {
  flex: 0 1 auto;
  min-width: 140px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
}
.bh-memory-commit-line:hover > .bh-memory-commit-subject { text-decoration: underline; }
.bh-memory-commit-line > .bh-memory-commit-files {
  flex: 0 100 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bh-memory-commit-sha { font-family: var(--dsw-font-family-mono, monospace); font-size: ${text.metaSize}; }
.bh-memory-commit-files { color: var(--dsw-alias-label-tertiary); }
.bh-bot-dm-action-bot .bh-persona-avatar { border-radius: 28%; overflow: hidden; }
.bh-bot-dm-action-name { color: var(--dsw-alias-label-primary); font-weight: ${text.strong}; }
.bh-dm-trace-line > .bh-memory-commit-subject { color: var(--dsw-alias-label-secondary); }
.bh-bot-dm-readonly {
  padding: ${space.x4} ${space.x5};
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
}
/* Human Inbox follows the native Bot mode inset and semantic theme aliases. */

nav:has(> .bh-panel-activity) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
nav:has(> .bh-panel-activity) > button { grid-column: 1; }
button:has(> .bh-panel-actions) { padding-right: 112px; }
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
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition:
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out);
}
.bh-panel-activity[data-wide='true'][data-unread='false'] { opacity: 0; pointer-events: none; }
button:has(.bh-panel-glyph):is(:hover, :focus-within) .bh-panel-activity[data-wide='true'][data-active='true'],
.bh-panel-activity[data-wide='true'][data-unread='false'].driver-active-element { opacity: 1; pointer-events: auto; }
.bh-panel-activity:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-panel-activity[aria-current='page'] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-panel-activity:focus-visible { outline: ${border.focus} solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.bh-human-inbox-count {
  flex: none;
  min-width: 14px;
  padding: 0 ${space.x1};
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  font-variant-numeric: tabular-nums;
  color: inherit;
}
.bh-human-inbox-notification-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: ${radius.round};
  background: var(--dsw-alias-state-error-primary);
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
.bh-panel-activity[data-wide='false'][data-active='false'] { display: none; }
.bh-panel-activity[data-wide='false']:hover { background: var(--bh-hover); }
.bh-panel-activity[data-wide='false'][aria-current='page'] { background: var(--bh-selected); }
.bh-human-inbox {
  overflow: auto;
  padding: 28px min(6vw, 64px);
}
.bh-human-inbox-inner {
  width: min(100%, 1120px);
  margin: 0 auto;
}
.bh-human-inbox-inner.bh-human-inbox-with-context {
  width: min(100%, 1120px);
}
.bh-human-inbox-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.bh-human-inbox-with-context .bh-human-inbox-workspace {
  grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.2fr);
}
.bh-human-inbox-row[data-selected='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-human-inbox-list {
  min-width: 0;
}
@media (max-width: 1000px) {
  .bh-human-inbox-with-context .bh-human-inbox-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .bh-human-inbox-tabs {
    flex-wrap: wrap;
  }
}
.bh-human-inbox h1 {
  margin: 0 0 20px;
  font-size: ${text.titleSize};
  line-height: ${text.titleLine};
  font-weight: ${text.strong};
}
.bh-human-inbox-tabs {
  display: flex;
  gap: ${space.x3};
  border-bottom: ${border.hairline} solid ${color.divider};
  margin-bottom: 20px;
}
.bh-human-inbox-tabs button {
  border: 0;
  border-bottom: ${border.focus} solid transparent;
  padding: ${space.x3} ${space.x4};
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  cursor: pointer;
}
.bh-human-inbox-tabs button[aria-selected='true'] {
  border-bottom-color: var(--bh-accent);
  color: var(--dsw-alias-label-primary);
}
.bh-human-inbox-filters {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: ${space.x4};
  margin: 0 0 ${space.x5};
}
.bh-human-inbox-filter {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  min-width: 160px;
  max-width: 240px;
  color: var(--dsw-alias-label-secondary);
  font-size: inherit;
}
.bh-human-inbox-selector {
  width: 100%;
  justify-content: space-between;
  gap: ${space.x4};
}
.bh-human-inbox-selector > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-human-inbox-selector > svg { flex-shrink: 0; }
.bh-human-inbox-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: ${space.x3} ${space.x4};
  min-height: 76px;
  padding: ${space.x4} ${space.x5};
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-human-inbox-row-open {
  position: absolute;
  inset: 0;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.bh-human-inbox-row-open:hover { background: var(--bh-hover); }
.bh-human-inbox-row-open:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: -2px;
}
.bh-human-inbox-row-main {
  position: relative;
  pointer-events: none;
  min-width: 0;
}
.bh-human-inbox-action-dialog {
  width: min(760px, 100%);
  max-height: 100%;
}
.bh-human-inbox-action-dialog-content {
  min-height: 0;
  overflow-y: auto;
}
.bh-human-inbox-source-link {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: ${space.x1};
  border: 0;
  border-radius: ${radius.sm};
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  cursor: pointer;
}
.bh-human-inbox-source-link:hover { background: var(--dsw-alias-button-primary-hover); }
.bh-human-inbox-source-link:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }
.bh-human-inbox-source-arrow {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  border-radius: ${radius.sm};
  background: var(--dsw-alias-button-primary-fill);
}
.bh-human-inbox-channel-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  overflow: hidden;
  border-radius: ${radius.sm};
}
.bh-human-inbox-channel-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bh-human-inbox-reply {
  margin: 0;
  padding: ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
}
.bh-human-inbox-reply-header,
.bh-human-inbox-reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.x3};
}
.bh-human-inbox-reply-header h2 {
  margin: 0;
  font-size: inherit;
  font-weight: ${text.strong};
}
.bh-human-inbox-reply p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: ${space.x2} 0;
}
.bh-human-inbox-purpose {
  font-size: inherit;
  font-weight: ${text.strong};
  overflow-wrap: anywhere;
}
.bh-human-inbox-purpose.is-collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bh-human-inbox-message {
  position: relative;  display: flex;
  gap: ${space.x3};
  padding: ${space.x4} ${space.x5};
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-human-inbox-message-flow {
  max-height: min(42vh, 380px);
  overflow: auto;
  margin-bottom: 0;
}
.bh-human-inbox-message-content {
  min-width: 0;
  flex: 1;
}
.bh-human-inbox-human-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: ${radius.sm};
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-human-inbox-message-heading {
  display: flex;
  align-items: baseline;
  gap: ${space.x3};
  flex-wrap: wrap;
}
.bh-human-inbox-message time {
  color: var(--dsw-alias-label-secondary);
  font-size: inherit;
}
.bh-human-inbox-message-target {
  display: inline-block;
  margin: ${space.x2} 0 0;
  padding: ${space.x1} ${space.x2};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--bh-accent);
  font-size: inherit;
}
.bh-human-inbox-reply-source {
  border-left: ${border.hairline} solid var(--bh-accent);
  background: var(--dsw-alias-bg-layer-1);
}
.bh-human-inbox-message blockquote {
  margin: ${space.x3} 0;
  padding-left: ${space.x3};
  border-left: ${border.hairline} solid ${color.divider};
  color: var(--dsw-alias-label-secondary);
}
.bh-human-inbox-reply form label {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
}
.bh-human-inbox-reply textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: ${space.x3};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  line-height: 1.5;
}
.bh-human-inbox-reply-actions {
  justify-content: flex-end;
  margin-top: ${space.x3};
  flex-wrap: wrap;
}
.bh-human-inbox-reply textarea:focus-visible,
.bh-human-inbox-reply button:focus-visible {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-human-inbox-row-title {
  position: relative;
  pointer-events: none;
  grid-column: 1 / -1;
  min-width: 0;
  font-weight: ${text.strong};
  overflow-wrap: anywhere;
}
.bh-human-inbox-row-summary {
  margin-top: ${space.x2};
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.bh-human-inbox-unread-meta {
  margin-top: ${space.x2};
  color: var(--dsw-alias-label-secondary);
  font-size: ${text.metaSize};
}
.bh-human-inbox-unread-meta summary {
  margin-top: ${space.x3};
  cursor: pointer;
}
.bh-human-inbox-row-actions {
  align-items: center;
  justify-content: flex-end;
  position: relative;
  display: flex;
  flex: none;
  gap: ${space.x2};
  flex-wrap: wrap;
}
.bh-human-inbox-row-check {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  margin: 0 ${space.x3} 0 0;
  vertical-align: middle;
  accent-color: ${color.accent};
  cursor: pointer;
}
.bh-human-inbox-row[data-checked] { background: ${color.selected}; }
.bh-human-inbox-batch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.x3};
  min-height: 36px;
  padding: 0 ${space.x5} ${space.x3};
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-human-inbox-batch-all { display: inline-flex; align-items: center; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-human-inbox:not(:focus-within) .bh-human-inbox-snoozed-toggle[aria-pressed='true'] { background: ${color.selected}; border-color: ${color.borderStrong}; }
.bh-human-inbox-more {
  padding: ${space.x2} ${space.x3};
  border: ${border.hairline} solid ${color.borderStrong};
  border-radius: ${radius.sm};
  color: var(--dsw-alias-label-primary);
  background: transparent;
  cursor: pointer;
}
.bh-human-inbox-more:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-activity-center { display:flex;flex-direction:column;overflow:hidden; }
.bh-activity-center-header {padding:20px ${space.x6} 0; flex-shrink:0;}
.bh-activity-center-header h1 {margin:0 0 ${space.x5};font-size:${text.titleSize};line-height:${text.titleLine};font-weight:${text.strong};}
.bh-activity-center > .bh-human-inbox {min-height:0;flex:1;}
.bh-activity-center-panel {height:100%;min-height:0;container-type:inline-size;}
.bh-activity-center-panel .bh-activity-center-header {padding:0;}
.bh-activity-center-panel .bh-overview {padding:${space.x4} 0 0;}
.bh-activity-center-panel > .bh-human-inbox {padding:${space.x4} 0 0;}
@container (max-width:480px){.bh-activity-center-panel .bh-overview-unread{align-items:flex-start;flex-direction:column}.bh-activity-center-panel .bh-overview-toolbar{gap:${space.x3}}}
.bh-overview {padding:${space.x5} ${space.x6} ${space.x6};overflow-y:auto;min-height:0;}
.bh-overview-toolbar {display:flex;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:${space.x4};margin-bottom:${space.x5};}
.bh-overview-bot-header,.bh-overview-session {color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;}
.bh-overview-bot-header:hover,.bh-overview-session:hover {background:var(--bh-hover);}
.bh-overview button:focus-visible {outline:${border.focus} solid var(--bh-accent);outline-offset:2px;}
.bh-overview-action-count {display:flex;align-items:center;gap:${space.x3};}
.bh-overview-action-count strong {font-variant-numeric:tabular-nums;}
.bh-overview-bots {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:${space.x4};}
.bh-overview-bot {min-width:0;border:${border.hairline} solid ${color.border};border-radius:${radius.sm};overflow:hidden;}
.bh-overview-bot-header {width:100%;display:flex;align-items:center;gap:${space.x3};text-align:left;padding:${space.x4};border:0;background:transparent;}
.bh-overview-bot-name {min-width:0;overflow-wrap:anywhere;flex:1;font-weight:${text.strong};}
.bh-overview-bot-state,.bh-overview-session-state {color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size);flex-shrink:0;}
.bh-overview-bot h2 {margin:0;padding:${space.x3} ${space.x4};font-size:var(--dsh-content-font-size);line-height:${text.metaLine};font-weight:${text.strong};color:var(--dsw-alias-label-secondary);border-top:${border.hairline} solid ${color.divider};}
.bh-overview-bot h2 span {margin-left:${space.x2};font-variant-numeric:tabular-nums;}
.bh-overview-idle {margin:0;padding:${space.x2} ${space.x4} ${space.x4};font-size:var(--dsh-content-font-size);color:var(--dsw-alias-label-tertiary);}
.bh-overview-bot ul {list-style:none;margin:0;padding:0 ${space.x2} ${space.x2};}
.bh-overview-bot li button {display:flex;align-items:center;gap:${space.x3};text-align:left;width:100%;min-height:40px;padding:${space.x3};border:${border.hairline} solid ${color.border};background:var(--dsw-alias-bg-base);border-radius:${radius.sm};}
.bh-session-role-icon {font-size:var(--dsh-content-font-size);color:var(--dsw-alias-label-secondary);}
.bh-overview-session-purpose {flex:1;min-width:0;overflow-wrap:anywhere;font-size:var(--dsh-content-font-size);}
@media(max-width:720px){.bh-activity-center-header{padding:${space.x5} ${space.x5} 0}.bh-overview{padding:${space.x4} ${space.x5} ${space.x5}}.bh-overview-toolbar{flex-wrap:wrap}}

.bh-overview-session-purpose {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bh-overview-bot ul {display:flex;flex-direction:column;gap:${space.x2};padding:0 ${space.x3} ${space.x3};}
.bh-session-role-icon {display:flex;align-items:center;flex-shrink:0;}
.bh-overview-actions {padding:0;overflow:visible;}
.bh-overview-actions .bh-human-inbox-inner {width:100%;margin:0;}
.bh-overview-actions .bh-human-inbox-row {min-height:64px;padding:${space.x3} ${space.x4};}
.bh-overview-actions .bh-human-inbox-row-actions {margin-left:auto;}
.bh-overview-actions .bh-human-inbox-row-title {font-weight:${text.strong};}
.bh-overview-actions .bh-human-inbox-row:last-child {border-bottom:0;}
.bh-overview-actions .bh-human-inbox-more {margin:${space.x3} ${space.x4};}
.bh-overview-actions p[role] {padding:0 ${space.x4};}
.bh-overview-bots {align-items:start;}

.bh-human-inbox-context-window { margin-top: ${space.x4}; }
.bh-human-inbox-context-edge { display: flex; align-items: center; justify-content: center; width: 100%; height: 28px; padding: 0; border: ${border.hairline} solid ${color.borderStrong}; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-human-inbox-context-edge:not(:disabled):hover { background: var(--bh-hover); }
.bh-human-inbox-context-edge:disabled { opacity: .4; cursor: default; }
.bh-human-inbox-context-older svg { transform: rotate(180deg); }
.bh-human-inbox-message-source { position: absolute; right: 8px; top: 8px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); opacity: 0; pointer-events: none; cursor: pointer; }
.bh-human-inbox-message:hover .bh-human-inbox-message-source, .bh-human-inbox-message:focus-within .bh-human-inbox-message-source, .bh-human-inbox-message-source:focus-visible { opacity: 1; pointer-events: auto; }
.bh-human-inbox-message-heading { padding-right: ${space.x6}; }
.bh-human-inbox-dismiss { display: flex; align-items: center; gap: ${space.x2}; }
@media (hover: none) { .bh-human-inbox-message-source { opacity: 1; pointer-events: auto; } }


.bh-channel-activity {margin-top:${space.x6};color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size);}
.bh-channel-activity header {display:flex;align-items:center;justify-content:space-between;gap:${space.x4};flex-wrap:wrap;}
.bh-channel-activity h2 {font-size:var(--dsh-content-font-size);margin:0;font-weight:${text.strong};}
.bh-channel-activity p {margin:${space.x3} 0;color:var(--dsw-alias-label-secondary);}
.bh-channel-activity ul {list-style:none;margin:0;padding:0;}
.bh-channel-activity > ul > li {border-bottom:${border.hairline} solid ${color.divider};}
.bh-channel-activity-legend {display:flex;gap:${space.x5};margin:${space.x4} 0;color:var(--dsw-alias-label-secondary);}
.bh-channel-activity-legend span {display:flex;align-items:center;gap:${space.x2};}
.bh-channel-activity-legend i {width:8px;height:8px;border-radius:${radius.sm};}
.bh-channel-activity-human {background:var(--bh-accent);}
.bh-channel-activity-bot {background:var(--bh-chart-output);}
.bh-channel-activity-other {background:var(--dsw-alias-label-tertiary);}
.bh-channel-activity-row {display:flex;align-items:center;gap:${space.x3};padding:${space.x3} 0;}
.bh-channel-activity-toggle {border:0;border-radius:${radius.sm};background:transparent;display:flex;align-items:center;gap:${space.x4};min-width:0;flex:1;min-height:40px;padding:${space.x3};text-align:left;font:inherit;color:inherit;cursor:pointer;}
.bh-channel-activity-toggle:hover {background:var(--bh-hover);}
.bh-channel-activity-name {width:160px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-channel-activity-chart {display:flex;flex:1;min-width:24px;height:12px;overflow:hidden;border-radius:${radius.sm};}
.bh-channel-activity-chart i {height:100%;}
.bh-channel-activity strong {font-variant-numeric:tabular-nums;}
.bh-channel-activity-toggle strong {min-width:36px;text-align:right;}
.bh-channel-activity-closed {transform:rotate(-90deg);}
.bh-channel-activity-senders {padding:0 ${space.x5} ${space.x4} 36px;}
.bh-channel-activity-senders li {display:flex;align-items:center;gap:${space.x4};padding:${space.x2} 0;}
.bh-channel-activity-senders li > span:first-child {min-width:0;flex:1;overflow-wrap:anywhere;}
.bh-channel-activity-kind {color:var(--dsw-alias-label-secondary);}
@media(max-width:720px){.bh-channel-activity-name{width:100px}.bh-channel-activity-toggle{gap:${space.x2}}}

.bh-overview-unread {display:flex;align-items:center;justify-content:space-between;gap:${space.x4};padding:${space.x4} 0;margin-bottom:${space.x5};border-bottom:${border.hairline} solid ${color.divider};}
.bh-overview-unread p {margin:${space.x2} 0 0;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size);}
.bh-overview-unread strong {font-variant-numeric:tabular-nums;}
.bh-overview-work-heading {font-size:var(--dsh-content-font-size);margin:0 0 ${space.x4};color:var(--dsw-alias-label-secondary);font-weight:${text.strong};}
.bh-statistics-toggle {display:flex;align-items:center;gap:${space.x3};background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.bh-statistics-toggle:hover {color:var(--bh-accent);}
.bh-channel-activity-name {flex:1;width:auto;}
.bh-channel-statistics-chart {width:100%;min-width:0;}
.bh-channel-activity {margin-top:${space.x6};padding-top:${space.x5};border-top:${border.hairline} solid ${color.divider};}
.bh-statistics-content[hidden] {display:none;}
@media(max-width:480px){.bh-overview-unread{align-items:flex-start;flex-direction:column}.bh-overview-toolbar{gap:${space.x3}}}

.bh-overview-memory {margin-top:${space.x4};min-width:0;}
.bh-overview-memory h3 {margin:0;font-weight:${text.regular};}
.bh-overview-memory .bh-note {margin:0;}
.bh-overview-memory-range {display:flex;justify-content:space-between;gap:${space.x3};font-size:${text.metaSize};color:var(--dsw-alias-label-tertiary);}
.bh-overview-memory-bots {list-style:none;margin:0;padding:0;}
.bh-overview-memory-bots > li {display:flex;align-items:center;gap:${space.x4};min-height:42px;padding:${space.x2} 0;border-top:${border.hairline} solid ${color.divider};font-size:${text.metaSize};}
.bh-overview-memory-name {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-memory-bots strong {font-variant-numeric:tabular-nums;white-space:nowrap;}
.bh-overview-memory-bots strong > span {font-weight:${text.regular};color:var(--dsw-alias-label-secondary);}
.bh-overview-memory-trend {width:126px;flex-shrink:0;}
.bh-overview-memory-dirty {color:var(--dsw-alias-state-warn-primary);}
.bh-overview-memory-unavailable {color:var(--dsw-alias-label-secondary);}
.bh-overview-memory .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--dsw-alias-label-secondary);}
.bh-overview-memory .bh-profile-pin:disabled {opacity:0.5;cursor:default;}
.bh-overview-memory .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
@media (max-width:700px) {.bh-overview-memory-bots > li {flex-wrap:wrap;gap:${space.x2};}.bh-overview-memory-trend {width:84px;}.bh-overview-memory-name {flex-basis:calc(100% - 36px);}.bh-overview-memory-bots .bh-profile-pin {margin-left:auto;}}
.bh-overview-usage {margin-top:${space.x4};min-width:0;container-type:inline-size;}
.bh-overview-usage h3 {margin:0;font-weight:${text.regular};}
.bh-overview-usage .bh-profile-card-head {flex-wrap:wrap;}
.bh-overview-usage-controls {display:flex;flex-wrap:wrap;align-items:center;gap:${space.x3};min-width:0;}
.bh-overview-usage .bh-usage-grouping button {white-space:nowrap;}
@container (max-width: 320px) {.bh-overview-usage .bh-usage-grouping button {padding:${space.x2};}}
.bh-overview-usage .bh-note {margin:0;}
.bh-overview-usage-period {padding:0;}
.bh-overview-usage .bh-usage-model-label {gap:${space.x2};}
.bh-overview-usage-bot-name {flex:1;}
.bh-overview-usage-bot-name > span {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-usage-bot-name > span + span {color:var(--dsw-alias-label-secondary);}
.bh-overview-usage .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--dsw-alias-label-secondary);}
.bh-overview-usage .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
.bh-overview-usage .bh-profile-pin:disabled {cursor:default;opacity:0.5;}
.bh-statistics-content > header h3 {font-size:var(--dsh-content-font-size);margin:0;}
.bh-release-dialog {
  width: min(680px, calc(100vw - 32px));
}
.bh-telemetry-dialog {
  width: min(560px, calc(100vw - 32px));
}
.bh-telemetry-notice {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  margin: 0;
  min-width: 0;
}
.bh-telemetry-notice-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: ${space.x4};
  min-width: 0;
}
.bh-telemetry-notice-row > dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
.bh-telemetry-notice-row > dd {
  margin: 0;
  min-width: 0;
}
@media (max-width: 520px) {
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
.bh-release-note {
  min-width: 0;
}
.bh-release-note-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  padding: ${space.x3} 0;
  cursor: pointer;
  list-style: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.bodyLine};
}
.bh-release-note-head::-webkit-details-marker {
  display: none;
}
.bh-release-note-head::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 ${space.x1};
  border-right: ${border.hairline} solid currentColor;
  border-bottom: ${border.hairline} solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.15s ease;
}
.bh-release-note[open] > .bh-release-note-head::before {
  transform: rotate(45deg);
}
.bh-release-note-head:hover .bh-release-note-version {
  color: var(--bh-accent, var(--dsw-alias-state-business-primary));
}
.bh-release-note-version {
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  color: var(--dsw-alias-label-primary);
}
.bh-release-note-rule {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: var(--dsw-alias-border-l2);
}
.bh-release-note-count {
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
  color: var(--dsw-alias-label-secondary);
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
  color: var(--dsw-alias-label-primary);
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
.bh-release-update-head {
  display: flex;
  align-items: center;
  gap: ${space.x3};
}
.bh-release-update-title {
  margin-right: auto;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  color: var(--dsw-alias-label-primary);
}
.bh-release-restart-hint {
  margin-right: auto;
}
.bh-release-command {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
}
.bh-release-command code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding: ${space.x2} ${space.x3};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-bg-module-platform);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: ${text.metaSize};
  white-space: nowrap;
}
.bh-release-install-error {
  display: flex;
  flex-direction: column;
  gap: ${space.x2};
  color: var(--dsw-alias-state-error-primary);
  font-size: ${text.bodySize};
}
.bh-release-install-diagnostic {
  max-height: 120px;
  margin: 0;
  overflow: auto;
  padding: ${space.x2} ${space.x3};
  border-radius: ${radius.sm};
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: ${text.metaSize};
  white-space: pre-wrap;
}
.bh-schedules {display:flex;flex-direction:column;gap:${space.x3};min-width:0;}
.bh-schedule-muted {color:var(--dsw-alias-label-secondary);font-size:${text.metaSize};}
.bh-schedule-muted {margin:0;}
.bh-schedule-empty {display:flex;flex-direction:column;align-items:flex-start;gap:${space.x3};}
.bh-schedule-error {margin:0;color:var(--dsw-alias-state-error-primary);font-size:${text.metaSize};}
.bh-card-list {display:flex;flex-direction:column;margin:0;padding:0;list-style:none;overflow:hidden;border:${border.hairline} solid ${color.border};border-radius:${radius.md};}
.bh-card-list + .bh-card-list {margin-top:${space.x3};}
.bh-card-list.bh-message-card-list {border:0;background:${color.well};}
.bh-message-card-list .bh-card-title {white-space:normal;overflow-wrap:anywhere;}
.bh-message-card-list .bh-card-main {min-height:40px;align-items:center;}
.bh-message-card-list .bh-card-row[data-selected="true"] {background:${color.accentTint};}
.bh-message-card-list .bh-card-row:has(.bh-card-main:disabled),
.bh-message-card-list .bh-card-row:has(.bh-card-checkbox:disabled) {opacity:.6;}
.bh-card-checkbox {flex:none;width:16px;height:16px;margin:0;accent-color:var(--bh-accent);cursor:pointer;}
.bh-card-checkbox:focus-visible {outline:${border.focus} solid var(--bh-accent);outline-offset:2px;}
.bh-card-checkbox:disabled {cursor:default;}
label.bh-card-main {cursor:pointer;}
label.bh-card-main:has(.bh-card-checkbox:disabled) {cursor:default;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > label.bh-card-main > .bh-card-checkbox:not(:disabled)):hover {background:var(--dsw-alias-interactive-bg-hover);}

.bh-card-row {min-width:0;}
.bh-card-row + .bh-card-row {border-top:${border.hairline} solid ${color.divider};}
.bh-card-line {display:flex;align-items:center;gap:${space.x3};min-width:0;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > button.bh-card-main:not(:disabled):hover) {background:var(--dsw-alias-interactive-bg-hover);}
.bh-card-main {display:flex;flex:1;align-items:flex-start;gap:${space.x3};min-width:0;margin:0;padding:${space.x3} ${space.x3};border:0;border-radius:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;}
button.bh-card-main {cursor:pointer;}
button.bh-card-main:disabled {cursor:default;}
.bh-card-main:focus-visible {outline:${border.focus} solid var(--dsw-alias-label-primary);outline-offset:-2px;}
.bh-card-icon {display:grid;flex:none;place-items:center;padding-top:1px;color:var(--dsw-alias-label-primary);}
.bh-card-leading {display:grid;flex:none;place-items:center;}
.bh-card-body {display:flex;flex:1;flex-direction:column;gap:${space.x2};min-width:0;}
.bh-card-title {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${text.bodySize};font-weight:${text.strong};line-height:${text.bodyLine};}
.bh-card-chips {display:flex;flex-wrap:wrap;align-items:center;gap:${space.x2};}
.bh-card-title-row {display:flex;align-items:center;gap:${space.x3};min-width:0;}
.bh-card-title-row > .bh-card-title {flex:1;min-width:0;}
.bh-card-badge {display:flex;flex:none;align-items:center;gap:${space.x2};}
.bh-card-summary {display:-webkit-box;overflow:hidden;color:var(--dsw-alias-label-secondary);font-size:${text.metaSize};line-height:${text.metaLine};overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.bh-card-title.bh-inbox-item-head {display:flex;align-items:baseline;gap:${space.x2};}
.bh-inbox-item-head .bh-inbox-item-author {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-inbox-item-head .bh-inbox-item-origin {color:var(--dsw-alias-label-secondary);font-weight:${text.regular};}
.bh-inbox-item-head .bh-inbox-item-time {flex:none;color:var(--dsw-alias-label-secondary);font-size:${text.metaSize};font-weight:${text.regular};}
.bh-inbox-item-return {flex:none;}
.bh-inbox-item-note {display:-webkit-box;overflow:hidden;flex-basis:100%;-webkit-box-orient:vertical;-webkit-line-clamp:2;}
.bh-sessions-header-action {display:contents;}
.bh-card-glyph {display:inline-grid;place-items:center;color:var(--dsw-alias-label-secondary);}
.bh-card-meta {display:flex;flex-wrap:wrap;align-items:baseline;gap:${space.x1} ${space.x3};min-width:0;color:var(--dsw-alias-label-secondary);font-size:${text.metaSize};line-height:${text.metaLine};overflow-wrap:anywhere;}
.bh-card-meta-line {flex-basis:100%;}
.bh-card-trailing {display:flex;flex:none;align-items:center;gap:${space.x2};padding-right:${space.x3};color:var(--dsw-alias-label-secondary);}
.bh-card-detail {padding:0 ${space.x3} ${space.x3} 34px;}
.bh-card-row[data-muted="true"] .bh-card-icon,
.bh-card-row[data-muted="true"] .bh-card-title {color:var(--dsw-alias-label-secondary);}
.bh-card-trailing .bh-workspace-folder-remove {width:28px;height:28px;border-radius:${radius.sm};}
.bh-workspace-folder-add, .bh-workspace-folder-add .bh-card-title, .bh-workspace-folder-add .bh-card-leading {color:${color.accent};}
.bh-workspace-folder-write {display:inline-flex;align-items:center;gap:${space.x2};font-size:${text.metaSize};line-height:${text.metaLine};white-space:nowrap;}
.bh-card-detail > .bh-workspace-folder-detail {padding:0;}
.bh-schedule-switch {display:inline-flex;}
` +
  STYLEX_CSS;
