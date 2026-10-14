import { COMBOBOX_CSS } from '../../../client/src/client/combobox.js';
import { STYLEX_CSS } from '../../../client/src/client/ds/stylex-css.js';

export const styles =
  COMBOBOX_CSS +
  `
.bh-browser-access-control { position: relative; display: flex; align-items: center; }
.bh-browser-borrow { display: grid; gap: 8px; font-size: 12.5px; }
.bh-browser-borrow-title, .bh-browser-daily-install { color: var(--bh-browser-label); text-underline-offset: 3px; }
.bh-browser-borrow-url { overflow-wrap: anywhere; }
.bh-browser-borrow-url { color: var(--bh-browser-secondary); }
.bh-browser-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: var(--dsw-radius-md); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.bh-browser-access-power:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power[aria-pressed='true'] { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-interactive-bg-hover); }
.bh-browser-access-power:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-browser-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-browser-access-power.bh-access-failed { color: var(--dsw-alias-state-error-primary); }
.bh-browser-access-error { order: -1; padding: 0 4px; color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 16px; white-space: nowrap; }

/* @bh-browser-aliases:start */
.bh-browser-body, .bh-browser-profiles {
  --bh-browser-error: var(--dsw-alias-state-error-primary);
  --bh-browser-secondary: var(--dsw-alias-label-secondary);
  --bh-browser-label: var(--dsw-alias-label-primary);
  --bh-browser-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-browser-elevation: var(--dsw-elevation-prominent);
  --bh-browser-stroke: var(--dsw-alias-border-l1);
  --bh-browser-radius: var(--dsw-radius-md);
}
/* @bh-browser-aliases:end */
.bh-browser-local { display: grid; gap: 8px; font-size: 12.5px; }
.bh-browser-card-detail { display: grid; gap: 8px; justify-items: start; font-size: 12px; }
.bh-browser-card-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; color: var(--bh-browser-secondary); }
.bh-browser-card-field > span:first-child { flex: none; }
.bh-browser-cards .bh-card-meta [role="status"] { color: inherit; }
.bh-browser-note { color: var(--bh-browser-secondary); }
.bh-browser-frame { display: block; width: 100%; border: 1px solid var(--bh-browser-stroke); border-radius: var(--bh-browser-radius); }
.bh-browser-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.bh-browser-tab[aria-pressed="true"] { background: var(--bh-browser-hover); }
.bh-browser-tab[aria-current="true"] .bh-browser-tab-title { font-weight: 600; }
.bh-browser-tab .bh-browser-tab-url { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-browser-tabs .bh-card-main { padding: 7px 10px; }
.bh-browser-error { color: var(--bh-browser-error); overflow-wrap: anywhere; }
.bh-viewer-btn-content { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 560px) {
  [data-bh-viewer-btn-label] { display: none; }
}
.bh-browser-progress { display: grid; gap: 4px; color: var(--bh-browser-secondary); }
.bh-browser-progress-bar { width: 100%; height: 6px; accent-color: var(--dsw-alias-state-business-primary); }
.bh-browser-failure { display: grid; gap: 4px; overflow-wrap: anywhere; }
.bh-browser-failure-title { color: var(--bh-browser-label); font-weight: 600; }
.bh-browser-failure-fault, .bh-browser-failure-action { color: var(--bh-browser-secondary); }
.bh-browser-failure-details { color: var(--bh-browser-secondary); }
.bh-browser-failure-details pre { overflow-x: auto; white-space: pre-wrap; font-size: 11px; }
` +
  STYLEX_CSS;
