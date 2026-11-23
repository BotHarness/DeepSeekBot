import { border, radius, space } from '../../ds/tokens.stylex.js';
import { schedulesCss } from '../schedules/styles.js';
import { sharedCss } from '../../shared-styles.js';

export const CARD_LIST_CSS = [
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
].join('');
