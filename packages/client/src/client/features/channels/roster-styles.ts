import { color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { personabotsCss } from '../personabots/styles.js';
import { sharedCss } from '../../shared-styles.js';

export const CHANNEL_ROSTER_CSS = [
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
].join('');
