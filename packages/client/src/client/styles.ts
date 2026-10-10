import { INTERNAL_TOUR_CSS } from './internal-tour-styles.js';
import { WINDOW_COMPANION_CSS } from './window-companion-styles.js';
import { COMBOBOX_CSS } from './combobox.js';
import { keyframesFor } from '@botharness/botui-core';
import { DEEPSEEKBOT_TRANSPARENT_DATA_URI } from './bot-icon-assets.js';

export const CSS =
  INTERNAL_TOUR_CSS +
  COMBOBOX_CSS +
  WINDOW_COMPANION_CSS +
  `
.bh-profile-backup-dialog.bh-profile-backup-dialog { width: min(760px, 100%); max-height: 100%; }
.bh-profile-backup { overflow-y: auto; min-height: 0; font-size: 13px; line-height: 20px; }
.bh-profile-backup section { border-top: 1px solid var(--dsw-alias-border-l2); padding-block: 12px; }
.bh-profile-backup p { margin-block: 8px; }
.bh-profile-backup h3 { margin-block: 0 8px; font-size: 14px; }
.bh-profile-backup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 8px; }
.bh-profile-backup pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 8px; background: var(--dsw-alias-bg-base); }
.bh-profile-backup code { overflow-wrap: anywhere; }
.bh-profile-backup-bot { padding-block: 12px; }
.bh-im-tutorials { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.bh-im-tutorials a { display: inline-flex; align-items: center; gap: 3px; color: var(--bh-accent); text-underline-offset: 3px; }
.bh-im-tutorials a:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 3px; border-radius: 2px; }
.bh-im-app-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bh-im-app-picker { display: flex; align-items: center; gap: 4px; }
.bh-im-app-refresh:disabled { opacity: 0.5; cursor: default; }
.bh-root {
  /* @bh-brand-aliases:start — thin BotHarness brand map onto DSH semantic
     tokens (ADR-0028): at most three entries, no second design system. */
  --bh-accent: var(--dsw-alias-state-business-primary);
  --bh-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-selected: var(--dsw-specific-sidebar-nav-item-active);
  /* @bh-brand-aliases:end */
  /* @bh-onboarding-aliases:start — native surfaces for the floating onboarding notice and card. */
  --bh-onboarding-border: var(--dsw-alias-border-l2);
  --bh-onboarding-surface: var(--dsw-alias-bg-base);
  --bh-onboarding-label: var(--dsw-alias-label-primary);
  /* @bh-onboarding-aliases:end */
  /* @bh-bridge-media-aliases:start — reuse the pinned native focus and muted labels. */
  --bh-bridge-media-focus: var(--dsw-alias-state-business-primary);
  --bh-bridge-media-muted: var(--dsw-alias-label-secondary);
  /* @bh-bridge-media-aliases:end */
  /* @bh-memory-graph-aliases:start — the pinned DSH theme has no radius
     variables; these match its measured 4/6/10px native controls. */
  --bh-memory-radius-chip: 4px;
  --bh-memory-radius-count: 5px;
  --bh-memory-radius-row: 6px;
  --bh-memory-radius-card: 10px;
  --bh-memory-font-code: var(--dsw-font-markdown-code-block-font-family);
  --bh-memory-label-muted: var(--dsw-alias-label-secondary);
  /* @bh-memory-graph-aliases:end */
  /* @bh-profile-chart-aliases:start — the pinned DSH theme has no categorical
     chart palette; read shades derive from the brand accent and output uses a
     state token so both series stay distinguishable in either theme. */
  --bh-chart-output: var(--dsw-alias-state-warn-primary);
  --bh-chart-read-dim: color-mix(in srgb, var(--bh-accent) 38%, transparent);
  /* @bh-profile-chart-aliases:end */
  /* @bh-inbox-reply-aliases:start — DSH has no radius tokens; 8px matches
     its measured project row and 6px matches its compact native controls. */
  --bh-inbox-radius-panel: 8px;
  --bh-inbox-radius-control: 6px;
  --bh-inbox-primary-fill: var(--dsw-alias-button-primary-fill);
  --bh-inbox-primary-hover: var(--dsw-alias-button-primary-hover);
  --bh-inbox-primary-label: var(--dsw-alias-label-primary-foreground);
  --bh-inbox-border: var(--dsw-alias-border-l2);
  --bh-inbox-divider: var(--dsw-alias-border-l3);
  --bh-inbox-surface: var(--dsw-alias-bg-layer-1);
  --bh-inbox-base: var(--dsw-alias-bg-base);
  --bh-inbox-label: var(--dsw-alias-label-primary);
  --bh-inbox-muted: var(--dsw-alias-label-secondary);
  --bh-inbox-error: var(--dsw-alias-state-error-primary);
  /* @bh-inbox-reply-aliases:end */
  /* @bh-composer-aliases:start — match the native multiline input panel. */
  --bh-composer-radius-panel: 20px;
  --bh-composer-panel-bg: var(--dsw-alias-bg-module-platform);
  /* @bh-composer-aliases:end */
  /* @bh-overview-aliases:start — pinned DSH has no radius tokens; use the
     measured native project row (8px), compact control (6px), and collapsed
     Bot mode button (12px, DSH 0.2.0-rc.1). */
  --bh-overview-radius-card: 8px;
  --bh-entry-radius-rail: 12px;
  --bh-entry-notification: var(--dsw-alias-state-error-primary);
  --bh-entry-notification-label: var(--dsw-alias-label-primary-foreground);
  --bh-overview-radius-control: 6px;
  --bh-overview-label: var(--dsw-alias-label-primary);
  --bh-overview-muted: var(--dsw-alias-label-secondary);
  --bh-overview-subtle: var(--dsw-alias-label-tertiary);
  --bh-overview-border: var(--dsw-alias-border-l2);
  --bh-overview-bg: var(--dsw-alias-bg-base);
  --bh-overview-font: var(--dsh-content-font-size);
  /* @bh-overview-aliases:end */
  font: 13px/1.5 var(--dsw-font-family);
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

.bh-onboarding-notice { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 1000; display: flex; align-items: center; gap: 8px; max-width: min(560px, calc(100vw - 32px)); padding: 8px 12px; border: 1px solid var(--bh-onboarding-border); border-radius: 12px; background: var(--bh-onboarding-surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.bh-onboarding-notice-text { min-width: 0; overflow-wrap: anywhere; }
.bh-onboarding-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.bh-bubble:has(> .bh-onboarding-welcome) { padding: 0; background: transparent; }
.bh-onboarding-welcome { display: grid; gap: 12px; width: 380px; max-width: 100%; white-space: normal; line-height: 20px; border: 1px solid var(--bh-onboarding-border); border-radius: 16px; background: var(--dsw-alias-bg-module-platform); overflow: hidden; }
.bh-onboarding-welcome > :not(.bh-welcome-banner) { margin-inline: 14px; }
.bh-onboarding-welcome > :last-child { margin-bottom: 14px; }
.bh-welcome-banner { aspect-ratio: 4 / 1; background: var(--dsw-alias-bg-base); }
.bh-welcome-banner .bh-banner-art { display: block; width: 100%; height: 100%; }
.bh-welcome-identity { position: relative; z-index: 1; display: flex; align-items: flex-end; gap: 10px; margin-top: -42px; }
.bh-welcome-avatar { padding: 3px; border-radius: 17px; background: var(--dsw-alias-bg-module-platform); line-height: 0; }
.bh-welcome-identity-text { display: grid; gap: 4px; min-width: 0; padding-bottom: 2px; }
.bh-welcome-name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-welcome-roles { display: flex; flex-wrap: wrap; gap: 4px; }
.bh-welcome-letter { display: grid; gap: 6px; }
.bh-welcome-letter strong { font-size: 15px; }
.bh-welcome-letter p { margin: 0; }
.bh-welcome-signature { color: var(--dsw-alias-label-secondary); }
.bh-welcome-provenance { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.bh-onboarding-welcome p, .bh-onboarding-model-form p { margin: 0; }
.bh-onboarding-welcome .bh-card-title { white-space: normal; }
.bh-onboarding-welcome .bh-onboarding-create { color: color-mix(in srgb, var(--bh-accent) 80%, var(--bh-onboarding-label)); background: color-mix(in srgb, var(--bh-accent) 10%, var(--bh-onboarding-surface)); border-color: color-mix(in srgb, var(--bh-accent) 35%, transparent); }
.bh-onboarding-welcome .bh-onboarding-create:hover:not(:disabled) { background: color-mix(in srgb, var(--bh-accent) 18%, var(--bh-onboarding-surface)); }
.bh-onboarding-welcome .bh-onboarding-create:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-onboarding-model-form > button { justify-self: start; }
.bh-onboarding-model-form .bh-card-title { white-space: normal; }
.bh-onboarding-model-form { display: grid; gap: 16px; min-width: 0; line-height: 20px; }
.bh-onboarding-request { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--bh-onboarding-border); border-radius: 10px; }
.bh-onboarding-request p { white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-onboarding-model-scope { display: grid; gap: 6px; padding-top: 12px; border-top: 1px solid var(--bh-onboarding-border); }

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
  padding: 0 var(--dsh-sidebar-inline-padding) 4px 0;
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
  gap: 8px;
}
.bh-rail-channel {
  position: relative;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 0;
  border-radius: 10px;
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
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-rail-channel-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-rail-channel-icon.bh-group-channel-icon { border-radius: 9px; overflow: hidden; }
.bh-rail-divider {
  width: 28px;
  flex: none;
  margin: 10px 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

/* HoverCard portals this preview to body, so these rules intentionally do
   not depend on the bh-root ancestor or its three local brand aliases. */
.bh-rail-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--dsw-alias-label-primary);
}
.bh-rail-preview-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.bh-rail-preview-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
}
.bh-rail-preview-icon.bh-group-channel-icon { border-radius: 7px; overflow: hidden; }
.bh-rail-preview-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.bh-rail-preview-meta,
.bh-rail-preview-description,
.bh-rail-preview-summary {
  display: -webkit-box;
  overflow: hidden;
  line-height: 18px;
  -webkit-box-orient: vertical;
}
.bh-rail-preview-meta,
.bh-rail-preview-description {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  -webkit-line-clamp: 2;
}
.bh-rail-preview-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  -webkit-line-clamp: 2;
  margin-top: 4px;
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
  gap: 4px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 4px;
  margin: 2px -4px 4px 0;
  border-radius: 12px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
}
.bh-header-label {
  flex: none;
  max-width: 45%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  transition:
    max-width 180ms var(--ds-ease-in-out),
    margin-right 180ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    transform 180ms var(--ds-ease-in-out),
    visibility 0s linear;
}
.bh-header-label-hidden {
  max-width: 0;
  margin-right: -4px;
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
  border-radius: 50%;
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
  margin-inline: -2px;
  padding-right: 4px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
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
  border-radius: 50%;
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
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  transition: opacity 120ms var(--ds-ease-in-out);
}
.bh-search-open .bh-search-input {
  margin-left: -2px;
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
  border-radius: 50%;
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
  gap: 4px;
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
  border-radius: 50%;
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
  margin-inline: 2px;
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

button:has(.bh-panel-glyph[data-wide='true']) > span:not(.bh-panel-glyph):not(.bh-panel-glyph-hit):not(.bh-panel-gear) {
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


/* Settings gear on the active Bot row: hidden until the row is hovered, then
   it opens the Bot section of the Settings dialog. */
.bh-panel-gear {
  position: absolute;
  top: 50%;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out);
}

button:has(.bh-panel-glyph):hover .bh-panel-gear,
button:has(.bh-panel-glyph):focus-within .bh-panel-gear {
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
  border-radius: 12px;
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
  margin-bottom: 12px;
  margin-inline: 4px;
  border: 1px dashed var(--dsw-alias-border-l3);
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
  margin-bottom: 12px;
  padding: 4px;
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
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}
.bh-unpin-zone {
  display: grid;
  flex: none;
  place-items: center;
  box-sizing: border-box;
  height: 72px;
  min-height: 72px;
  margin: 0 4px 12px;
  padding-inline: 20px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 12px;
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
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  pointer-events: none;
}
.bh-pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: 6px 8px;
}
.bh-pinned-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  padding: 0 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 600;
}
.bh-pinned-header .bh-row-action {
  width: 20px;
  height: 20px;
}

.bh-pinned {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 0;
  border-radius: 10px;
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
  border-radius: 2px;
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
  font-size: 12px;
  font-weight: 600;
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
  border-radius: 50%;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
}
.bh-pinned-channel-icon.bh-group-pinned-channel-icon {
  border-radius: 15px;
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
  border-radius: 50%;
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
  padding: 0 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--bh-entry-notification-label);
  background: var(--bh-entry-notification);
  font-size: 10px;
  line-height: 14px;
  font-weight: 600;
}
.bh-avatar-information {
  color: var(--bh-overview-label);
  background: var(--bh-inbox-surface);
  border: 1px solid var(--bh-overview-border);
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
  border: 1.5px solid var(--dsw-alias-bg-base);
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
  border-radius: 3px;
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
  gap: 8px;
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
  margin: 4px 2px 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  background: var(--bh-hover);
}
.bh-https-fallback-code {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-https-fallback-caption {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: -4px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 18px;
}
.bh-https-fallback-detail {
  font-family: var(--dsw-font-family-mono, monospace);
  overflow-wrap: anywhere;
}
.bh-git-unavailable {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 2px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  background: var(--bh-hover);
}
.bh-git-unavailable-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.bh-git-unavailable-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
.bh-git-unavailable-buttons {
  display: flex;
  gap: 6px;
  margin-left: auto;
  white-space: nowrap;
}
.bh-git-install-error {
  color: var(--bh-inbox-error);
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
  margin-left: 4px;
}
.bh-row-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
  line-height: 16px;
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
  padding-right: 3px;
}
.bh-avatar-facepile-button { display: inline-flex; flex: none; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.bh-avatar-facepile-button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-avatar-facepile > * + * {
  margin-left: -7px;
}
.bh-avatar-facepile .bh-persona-avatar,
.bh-avatar-facepile-overflow {
  border: 1.5px solid var(--dsw-alias-bg-base);
  border-radius: 50%;
}
.bh-avatar-facepile-overflow {
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  font-weight: 600;
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
  margin-top: 2px;
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
  margin-top: 12px;
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
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  line-height: 20px;
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
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: 11px/1 var(--dsw-font-family);
  pointer-events: none;
}
.bh-shortcut-active .bh-state {
  visibility: hidden;
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
  font-size: 10px;
}

.bh-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
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
  gap: 6px;
  min-width: 0;
}
.bh-contact .bh-name,
.bh-channel-row .bh-name {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-channel-message-time {
  margin-left: auto;
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bh-role-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
  font-size: 11.5px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-unread {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bh-accent);
  flex: 0 0 auto;
}
.bh-state {
  flex: 0 0 auto;
}

.bh-channel-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  overflow: hidden;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-weight: 600;
}
.bh-channel-mark-sm {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  font-size: 12px;
}

/* Conversation rows share the DM geometry so Groups also show a message preview. */
.bh-channel-row {
  min-height: 48px;
  gap: 9px;
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
  border-radius: 10px;
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
  padding: 0 8px;
}
.bh-section-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
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
  font-size: 12px;
  line-height: 20px;
}

/* 原生 .rowActions：16px 字形、gap 12、仅悬停显示（菜单打开时的常显由
   row 组件的 menu-open 变体在交互接线时补上）。 */
.bh-row-actions {
  flex: none;
  display: none;
  align-items: center;
  gap: 12px;
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
  border-radius: 4px;
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
  gap: 8px;
  width: 100%;
}
.bh-move-checked-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 原生 WorkspaceBrowser .deleteAction：Modal 确认按钮走 error 色描边文本。
   双类提升特异性，压过 Modal 外挂载顺序下 primitives 的 outline 规则。 */
.bh-danger-action.bh-danger-action:not(:disabled) {
  color: var(--dsw-alias-state-error-primary);
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
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-name-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}
.bh-name-input:disabled {
  color: var(--dsw-alias-label-dimmed);
}

/* PersonaBot creation is portaled with the native Modal, so these form styles
   intentionally do not depend on the .bh-root surface. */
.bh-personabot-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.bh-personabot-persona {
  min-height: 120px;
  resize: vertical;
}
.bh-personabot-persona:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.bh-personabot-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bh-personabot-label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.bh-personabot-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.bh-role-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bh-role-editor-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bh-role-edit-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.bh-role-edit-badge button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: -2px;
  border: 0;
  border-radius: 50%;
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

/* 创建失败提示留在 Modal 体内；Modal 在 body 下，不能依赖 .bh-root 前缀。 */
 .bh-bot-deletion { display: grid; gap: 12px; }
.bh-bot-deletion p { margin: 0; }
.bh-bot-deletion-path { overflow-wrap: anywhere; font-family: var(--dsw-font-family-mono); }
.bh-bot-deletion-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.bh-bot-deletion-choice { display: flex; align-items: center; gap: 8px; }
.bh-bot-deletion-confirm { color: var(--dsw-alias-state-error-primary); }
.bh-bot-deletion dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.bh-bot-deletion dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }

.bh-modal-error {
  margin-top: 8px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
}

/* Bot Marketplace is portaled with the native Modal; never depend on .bh-root. */
.bh-market-modal {
  width: min(880px, 100%);
  max-height: 100%;
}
.bh-market {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.bh-market-submit {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.bh-market-submit > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.bh-market-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 24px 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}
.bh-market-browse {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bh-market-browse > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-market-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bh-market-topic {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
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
  font-weight: 500;
}
.bh-market-topic-count {
  color: var(--dsw-alias-label-tertiary);
}
.bh-market-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  align-content: start;
  gap: 14px;
  max-height: min(54vh, 560px);
  overflow-y: auto;
  padding: 2px;
}
/* A profile card: banner on top, the Bot's avatar half over its lower edge, identity below. */
.bh-market-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
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
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-market-avatar {
  display: block;
  flex-shrink: 0;
  width: fit-content;
  padding: 3px;
  border-radius: 15px;
  background: var(--dsw-alias-bg-module-platform);
  line-height: 0;
}
/* The avatar rides half over the banner; name, repository and Install sit beside it. */
.bh-market-row-head {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  min-width: 0;
  margin-top: -32px;
  padding: 0 4px 0 10px;
}
.bh-market-row-head > button:last-child { flex-shrink: 0; }
.bh-market-row-head > .bh-market-open { gap: 0; overflow: hidden; }
.bh-market-card-name {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-row .bh-market-owner {
  overflow: hidden;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-market-card-tags {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  overflow: hidden;
}
.bh-market-row > .bh-market-description {
  display: -webkit-box;
  overflow: hidden;
  padding: 0 4px;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.bh-market-row-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: auto;
  padding: 0 4px;
}
.bh-market-row-foot .bh-market-meta { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
.bh-market-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bh-market-name {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.bh-market-owner {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 400;
}
.bh-market-description {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.bh-market-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
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
  gap: 12px;
  min-width: 0;
}
.bh-market-banner,
.bh-market-banner-thumb {
  display: block;
  flex-shrink: 0;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-market-banner,
.bh-market-banner-thumb { border: 0; }
.bh-market-hero {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bh-market-hero > .bh-market-banner {
  position: relative;
  aspect-ratio: 5 / 1;
  border-radius: 12px;
}
.bh-market-hero[data-market-banner='none'] > .bh-market-banner { display: none; }
.bh-market-hero[data-market-banner='none'] > .bh-market-row-head { margin-top: 0; }
.bh-market-hero > .bh-market-row-head { margin-top: -36px; padding-left: 12px; }
.bh-market-hero > .bh-market-row-head > .bh-market-copy { padding-bottom: 4px; }
.bh-market-hero > .bh-market-description,
.bh-market-hero > .bh-market-meta { padding: 0 4px; }
.bh-market-hero .bh-market-name { font-size: 18px; font-weight: 600; line-height: 24px; }
.bh-market-hero .bh-market-github {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
}
.bh-market-github {
  flex: none;
  color: var(--bh-accent);
  font-size: 13px;
  text-decoration: none;
}
.bh-market-github:hover {
  text-decoration: underline;
}
.bh-market-readme {
  max-height: min(56vh, 480px);
  overflow-y: auto;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  min-width: 0;
}
.bh-market-readme img {
  max-width: 100%;
}
.bh-market-report-open {
  margin-right: auto;
}
.bh-market-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 18px;
}
.bh-market-report strong {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
}
.bh-market-report label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bh-market-report textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.bh-market-report textarea:focus-visible {
  outline: 2px solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-market-confirm {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.bh-market-confirm-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.bh-market-facts {
  display: grid;
  gap: 8px;
  margin: 0;
  font-size: 13px;
}
.bh-market-facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
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
  gap: 4px;
  border: 1px solid var(--dsw-alias-state-warning-secondary);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.bh-market-risk strong {
  color: var(--dsw-alias-state-warning-primary);
  font-size: 13px;
}
.bh-bot-zip-export {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-bot-zip-file {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 8px;
  padding: 10px 12px;
}
.bh-bot-zip-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-bot-zip-file-name[data-empty] {
  color: var(--dsw-alias-label-tertiary);
}
.bh-bot-zip-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bh-bot-zip-picker-head {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.bh-bot-zip-picker-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.bh-bot-zip-picker-count {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.bh-bot-zip-picker-loading {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.bh-bot-zip-tree,
.bh-bot-zip-tree-group {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-bot-zip-tree {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 4px 0;
}
.bh-bot-zip-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding-right: 10px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.bh-bot-zip-tree-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-bot-zip-tree-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 6px;
  border: 0;
  border-radius: 4px;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
span.bh-bot-zip-tree-toggle {
  cursor: default;
}
.bh-bot-zip-tree-label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
}
.bh-bot-zip-tree-label input {
  flex: none;
  margin: 0;
  accent-color: var(--dsw-alias-state-business-primary);
}
.bh-bot-zip-tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-bot-zip-tree-always {
  flex: none;
  border-radius: 4px;
  padding: 0 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
}
.bh-bot-zip-history {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.bh-bot-zip-history[data-disabled] {
  cursor: default;
}
.bh-bot-zip-history input {
  flex: none;
  margin: 3px 0 0;
  accent-color: var(--dsw-alias-state-business-primary);
}
.bh-bot-zip-history-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.bh-bot-zip-history-text strong {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
.bh-bot-zip-history[data-disabled] .bh-bot-zip-history-text strong {
  color: var(--dsw-alias-label-tertiary);
}
.bh-bot-zip-tree-size {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Hidden Channel recovery is portaled under body; never depend on .bh-root. */
.bh-hidden-manager {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.bh-hidden-manager > :last-child {
  gap: 8px;
  margin-top: 12px;
}
.bh-hidden-search {
  box-sizing: border-box;
  width: 100%;
}
.bh-hidden-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(360px, 55vh);
  overflow-y: auto;
}
.bh-hidden-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 2px 4px;
  border-radius: 8px;
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
  font-size: 14px;
  line-height: 18px;
}
.bh-hidden-meta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 16px;
}
.bh-hidden-empty {
  padding: 28px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  text-align: center;
}

.bh-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 4px;
}
.bh-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
}
.bh-skeleton-messages {
  gap: 24px;
  padding: 20px 24px;
}
.bh-skeleton-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
}
.bh-skeleton-avatar,
.bh-skeleton-line {
  display: block;
  flex: none;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
}
html[data-botharness-motion='full'] .bh-skeleton-avatar,
html[data-botharness-motion='full'] .bh-skeleton-line {
  animation: bh-skeleton-pulse 1.6s ease-in-out infinite;
}
.bh-skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.bh-skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  padding-top: 2px;
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
  gap: 8px;
  padding: 12px 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-error {
  margin: 4px 4px 10px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
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
  padding: 10px 52px 0;
  pointer-events: none;
}
.bh-channel-island {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(100%, 440px);
  min-height: 34px;
  padding: 5px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
.bh-channel-island:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-island:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-channel-island > :first-child {
  flex: 0 0 auto;
}
.bh-group-channel-name { display: inline-flex; align-items: center; flex: 1; min-width: 0; padding: 0; border: 0; border-radius: 4px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.bh-group-channel-name:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-group-live-activity { container-type: inline-size; min-width: 0; }
.bh-group-live-activity-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.bh-group-activity-chip { display: inline-flex; min-width: 0; max-width: 100%; border-radius: 999px; }
.bh-group-activity-chip:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-group-activity-pill { min-width: 0; max-width: 100%; }
.bh-group-activity-chip-name { min-width: 0; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.bh-group-activity-chip-state { white-space: nowrap; }
.bh-group-activity-overflow { flex-shrink: 0; }
.bh-channel-island-wrap {
  position: relative;
  display: inline-flex;
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
  gap: 10px;
  width: max-content;
  min-width: 248px;
  max-width: min(320px, 80vw);
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
  text-align: left;
}
.bh-profile-popover-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.bh-profile-popover-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.bh-profile-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-profile-roles {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
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
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
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
.bh-avatar-editor { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 24px; align-items: start; }
.bh-card-list.bh-avatar-methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; overflow: visible; border: 0; border-radius: 0; }
.bh-card-list.bh-avatar-methods > .bh-card-row { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.bh-card-list.bh-avatar-methods > .bh-card-row + .bh-card-row { border-top: 1px solid var(--dsw-alias-border-l2); }
.bh-card-list.bh-avatar-methods > .bh-card-row[data-state="current"] { border-color: var(--bh-accent); }
.bh-card-list.bh-avatar-methods .bh-card-title { white-space: normal; }
.bh-card-list.bh-avatar-methods .bh-card-detail { padding-top: 2px; }
.bh-avatar-editor-preview { display: flex; align-items: center; justify-content: center; }
.bh-avatar-editor-controls h3 { margin: 0; font-size: 15px; }
.bh-avatar-editor-controls p { margin: 8px 0 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.bh-avatar-editor-fields { border: 0; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.bh-avatar-families { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; align-self: flex-start; }
.bh-avatar-families button { min-height: 26px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.bh-avatar-families button[aria-checked='true'] { background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); }
.bh-avatar-ranges { display: flex; flex-direction: column; gap: 10px; max-width: 360px; }
.bh-avatar-ranges label { display: grid; grid-template-columns: 72px minmax(0, 1fr) 28px; align-items: center; gap: 8px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.bh-avatar-ranges output { text-align: right; color: var(--dsw-alias-label-primary); }
.bh-avatar-categories { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px; }
.bh-avatar-categories [role='tablist'] { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
.bh-avatar-categories button { min-height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.bh-avatar-categories button:hover { background: var(--bh-hover); }
.bh-avatar-categories button[aria-selected='true'] { background: var(--dsw-alias-button-elevated-fill); border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.bh-avatar-categories .bh-avatar-shuffle { margin-left: auto; border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.bh-avatar-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 8px; }
.bh-avatar-option { aspect-ratio: 1; padding: 3px; border: 2px solid transparent; border-radius: 12px; background: transparent; cursor: pointer; }
.bh-avatar-option span, .bh-avatar-option svg { display: block; width: 100%; height: 100%; }
.bh-avatar-option:hover { border-color: var(--dsw-alias-border-l2); }
.bh-avatar-option[aria-pressed='true'] { border-color: var(--dsw-alias-label-primary); }
.bh-avatar-hidden-note { grid-column: 1 / -1; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.bh-part-editor { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; }
.bh-part-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bh-part-toolbar > button:not(.bh-avatar-category) { min-height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; }
.bh-part-toolbar > button:disabled { opacity: 0.45; cursor: default; }
.bh-part-divider { width: 1px; height: 20px; background: var(--dsw-alias-border-l2); }
.bh-part-options { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 13px; }
.bh-part-options > span, .bh-part-options label { display: inline-flex; align-items: center; gap: 4px; }
.bh-part-options small { color: var(--dsw-alias-label-secondary); }
.bh-part-options > span > button:not(.bh-avatar-category):not(.bh-part-swatch) { min-height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.bh-part-options button:disabled { opacity: 0.45; cursor: default; }
.bh-part-hint { flex-basis: 100%; }
.bh-part-cursor { position: absolute; box-sizing: border-box; border: 2px solid var(--dsw-alias-label-primary); box-shadow: 0 0 0 1px var(--dsw-alias-bg-base); pointer-events: none; }
.bh-part-draw { align-self: stretch; min-width: 88px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; touch-action: none; user-select: none; }
.bh-part-workspace { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
.bh-part-canvas { position: relative; flex: none; max-width: 100%; overflow: hidden; border-radius: 8px; touch-action: none; user-select: none; }
.bh-part-backdrop { position: absolute; inset: 0; opacity: 0.38; pointer-events: none; }
.bh-part-backdrop svg { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.bh-part-grid { position: absolute; inset: 0 0 auto 0; display: grid; outline: 2px dashed var(--dsw-alias-label-secondary); outline-offset: -1px; }
.bh-part-cell { box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l2); cursor: crosshair; }
.bh-part-cell[data-part-other='true'] { opacity: 0.45; }
.bh-part-side { display: flex; flex-direction: column; gap: 10px; }
.bh-part-preview { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-part-preview svg { display: block; width: 32px; height: 32px; image-rendering: pixelated; }
.bh-part-palette { display: grid; grid-template-columns: repeat(2, auto); gap: 4px 10px; }
.bh-part-palette-row { display: flex; gap: 2px; }
.bh-part-swatch { width: 18px; height: 18px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 3px; cursor: pointer; }
.bh-part-swatch[aria-pressed='true'] { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 1px; }
.bh-part-name { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.bh-part-name input { flex: 1; min-height: 30px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); color: inherit; font: inherit; }
.bh-part-library-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.bh-part-image { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; font-size: 13px; }
.bh-part-image p { margin: 0; }
.bh-part-image label { display: flex; align-items: center; gap: 8px; }
.bh-part-image input, .bh-part-image select { min-height: 28px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); color: inherit; font: inherit; }
.bh-part-image input { width: 72px; }
.bh-avatar-color-reset { min-height: 26px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.bh-avatar-colors { display: flex; flex-direction: column; gap: 10px; }
.bh-avatar-color-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; }
.bh-avatar-color-row > span { width: 72px; color: var(--dsw-alias-label-secondary); }
.bh-avatar-swatch { width: 24px; height: 24px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 50%; cursor: pointer; }
.bh-avatar-swatch[aria-pressed='true'] { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-avatar-color-row input { width: 32px; height: 26px; padding: 0 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); }
.bh-avatar-editor-fields :focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-avatar-media-composed svg { image-rendering: pixelated; }
.bh-personabot-name-row { display: flex; align-items: center; gap: 10px; }
.bh-personabot-name-row > :last-child { flex: 1; min-width: 0; }
@media (max-width: 640px) { .bh-avatar-editor { grid-template-columns: minmax(0, 1fr); } .bh-avatar-options { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); } }
.bh-profile-view {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 74px 18px 24px;
}
.bh-profile-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 6px;
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
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform);
}
.bh-profile-banner {
  position: relative;
  aspect-ratio: 3 / 1;
  max-height: 200px;
  width: 100%;
  overflow: hidden;
  background: var(--bh-hover);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
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
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-bg-module-platform) 88%, transparent);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;
}
.bh-profile-banner:hover .bh-profile-banner-edit,
.bh-profile-banner-edit:focus-visible { opacity: 1; }
@media (hover: none) { .bh-profile-banner-edit { opacity: 1; } }
.bh-profile-popover-banner {
  margin: -12px -12px 0;
  aspect-ratio: 3 / 1;
  max-height: 96px;
  overflow: hidden;
  border-radius: 11px 11px 0 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-banner-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.bh-banner-preview {
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.bh-banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bh-banner-scenes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}
.bh-banner-scene {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.bh-banner-scene .bh-banner-art {
  aspect-ratio: 3 / 1;
  height: auto;
  border-radius: 5px;
}
.bh-banner-scene[aria-checked="true"] {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary);
}
.bh-banner-scene:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); }
.bh-profile-header-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px 16px;
}
.bh-profile-header-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
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
  gap: 8px;
  padding-bottom: 4px;
}
.bh-profile-header-actions > button { white-space: nowrap; }
.bh-profile-header .bh-profile-view-name { margin-top: 4px; white-space: normal; overflow-wrap: anywhere; }
.bh-profile-header .bh-profile-description { -webkit-line-clamp: unset; overflow-wrap: anywhere; }
.bh-profile-bio-input {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.bh-profile-bio-input:focus-visible {
  outline: 2px solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-profile-bio-count { align-self: flex-end; font-variant-numeric: tabular-nums; }
.bh-personabot-hint[data-invalid="true"] { color: var(--dsw-alias-state-error-primary); }
.bh-profile-avatar-modal { width: min(760px, calc(100vw - 32px)); }
.bh-profile-avatar-modal .bh-avatar-section { margin: 0; padding: 0; border: 0; }
.bh-profile-avatar-modal .bh-avatar-section > .bh-profile-section-title { display: none; }
.bh-profile-view-identity {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-profile-view-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bh-profile-view-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.bh-profile-view-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-profile-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-profile-edit:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-profile-name-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bh-profile-name-actions {
  display: flex;
  gap: 8px;
}
.bh-profile-action {
  padding: 4px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
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
  gap: 8px;
  margin-top: 2px;
}
.bh-profile-avatar-input {
  display: none;
}
.bh-profile-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}
.bh-profile-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 20px;
}
.bh-profile-section {
  margin-top: 20px;
}
.bh-profile-section-title {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 600;
}
.bh-profile-section .bh-profile-cards {
  margin-top: 0;
}
.bh-profile-policy-section {
  padding-top: 20px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.bh-profile-policy-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  list-style: none;
  cursor: pointer;
}
.bh-profile-policy-summary::-webkit-details-marker {
  display: none;
}
.bh-profile-policy-summary:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 3px;
}
.bh-profile-policy-summary-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bh-profile-policy-summary-text strong {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
}
.bh-profile-policy-summary-text span {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-profile-policy-summary > svg {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-secondary);
  transition: transform 150ms ease;
}
.bh-profile-policy-details[open] .bh-profile-policy-summary > svg {
  transform: rotate(90deg);
}
.bh-profile-policy-details > .bh-profile-cards {
  margin-top: 14px;
}
.bh-profile-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-module-platform);
}
.bh-profile-card-compact {
  gap: 6px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
}
.bh-profile-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bh-profile-card-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-popover-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bh-profile-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bh-source-policy-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}
.bh-source-policy-table th, .bh-source-policy-table td {
  padding: 6px 8px;
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-source-policy-table thead th {
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
.bh-source-policy-table th:first-child { width: 25%; padding-left: 0; }
.bh-source-policy-table th:nth-child(2) { width: 43%; }
.bh-source-policy-table th:nth-child(3) { width: 14%; }
.bh-source-policy-table th:nth-child(4) { width: 18%; }
.bh-source-policy-table tbody th { font-weight: 500; }
.bh-source-policy-table tbody tr:last-child > * { border-bottom: 0; }
.bh-source-policy-table td:last-child, .bh-source-policy-table th:last-child { padding-right: 0; text-align: right; }
.bh-source-policy-count { font-variant-numeric: tabular-nums; }
.bh-source-policy-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.bh-source-policy-action { border-radius: 6px; color: var(--dsw-alias-label-primary); }
.bh-source-policy-action:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 1px; }
.bh-source-policy-read-only { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.bh-source-policy-audit { display: flex; flex-direction: column; gap: 16px; margin: 0; font-size: 13px; }
.bh-source-policy-audit dt { color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }
.bh-source-policy-audit dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 1100px) {
  .bh-source-policy-table th, .bh-source-policy-table td { padding-left: 4px; padding-right: 4px; }
  .bh-source-policy-table th:first-child { width: 25%; }
  .bh-source-policy-table th:nth-child(2) { width: 37%; }
  .bh-source-policy-table th:nth-child(3) { width: 16%; }
  .bh-source-policy-table th:nth-child(4) { width: 22%; }
}

.bh-root, .bh-im-danger, .bh-im-help {
  /* @bh-im-actions-aliases:start — native Button has no destructive variant;
     preserve its compact geometry with the shell's error/foreground tokens. */
  --bh-im-danger-fill: var(--dsw-alias-state-error-primary);
  --bh-im-danger-hover: color-mix(in srgb, var(--dsw-alias-state-error-primary) 85%, var(--dsw-alias-label-primary));
  --bh-im-danger-label: var(--dsw-alias-label-primary-foreground);
  --bh-im-help-focus: var(--dsw-alias-state-business-primary);
  /* @bh-im-actions-aliases:end */
}
.bh-im-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bh-im-heading { display: flex; align-items: center; gap: 4px; min-width: 0; }
.bh-im-heading small { color: var(--dsw-alias-label-secondary); font-weight: normal; }
.bh-im-help { width: 22px; height: 22px; flex: none; color: var(--dsw-alias-label-secondary); }
.bh-im-help:focus-visible { outline: 2px solid var(--bh-im-help-focus); outline-offset: 2px; }
.bh-im-grant-body .bh-im-group-policy { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px 12px; padding-block: 10px; }
.bh-im-wide { grid-column: 1 / -1; }
.bh-im-policy-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.bh-im-policy-revision { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.bh-im-grant-body .bh-im-status { margin: 0; font-size: 12px; }
.bh-im-notice { font-size: 12px; }
.bh-im-grant-body .bh-im-submit { align-self: flex-end; }
.bh-im-danger.bh-im-danger { background: var(--bh-im-danger-fill); color: var(--bh-im-danger-label); border-color: transparent; }
.bh-im-danger.bh-im-danger:not(:disabled):hover { background: var(--bh-im-danger-hover); }
.bh-im-thread-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
@media (max-width: 720px) {
  .bh-im-grant-body .bh-im-group-policy { grid-template-columns: minmax(0,1fr); }
}
.bh-im-danger-outline.bh-im-danger-outline { color: var(--dsw-alias-state-error-primary); }
.bh-im-danger-text.bh-im-danger-text { color: var(--dsw-alias-state-error-primary); }
.bh-conversation-group { display: grid; gap: 4px; }
.bh-conversation-group + .bh-conversation-group { margin-top: 8px; }
.bh-conversation-group-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.bh-conversation-group-title small { font-weight: 400; margin-left: 2px; }
.bh-conversation-reason { font-size: 12px; color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.bh-conversation-list .bh-card-main { padding-block: 7px 2px; }
.bh-conversation-list .bh-card-body { gap: 2px; }
.bh-conversation-list .bh-card-detail { display: grid; gap: 6px; padding-bottom: 6px; }
.bh-conversation-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bh-conversation-sync { display: grid; gap: 6px; }
.bh-conversation-sync-title { display: flex; align-items: center; gap: 2px; font-size: 12px; font-weight: 500; }
.bh-conversation-sync .bh-modal-footer { gap: 6px; }
.bh-conversation-confirm { display: grid; gap: 8px; }
.bh-conversation-confirm p { margin: 0; }
.bh-modal-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; width: 100%; justify-content: flex-end; }
.bh-modal-footer > button { white-space: nowrap; }
.bh-modal-footer-gap { flex: 1; }
.bh-sidebar-modal { width: min(440px, calc(100vw - 32px)); }
.bh-external-identity-modal { max-height: calc(100dvh - 32px); }
.bh-external-identity-content { min-height: 0; overflow-y: auto; }
.bh-sidebar-modal-form, .bh-im-grant-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; font-size: 13px; }
.bh-sidebar-modal-form p, .bh-im-grant-body p { margin: 0; }
.bh-sidebar-modal-form ul:not(.bh-card-list) { margin: 0; padding-left: 18px; }
.bh-sidebar-modal-subject { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 500; overflow-wrap: anywhere; }
.bh-sidebar-modal-subject .bh-bridge-secondary { width: 100%; margin-top: 0; font-weight: 400; }
.bh-muted { color: var(--dsw-alias-label-secondary); }
.bh-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bh-im-history { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.bh-external-entry { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.bh-memory-limits { margin-top: 8px; }
.bh-external-panel-modal .bh-im-pairing { padding-block: 0; font-size: 13px; }

.bh-app-setup-qr { display: block; width: 320px; max-width: 100%; height: auto; align-self: center; }

 .bh-im-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}
 .bh-im-group-policy { display: grid; gap: 8px; padding-block: 12px; border-block: 1px solid var(--dsw-alias-border-l2); }
.bh-im-threads { display: grid; gap: 8px; padding-block: 12px; }
.bh-im-threads p { margin: 0; color: var(--dsw-alias-label-secondary); }
.bh-im-pairing { display: flex; flex-direction: column; gap: 12px; padding-block: 16px; }
.bh-im-pairing p { margin: 0; }
.bh-im-pairing-request { padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--bh-memory-radius-row); display: flex; flex-direction: column; gap: 12px; overflow-wrap: anywhere; }
.bh-im-pairing-request dl { margin: 0; display: grid; gap: 6px; }
.bh-im-pairing-request dl > div { display: grid; grid-template-columns: minmax(90px, 25%) minmax(0, 1fr); gap: 12px; }
.bh-im-pairing-request dt { color: var(--dsw-alias-label-secondary); }
.bh-im-pairing-request dd { margin: 0; }
.bh-im-pairing-capabilities { display: flex; flex-wrap: wrap; gap: 12px; border: none; padding: 0; margin: 0; }
.bh-im-pairing-capabilities legend { margin-bottom: 8px; }
.bh-im-role-form { display: flex; flex-direction: column; gap: 12px; border: none; padding: 0; margin: 0; }
.bh-im-role-form legend { margin-bottom: 8px; }
.bh-im-pairing-capabilities label { display: flex; align-items: center; gap: 6px; }
.bh-im-threads td { overflow-wrap: anywhere; }
.bh-identity-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bh-identity-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.bh-bridge-secondary{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:4px}
.bh-im-threads .bh-source-policy-table th:first-child { width: 40%; }
.bh-im-threads .bh-source-policy-table th:nth-child(2) { width: 27%; }
.bh-im-threads .bh-source-policy-table th:nth-child(3) { width: 12%; }
.bh-im-threads .bh-source-policy-table th:nth-child(4) { width: 21%; }
.bh-im-group-policy p { margin: 0; color: var(--dsw-alias-label-secondary); }
.bh-im-digest-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.bh-im-field textarea { min-height: 80px; resize: vertical; }
.bh-im-outcome { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; overflow-wrap: anywhere; }
.bh-im-field > select,
.bh-im-field > textarea,
.bh-im-field > input,
.bh-profile-policy-select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.bh-profile-policy-digest {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.bh-profile-policy-digest label {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
  font-size: 13px;
}
.bh-profile-card-total {
  font-size: 15px;
  font-weight: 600;
}
.bh-profile-card-compact .bh-profile-card-total {
  font-size: 13px;
}
.bh-profile-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
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
  gap: 6px;
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
.bh-profile-tip-head { display: flex; gap: 8px; align-items: baseline; }
.bh-profile-tip-line { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-profile-heat-grid {
  width: max-content;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 10px);
  grid-auto-columns: 10px;
  gap: 2px;
}
.bh-profile-card-compact .bh-profile-heat-grid {
  grid-template-rows: repeat(7, 8px);
  grid-auto-columns: 8px;
}
.bh-profile-heat-cell {
  border-radius: 2px;
  background: var(--dsw-alias-interactive-bg-hover);
}
button.bh-profile-heat-cell {
  padding: 0;
  border: 0;
  appearance: none;
}
button.bh-profile-heat-cell:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 1px;
}
.bh-profile-heat-cell[data-level='1'] {
  background: color-mix(in srgb, var(--bh-accent) 28%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='2'] {
  background: color-mix(in srgb, var(--bh-accent) 50%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='3'] {
  background: color-mix(in srgb, var(--bh-accent) 72%, var(--dsw-alias-interactive-bg-hover));
}
.bh-profile-heat-cell[data-level='4'] {
  background: var(--bh-accent);
}
.bh-profile-heat-cell[data-level='future'] {
  background: transparent;
}
.bh-profile-empty {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-profile-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-profile-reasons li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-reason-count {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.bh-profile-stats {
  display: flex;
  gap: 24px;
  margin: 0;
}
.bh-profile-stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bh-profile-stats dt {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.bh-profile-stats dd {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.bh-profile-bar-chart {
  width: 100%;
}
.bh-profile-bar-chart svg {
  display: block;
}
.bh-profile-token-shares {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.bh-model-usage {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.bh-model-usage-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bh-model-usage-header label {
  display: flex;
  align-items: center;
  gap: 8px;
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
  gap: 12px;
}
.bh-model-usage-range label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bh-model-usage-range input { width: auto; }
.bh-usage-model-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.bh-usage-range-controls { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.bh-usage-totals { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.bh-usage-daily > .bh-usage-legend { margin-bottom: 4px; }
.bh-usage-grouping { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; }
.bh-usage-grouping button { border: 0; border-radius: 6px; padding: 4px 10px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.bh-usage-grouping button[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-usage-grouping button:hover { color: var(--dsw-alias-label-primary); }
.bh-usage-grouping button:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-usage-daily, .bh-usage-models, .bh-usage-cache { display: grid; gap: 12px; }
.bh-usage-axis-labels { display: flex; justify-content: space-between; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.bh-usage-model-plot { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px; }
.bh-usage-model-label { height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
.bh-usage-model-label > span,.bh-usage-cache-label > span { min-width: 0; line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-usage-model-label strong,.bh-usage-cache-label strong { flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bh-usage-cache-label { height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
.bh-usage-measures { display: grid; gap: 2px; margin: 4px 0 0; font-size: 12px; font-variant-numeric: tabular-nums; }
.bh-usage-measures > div { display: flex; flex-wrap: wrap; gap: 4px; }
.bh-usage-measures dt { color: var(--dsw-alias-label-secondary); }
.bh-usage-measures dd { margin: 0; }
.bh-usage-cached-measure { padding-left: 8px; }
.bh-usage-legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.bh-usage-legend span { display: inline-flex; align-items: center; gap: 6px; }
.bh-usage-legend i { width: 8px; height: 8px; border-radius: 2px; }
.bh-usage-legend i[data-series="cached"] { background: var(--bh-accent); }
.bh-usage-legend i[data-series="uncached"] { background: var(--bh-chart-read-dim); }
.bh-usage-legend i[data-series="output"] { background: var(--bh-chart-output); }
.bh-usage-legend i[data-series="unclassified"] { background: var(--dsw-alias-label-tertiary); }
.bh-usage-details summary { cursor: pointer; padding: 12px 0; color: var(--dsw-alias-label-secondary); }
.bh-usage-details summary:hover, .bh-usage-details summary:focus-visible { color: var(--dsw-alias-label-primary); }
.bh-usage-details > div { display: grid; gap: 12px; }
.bh-usage-table-scroll { overflow-x: auto; }
.bh-usage-day-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.bh-usage-day-table th, .bh-usage-day-table td { padding: 8px; text-align: left; font-variant-numeric: tabular-nums; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.bh-usage-day-table caption { text-align: left; padding-bottom: 8px; color: var(--dsw-alias-label-secondary); }
.bh-model-usage-route {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  overflow-wrap: anywhere;
}
.bh-model-usage-buckets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
  margin: 0;
}
.bh-model-usage-buckets dt {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-model-usage-buckets dd {
  margin: 4px 0 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
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
  gap: 2px;
  align-items: flex-start;
  padding: 4px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
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
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
  color: var(--dsw-alias-label-primary);
  font: 12px/1.4 var(--dsw-font-family);
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
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-profile-tip-rows li {
  display: flex;
  justify-content: space-between;
  gap: 16px;
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
  outline: 2px solid var(--dsw-alias-label-primary);
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
.bh-topbar .bh-title {
  flex: 1 1 auto;
  min-width: 56px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-pill {
  margin-left: auto;
  flex: 0 0 auto;
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
  gap: 6px;
  text-align: center;
  padding: 24px;
}
.bh-placeholder .bh-big {
  font-size: 15px;
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
  padding: 74px 18px calc(10px + var(--bh-activity-overlay-inset, 0px));
  overscroll-behavior: contain;
  transition: padding-bottom 160ms ease;
}
/* The faded composer status gives its reserved space back only after the
   fade, so the working rows slide down instead of jumping onto its text. */
.bh-chat-pane[data-activity-concealed='true'] .bh-chat-body {
  padding-bottom: 10px;
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
  font-size: 12px;
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
  margin-top: 14px;
}
.bh-message-day {
  width: fit-content;
  margin: 10px auto 16px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-message-group {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}
.bh-message-group-me {
  justify-content: flex-end;
}
.bh-message-group-avatar {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: flex-end;
  margin-bottom: 0;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: transparent;
}
.bh-message-group-avatar-link { cursor: pointer; }
/* Client-only working rows under the latest message: the composer status
   stays the live region, so these rows are hidden from assistive tech. */
.bh-timeline-working {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.bh-timeline-working-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bh-timeline-working-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-timeline-working-name { color: var(--dsw-alias-label-secondary); }
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
.bh-timeline-working-more {
  padding-left: 36px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-message-group-avatar-link:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
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
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.bh-bubble-author {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  margin: 0 0 0 2px;
}
.bh-root .bh-bridge-source-author {
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: 11px;
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
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 3px;
  border-radius: var(--dsw-radius-sm);
}
.bh-bridge-source-modal {
  width: min(560px, 100%);
  max-height: 100%;
}
.bh-bridge-source-fields {
  display: grid;
  gap: 14px;
  margin: 0;
}
.bh-bridge-source-fields > div {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 3fr);
  gap: 12px;
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
  margin: 0 2px 0 0;
}
.bh-message-group-me .bh-message-identity {
  flex-direction: row-reverse;
}
.bh-bubble-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 4px;
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
  gap: 8px;
}
.bh-bubble-failed-action {
  flex: none;
  border: 0;
  padding: 2px 0;
  color: var(--dsw-alias-state-error-primary);
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.bh-bubble-failed-action:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-bubble-wrap + .bh-bubble-wrap {
  margin-top: 2px;
}
.bh-bubble {
  width: fit-content;
  max-width: 100%;
  border: 1px solid transparent;
  border-radius: 18px;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  padding: 8px 12px;
}
.bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: 5px;
}
.bh-bubble[data-group-position='middle'] {
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
}
.bh-bubble[data-group-position='last'] {
  border-top-left-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='middle'] {
  border-top-left-radius: 18px;
  border-bottom-left-radius: 18px;
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='last'] {
  border-top-left-radius: 18px;
  border-top-right-radius: 5px;
}
.bh-bubble-me {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-label-primary-foreground);
}
.bh-bubble-pending {
  opacity: 0.55;
}
.bh-bubble-failed {
  opacity: 0.8;
}
.bh-bubble-focused .bh-bubble {
  box-shadow: 0 0 0 2px var(--dsw-alias-label-primary);
}
.bh-bubble-reply {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 0 7px;
  padding: 4px 8px;
  border: 0;
  border-left: 2px solid var(--dsw-alias-label-secondary);
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-bubble-reply:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.bh-bubble-reply:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
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
  font-size: 11px;
  font-weight: 600;
}
.bh-bubble-reply-body {
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
}

/* Files stay part of the same message grouping as their text. */
.bh-bubble-content { min-width: 0; }
.bh-message-attachment { position: relative; min-width: 0; }
.bh-message-file-more { flex: none; color: inherit; }
.bh-message-attachments { display: grid; gap: 8px; margin-top: 8px; }
.bh-bridge-media-content { white-space: pre-wrap; }
.bh-bridge-image { max-width: min(100%, 320px); }
.bh-bridge-image-button { display: block; padding: 0; border: 0; background: transparent; cursor: zoom-in; border-radius: 12px; }
.bh-bridge-image-button:focus-visible { outline: 2px solid var(--bh-bridge-media-focus); outline-offset: 2px; }
.bh-bridge-image-state { display: flex; align-items: center; gap: 8px; min-height: 96px; color: var(--bh-bridge-media-muted); }
.bh-bridge-image-expanded { display: block; max-width: 100%; max-height: 75vh; margin: auto; object-fit: contain; }
.bh-message-image-link { display: block; width: fit-content; max-width: 320px; min-width: 0; }
.bh-message-image-row { display: flex; align-items: flex-start; gap: 4px; width: fit-content; max-width: 100%; min-width: 0; }
.bh-message-image { display: block; max-width: 100%; max-height: 320px; border-radius: 12px; object-fit: contain; }
/* File and audio pills share one card rhythm: icon, stacked name/size, divider, action. */
.bh-message-file, .bh-message-audio { display: flex; align-items: center; gap: 10px; min-width: 0; width: fit-content; max-width: min(100%, 320px); min-height: 52px; padding: 8px 8px 8px 12px; border: 0; border-radius: 12px; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; }
.bh-message-file-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; }
button.bh-message-file-main { cursor: pointer; }
.bh-message-file-main:focus-visible, .bh-message-file-download:focus-visible, .bh-message-audio-play:focus-visible, .bh-message-audio-spectrum:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.bh-message-file-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; }
.bh-message-file-copy { display: flex; flex-direction: column; flex: 1; gap: 2px; min-width: 0; }
.bh-message-file-name { display: block; overflow: hidden; min-width: 0; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; font-weight: 500; line-height: 18px; }
.bh-message-file-size { color: color-mix(in srgb, currentColor 72%, transparent); font-size: 11px; line-height: 14px; white-space: nowrap; }
.bh-message-file-divider { flex: none; align-self: stretch; width: 1px; margin-block: 2px; background: var(--dsw-alias-border-l2); }
.bh-message-file-download { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 8px; color: inherit; text-decoration: none; }
a.bh-message-file-download:hover, button.bh-message-file-download:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-audio-play { display: grid; place-items: center; flex: none; width: 32px; height: 32px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.bh-message-audio-play:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
.bh-message-audio-play:disabled { opacity: 0.5; cursor: default; }
.bh-message-audio-meta { display: flex; align-items: center; gap: 4px; color: color-mix(in srgb, currentColor 72%, transparent); font-size: 11px; line-height: 14px; white-space: nowrap; }
.bh-message-audio-spectrum { display: flex; align-items: center; gap: 2px; width: 100%; min-width: 0; height: 28px; margin-top: 4px; padding: 0; border-radius: 4px; cursor: pointer; touch-action: none; }
.bh-message-audio-spectrum[aria-disabled='true'] { cursor: default; }
.bh-message-audio-bar { flex: 1 1 0; min-width: 2px; max-width: 4px; border-radius: 2px; background: color-mix(in srgb, currentColor 28%, transparent); }
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
  margin-left: 4px;
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
  gap: 4px;
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
  font-size: 10.5px;
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
  font-size: 11px;
}
.bh-bubble-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.bh-bubble-action {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  cursor: pointer;
}
.bh-bubble-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-bubble-action:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
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
  .bh-bubble-meta {
    display: none;
  }
}
.bh-timeline-new {
  position: absolute;
  z-index: 2;
  bottom: calc(82px + var(--bh-activity-overlay-inset, 0px));
  left: 50%;
  transform: translateX(-50%);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  cursor: pointer;
}

.bh-inline-mention {
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-interactive-bg-active);
}
.bh-inline-mention-sent {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
  border-radius: 6px;
  padding: 2px 8px;
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
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.bh-bubble-me .bh-inline-mention {
  color: inherit;
  background: color-mix(in srgb, currentColor 14%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 14%, transparent);
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
  border-radius: 50%;
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
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}

.bh-delivery-badge {
  --bh-delivery-color-handled: var(--dsw-alias-state-success-primary);
  --bh-delivery-color-running: var(--dsw-alias-state-business-primary);
  --bh-delivery-color-observed: var(--dsw-alias-label-primary);
  --bh-delivery-color-pending: var(--dsw-alias-label-secondary);
  --bh-delivery-color-ignored: var(--dsw-alias-label-tertiary);
  --bh-delivery-color-retryable: var(--dsw-alias-state-error-primary);
  --bh-delivery-color-needs-repair: var(--dsw-alias-state-error-primary);
  --bh-delivery-color-human-read: var(--dsw-alias-state-success-primary);
  --bh-delivery-color-human-unread: var(--dsw-alias-label-secondary);
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  padding: 2px;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
}
.bh-delivery-pie {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
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
  border-radius: 50%;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
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
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  color: var(--dsw-alias-label-primary);
  font: 12px/1.5 var(--dsw-font-family);
}
.bh-delivery-panel:focus {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-delivery-panel-summary {
  margin-bottom: 10px;
  color: var(--dsw-alias-label-secondary);
}
.bh-delivery-panel-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
  gap: 5px;
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
}
.bh-delivery-legend {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
}
.bh-delivery-panel-group ul {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-delivery-panel-group li {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}
.bh-delivery-panel-group li > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-mention-picker {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.bh-mention-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 7px 10px;
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
  gap: 2px;
}
.bh-mention-option-copy small,
.bh-mention-option-id {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-composer-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin: 0 14px calc(12px + env(safe-area-inset-bottom, 0px));
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
  padding: 7px var(--bh-composer-compact-padding-right) 7px var(--bh-composer-compact-padding-left);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 25px;
  background: var(--bh-composer-panel-bg);
  box-shadow: 0 8px 24px
    color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
  transition:
    padding 220ms var(--ds-ease-in-out),
    border-radius 220ms var(--ds-ease-in-out);
}
.bh-composer-expanded {
  padding-top: 10px;
  padding-bottom: 48px;
  border-radius: var(--bh-composer-radius-panel);
}
.bh-composer-with-footer {
  padding: 10px 12px 48px;
  border-radius: var(--bh-composer-radius-panel);
}
.bh-composer-reply {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 0 6px 8px;
}
.bh-composer-reply-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-label-secondary);
}
.bh-composer-reply-author {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-body {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-cancel {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}
.bh-composer-reply-cancel:hover {
  background: var(--dsw-alias-interactive-bg-active);
}
.bh-composer-reply-cancel:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
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
  padding: 0 6px;
  color: var(--bh-overview-muted);
  font-size: var(--bh-overview-font);
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
  gap: 8px;
  cursor: pointer;
  list-style: none;
  background: transparent;
}
.bh-composer-activity-chevron { flex: none; }
.bh-composer-activity-status[open] .bh-composer-activity-chevron { transform: rotate(180deg); }
.bh-composer-activity-toggle::-webkit-details-marker { display: none; }
.bh-composer-activity-toggle:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-composer-activity-status:not([open]) .bh-composer-activity-details { display: none; }
.bh-composer-activity-details { pointer-events: auto; display: flex; flex-direction: column; gap: 4px; max-height: min(40vh, 320px); overflow-y: auto; margin: 8px 0 0; padding: 0; list-style: none; background: transparent; }
.bh-composer-activity-session { flex: none; pointer-events: auto; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 40px; padding: 8px 12px; border: 1px solid var(--bh-overview-border); background: var(--bh-overview-bg); border-radius: var(--bh-overview-radius-control); }
.bh-composer-activity-session time { flex: none; margin-left: auto; font-size: var(--bh-overview-font); color: var(--bh-overview-muted); font-variant-numeric: tabular-nums; }
.bh-composer-activity-session-latest { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--bh-overview-font); color: var(--bh-overview-muted); }
.bh-composer-activity-source { color: var(--bh-overview-label); }
.bh-composer-activity-source-label { flex: 0 1 auto; max-width: 40%; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--bh-overview-label); }
.bh-composer-activity-source-count { flex-shrink: 0; color: var(--bh-overview-muted); font-variant-numeric: tabular-nums; }
@container (max-width: 480px) {
  .bh-composer-activity-session { flex-wrap: wrap; }
  .bh-composer-activity-source-label { flex: 1; max-width: none; }
  .bh-composer-activity-session-latest { order: 1; flex-basis: 100%; padding-left: 24px; }
}
.bh-composer-activity-summary {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-composer-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bh-composer-add-file { position: absolute; left: 8px; bottom: 10px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 50%; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: pointer; }
.bh-composer-add-file:hover { background: var(--dsw-alias-interactive-bg-active); }
.bh-composer-add-file:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.bh-composer-add-file:disabled { opacity: .5; cursor: default; }
.bh-composer-attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 6px 8px 0;
}
.bh-composer-image-attachment {
  position: relative;
  flex: 0 0 88px;
  width: 88px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
}
.bh-composer-image-preview {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
.bh-composer-image-preview:disabled { cursor: default; }
.bh-composer-image-preview:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -3px; }
.bh-composer-image-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.bh-composer-image-attachment[data-status='error'] .bh-composer-image-preview img { opacity: .55; }
.bh-composer-image-status {
  position: absolute;
  right: 5px;
  bottom: 5px;
  left: 5px;
  display: flex;
  pointer-events: none;
}
.bh-composer-image-status:empty { display: none; }
.bh-composer-image-status .bh-composer-upload-status,
.bh-composer-image-status .bh-composer-upload-retry {
  max-width: 100%;
  overflow: hidden;
  padding: 3px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
}
.bh-composer-image-status .bh-composer-upload-retry { color: var(--dsw-alias-state-error-primary); cursor: pointer; }
.bh-composer-file-attachment {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: min(100%, 280px);
  min-height: 42px;
  padding: 5px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-secondary);
}
.bh-composer-file-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; }
.bh-composer-file-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.bh-composer-attachment-name { display: block; overflow: hidden; min-width: 0; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 16px; white-space: nowrap; text-overflow: ellipsis; }
.bh-composer-upload-status { color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 13px; }
.bh-composer-upload-retry { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-state-error-primary); font-size: 10px; line-height: 13px; cursor: pointer; }
.bh-composer-attachment-remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-composer-attachment-remove:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-composer-attachment-remove:focus-visible,
.bh-composer-upload-retry:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.bh-composer-image-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-input-major);
}
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
  line-height: 22px;
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
  border-radius: 50%;
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
  border-left: 1px solid var(--dsw-alias-border-l2);
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
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-sidebar-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
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
.bh-sidebar-settings-trigger { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 30px; padding: 4px 8px; border: 0; border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
.bh-sidebar-settings-trigger > span { flex: 1; white-space: nowrap; }
.bh-sidebar-settings-trigger:hover, .bh-sidebar-settings-trigger:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.bh-sidebar-settings-options { position: absolute; top: 0; right: calc(100% + 10px); z-index: 1101; min-width: 163px; padding: 4px; box-sizing: border-box; --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); }
.bh-sidebar-settings-options::before { content: ''; position: absolute; top: 0; bottom: 0; right: -10px; width: 10px; }
@media (max-width: 480px) {
  .bh-sidebar-settings-options { top: 100%; right: 0; }
}
.bh-sidebar-settings-label {
  padding: 8px 10px 4px;
  color: var(--bh-overview-muted);
  font-size: 12px;
  line-height: 18px;
}
.bh-channel-sidebar-entry-icon {
  display: inline-flex;
  flex: none;
  color: var(--bh-overview-muted);
}
.bh-channel-sidebar-entries {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0 12px;
}
.bh-channel-sidebar-entry-header {
  display: flex;
  align-items: center;
  width: calc(100% - 12px);
  margin: 2px 6px;
}
.bh-channel-sidebar-entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-channel-sidebar-entry-head:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-sidebar-entry-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-channel-sidebar-entry-action-slot {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding-right: 2px;
}
.bh-channel-sidebar-entry-action:hover,
.bh-channel-sidebar-entry-action[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-channel-sidebar-entry-chevron {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
.bh-channel-sidebar-entry-chevron.bh-chevron-collapsed {
  transform: rotate(-90deg);
}
.bh-channel-sidebar-entry-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.bh-channel-sidebar-entry-badge {
  flex: none;
  display: inline-flex;
}
.bh-channel-sidebar-entry-badge:has(.bh-channel-sidebar-summary) {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 55%;
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
  gap: 8px;
  min-width: 0;
}
.bh-model-preset-editor,
.bh-wake-policy-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.bh-model-preset-editor {
  gap: 18px;
  max-height: min(64vh, 640px);
  overflow-y: auto;
  padding: 2px 4px 2px 0;
}
.bh-model-picker,
.bh-model-allowed,
.bh-model-preset-source {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bh-model-picker-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.bh-model-picker-heading > span {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-model-picker-effort {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-model-preset-source {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-model-allowed {
  padding-top: 14px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.bh-model-allowed-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
}
.bh-model-allowed-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
}
.bh-model-allowed-provider {
  flex: 1;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-model-allowed-efforts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
}
.bh-model-save-preset {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bh-model-save-preset > :first-child {
  flex: 1;
  min-width: 0;
}
.bh-model-editor-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.bh-model-editor-footer-gap {
  flex: 1;
}
.bh-wake-policy-edit-source {
  font-size: 13px;
  font-weight: 500;
}
.bh-channel-sidebar-entry-body {
  padding: 2px 12px 10px;
}
.bh-inbox-group {
  border-top: 1px solid var(--bh-inbox-divider);
  padding: 6px 0;
}
.bh-inbox-group-head,
.bh-inbox-history > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--bh-inbox-muted);
  font-size: 12px;
}
.bh-inbox-group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-inbox-group-head > span:last-child {
  flex-shrink: 0;
}
.bh-inbox-group-chevron {
  flex-shrink: 0;
  transform: rotate(-90deg);
}
.bh-inbox-group[open] > summary > .bh-inbox-group-chevron,
.bh-inbox-history[open] > summary > .bh-inbox-group-chevron {
  transform: none;
}
.bh-inbox-history > summary {
  justify-content: flex-start;
}
.bh-inbox-history {
  margin-top: 4px;
}
.bh-inbox-item:focus-visible,
.bh-inbox-group-head:focus-visible,
.bh-inbox-history > summary:focus-visible {
  outline: 2px solid var(--bh-accent);
  outline-offset: -2px;
}
.bh-inbox-item-summary {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
.bh-external-source-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-block: 8px;
}
.bh-external-source-audio { display: grid; gap: 8px; margin-block: 8px; }
.bh-external-source-video video { display: block; max-width: 100%; max-height: 420px; }
.bh-external-source-audio audio { display: block; width: 100%; max-width: 360px; }
.bh-external-source-audio p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-external-source-image { display: block; max-width: 100%; max-height: 384px; object-fit: contain; margin-block: 8px; }
.bh-external-source-file > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.bh-external-source-file > button { flex-shrink: 0; }
 .bh-external-source-modal {
  width: min(720px, 100%);
  max-height: 100%;
}
.bh-external-source-content {
  max-height: 65vh;
  overflow: auto;
  overflow-wrap: anywhere;
  font: 13px/1.5 var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
}
.bh-external-route {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-external-route-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.bh-external-platform {
  font-weight: 600;
  color: var(--dsw-alias-state-business-primary);
}
.bh-external-scope {
  padding: 1px 6px;
  border-radius: var(--dsw-radius-sm);
  font-size: 11px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.bh-external-route > strong {
  font-size: 15px;
}
.bh-external-route > span {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-external-original { padding: 20px 0; }
.bh-external-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.bh-external-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 15px;
  font-weight: 600;
}
.bh-external-message-main { flex: 1; min-width: 0; }
.bh-external-message-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 7px;
}
.bh-external-message-head strong { font-size: 13px; }
.bh-external-message-head time {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-external-quote {
  margin: 8px 0;
  padding: 10px 12px;
  border-left: 3px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-hover);
  border-radius: var(--dsw-radius-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-external-quote p { margin: 6px 0; }
.bh-external-message-text {
  width: fit-content;
  max-width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 0 var(--dsw-radius-sm) var(--dsw-radius-sm) var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.bh-external-mention { color: var(--dsw-alias-state-business-primary); }
.bh-external-details {
  margin-top: 7px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-external-details > summary {
  width: fit-content;
  padding: 2px 0;
  cursor: pointer;
}
.bh-external-details > summary:hover { color: var(--dsw-alias-label-primary); }
.bh-external-details > summary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
  border-radius: var(--dsw-radius-sm);
}
.bh-external-detail-body {
  overflow-wrap: anywhere;
  padding: 8px 10px;
  margin-top: 4px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.bh-external-detail-body p { margin: 0 0 6px; }
.bh-external-detail-body p:last-child { margin-bottom: 0; }
.bh-external-raw-text { white-space: pre-wrap; }
.bh-external-context { border-top: 1px solid var(--dsw-alias-border-l2); padding-top: 16px; }
.bh-external-context h3 { margin: 0 0 4px; font-size: 13px; }
.bh-external-context-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-external-notice {
  margin: 10px 0;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-warn-primary);
  font-size: 12px;
}
.bh-external-context-messages { display: flex; flex-direction: column; gap: 20px; padding-top: 16px; }
@media (max-width: 480px) {
  .bh-external-message { gap: 8px; }
  .bh-external-avatar { flex-basis: 28px; height: 28px; font-size: 12px; }
  .bh-external-message-text { padding: 8px 10px; }
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
html[data-botharness-motion='reduce'] .bh-channel-sidebar-entry-chevron {
  transition: none;
}
.bh-workspace-grants {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bh-workspace-folder-table {
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.bh-workspace-folder-row + .bh-workspace-folder-row {
  border-top: 1px solid var(--dsw-alias-border-l2);
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
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
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
.bh-workspace-folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.bh-workspace-folder-toggle:focus-visible,
.bh-workspace-folder-remove:focus-visible,
.bh-folder-browser button:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-workspace-folder-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 10px 10px 32px;
}
.bh-workspace-folder-path {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-workspace-folder-secondary {
  min-width: 0;
}
.bh-workspace-folder-secondary > summary {
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-workspace-folder-secondary .bh-workspace-folder-table,
.bh-workspace-folder-manual {
  margin-top: 8px;
}
.bh-workspace-folder-manual {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.bh-workspace-folder-manual input {
  width: 100%;
}
.bh-folder-browser {
  width: min(580px, calc(100vw - 32px));
}
.bh-folder-browser-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.bh-folder-browser-crumb {
  border: 0;
  border-radius: 6px;
  padding: 4px 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-folder-browser-crumb[aria-current='location'] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.bh-folder-browser-list {
  min-height: 180px;
  max-height: min(360px, 50vh);
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
}
.bh-folder-browser-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  padding: 8px 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-folder-browser-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-folder-browser-hidden {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: var(--dsw-alias-label-secondary);
}
.bh-memory-entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.bh-memory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-memory-toolbar button,
.bh-memory-editor button {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 4px 8px;
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
  gap: 2px;
  min-width: 0;
}
.bh-memory-row {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
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
  gap: 6px;
}
.bh-memory-editor label,
.bh-memory-history strong {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-memory-editor textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: 12px;
}
.bh-memory-diff {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.bh-session-workspace-group {
  margin: 2px 0;
}
.bh-session-workspace-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  padding: 0 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-session-workspace-heading:hover {
  background: var(--bh-hover);
}
.bh-session-workspace-heading svg {
  flex: none;
  transition: transform 150ms var(--ds-ease-in-out, ease);
}
.bh-session-workspace-chevron-collapsed {
  transform: rotate(-90deg);
}
html[data-botharness-motion='reduce'] .bh-session-workspace-heading svg {
  transition: none;
}
.bh-session-workspace-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-session-workspace-count {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.bh-member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.bh-member-row .bh-name {
  flex: 1;
  min-width: 0;
}
.bh-member-open-dm {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 0;
  border-radius: 6px;
  padding: 2px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-member-open-dm:hover { background: var(--bh-hover); }
.bh-member-open-dm:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
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
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-member-menu-button:hover,
.bh-member-menu-button[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-group-attention-trigger { position: relative; }
.bh-group-attention-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  display: inline-flex;
  min-width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  border-radius: 999px;
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 9px;
  line-height: 14px;
}
/* These controls are in native Modal portals, outside .bh-root. */
.bh-group-invite-modal,
.bh-group-attention-modal,
.bh-member-policy-modal,
.bh-group-avatar-crop { display: grid; gap: 12px; color: var(--dsw-alias-label-primary); }
.bh-group-invite-modal > label,
.bh-group-avatar-crop > label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.bh-group-invite-results,
.bh-group-attention-modal { max-height: min(50vh, 360px); overflow-y: auto; }
.bh-group-invite-results { display: grid; gap: 4px; }
.bh-group-invite-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-group-invite-option:hover,
.bh-group-invite-option[aria-pressed='true'] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-group-attention-modal h3 {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.bh-group-attention-item { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 6px 0; }
.bh-group-attention-item .bh-name { flex: 1; min-width: 100px; overflow-wrap: anywhere; }
.bh-group-attention-actions { display: flex; justify-content: flex-end; gap: 6px; width: 100%; }
.bh-member-policy-modal .bh-member-wake-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.bh-member-policy-modal .bh-member-wake-choices button {
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.3;
  text-align: left;
}
.bh-member-policy-modal .bh-member-wake-choices button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-member-policy-modal .bh-member-wake-choices [aria-pressed='true'] {
  border-color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-member-policy-modal .bh-member-wake-values {
  display: grid;
  grid-template-columns: 1fr 80px;
  gap: 8px;
  align-items: center;
}
.bh-member-policy-modal .bh-member-wake-values input { width: 80px; }
.bh-group-avatar-crop-viewport {
  position: relative;
  width: 280px;
  height: 280px;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-button-elevated-fill);
  cursor: grab;
  touch-action: none;
}
.bh-group-avatar-crop-viewport:active { cursor: grabbing; }
.bh-group-avatar-crop-viewport:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); }
.bh-group-avatar-crop-viewport img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  user-select: none;
  pointer-events: none;
}
.bh-group-avatar-crop input[type='range'] { width: 100%; }
.bh-group-management { display: grid; gap: 8px; }
.bh-group-setting { display: grid; gap: 6px; padding: 4px 8px; }
.bh-group-setting > label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-group-setting-row { display: flex; align-items: center; gap: 6px; padding: 2px 8px; }
.bh-group-setting .bh-group-setting-row { padding: 0; }
.bh-group-setting-row input, .bh-group-setting-row select {
  min-width: 0;
  flex: 1;
}
.bh-group-avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.bh-group-avatar-topbar { width: 22px; height: 22px; border-radius: 7px; }
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
.bh-group-avatar-stack[data-count='2'] > .bh-persona-avatar { border: 1.5px solid var(--dsw-alias-button-elevated-fill); }
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
  border-radius: 12px;
  overflow: hidden;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-weight: 600;
}
.bh-group-profile-avatar-small { width: 40px; height: 40px; }
.bh-group-profile-avatar-large { width: 64px; height: 64px; border-radius: 16px; }
.bh-group-profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bh-group-profile-authors {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.bh-group-profile-authors li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bh-group-setting-row select {
  width: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  padding: 5px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.bh-group-avatar-setting { display: flex; align-items: center; gap: 8px; }
.bh-group-avatar-setting > img, .bh-group-avatar-setting > span {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 8px;
  object-fit: cover;
}
.bh-group-avatar-setting > span {
  display: grid;
  place-items: center;
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-group-avatar-setting label { position: relative; }
.bh-group-avatar-setting input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.bh-group-avatar-setting label:focus-within { outline: 2px solid var(--dsw-alias-label-primary); }
.bh-group-request .bh-name { overflow-wrap: anywhere; }
.bh-group-request-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 8px 6px 40px;
}
.bh-group-invitations {
  margin-top: 12px;
}
.bh-group-invitations-title {
  padding: 4px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-group-manage-button,
.bh-group-delete-button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 7px;
}
.bh-group-manage-button:hover,
.bh-group-delete-button:hover {
  background: var(--bh-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-group-delete-button {
  margin: 12px 8px 4px;
  color: var(--dsw-alias-state-error-primary);
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
/* Manual path fallback inside a settings row (the picker may be absent). */
.bh-settings-input {
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}

.bh-settings-input:focus {
  outline: none;
  border-color: var(--bh-accent);
}

.bh-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 8px;
  margin: 8px 0 4px;
}

.bh-icon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    color 120ms var(--ds-ease-in-out);
}

.bh-icon-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.bh-icon-card[data-selected='true'] {
  border-color: var(--bh-accent);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}

.bh-icon-card-art {
  pointer-events: none;
}

.bh-icon-card-label {
  text-align: center;
  line-height: 1.3;
}

.bh-settings-section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px 0 8px;
}
.bh-settings-section-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-settings-section-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-settings-rows {
  display: flex;
  flex-direction: column;
}
.bh-bot-settings.bh-bot-settings {
  /* @bh-bot-settings-aliases:start — the modal portals outside .bh-root, so it
     maps the native settings panel's tokens itself. */
  --bh-bot-settings-label: var(--dsw-alias-label-primary);
  --bh-bot-settings-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-bot-settings-nav-hover: var(--dsw-specific-sidebar-nav-item-hover);
  --bh-bot-settings-nav-active: var(--dsw-specific-sidebar-nav-item-active);
  --bh-bot-settings-radius-md: var(--dsw-radius-md);
  --bh-bot-settings-radius-sm: var(--dsw-radius-sm);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  /* @bh-bot-settings-aliases:end */
  flex-direction: row;
  gap: 0;
  width: min(800px, 100%);
  height: min(800px, 100%);
  padding: 0;
}
.bh-bot-settings-nav {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 188px;
  padding: 22px 12px 0;
  box-sizing: border-box;
}
.bh-bot-settings-nav-title {
  padding: 0 12px;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--bh-bot-settings-label);
}
.bh-bot-settings-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.bh-bot-settings-nav-cell {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 9px 16px 9px 12px;
  box-sizing: border-box;
  border: none;
  border-radius: var(--bh-bot-settings-radius-md);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--bh-bot-settings-label);
  text-align: left;
}
.bh-bot-settings-nav-cell:hover {
  background: var(--bh-bot-settings-nav-hover);
}
.bh-bot-settings-nav-cell[aria-current='page'] {
  background: var(--bh-bot-settings-nav-active);
}
.bh-bot-settings-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-bot-settings-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.bh-bot-settings-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 14px 8px 24px;
}
.bh-bot-settings-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--bh-bot-settings-label);
}
.bh-bot-settings-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--bh-bot-settings-radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--bh-bot-settings-label);
}
.bh-bot-settings-close:hover {
  background: var(--bh-bot-settings-hover);
}
.bh-bot-settings-options {
  flex: 1;
  min-height: 0;
  padding: 0 24px 24px;
  overflow-y: auto;
}
.bh-bot-settings-content[data-narrow] .bh-bot-settings-header {
  align-items: center;
  padding: 16px 14px 8px 16px;
}
.bh-bot-settings-content[data-narrow] .bh-bot-settings-options {
  padding: 0 16px 16px;
}
.bh-settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.bh-settings-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 48px;
}
.bh-settings-row-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-settings-row-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-settings-row-value {
  flex: none;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary);
}
.bh-assignment-limit-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.bh-assignment-limit-controls > :first-child { width: 76px; }
.bh-assignment-limit-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.bh-standing-limits > .bh-settings-row-desc { margin: 0 0 12px; }
.bh-standing-limits-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.bh-standing-limit-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bh-standing-limit-label { display: flex; align-items: baseline; gap: 6px; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 500; }
.bh-standing-limit-label code { color: var(--dsw-alias-label-tertiary); font-size: 12px; font-weight: 400; }
.bh-standing-limit-input { display: flex; align-items: center; gap: 8px; }
.bh-standing-limit-input > :first-child { width: 120px; }
.bh-standing-limit-unit { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.bh-standing-limits-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.bh-telemetry-row .bh-settings-row-desc a { color: var(--dsw-alias-state-business-primary); text-decoration: none; }
.bh-telemetry-row .bh-settings-row-desc a:hover { text-decoration: underline; }
.bh-telemetry-row-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }
.bh-settings-selector {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: var(--dsw-alias-bg-module-platform);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.bh-settings-selector:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-settings-chevron {
  flex: none;
}
.bh-motion-preview {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  min-height: 24px;
  margin-top: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 2px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.bh-motion-preview-sample {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  width: 22px;
  height: 12px;
}
.bh-motion-preview-sample i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
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
    margin-right: 8px;
    margin-left: 8px;
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
.bh-grant-request-card { display: grid; gap: 12px; min-width: min(340px, 100%); }
.bh-grant-request-title { font-weight: 600; }
.bh-grant-request-reason { white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-grant-request-card > button { justify-self: start; }
.bh-session-failure-row {
  display: grid;
  gap: 8px;
  min-width: min(340px, 100%);
  max-width: 560px;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 20px;
}
.bh-session-failure-heading {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  flex-wrap: wrap;
}
.bh-session-failure-heading > :first-child { flex: none; }
.bh-session-failure-title {
  color: var(--dsw-alias-state-error-primary);
  font-weight: 600;
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
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.bh-session-failure-raw { white-space: pre-wrap; }
.bh-tool-approval-card { display: grid; gap: 10px; min-width: min(340px, 100%); }
.bh-question-card { display: grid; gap: 10px; width: 380px; max-width: 100%; }
.bh-question-card > button { justify-self: start; }
.bh-question-source { color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.bh-question-source code { display: block; margin-top: 5px; overflow-wrap: anywhere; }
.bh-question-item { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; }
.bh-question-prompt { font-weight: 600; white-space: pre-wrap; }
.bh-question-custom { color: var(--dsw-alias-label-secondary); font-size: var(--dsh-content-font-size-secondary, 13px); }
.bh-tool-approval-input {
  margin: 0;
  padding: 10px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
}
.bh-tool-approval-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bh-tool-approval-confirm, .bh-access-warning { display: grid; gap: 8px; padding: 10px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 8px; }
.bh-assignment-access-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.bh-memory-history {
  gap: 0;
}
.bh-memory-recovery {
  border-top: 1px solid var(--dsw-alias-border-l3);
  margin-top: 8px;
  padding-top: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.bh-memory-recovery > summary {
  cursor: pointer;
  font-weight: 600;
}
.bh-memory-recovery-help,
.bh-memory-recovery-meta {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
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
  gap: 2px;
  width: 100%;
  padding: 6px 4px;
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
  gap: 6px;
}
  .bh-memory-recovery-selection {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .bh-memory-recovery-archive {
    overflow-wrap: anywhere;
  }
  .bh-memory-recovery-archive > summary {
    cursor: pointer;
  }
  .bh-memory-recovery-archive code {
    display: block;
    margin-top: 6px;
    user-select: all;
  }
.bh-memory-recovery-confirm p {
  flex-basis: 100%;
  margin: 0;
}
.bh-memory-graph-dirty {
  flex: none;
  font-size: 11px;
}
.bh-memory-branch-control {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 2px 0 8px;
  color: var(--dsw-alias-label-secondary);

}
.bh-memory-branch-picker {
  display: block;
  flex: 1;
  min-width: 0;
}
.bh-memory-branch-picker > span {
  display: flex;
  min-width: 0;
}
.bh-memory-branch-picker input {
  min-width: 0;
  width: 100%;
}
.bh-memory-branch-menu {
  min-width: 180px;
}
.bh-memory-branch-empty {
  padding: 8px 12px;
  color: var(--bh-memory-label-muted);
  font-size: 12px;
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
  gap: 8px;
  border: 0;
  border-radius: var(--bh-memory-radius-row);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  padding: 0 4px;
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
  gap: 2px;
  padding: 4px 0 8px;
}
.bh-memory-graph-top {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}
.bh-memory-graph-subject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
}
.bh-memory-graph-detail {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.bh-memory-graph-hash {
  font-family: var(--bh-memory-font-code);
  font-variant-numeric: tabular-nums;
}
.bh-memory-ref {
  flex: none;
  display: inline-flex;
  align-items: center;
  max-width: 84px;
  height: 16px;
  overflow: hidden;
  padding: 0 6px;
  border-radius: var(--bh-memory-radius-chip);
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-memory-ref[data-current='true'] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.bh-memory-graph-head-label {
  color: var(--dsw-alias-state-business-primary);
  font-weight: 600;
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
  padding: 8px 4px;
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-memory-graph-more:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-sidebar-order-row { position: relative; display: flex; align-items: flex-start; min-width: 0; }
.bh-sidebar-order-row[hidden] { display: none; }
.bh-sidebar-order-row[data-entry-hidden] .bh-channel-sidebar-entry-label { text-decoration: line-through; opacity: 0.6; }
.bh-sidebar-hidden-badge { flex: none; align-self: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.bh-sidebar-visibility-toggle { display: flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 34px; padding: 0; border: 0; border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-sidebar-visibility-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-visibility-toggle:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-sidebar-visibility-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-row[data-dragging] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-order-row[data-drop-indicator]::before { content: ''; position: absolute; inset-inline: 24px 12px; top: -1px; height: 2px; background: var(--dsw-alias-state-business-primary); pointer-events: none; }
.bh-sidebar-editing .bh-channel-sidebar-entry-head { pointer-events: none; }
.bh-sidebar-editing .bh-sidebar-order-row { cursor: grab; user-select: none; touch-action: none; }
.bh-sidebar-editing .bh-sidebar-order-row[data-dragging] { cursor: grabbing; }
.bh-sidebar-order-row > .bh-channel-sidebar-entry { flex: 1; min-width: 0; }
.bh-sidebar-order-handle { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 34px; border: 0; border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-secondary); cursor: grab; }
.bh-sidebar-order-handle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-sidebar-order-handle:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-sidebar-editing .bh-channel-sidebar-entry-action-slot { display: none; }
.bh-sidebar-order-toolbar { padding: 8px 12px 12px; }
.bh-sidebar-order-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.bh-sidebar-order-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.bh-sidebar-order-actions button { border: 0; border-radius: var(--dsw-radius-md); padding: 4px 8px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.bh-sidebar-order-actions button:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-actions button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); }
.bh-sidebar-order-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.bh-memory-load-feedback {
  display: flex;
  align-items: center;
  gap: 8px;
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
.bh-memory-header-actions { display: flex; align-items: center; gap: 2px; }
.bh-memory-working-list { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
.bh-memory-change-group { min-width: 0; }
.bh-memory-change-heading { display: flex; align-items: center; gap: 5px; width: 100%; border: 0; border-radius: 6px; padding: 5px 3px; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; text-align: left; cursor: pointer; }
.bh-memory-change-heading:hover { background: var(--bh-hover); }
.bh-memory-change-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.bh-memory-change-rows { display: flex; flex-direction: column; gap: 2px; }
.bh-memory-change-rows .bh-memory-row { display: flex; align-items: center; gap: 7px; padding-left: 10px; }
.bh-memory-change-badge { flex: none; min-width: 20px; border-radius: 4px; padding: 1px 4px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-family: var(--bh-memory-font-code); font-size: 10px; font-weight: 600; text-align: center; }
.bh-memory-change-badge[data-status='new'], .bh-memory-change-badge[data-status='A'], .bh-memory-change-badge[data-status='U'] { color: var(--dsw-alias-state-success-primary); }
.bh-memory-change-badge[data-status='deleted'], .bh-memory-change-badge[data-status='D'] { color: var(--dsw-alias-state-error-primary); }
.bh-memory-change-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-file-tree { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bh-memory-tree-item { display: flex; align-items: center; min-width: 0; border-radius: 8px; }
.bh-memory-tree-item:hover { background: var(--bh-hover); }
.bh-memory-tree-item > .bh-memory-tree-row { flex: 1; }
.bh-memory-tree-more { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; padding: 0; margin-right: 4px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; opacity: 0; }
.bh-memory-tree-item:hover .bh-memory-tree-more, .bh-memory-tree-item:focus-within .bh-memory-tree-more { opacity: 1; }
.bh-memory-tree-more:hover { background: var(--bh-hover); }
@media (hover: none) { .bh-memory-tree-more { opacity: 1; } }
.bh-file-path-button { padding: 0; border: 0; border-radius: 4px; background: transparent; text-align: left; cursor: pointer; font: inherit; }
.bh-file-path-button:hover { text-decoration: underline; }
.bh-file-path-button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.bh-file-path-button.bh-workspace-folder-path { font-size: 12px; }
.bh-file-app-icon { width: 16px; height: 16px; object-fit: contain; }
.bh-file-action-feedback { font-size: 12px; }
.bh-memory-tree-directory { min-width: 0; }
.bh-memory-tree-group { margin-left: 9px; padding-left: 8px; border-left: 1px solid var(--dsw-alias-border-l2); }
.bh-memory-tree-row { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; border: 0; border-radius: 8px; padding: 5px 6px; background: transparent; color: var(--dsw-alias-label-primary); font-size: 12px; text-align: left; cursor: pointer; }
.bh-memory-tree-row:hover { background: var(--bh-hover); }
.bh-memory-tree-row.bh-memory-row-selected { background: var(--bh-selected); }
.bh-memory-tree-chevron-space { flex: none; width: 14px; }
.bh-memory-tree-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-tree-row:has(.bh-memory-standing) > .bh-memory-tree-name { flex: none; }
.bh-memory-standing { display: inline-flex; align-items: center; gap: 4px; min-width: 0; margin-left: auto; flex: 0 1 auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; }
.bh-memory-standing > :first-child { flex: none; }
.bh-memory-standing-usage { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-memory-standing-over .bh-memory-standing-usage { color: var(--dsw-alias-state-error-primary); }
.bh-memory-file-tree button:focus-visible, .bh-memory-working-list button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-memory-commit-view { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; color: var(--dsw-alias-label-primary); }
.bh-memory-commit-header { display: flex; align-items: center; gap: 10px; min-height: 52px; margin: 0 -12px 10px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-sidebar-fill); }
.bh-memory-view-icon-button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.bh-memory-view-icon-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.bh-memory-view-icon-button:focus-visible, .bh-memory-diff-file-header:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: -2px; }
.bh-memory-commit-header > .bh-memory-view-icon-button:last-child { margin-left: auto; }
.bh-memory-continue-form { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.bh-memory-continue-form label { color: var(--dsw-alias-label-secondary); }
.bh-memory-continue-form input { min-width: 180px; max-width: 320px; }
.bh-memory-commit-header div { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.bh-memory-commit-header strong { min-width: 0; overflow-wrap: anywhere; }
.bh-memory-commit-header span { font-family: var(--bh-memory-font-code); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bh-memory-commit-header .bh-memory-commit-title {
  flex: 0 1 auto;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  max-width: calc(100% - 96px);
  white-space: nowrap;
}
.bh-memory-graph-list > .bh-memory-continue-form { margin: 6px 0 10px 24px; }
.bh-topbar[data-memory-diff='true'] .bh-channel-island-wrap { display: none; }
.bh-memory-commit-title code { flex: none; font-family: var(--bh-memory-font-code); font-size: 12px; color: var(--dsw-alias-label-secondary); }
.bh-memory-commit-header .bh-memory-commit-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.bh-memory-commit-files-count { margin: 0 0 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 600; }
.bh-memory-diff-file { overflow: hidden; margin: 0 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--bh-memory-radius-card); background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.bh-memory-diff-file-header { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 12px; background: var(--dsw-specific-sidebar-fill); color: var(--dsw-alias-label-primary); cursor: pointer; list-style: none; }
.bh-memory-diff-file-header:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-memory-diff-file-header::-webkit-details-marker { display: none; }
.bh-memory-diff-file-header > svg { flex: none; color: var(--dsw-alias-label-tertiary); transition: transform 150ms; }
.bh-memory-diff-file:not([open]) .bh-memory-diff-file-header > svg { transform: rotate(-90deg); }
.bh-memory-diff-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--bh-memory-font-code); font-size: 12px; font-weight: 600; }
.bh-memory-diff-stat { display: inline-flex; align-items: center; flex: none; gap: 8px; margin-left: auto; font-family: var(--bh-memory-font-code); font-size: 11px; font-variant-numeric: tabular-nums; }
.bh-memory-diff-stat-add { color: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-stat-remove { color: var(--dsw-alias-state-error-primary); }
.bh-memory-diff-file[open] .bh-memory-diff-file-header { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.bh-memory-commit-code { overflow: auto; margin: 0 -12px; border-top: 1px solid var(--dsw-alias-border-l2); border-bottom: 1px solid var(--dsw-alias-border-l2); padding: 4px 0; font-family: var(--bh-memory-font-code); font-size: 13px; line-height: 1.5; white-space: pre; }
pre.bh-memory-commit-code { padding: 8px 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-memory-diff-scroll { overflow: auto; background: var(--dsw-alias-bg-base); }
.bh-memory-diff-table { width: 100%; min-width: max-content; border-collapse: separate; border-spacing: 0; font-family: var(--bh-memory-font-code); font-size: 12px; line-height: 20px; white-space: pre; }
.bh-memory-diff-table td { box-sizing: border-box; height: 24px; padding: 2px 0; vertical-align: top; }
.bh-memory-diff-number { width: 1%; min-width: 34px; padding: 2px 6px !important; color: var(--dsw-alias-label-tertiary); font-size: 11px; text-align: right; user-select: none; }
.bh-memory-diff-number:first-child { position: relative; padding-left: 9px !important; }
.bh-memory-diff-number:nth-child(2) { border-right: 1px solid var(--dsw-alias-border-l2); }
.bh-memory-diff-sign { width: 1%; min-width: 20px; padding: 2px 2px !important; color: var(--dsw-alias-label-tertiary); font-size: 11px; text-align: center; user-select: none; }
.bh-memory-diff-content { padding: 2px 16px 2px 4px !important; color: var(--dsw-alias-label-primary); }
.bh-memory-diff-hunk td, .bh-memory-diff-note td { padding: 4px 12px !important; color: var(--dsw-alias-label-secondary); }
.bh-memory-diff-hunk { background: color-mix(in srgb, var(--bh-accent) 6%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-note { font-style: italic; }
.bh-memory-diff-add { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-remove { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-base)); }
.bh-memory-diff-add .bh-memory-diff-number:nth-child(2), .bh-memory-diff-add .bh-memory-diff-sign { color: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-remove .bh-memory-diff-number:first-child, .bh-memory-diff-remove .bh-memory-diff-sign { color: var(--dsw-alias-state-error-primary); }
.bh-memory-diff-add .bh-memory-diff-number:first-child::before, .bh-memory-diff-remove .bh-memory-diff-number:first-child::before { position: absolute; top: 0; bottom: 0; left: 0; width: 3px; content: ''; }
.bh-memory-diff-add .bh-memory-diff-number:first-child::before { background: var(--dsw-alias-state-success-primary); }
.bh-memory-diff-remove .bh-memory-diff-number:first-child::before { background: repeating-linear-gradient(45deg, var(--dsw-alias-state-error-primary) 0 1.5px, transparent 1.5px 3px); }
.bh-memory-diff-empty { padding: 12px 14px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 12px; }

.bh-member-departure {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 520px);
  width: fit-content;
  margin: 6px auto;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
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
  margin: 6px auto;
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
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
  gap: 4px;
}
.bh-bot-dm-action-bot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.bh-bot-dm-action-avatar { display: inline-flex; pointer-events: none; }
.bh-memory-commit-row { container-type: inline-size; width: 100%; }
@container (max-width: 720px) {
  .bh-memory-commit-line > .bh-memory-commit-files { display: none; }
}
.bh-memory-commit-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  margin: 6px auto;
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.bh-memory-commit-line > * { flex: none; }
.bh-memory-commit-line:hover { color: var(--dsw-alias-label-primary); }
.bh-memory-commit-line:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
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
.bh-memory-commit-sha { font-family: var(--dsw-font-family-mono, monospace); font-size: 11px; }
.bh-memory-commit-files { color: var(--dsw-alias-label-tertiary); }
.bh-bot-dm-action-bot .bh-persona-avatar { border-radius: 28%; overflow: hidden; }
.bh-bot-dm-action-name { color: var(--dsw-alias-label-primary); font-weight: 500; }
.bh-bot-dm-readonly {
  padding: 14px 18px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
/* Human Inbox follows the native Bot mode inset and semantic theme aliases. */

nav:has(> .bh-panel-activity) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
nav:has(> .bh-panel-activity) > button { grid-column: 1; }
nav:has(> .bh-panel-activity[data-wide='true']) > button:has(.bh-panel-glyph) { padding-right: 112px; }
.bh-panel-activity {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  gap: 4px;
  min-height: 26px;
  margin-right: 38px;
  padding: 3px 6px;
  border: 1px solid var(--bh-overview-border);
  border-radius: var(--bh-overview-radius-control);
  color: var(--bh-overview-muted);
  background: var(--bh-overview-bg);
  cursor: pointer;
}
.bh-panel-activity[data-wide='true'][data-unread='false'] { opacity: 0; pointer-events: none; }
button:has(.bh-panel-glyph):is(:hover, :focus-within) ~ .bh-panel-activity[data-wide='true'][data-unread='false'][data-active='true'],
.bh-panel-activity[data-wide='true'][data-unread='false'][data-active='true']:is(:hover, :focus-visible) { opacity: 1; pointer-events: auto; }
.bh-panel-activity:hover { background: var(--bh-hover); color: var(--bh-overview-label); }
.bh-panel-activity[aria-current='page'] { background: var(--bh-selected); color: var(--bh-overview-label); }
.bh-panel-activity:focus-visible { outline: 2px solid var(--bh-overview-label); outline-offset: 2px; }
.bh-human-inbox-count {
  flex: none;
  min-width: 14px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--bh-overview-label);
}
.bh-human-inbox-notification-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bh-entry-notification);
}
.bh-panel-activity[data-wide='false'] {
  justify-self: start;
  width: 36px;
  height: 36px;
  min-height: 36px;
  margin: -8px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--bh-entry-radius-rail);
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
  font-size: 24px;
  font-weight: 600;
}
.bh-human-inbox-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l3);
  margin-bottom: 20px;
}
.bh-human-inbox-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 9px 12px;
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
  gap: 12px;
  margin: 0 0 16px;
}
.bh-human-inbox-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
  max-width: 240px;
  color: var(--dsw-alias-label-secondary);
  font-size: inherit;
}
.bh-human-inbox-selector {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
}
.bh-human-inbox-selector > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-human-inbox-selector > svg { flex-shrink: 0; }
.bh-human-inbox-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  min-height: 76px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l3);
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
  outline: 2px solid var(--bh-accent);
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
  padding: 3px;
  border: 0;
  border-radius: var(--bh-inbox-radius-control);
  background: var(--bh-inbox-primary-fill);
  color: var(--bh-inbox-primary-label);
  cursor: pointer;
}
.bh-human-inbox-source-link:hover { background: var(--bh-inbox-primary-hover); }
.bh-human-inbox-source-link:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-human-inbox-source-arrow {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  border-radius: var(--bh-inbox-radius-control);
  background: var(--bh-inbox-primary-fill);
}
.bh-human-inbox-channel-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  border-radius: var(--bh-inbox-radius-control);
}
.bh-human-inbox-channel-avatar img { width: 100%; height: 100%; object-fit: cover; }
.bh-human-inbox-reply {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--bh-inbox-radius-panel);
}
.bh-human-inbox-reply-header,
.bh-human-inbox-reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bh-human-inbox-reply-header h2 {
  margin: 0;
  font-size: inherit;
  font-weight: 600;
}
.bh-human-inbox-reply p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 6px 0;
}
.bh-human-inbox-purpose {
  font-size: inherit;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.bh-human-inbox-purpose.is-collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.bh-human-inbox-reply-context {
  margin: 12px 0;
}
.bh-human-inbox-message {
  position: relative;  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l3);
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
  border-radius: var(--bh-inbox-radius-control);
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-human-inbox-message-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.bh-human-inbox-message time {
  color: var(--dsw-alias-label-secondary);
  font-size: inherit;
}
.bh-human-inbox-message-target {
  display: inline-block;
  margin: 4px 0 0;
  padding: 2px 5px;
  border-radius: var(--bh-inbox-radius-control);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--bh-accent);
  font-size: inherit;
}
.bh-human-inbox-reply-source {
  border-left: 2px solid var(--bh-accent);
  background: var(--dsw-alias-bg-layer-1);
}
.bh-human-inbox-message blockquote {
  margin: 8px 0;
  padding-left: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.bh-human-inbox-reply form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bh-human-inbox-reply textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--bh-inbox-radius-control);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  line-height: 1.5;
}
.bh-human-inbox-reply-actions {
  justify-content: flex-end;
  margin-top: 8px;
  flex-wrap: wrap;
}
.bh-human-inbox-reply textarea:focus-visible,
.bh-human-inbox-reply button:focus-visible {
  outline: 2px solid var(--bh-accent);
  outline-offset: 2px;
}
.bh-human-inbox-row-title {
  position: relative;
  pointer-events: none;
  grid-column: 1 / -1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.bh-human-inbox-row-summary {
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.bh-human-inbox-unread-meta {
  margin-top: 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-human-inbox-unread-meta summary {
  margin-top: 8px;
  cursor: pointer;
}
.bh-human-inbox-row-actions {
  align-items: center;
  justify-content: flex-end;
  position: relative;
  display: flex;
  flex: none;
  gap: 6px;
  flex-wrap: wrap;
}
.bh-human-inbox-more {
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  cursor: pointer;
}
.bh-human-inbox-more:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-options{position:absolute;right:12px;top:11px;pointer-events:auto}
.bh-chat-layout[data-sidebar='hidden'] .bh-channel-options{right:44px}
.bh-chat-layout[data-sidebar='hidden'] .bh-topbar{padding-right:84px}
.bh-human-nickname-dialog p{margin:0}
.bh-messaging-defaults{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.bh-messaging-defaults p{margin:0}
.bh-platform-defaults{display:flex;flex-direction:column;gap:12px}
.bh-default-platform{display:flex;align-items:center;gap:12px}
.bh-messaging-defaults input{width:56px}
.bh-messaging-defaults .bh-source-policy-table{table-layout:auto;min-width:0;width:100%;font-size:12px}
.bh-messaging-defaults .bh-source-policy-table th,.bh-messaging-defaults .bh-source-policy-table td{width:auto;padding:10px 6px;text-align:left;vertical-align:middle}
.bh-messaging-defaults .bh-source-policy-table th:first-child{padding-left:0;white-space:nowrap}
.bh-messaging-defaults .bh-source-policy-table td:last-child{padding-right:0}
.bh-messaging-defaults select{max-width:150px;width:100%}
.bh-default-threshold{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:4px 0}
.bh-default-threshold span{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.bh-messaging-defaults input,.bh-messaging-defaults select{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px}
.bh-human-name-setting{display:flex;flex-direction:column;gap:10px;margin-top:20px}
.bh-human-name-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bh-human-name-controls>div:first-child{flex:1 1 220px;min-width:0}
.bh-human-name-setting p{margin:0}
.bh-activity-center { display:flex;flex-direction:column;overflow:hidden; }
.bh-activity-center-header {padding:20px 24px 0; flex-shrink:0;}
.bh-activity-center-header h1 {margin:0 0 16px;font-size:calc(var(--bh-overview-font) + 6px);line-height:1.4;}
.bh-activity-center > .bh-human-inbox {min-height:0;flex:1;}
.bh-overview {padding:16px 24px 24px;overflow-y:auto;min-height:0;}
.bh-overview-toolbar {display:flex;flex-wrap:wrap;justify-content:flex-start;align-items:center;gap:12px;margin-bottom:16px;}
.bh-overview-bot-header,.bh-overview-session {color:var(--bh-overview-label);font:inherit;cursor:pointer;}
.bh-overview-bot-header:hover,.bh-overview-session:hover {background:var(--bh-hover);}
.bh-overview button:focus-visible {outline:2px solid var(--bh-accent);outline-offset:2px;}
.bh-overview-action-count {display:flex;align-items:center;gap:8px;}
.bh-overview-action-count strong {font-variant-numeric:tabular-nums;}
.bh-overview-refresh {margin-left:auto;padding:6px 12px;border:1px solid var(--bh-overview-border);border-radius:var(--bh-overview-radius-control);background:transparent;}
.bh-overview-bots {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px;}
.bh-overview-bot {min-width:0;border:1px solid var(--bh-overview-border);border-radius:var(--bh-overview-radius-card);overflow:hidden;}
.bh-overview-bot-header {width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border:0;background:transparent;}
.bh-overview-bot-name {min-width:0;overflow-wrap:anywhere;flex:1;font-weight:600;}
.bh-overview-bot-state,.bh-overview-session-state {color:var(--bh-overview-muted);font-size:var(--bh-overview-font);flex-shrink:0;}
.bh-overview-bot h2 {margin:0;padding:8px 12px;font-size:var(--bh-overview-font);line-height:18px;font-weight:500;color:var(--bh-overview-muted);border-top:1px solid var(--bh-overview-border);}
.bh-overview-bot h2 span {margin-left:6px;font-variant-numeric:tabular-nums;}
.bh-overview-idle {margin:0;padding:4px 12px 12px;font-size:var(--bh-overview-font);color:var(--bh-overview-subtle);}
.bh-overview-bot ul {list-style:none;margin:0;padding:0 4px 4px;}
.bh-overview-bot li button,.bh-composer-activity-source {display:flex;align-items:center;gap:8px;text-align:left;width:100%;min-height:40px;padding:8px;border:1px solid var(--bh-overview-border);background:var(--bh-overview-bg);border-radius:var(--bh-overview-radius-control);}
.bh-session-role-icon {font-size:var(--bh-overview-font);color:var(--bh-overview-muted);}
.bh-overview-session-purpose {flex:1;min-width:0;overflow-wrap:anywhere;font-size:var(--bh-overview-font);}
@media(max-width:720px){.bh-activity-center-header{padding:16px 16px 0}.bh-overview{padding:12px 16px 16px}.bh-overview-toolbar{flex-wrap:wrap}}

.bh-overview-session-purpose {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bh-overview-bot ul {display:flex;flex-direction:column;gap:4px;padding:0 8px 8px;}
.bh-session-role-icon {display:flex;align-items:center;flex-shrink:0;}
.bh-overview-actions {padding:0;overflow:visible;}
.bh-overview-actions .bh-human-inbox-inner {width:100%;margin:0;}
.bh-overview-actions .bh-human-inbox-row {min-height:64px;padding:10px 12px;}
.bh-overview-actions .bh-human-inbox-row-actions {margin-left:auto;}
.bh-overview-actions .bh-human-inbox-row-title {font-weight:500;}
.bh-overview-actions .bh-human-inbox-row:last-child {border-bottom:0;}
.bh-overview-actions .bh-human-inbox-more {margin:8px 12px;}
.bh-overview-actions p[role] {padding:0 12px;}
.bh-overview-bots {align-items:start;}

.bh-human-inbox-context-window { margin-top: 12px; }
.bh-human-inbox-context-edge { display: flex; align-items: center; justify-content: center; width: 100%; height: 28px; padding: 0; border: 1px solid var(--bh-inbox-divider); background: var(--bh-inbox-surface); color: var(--bh-inbox-muted); cursor: pointer; }
.bh-human-inbox-context-edge:not(:disabled):hover { background: var(--bh-hover); }
.bh-human-inbox-context-edge:disabled { opacity: .4; cursor: default; }
.bh-human-inbox-context-older svg { transform: rotate(180deg); }
.bh-human-inbox-message-source { position: absolute; right: 8px; top: 8px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--bh-inbox-border); border-radius: var(--bh-inbox-radius-control); background: var(--bh-inbox-base); color: var(--bh-inbox-label); opacity: 0; pointer-events: none; cursor: pointer; }
.bh-human-inbox-message:hover .bh-human-inbox-message-source, .bh-human-inbox-message:focus-within .bh-human-inbox-message-source, .bh-human-inbox-message-source:focus-visible { opacity: 1; pointer-events: auto; }
.bh-human-inbox-message-heading { padding-right: 24px; }
.bh-human-inbox-dismiss { display: flex; align-items: center; gap: 6px; }
@media (hover: none) { .bh-human-inbox-message-source { opacity: 1; pointer-events: auto; } }


.bh-channel-activity {margin-top:24px;color:var(--bh-overview-label);font-size:var(--bh-overview-font);}
.bh-channel-activity header {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.bh-channel-activity h2 {font-size:var(--bh-overview-font);margin:0;font-weight:600;}
.bh-channel-activity p {margin:8px 0;color:var(--bh-overview-muted);}
.bh-channel-activity ul {list-style:none;margin:0;padding:0;}
.bh-channel-activity > ul > li {border-bottom:1px solid var(--bh-overview-border);}
.bh-channel-activity-legend {display:flex;gap:16px;margin:12px 0;color:var(--bh-overview-muted);}
.bh-channel-activity-legend span {display:flex;align-items:center;gap:6px;}
.bh-channel-activity-legend i {width:8px;height:8px;border-radius:var(--bh-overview-radius-control);}
.bh-channel-activity-human {background:var(--bh-accent);}
.bh-channel-activity-bot {background:var(--bh-chart-output);}
.bh-channel-activity-other {background:var(--bh-overview-subtle);}
.bh-channel-activity-row {display:flex;align-items:center;gap:8px;padding:8px 0;}
.bh-channel-activity-toggle {border:0;border-radius:var(--bh-overview-radius-control);background:transparent;display:flex;align-items:center;gap:12px;min-width:0;flex:1;min-height:40px;padding:8px;text-align:left;font:inherit;color:inherit;cursor:pointer;}
.bh-channel-activity-toggle:hover {background:var(--bh-hover);}
.bh-channel-activity-name {width:160px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-channel-activity-chart {display:flex;flex:1;min-width:24px;height:12px;overflow:hidden;border-radius:var(--bh-overview-radius-control);}
.bh-channel-activity-chart i {height:100%;}
.bh-channel-activity strong {font-variant-numeric:tabular-nums;}
.bh-channel-activity-toggle strong {min-width:36px;text-align:right;}
.bh-channel-activity-closed {transform:rotate(-90deg);}
.bh-channel-activity-senders {padding:0 16px 12px 36px;}
.bh-channel-activity-senders li {display:flex;align-items:center;gap:12px;padding:6px 0;}
.bh-channel-activity-senders li > span:first-child {min-width:0;flex:1;overflow-wrap:anywhere;}
.bh-channel-activity-kind {color:var(--bh-overview-muted);}
@media(max-width:720px){.bh-channel-activity-name{width:100px}.bh-channel-activity-toggle{gap:6px}}

.bh-overview-unread {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;margin-bottom:16px;border-bottom:1px solid var(--bh-overview-border);}
.bh-overview-unread p {margin:4px 0 0;color:var(--bh-overview-muted);font-size:var(--bh-overview-font);}
.bh-overview-unread strong {font-variant-numeric:tabular-nums;}
.bh-overview-work-heading {font-size:var(--bh-overview-font);margin:0 0 12px;color:var(--bh-overview-muted);font-weight:500;}
.bh-statistics-toggle {display:flex;align-items:center;gap:8px;background:transparent;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;}
.bh-statistics-toggle:hover {color:var(--bh-accent);}
.bh-channel-activity-name {flex:1;width:auto;}
.bh-channel-statistics-chart {width:100%;min-width:0;}
.bh-channel-activity {margin-top:24px;padding-top:16px;border-top:1px solid var(--bh-overview-border);}
.bh-statistics-content[hidden] {display:none;}
@media(max-width:480px){.bh-overview-unread{align-items:flex-start;flex-direction:column}.bh-overview-toolbar{gap:8px}}

.bh-overview-memory {margin-top:12px;min-width:0;}
.bh-overview-memory h3 {margin:0;font-weight:400;}
.bh-overview-memory .bh-note {margin:0;}
.bh-overview-memory-range {display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-tertiary);}
.bh-overview-memory-bots {list-style:none;margin:0;padding:0;}
.bh-overview-memory-bots > li {display:flex;align-items:center;gap:12px;min-height:42px;padding:4px 0;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;}
.bh-overview-memory-name {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-memory-bots strong {font-variant-numeric:tabular-nums;white-space:nowrap;}
.bh-overview-memory-bots strong > span {font-weight:400;color:var(--dsw-alias-label-secondary);}
.bh-overview-memory-trend {width:126px;flex-shrink:0;}
.bh-overview-memory-dirty {color:var(--dsw-alias-state-warn-primary);}
.bh-overview-memory-unavailable {color:var(--dsw-alias-label-secondary);}
.bh-overview-memory .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--dsw-alias-label-secondary);}
.bh-overview-memory .bh-profile-pin:disabled {opacity:0.5;cursor:default;}
.bh-overview-memory .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
@media (max-width:700px) {.bh-overview-memory-bots > li {flex-wrap:wrap;gap:6px;}.bh-overview-memory-trend {width:84px;}.bh-overview-memory-name {flex-basis:calc(100% - 36px);}.bh-overview-memory-bots .bh-profile-pin {margin-left:auto;}}
.bh-overview-usage {margin-top:12px;min-width:0;}
.bh-overview-usage h3 {margin:0;font-weight:400;}
.bh-overview-usage .bh-profile-card-head {flex-wrap:wrap;}
.bh-overview-usage-controls {display:flex;align-items:center;gap:8px;}
.bh-overview-usage .bh-note {margin:0;}
.bh-overview-usage-period {padding:0;}
.bh-overview-usage .bh-usage-model-label {gap:6px;}
.bh-overview-usage-bot-name {flex:1;}
.bh-overview-usage-bot-name > span {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-overview-usage-bot-name > span + span {color:var(--bh-overview-muted);}
.bh-overview-usage .bh-profile-pin {flex-shrink:0;cursor:pointer;color:var(--bh-overview-muted);}
.bh-overview-usage .bh-profile-pin:hover {background:var(--bh-hover);color:var(--bh-text);}
.bh-overview-usage .bh-profile-pin:disabled {cursor:default;opacity:0.5;}
.bh-statistics-content > header h3 {font-size:var(--bh-overview-font);margin:0;}
.bh-release-dialog {
  width: min(680px, calc(100vw - 32px));
}
.bh-telemetry-dialog {
  width: min(560px, calc(100vw - 32px));
}
.bh-telemetry-notice {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  min-width: 0;
}
.bh-telemetry-notice-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}
.bh-telemetry-notice-row > dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 22px;
}
.bh-telemetry-notice-row > dd {
  margin: 0;
  min-width: 0;
}
@media (max-width: 520px) {
  .bh-telemetry-notice-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
.bh-release-notes {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  gap: 8px;
  padding: 8px 0;
  cursor: pointer;
  list-style: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}
.bh-release-note-head::-webkit-details-marker {
  display: none;
}
.bh-release-note-head::before {
  content: '';
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 2px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
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
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
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
  gap: 10px;
  padding: 2px 0 12px 18px;
}
.bh-release-note-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}
.bh-release-note-entries {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px 10px;
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
  margin-top: 2px;
  white-space: nowrap;
}
.bh-release-note-text {
  min-width: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.bh-release-site-button {
  margin-right: auto;
}
.bh-release-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.bh-release-update {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 4px;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.bh-release-update-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bh-release-update-title {
  margin-right: auto;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.bh-release-restart-hint {
  margin-right: auto;
}
.bh-release-command {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.bh-release-command code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-module-platform);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: 12px;
  white-space: nowrap;
}
.bh-release-install-error {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
}
.bh-release-install-diagnostic {
  max-height: 120px;
  margin: 0;
  overflow: auto;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: 12px;
  white-space: pre-wrap;
}
.bh-schedules {display:flex;flex-direction:column;gap:8px;min-width:0;}
.bh-schedule-muted,
.bh-schedule-firing-time {color:var(--dsw-alias-label-secondary);font-size:12px;}
.bh-schedule-muted {margin:0;}
.bh-schedule-empty {display:flex;flex-direction:column;align-items:flex-start;gap:8px;}
.bh-schedule-error {margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;}
.bh-schedule-warning {margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:12px;}
.bh-schedule-modal {width:min(480px, calc(100vw - 32px));}
.bh-schedule-form {display:flex;flex-direction:column;gap:12px;}
.bh-schedule-field {display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px;}
.bh-schedule-field > span {color:var(--dsw-alias-label-secondary);}
.bh-schedule-field textarea {min-height:88px;padding:8px 10px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;}
.bh-schedule-field textarea:focus-visible {outline:2px solid var(--dsw-alias-label-primary);outline-offset:-1px;}
.bh-schedule-row {display:flex;gap:8px;}
.bh-schedule-row > .bh-schedule-field {flex:1;}
.bh-schedule-zone {flex:2;}
.bh-schedule-history {display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);}
.bh-schedule-history h4 {margin:0;font-size:13px;font-weight:500;}
.bh-schedule-history ol {display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;max-height:200px;overflow:auto;}
.bh-schedule-firing {display:flex;align-items:center;gap:6px;min-width:0;}
.bh-schedule-firing-time {flex:1;min-width:0;}
.bh-schedule-link {padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;text-decoration:underline;cursor:pointer;}
.bh-schedule-modal-footer {display:flex;align-items:center;gap:8px;width:100%;}
.bh-schedule-modal-spacer {flex:1;}
.bh-card-list {display:flex;flex-direction:column;margin:0;padding:0;list-style:none;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;}
.bh-card-list + .bh-card-list {margin-top:8px;}
.bh-card-list.bh-message-card-list {background:var(--dsw-alias-bg-base);}
.bh-message-card-list .bh-card-title {white-space:normal;overflow-wrap:anywhere;}
.bh-message-card-list .bh-card-main {min-height:40px;align-items:center;}
.bh-message-card-list .bh-card-row[data-selected="true"] {background:color-mix(in srgb,var(--bh-accent) 12%,var(--dsw-alias-bg-base));box-shadow:inset 3px 0 var(--bh-accent);}
.bh-message-card-list .bh-card-row:has(.bh-card-main:disabled),
.bh-message-card-list .bh-card-row:has(.bh-card-checkbox:disabled) {opacity:.6;}
.bh-card-checkbox {flex:none;width:16px;height:16px;margin:0;accent-color:var(--bh-accent);cursor:pointer;}
.bh-card-checkbox:focus-visible {outline:2px solid var(--bh-accent);outline-offset:2px;}
.bh-card-checkbox:disabled {cursor:default;}
label.bh-card-main {cursor:pointer;}
label.bh-card-main:has(.bh-card-checkbox:disabled) {cursor:default;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > label.bh-card-main > .bh-card-checkbox:not(:disabled)):hover {background:var(--dsw-alias-interactive-bg-hover);}

.bh-card-row {min-width:0;}
.bh-card-row + .bh-card-row {border-top:1px solid var(--dsw-alias-border-l2);}
.bh-card-line {display:flex;align-items:center;gap:8px;min-width:0;}
.bh-card-row:not([data-selected="true"]):has(> .bh-card-line > button.bh-card-main:not(:disabled):hover) {background:var(--dsw-alias-interactive-bg-hover);}
.bh-card-main {display:flex;flex:1;align-items:flex-start;gap:8px;min-width:0;margin:0;padding:9px 10px;border:0;border-radius:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;}
button.bh-card-main {cursor:pointer;}
button.bh-card-main:disabled {cursor:default;}
.bh-card-main:focus-visible {outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px;}
.bh-card-icon {display:grid;flex:none;place-items:center;padding-top:1px;color:var(--dsw-alias-label-primary);}
.bh-card-body {display:flex;flex:1;flex-direction:column;gap:4px;min-width:0;}
.bh-card-title {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;}
.bh-card-title.bh-inbox-item-summary {display:-webkit-box;white-space:normal;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3;}
.bh-card-chips {display:flex;flex-wrap:wrap;align-items:center;gap:4px;}
.bh-card-glyph {display:inline-grid;place-items:center;color:var(--dsw-alias-label-secondary);}
.bh-card-meta {display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;overflow-wrap:anywhere;}
.bh-card-meta-line {flex-basis:100%;}
.bh-card-trailing {display:flex;flex:none;align-items:center;gap:4px;padding-right:10px;color:var(--dsw-alias-label-secondary);}
.bh-card-detail {padding:0 10px 10px 34px;}
.bh-card-row[data-muted="true"] .bh-card-icon,
.bh-card-row[data-muted="true"] .bh-card-title {color:var(--dsw-alias-label-secondary);}
.bh-card-trailing .bh-workspace-folder-remove {width:28px;height:28px;border-radius:6px;}
.bh-assignment-access-card .bh-card-title {white-space:normal;}
.bh-inbox-group .bh-card-list {margin:0 0 4px;}
.bh-session-workspace-group > .bh-card-list {margin:2px 0 6px;}
.bh-card-detail > .bh-workspace-folder-detail {padding:0;}
.bh-inbox-group {border-top:0;padding:2px 0;}
.bh-card-action {display:inline-grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.bh-card-action:hover:not(:disabled) {background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.bh-card-action:focus-visible {outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px;}
.bh-card-action:disabled {cursor:default;}
.bh-schedule-lock-toggle:not([data-locked]) {opacity:.55;}
.bh-schedule-switch {display:inline-flex;}
.bh-schedule-weekdays {display:flex;gap:4px;flex-wrap:wrap;}
.bh-schedule-weekday {flex:1;min-width:40px;padding:6px 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;}
.bh-schedule-weekday:hover {background:var(--dsw-alias-interactive-bg-hover);}
.bh-schedule-weekday[aria-pressed="true"] {border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);}
.bh-schedule-weekday:focus-visible {outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px;}
.bh-schedule-cron input, input.bh-schedule-cron {font-family:var(--dsw-font-family-mono, monospace);}
.bh-schedule-field small {font-size:12px;}
.bh-schedule-preview {display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);font-size:12px;}
.bh-schedule-preview-label {color:var(--dsw-alias-label-secondary);}
.bh-schedule-preview ol {display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}
.bh-channel-history-dialog.bh-channel-history-dialog { width: min(760px, 100%); max-height: 100%; }
.bh-channel-history { min-height: 0; overflow-y: auto; overscroll-behavior: contain; font-size: 13px; line-height: 20px; }
.bh-channel-history-toolbar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.bh-channel-history-toolbar > :first-child { flex: 1; min-width: 0; }
.bh-channel-history-toolbar h3, .bh-channel-history-toolbar p { margin-block: 8px; }
.bh-channel-history-hint { color: var(--dsw-alias-label-secondary); }
.bh-channel-history-status { padding-block: 8px; }
.bh-channel-history-placements { display: flex; flex-direction: column; gap: 4px; }
.bh-channel-history-selected { padding-inline-start: 20px; }
.bh-channel-history-sources { display: flex; flex-direction: column; gap: 12px; }
.bh-channel-history-source { display: flex; align-items: start; gap: 8px; padding-block: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.bh-channel-history-source > label { display: flex; align-items: start; gap: 8px; flex: 1; min-width: 0; cursor: pointer; }
.bh-channel-history-source > label > span { min-width: 0; overflow-wrap: anywhere; }
.bh-channel-history-body { display: block; white-space: pre-wrap; }
.bh-channel-history small { color: var(--dsw-alias-label-secondary); }
.bh-channel-history li { overflow-wrap: anywhere; }
.bh-schedule-lock-toggle[data-locked] {color:var(--dsw-alias-label-primary);}
.bh-schedule-lock {display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;}
.bh-schedule-lock .bh-card-title {white-space:normal;}
`;
