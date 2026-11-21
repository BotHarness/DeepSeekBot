import { space, text } from '../../ds/tokens.stylex.js';

export const schedulesCss = {
  schedules: `.bh-schedules {display:flex;flex-direction:column;gap:${space.x3};min-width:0;}
.bh-schedule-muted {color:var(--tobs-ink-secondary);font-size:${text.metaSize};}
.bh-schedule-muted {margin:0;}
.bh-schedule-empty {display:flex;flex-direction:column;align-items:flex-start;gap:${space.x3};}
.bh-schedule-error {margin:0;color:var(--tobs-status-danger-base);font-size:${text.metaSize};}
`,
};
