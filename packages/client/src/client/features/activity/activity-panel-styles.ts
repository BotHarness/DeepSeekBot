import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { activityCss } from './styles.js';
import { usageCss } from '../usage/styles.js';

export const ACTIVITY_PANEL_CSS = [
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
].join('');
