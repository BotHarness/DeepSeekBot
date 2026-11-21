import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import { DEEPSEEKBOT_TRANSPARENT_DATA_URI } from './bot-icon-assets.js';
import { font } from './ds/tobs.stylex.js';

export const SHELL_AND_ROSTER_CSS =
  `
@property --bh-composer-overlay {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

.bh-selection-bar { display: flex; align-items: center; justify-content: space-between; gap: ${space.x4}; margin: 0 ${space.x5} ${space.x5}; padding: ${space.x3} ${space.x4} ${space.x3} ${space.x5}; border-radius: ${radius.md}; background: var(--tobs-layer-raised); color: var(--tobs-ink-primary); }
.bh-selection-count { min-width: 0; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; font-weight: ${text.strong}; font-variant-numeric: tabular-nums; }
.bh-selection-export { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-snapshot { position: fixed; left: -100000px; top: 0; display: flex; flex-direction: column; gap: ${space.x4}; padding: 20px ${space.x6} ${space.x6}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); pointer-events: none; }
.bh-snapshot-header { display: flex; flex-direction: column; gap: ${space.x1}; padding-bottom: ${space.x4}; border-bottom: ${border.hairline} solid ${color.divider}; }
.bh-snapshot-header strong { font-size: ${text.titleSize}; line-height: ${text.bodyLine}; font-weight: ${text.strong}; }
.bh-snapshot-header span { font-size: ${text.metaSize}; line-height: ${text.metaLine}; color: var(--tobs-ink-secondary); }
.bh-snapshot-body { display: flex; flex-direction: column; gap: ${space.x4}; }
.bh-selection-actions { display: flex; flex: none; gap: ${space.x3}; font-size: ${text.titleSize}; line-height: normal; }
.bh-message-group:has(.bh-bubble-selecting) { position: relative; padding-left: 32px; }
.bh-bubble-wrap.bh-bubble-selecting { position: static; cursor: pointer; user-select: none; }
.bh-bubble-wrap.bh-bubble-selecting:focus-visible { outline: none; }
.bh-bubble-wrap.bh-bubble-selecting:focus-visible .bh-bubble { outline: ${border.focus} solid var(--bh-accent); outline-offset: ${space.x1}; }
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-surface { pointer-events: none; }
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-side { display: none; }
.bh-bubble-check { position: absolute; left: 4px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-bottom: ${space.x3}; border-radius: ${radius.round}; border: ${border.hairline} solid ${color.borderStrong}; background: var(--tobs-layer-canvas); color: var(--tobs-accent-on-solid); }
.bh-bubble-check[data-checked="true"] { border-color: var(--bh-accent); background: var(--bh-accent); }
.bh-composer-recovery { min-width: 0; }
.bh-composer-recovery > p, .bh-composer-recovery section > p { margin: ${space.x2} 0; font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
.bh-composer-draft-version { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x3}; padding: ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; }
.bh-composer-draft-version pre { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 100px; overflow-y: auto; }
.bh-composer-recovery > p button, .bh-composer-draft-version button { color: var(--tobs-ink-primary); background: var(--tobs-layer-canvas); border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; padding: ${space.x2} ${space.x3}; cursor: pointer; }
.bh-composer-recovery > p button:hover, .bh-composer-draft-version button:hover { background: var(--bh-hover); }
.bh-composer-recovery > p button:focus-visible, .bh-composer-draft-version button:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: ${space.x1}; }
:root {
  --bh-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
.bh-root {
  --bh-chat-card-inset: ${space.x4};
  /* @bh-brand-aliases:start — thin BotHarness brand map onto DSH semantic
     tokens (ADR-0028): at most three entries, no second design system. */
  --bh-accent: var(--tobs-accent-solid);
  --bh-hover: var(--tobs-state-hover);
  --bh-selected: var(--tobs-state-selected);
  /* @bh-brand-aliases:end */
  --bh-surface-selected: color-mix(in srgb, ${color.fg} 8%, ${color.surface});
  --bh-surface-pressed: color-mix(in srgb, ${color.fg} 13%, ${color.surface});
  --bh-surface-danger: color-mix(in srgb, ${color.danger} 10%, ${color.surface});
  --bh-on-surface-danger: color-mix(in srgb, ${color.danger} 65%, ${color.fg});
  --bh-well-inset: color-mix(in srgb, ${color.fg} 7%, ${color.well});
  /* @bh-profile-chart-aliases:start — the pinned DSH theme has no categorical
     chart palette; read shades derive from the brand accent and output uses a
     state token so both series stay distinguishable in either theme. */
  --bh-chart-output: var(--tobs-status-warning-base);
  --bh-chart-read-dim: color-mix(in srgb, var(--bh-accent) 38%, transparent);
  /* @bh-profile-chart-aliases:end */
  font: ${text.bodySize}/1.5 ${font.familySans};
  color: var(--tobs-ink-primary);
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

.bh-onboarding-notice { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 1000; display: flex; align-items: center; gap: ${space.x3}; max-width: min(560px, calc(100vw - 32px)); padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--tobs-layer-canvas); box-shadow: 0 8px 24px color-mix(in srgb, var(--tobs-ink-primary) 12%, transparent); }
.bh-onboarding-notice-text { min-width: 0; overflow-wrap: anywhere; }
/* Onboarding launcher: a progress ring in the Bot-mode row's action group (no row
   of its own). Like Activity and gear it appears only on hover, while its
   checklist is open, or while the walkthrough highlights the row. */
.bh-onboarding-launcher { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: ${radius.sm}; color: var(--tobs-ink-secondary); cursor: pointer; transition: opacity 120ms var(--ds-ease-in-out), background 120ms var(--ds-ease-in-out); }
.bh-onboarding-launcher[data-bh-onboarding-launcher='row']:not([data-open='true']) { opacity: 0; pointer-events: none; }
button:has(.bh-panel-glyph):is(:hover, :focus-within, .driver-active-element) .bh-onboarding-launcher[data-bh-onboarding-launcher='row'] { opacity: 1; pointer-events: auto; }
.bh-onboarding-launcher:hover, .bh-onboarding-launcher[data-open='true'] { background: var(--tobs-state-hover); }
.bh-onboarding-launcher:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 1px; }
.bh-onboarding-launcher[data-bh-onboarding-launcher='header'] { width: 36px; height: 36px; border-radius: ${radius.md}; }
.bh-onboarding-launcher[data-bh-onboarding-launcher='header'][data-settled='true'] { display: none; }
.bh-onboarding-ring circle { fill: none; stroke-width: 2; }
.bh-onboarding-ring-track { stroke: var(--tobs-line-edge); }
.bh-onboarding-ring-value { stroke: var(--tobs-accent-solid); stroke-linecap: round; transition: stroke-dashoffset 240ms var(--ds-ease-in-out); }
.bh-onboarding-enter { display: inline-flex; align-items: center; gap: ${space.x2}; margin-left: ${space.x2}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; color: var(--tobs-accent-solid); pointer-events: none; }
.bh-onboarding-enter-dot { width: 6px; height: 6px; border-radius: ${radius.round}; background: currentColor; animation: bh-onboarding-pulse 1.6s ease-in-out infinite; }
@keyframes bh-onboarding-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 45%, transparent); } 50% { box-shadow: 0 0 0 4px transparent; } }
html[data-botharness-motion='reduce'] .bh-onboarding-enter-dot { animation: none; }
.bh-onboarding-checklist { position: fixed; z-index: 1000; display: grid; gap: ${space.x4}; width: 340px; max-height: calc(100vh - 24px); overflow: auto; padding: ${space.x5}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); box-shadow: 0 12px 32px color-mix(in srgb, var(--tobs-ink-primary) 14%, transparent); line-height: ${text.bodyLine}; }
.bh-onboarding-checklist[data-placement='sheet'] { left: 12px; right: 12px; bottom: 12px; width: auto; max-height: calc(100vh - 96px); }
.bh-onboarding-checklist-header { display: flex; align-items: flex-start; justify-content: space-between; gap: ${space.x3}; }
.bh-onboarding-checklist-heading { display: grid; gap: ${space.x1}; min-width: 0; }
.bh-onboarding-checklist-heading strong { font-size: ${text.titleSize}; }
.bh-onboarding-checklist-close { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: ${radius.sm}; color: var(--tobs-ink-secondary); background: transparent; cursor: pointer; }
.bh-onboarding-checklist-close:hover { background: var(--bh-hover); }
.bh-onboarding-checklist-progress { height: 4px; border-radius: ${radius.xs}; background: var(--tobs-line-edge); overflow: hidden; }
.bh-onboarding-checklist-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--bh-accent); transition: width 240ms var(--ds-ease-in-out); }
.bh-onboarding-checklist-tier { display: grid; gap: ${space.x2}; }
.bh-onboarding-checklist-tier h3 { margin: 0; font-size: ${text.metaSize}; font-weight: ${text.strong}; line-height: ${text.metaLine}; color: var(--tobs-ink-secondary); }
.bh-onboarding-checklist-tier ul { display: grid; margin: 0; padding: 0; list-style: none; }
.bh-onboarding-checklist-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: ${space.x3}; padding: ${space.x3} 0; }
.bh-onboarding-checklist-item + .bh-onboarding-checklist-item { border-top: ${border.hairline} solid ${color.divider}; }
.bh-onboarding-checklist-mark { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; }
.bh-onboarding-checklist-item[data-state='done'] .bh-onboarding-checklist-mark { border-color: var(--bh-accent); background: var(--bh-accent); color: var(--tobs-layer-canvas); }
.bh-onboarding-checklist-item[data-state='done'] .bh-onboarding-checklist-name { color: var(--tobs-ink-secondary); }
.bh-onboarding-checklist-item[data-state='locked'] { opacity: 0.6; }
.bh-onboarding-checklist-text { display: grid; gap: ${space.x1}; min-width: 0; }
.bh-onboarding-checklist-text .bh-note { font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-onboarding-checklist-status { font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
.bh-onboarding-checklist-exit { margin: 0; font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-onboarding-checklist-footer { display: flex; justify-content: space-between; gap: ${space.x3}; }
.bh-onboarding-checklist[data-placement='sheet'] { gap: ${space.x3}; padding: ${space.x4} ${space.x4}; }
.bh-onboarding-checklist[data-placement='sheet'] .bh-onboarding-checklist-item { padding: ${space.x2} 0; }
.bh-onboarding-checklist[data-placement='sheet'] .bh-onboarding-checklist-footer { align-items: center; justify-content: flex-end; }
.bh-onboarding-checklist-pager { display: inline-flex; align-items: center; gap: ${space.x2}; margin-right: auto; }
.bh-onboarding-checklist-page { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: ${radius.sm}; color: var(--tobs-ink-primary); background: var(--tobs-state-hover); cursor: pointer; }
.bh-onboarding-checklist-page:hover:not(:disabled) { background: var(--tobs-state-pressed); }
.bh-onboarding-checklist-page:disabled { opacity: 0.4; cursor: default; }
.bh-onboarding-checklist-dots { display: inline-flex; gap: ${space.x2}; }
.bh-onboarding-checklist-dots > span { width: 6px; height: 6px; border-radius: ${radius.round}; background: var(--tobs-line-edge); }
.bh-onboarding-checklist-dots > span[data-state='done'] { background: color-mix(in srgb, var(--bh-accent) 45%, transparent); }
.bh-onboarding-checklist-dots > span[data-current='true'] { background: var(--bh-accent); }
.bh-onboarding-actions { display: flex; gap: ${space.x3}; align-items: center; flex-wrap: wrap; }
.bh-bubble:has(> .bh-onboarding-welcome) { padding: 0; background: transparent; }
.bh-onboarding-welcome { display: grid; gap: ${space.x4}; width: 380px; max-width: 100%; white-space: normal; line-height: ${text.bodyLine}; border-radius: ${radius.lg}; background: var(--tobs-layer-raised); overflow: hidden; }
.bh-onboarding-welcome > :not(.bh-welcome-banner) { margin-inline: ${space.x4}; }
.bh-onboarding-welcome > :last-child { margin-bottom: ${space.x4}; }
.bh-welcome-banner { aspect-ratio: 3 / 1; background: var(--tobs-layer-canvas); }
.bh-welcome-banner .bh-banner-art { display: block; width: 100%; height: 100%; }
/* The avatar rides over the banner; the name starts just below the banner edge (42px overlap - 12px grid gap + 4px). */
.bh-welcome-identity { position: relative; z-index: 1; display: flex; align-items: flex-start; gap: ${space.x3}; margin-top: -42px; }
.bh-welcome-avatar { padding: ${space.x1}; border-radius: ${radius.lg}; background: var(--tobs-layer-raised); line-height: 0; }
.bh-welcome-identity-text { display: grid; gap: ${space.x2}; min-width: 0; padding-top: calc(${space.x6} + ${space.x3} + ${space.x1}); }
.bh-welcome-name { font-size: ${text.titleSize}; font-weight: ${text.strong}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-welcome-roles { display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-welcome-letter { display: grid; gap: ${space.x2}; }
.bh-welcome-letter strong { font-size: ${text.titleSize}; }
.bh-welcome-letter p { margin: 0; }
.bh-welcome-signature { color: var(--tobs-ink-secondary); }
.bh-welcome-provenance { margin: 0; color: var(--tobs-ink-tertiary); font-size: ${text.metaSize}; }
.bh-onboarding-welcome p { margin: 0; }
.bh-onboarding-welcome .bh-card-title { white-space: normal; }
.bh-onboarding-welcome .bh-onboarding-create { color: color-mix(in srgb, var(--bh-accent) 80%, var(--tobs-ink-primary)); background: color-mix(in srgb, var(--bh-accent) 10%, var(--tobs-layer-canvas)); border-color: color-mix(in srgb, var(--bh-accent) 35%, transparent); }
.bh-onboarding-welcome .bh-onboarding-create:hover:not(:disabled) { background: color-mix(in srgb, var(--bh-accent) 18%, var(--tobs-layer-canvas)); }
.bh-onboarding-welcome .bh-onboarding-create:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: 2px; }

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
/* HoverCard portals this preview to body, so these rules intentionally do
   not depend on the bh-root ancestor or its three local brand aliases. */
.bh-rail-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: ${space.x2};
  color: var(--tobs-ink-primary);
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
  border: 0.5px solid var(--tobs-line-strong);
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
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  -webkit-line-clamp: 2;
}
.bh-rail-preview-summary {
  color: var(--tobs-ink-secondary);
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
  color: var(--tobs-ink-primary);
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
  color: var(--tobs-ink-tertiary);
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
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
}
.bh-author-card-status-value {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tobs-ink-secondary);
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
  color: var(--tobs-ink-tertiary);
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
html[data-botharness-motion='reduce'] .bh-header-label-hidden,
html[data-botharness-motion='reduce'] .bh-header-actions-hidden {
  transform: none;
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
  color: var(--tobs-ink-secondary);
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
  border: 0.5px solid var(--tobs-line-strong);
  border-radius: ${radius.md};
  color: var(--tobs-ink-tertiary);
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
  color: var(--tobs-ink-primary);
  transition: opacity 120ms var(--ds-ease-in-out);
}
.bh-search-open .bh-search-input {
  margin-left: -${space.x1};
  opacity: 1;
  pointer-events: auto;
}
.bh-search-input::placeholder {
  color: var(--tobs-ink-tertiary);
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
  color: var(--tobs-ink-secondary);
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
  color: var(--tobs-ink-secondary);
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

/* The glyph marks its button: a :has() anchor with a plain span subject restyles the whole page
   on every DOM insertion. */
button[data-bh-wide-glyph] > span:not(.bh-panel-glyph):not(.bh-panel-glyph-hit):not(.bh-panel-actions) {
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


/* Action group on the wide Bot row: tutorial progress, Activity and the
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
  color: var(--tobs-ink-secondary);
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
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
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
  background: var(--tobs-layer-elevated);
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
  color: var(--tobs-ink-secondary);
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
  background: var(--tobs-layer-elevated);
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
  color: var(--tobs-ink-secondary);
  font-size: ${text.bodySize};
  font-weight: ${text.strong};
  text-align: center;
  pointer-events: none;
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
  background: var(--tobs-layer-elevated);
}
.bh-avatar-media-image img {
  object-fit: cover;
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
  color: var(--tobs-accent-on-solid);
  background: var(--tobs-status-danger-base);
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  font-weight: ${text.strong};
}
.bh-avatar-information {
  color: var(--tobs-ink-primary);
  background: var(--tobs-layer-raised);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: ${border.hairline} solid var(--tobs-layer-canvas);
  border-radius: ${radius.xs};
  color: ${color.accentText};
  background: var(--tobs-layer-canvas);
}
.bh-persona-avatar[data-state='waiting'] .bh-avatar-indicator {
  color: var(--tobs-status-warning-base);
}
.bh-persona-avatar[data-state='blocked'] .bh-avatar-indicator {
  color: var(--tobs-status-danger-base);
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
  color: var(--tobs-ink-secondary);
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
  color: var(--tobs-ink-secondary);
  background: var(--bh-hover);
}
.bh-git-unavailable-title {
  color: var(--tobs-ink-primary);
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
  color: var(--tobs-status-danger-base);
}
.bh-git-install-progress {
  width: 100%;
  height: 4px;
  accent-color: var(--tobs-accent-solid);
}
.bh-git-unavailable-actions a {
  color: var(--tobs-accent-solid);
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
.bh-row-status .bh-avatar-indicator {
  position: static;
}
.bh-row-status .bh-avatar-attention,
.bh-row-status .bh-avatar-information {
  min-width: 16px;
  height: 16px;
  line-height: ${text.metaLine};
}
.bh-row-status[data-state='waiting'] .bh-avatar-indicator {
  color: var(--tobs-status-warning-base);
}
.bh-row-status[data-state='blocked'] .bh-avatar-indicator {
  color: var(--tobs-status-danger-base);
}
.bh-avatar-facepile {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding-right: ${space.x1};
}
.bh-avatar-facepile-button { display: inline-flex; flex: none; padding: 0; border: 0; border-radius: ${radius.round}; background: transparent; color: inherit; cursor: pointer; }
.bh-avatar-facepile-button:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 2px; }
.bh-avatar-facepile > * + * {
  margin-left: -${space.x3};
}
.bh-avatar-facepile .bh-persona-avatar,
.bh-avatar-facepile-overflow {
  border: ${border.hairline} solid var(--tobs-layer-canvas);
  border-radius: ${radius.round};
}
.bh-avatar-facepile-overflow {
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-secondary);
  font-size: 9px;
  font-weight: ${text.strong};
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

`;
