import { border, color, space } from '../../ds/tokens.stylex.js';
import { channelsCss } from './styles.js';
import { personabotsCss } from '../personabots/styles.js';

export const CONVERSATION_HEADER_CSS = [
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
].join('');
