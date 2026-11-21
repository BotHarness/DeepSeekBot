import { space, text } from '../../ds/tokens.stylex.js';
import { font } from '../../ds/tobs.stylex.js';

export const sessionsCss = {
  sessionChrome: `[data-card-trailing="start"] {
  align-self: flex-start;
  padding-top: ${space.x3};
}
@property --session-composer-overlay {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
@media (hover: hover) {
  li:not(:hover):not(:focus-within) [data-session-more="closed"] {
    opacity: 0;
  }
}
`,
  sessionFailureHeading: `.bh-session-failure-heading {
  display: flex;
  align-items: baseline;
  gap: ${space.x3};
  min-width: 0;
  flex-wrap: wrap;
}
.bh-session-failure-heading > :first-child { flex: none; }
.bh-session-failure-title {
  color: var(--tobs-status-danger-base);
  font-weight: ${text.strong};
}
.bh-session-failure-summary { overflow-wrap: anywhere; }
.bh-session-failure-code {
  margin-left: auto;
  color: var(--tobs-ink-tertiary);
  font: ${text.metaSize}/${text.metaLine} ${font.familyMono};
}
.bh-session-failure-context {
  color: var(--tobs-ink-tertiary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-session-failure-details { color: var(--tobs-ink-tertiary); }
.bh-session-failure-details summary { cursor: pointer; }
.bh-session-failure-details > div, .bh-session-failure-details > code {
  display: block;
  margin-top: ${space.x2};
  overflow-wrap: anywhere;
}
.bh-session-failure-raw { white-space: pre-wrap; }
`,
  takeoverCard: `.bh-takeover-card .bh-note, .bh-private-input-card .bh-note, .bh-grant-request-card .bh-note { padding: 0; }
`,
};
