import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { size as tobsSize } from '../../ds/tobs.stylex.js';

export const personabotsCss = {
  contact: `.bh-contact .bh-body,
.bh-channel-row .bh-body {
  display: block;
  min-width: 0;
  flex: 1;
}
.bh-contact .bh-top,
.bh-channel-row .bh-top {
  display: flex;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  min-height: calc(${tobsSize.rowMedium} / 2);
  line-height: calc(${tobsSize.rowMedium} / 2);
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
  color: var(--tobs-ink-secondary);
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
  color: var(--tobs-ink-tertiary);
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
  min-height: calc(${tobsSize.rowMedium} / 2);
  line-height: calc(${tobsSize.rowMedium} / 2);
}
.bh-bottom .bh-msg {
  min-width: 0;
  flex: 1;
}
.bh-has-unread .bh-msg {
  color: var(--tobs-ink-secondary);
}
`,
  rowAvatar: `.bh-row-avatar .bh-avatar-media-image {
  border-radius: 0;
}
.bh-paused .bh-row-avatar > .bh-persona-avatar {
  opacity: 0.5;
}
.bh-contact .bh-name,
.bh-channel-row .bh-name {
  font-weight: ${text.regular};
}
.bh-contact.bh-has-unread .bh-name,
.bh-channel-row.bh-has-unread .bh-name {
  font-weight: ${text.strong};
}
`,
  rowGlyphRing: `.bh-row-glyph-ring,
.bh-row-glyph-check,
.bh-row-glyph-cut {
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.bh-row-glyph-ring,
.bh-row-glyph-check { stroke: currentColor; }
.bh-row-glyph-check { stroke-width: 1.6; }
.bh-row-glyph-fill { fill: currentColor; }
.bh-row-glyph-cut { stroke: var(--tobs-layer-canvas); stroke-width: 1.7; }
.bh-row-glyph-dot { fill: var(--tobs-layer-canvas); }
.bh-row-glyph[data-status='working'] { color: var(--tobs-status-success-base); }
.bh-row-glyph[data-status='needs-you'] { color: var(--tobs-status-warning-base); }
.bh-row-glyph[data-status='blocked'] { color: var(--tobs-status-danger-base); }
.bh-row-glyph[data-status='done'],
.bh-row-glyph[data-status='paused'] { color: var(--tobs-ink-tertiary); }
.bh-unread-count-muted {
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-secondary);
}
.bh-muted .bh-name,
.bh-muted .bh-msg {
  color: var(--tobs-ink-tertiary);
}
.bh-muted-mark {
  display: inline-flex;
  flex: none;
  color: var(--tobs-ink-tertiary);
}
.bh-shortcut-active .bh-unread-count {
  visibility: hidden;
}
`,
  channelRow: `/* 拖拽源行原位淡出：标示来处，不占位、不推动任何布局（native 无此态，
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
  width: 100%;
  height: 100%;
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-tertiary);
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
`,
  section: `/* 原生 .groupSection 的 workspace 拖动插入线：section 头的重排和 flat
   gap 的松散落点把同一条渐变画在区块上下边界（-8px 落在 12px 间距带内）。
   伪元素绝对定位，不占布局，拖拽中没有任何区块改变高度。 */
.bh-section.bh-drop-before,
.bh-section.bh-drop-after {
  position: relative;
}
`,
  sectionDropScope: `/* Row-less section body 的投放线（空 / 折叠 / 过滤无行）：画在 body 顶部
   下方——空 body 下即紧贴 header 的位置。伪元素绝对定位，不占布局；
   取布局的旧空区方案已退役（它在 dragstart 内同步改变高度会掐断手势）。 */
.bh-section.bh-drop-scope > .bh-list-area {
  position: relative;
}
`,
  pinZone: `html[data-botharness-motion='reduce'] .bh-pin-zone,
html[data-botharness-motion='reduce'] .bh-unpin-zone {
  transition: none;
}

`,
  profileName: `.bh-profile-name {
  font-weight: ${text.strong};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`,
  bannerArt: `.bh-banner-art {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
canvas.bh-banner-art { image-rendering: pixelated; }
.bh-profile-action {
  padding: ${space.x2} ${space.x4};
  border: ${border.hairline} solid ${color.border};
  border-radius: ${radius.sm};
  background: transparent;
  color: var(--tobs-ink-primary);
  font: inherit;
  cursor: pointer;
}
.bh-profile-action:hover {
  background: var(--bh-hover);
}
.bh-profile-action-primary {
  border-color: var(--bh-accent);
  color: ${color.accentText};
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
  color: var(--tobs-status-danger-base);
  font-size: ${text.metaSize};
}
.bh-profile-card-body {
  display: flex;
  flex-direction: column;
  gap: ${space.x3};
}
`,
  botDmAction: `.bh-bot-dm-action:hover {
  color: var(--tobs-ink-primary);
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
`,
  intro: `/* The see-through intro step marks the document, so no :has() scans the backdrop's siblings. */
html[data-bh-intro-see-through] [role='presentation'] > [aria-hidden='true']::after {
  opacity: 0.2;
}
`,
  telemetryNotice: `.bh-telemetry-notice {
  display: flex;
  flex-direction: column;
  gap: ${space.x4};
  margin: 0;
  min-width: 0;
}
`,
  telemetryNoticeRow: `.bh-telemetry-notice-row > dt {
  color: var(--tobs-ink-tertiary);
  font-size: ${text.bodySize};
  line-height: ${text.bodyLine};
}
.bh-telemetry-notice-row > dd {
  margin: 0;
  min-width: 0;
}
`,
};
