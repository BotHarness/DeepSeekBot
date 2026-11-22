import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';
import { appearanceCss } from '../appearance/styles.js';
import { channelFilesCss } from '../channel-files/styles.js';
import { channelsCss } from '../channels/styles.js';
import { memoryCss } from './styles.js';
import { personabotsCss } from '../personabots/styles.js';

export const CONVERSATION_MEMORY_CSS = [
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
].join('');
